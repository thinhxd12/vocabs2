import { format } from "date-fns";
import { error, fail } from "@sveltejs/kit";
import {
  createEmptyCard,
  fsrs,
  type Card,
  type CardInput,
  type FSRSParameters,
  type Grade,
} from "ts-fsrs";
import type { SupabaseClient } from "@supabase/supabase-js";
import { v7 as uuidv7 } from "uuid";
import { getDashboard } from "#lib/server/dashboard.ts";
import {
  DAY_CAP,
  isFilled,
  openSlot,
  readBlock,
  readerToday,
  slotDate,
  type TodaySchedule,
} from "#lib/server/schedule.ts";
import { decodeSession, SESSION_COOKIE } from "#lib/review-session.ts";
import { normalizeWord } from "#lib/server/translate.ts";
import type { Actions, PageServerLoad } from "./$types";

/**
 * Scheduling parameters, fixed by the app's study plan. These mirror the legacy
 * client scheduler (`old/lib/store/layoutstore.ts`); `w` is the only field the
 * account overrides, and ts-fsrs defaults are *not* the plan — without the two
 * step lists below a new card's `Again` comes back in 1m and a lapsed card's in
 * 10m, instead of 9m and 6m.
 *
 * `learning_steps` drive `New`/`Learning` cards, `relearning_steps` drive
 * `Review`/`Relearning` cards after a lapse (`Again`). They are separate lists
 * on purpose: a brand-new card's first `Again` is the learning step, not the
 * relearning one.
 */
const SCHEDULER_PARAMS: Partial<FSRSParameters> = {
  request_retention: 0.9,
  maximum_interval: 36500,
  enable_fuzz: true,
  enable_short_term: true,
  learning_steps: ["9m"],
  relearning_steps: ["6m"],
};

/** Cards pulled per batch, and the bounds the ?n= input is clamped to. */
const DEFAULT_BATCH = 12;
const MIN_BATCH = 1;
const MAX_BATCH = 99;

/** Grades a review can submit (ts-fsrs Rating 1–4). */
const GRADES: readonly Grade[] = [1, 2, 3, 4];

/** The columns of `memories_table` the scheduler reads and writes. `numeric`
 *  arrives from PostgREST as a string, so those are widened here. */
type MemoryRow = {
  id: string;
  word: string;
  created_at: string;
  difficulty: number | string;
  elapsed_days: number | string;
  lapses: number | string;
  learning_steps: number | string;
  reps: number | string;
  scheduled_days: number | string;
  stability: number | string;
  state: number | string;
  last_review: number | string | null;
  due: number | string | null;
};

/** One queued card, with its four FSRS previews precomputed. */
export type ReviewCard = {
  id: string;
  word: string;
  /** `created_at` formatted on the server so SSR and hydration agree. */
  createdLabel: string;
  /** Epoch ms the card next comes due under each grade. */
  due: { again: number; hard: number; good: number; easy: number };
};

function clampBatch(value: number) {
  if (!Number.isFinite(value)) return DEFAULT_BATCH;
  return Math.min(MAX_BATCH, Math.max(MIN_BATCH, Math.round(value)));
}

/**
 * Per-request memo for the scheduler. `locals` is a fresh object for every
 * request, so keying the cache on it scopes the entry to that request and lets
 * it be collected with the request. Storing the promise also collapses
 * concurrent callers into a single build of the scheduler.
 */
const schedulers = new WeakMap<App.Locals, Promise<ReturnType<typeof fsrs>>>();

/** Reads the account's weights and rebuilds the scheduler, once per request. */
function loadScheduler(locals: App.Locals): Promise<ReturnType<typeof fsrs>> {
  const cached = schedulers.get(locals);
  if (cached) return cached;

  const pending = readScheduler(locals);
  schedulers.set(locals, pending);
  return pending;
}

/**
 * The account's FSRS weights, from whatever `dashboard_table.fsrsparams` holds.
 *
 * The legacy client wrote `JSON.stringify(w)` into the column, so the usual
 * shape is a JSON array inside a string. A `jsonb` column arrives already
 * parsed, and a future writer may store the whole parameter object, so all of
 * these are accepted. Anything that is not an array of finite numbers is
 * ignored: a bad value then falls back to ts-fsrs's built-in weights instead of
 * poisoning the scheduler (ts-fsrs throws on a `NaN` weight).
 */
function parseWeights(raw: unknown): number[] | null {
  let value = raw;

  if (typeof value === "string") {
    const text = value.trim();
    if (!text || text === "null") return null;

    try {
      value = JSON.parse(text);
    } catch {
      return null;
    }
  }

  // A stored parameter object, e.g. `{ "w": [...] }`.
  if (value !== null && typeof value === "object" && !Array.isArray(value)) {
    value = (value as { w?: unknown }).w;
  }

  if (!Array.isArray(value) || value.length === 0) return null;

  const weights: number[] = [];
  for (const weight of value) {
    if (typeof weight !== "number" || !Number.isFinite(weight)) return null;
    weights.push(weight);
  }

  return weights;
}

/**
 * Rebuilds the scheduler from the app's fixed parameters plus the account's
 * stored weights (`dashboard_table.fsrsparams`), read through the shared
 * dashboard cache and applied at `w` exactly as the legacy store did. Falls back
 * to the built-in weights when the column is absent or unreadable — the steps
 * from `SCHEDULER_PARAMS` stay either way.
 */
async function readScheduler(locals: App.Locals) {
  const { record } = await getDashboard(locals);
  const weights = parseWeights(record?.fsrsparams);

  return fsrs(weights ? { ...SCHEDULER_PARAMS, w: weights } : SCHEDULER_PARAMS);
}

/**
 * Row → the card ts-fsrs schedules from.
 *
 * The stored row *is* the card input, exactly as the legacy client handed it
 * over: ts-fsrs converts its number/string dates itself, so the fields are
 * passed through untouched instead of being rebuilt by hand. A row with no
 * `due` has never been scheduled, so it starts from a fresh empty card —
 * matching the old client, which reset any card whose `due` was falsy (whether
 * or not the row still carried a stale `state`/`reps`).
 */
function toCard(row: MemoryRow, now: Date): Card | CardInput {
  const { id: _id, word: _word, created_at: _createdAt, ...card } = row;
  return Number(card.due)
    ? (card as unknown as CardInput)
    : createEmptyCard(now);
}

function toReviewCard(
  row: MemoryRow,
  scheduler: ReturnType<typeof fsrs>,
  now: Date,
): ReviewCard {
  const preview = scheduler.repeat(toCard(row, now), now);

  return {
    id: row.id,
    word: row.word,
    createdLabel: format(new Date(row.created_at), "cccc, yyyy-MM-dd 'at' p"),
    due: {
      again: preview[1].card.due.getTime(),
      hard: preview[2].card.due.getTime(),
      good: preview[3].card.due.getTime(),
      easy: preview[4].card.due.getTime(),
    },
  };
}

/**
 * Builds a batch: every card due now, topped up with brand-new cards so a light
 * day still fills the session. This mirrors the order the old client used —
 * overdue first (earliest due), then unseen cards, newest first.
 */
async function buildQueue(
  supabase: SupabaseClient,
  scheduler: ReturnType<typeof fsrs>,
  now: Date,
  limit: number,
) {
  const { data: due, error: dueError } = await supabase
    .from("memories_table")
    .select("*")
    .order("due", { ascending: true })
    .lte("due", now.getTime())
    .gt("due", 0)
    .limit(limit);

  if (dueError) error(500, "Could not load cards to review.");

  const rows = (due ?? []) as MemoryRow[];
  let queue = rows;

  if (rows.length < limit) {
    const { data: fresh, error: freshError } = await supabase
      .from("memories_table")
      .select("*")
      .order("created_at", { ascending: false })
      .eq("due", 0)
      .limit(limit - rows.length);

    if (freshError) error(500, "Could not load new cards.");

    queue = [...rows, ...((fresh ?? []) as MemoryRow[])];
  }

  return queue.map((row) => toReviewCard(row, scheduler, now));
}

/**
 * Rebuilds the batch a session cookie still holds: the same cards, in the same
 * order, previewed against *now* rather than whenever the batch was first
 * built. This is what makes leaving `/fsrs` and coming back continue the batch
 * instead of building a different one — see `#lib/review-session.ts`.
 *
 * A card that has been scheduled forward since the cookie was written — graded
 * in another tab, or named by a cookie older than the review it describes — is
 * dropped rather than shown again: it is not due, and grading it twice would
 * move it twice.
 */
async function restoreQueue(
  supabase: SupabaseClient,
  scheduler: ReturnType<typeof fsrs>,
  now: Date,
  ids: string[],
): Promise<ReviewCard[]> {
  if (!ids.length) return [];

  const { data, error: readError } = await supabase
    .from("memories_table")
    .select("*")
    .in("id", ids);

  if (readError) error(500, "Could not resume your review batch.");

  const rows = new Map(
    ((data ?? []) as MemoryRow[]).map((row) => [row.id, row]),
  );

  return ids.flatMap((id) => {
    const row = rows.get(id);
    if (!row) return [];

    // `due: 0` is an unseen card (still queued); anything dated ahead of now has
    // already been reviewed and belongs to a later batch.
    if (Number(row.due) > now.getTime()) return [];

    return [toReviewCard(row, scheduler, now)];
  });
}

export const load: PageServerLoad = async ({ url, locals, cookies }) => {
  const scheduler = await loadScheduler(locals);
  const now = new Date();
  const previewedAt = now.getTime();

  // A batch in progress is resumed from the session cookie the client wrote
  // (`#lib/review-session.ts`). Asking for a *new* batch is the client's call:
  // the size control drops the cookie before it navigates, so this load finds
  // none. That keeps a plain reload of `?n=…` — no new batch asked for — on the
  // batch the reader is in, rather than starting over.
  const session = decodeSession(cookies.get(SESSION_COOKIE));

  if (session) {
    const cards = await restoreQueue(locals.supabase, scheduler, now, session.ids);

    // Something to resume: the batch the reader left, at the progress they had.
    if (cards.length) {
      return {
        cards,
        batch: Math.max(session.total, session.graded + cards.length),
        graded: session.graded,
        previewedAt,
      };
    }

    // Every queued card is gone or already scheduled ahead: nothing is left of
    // that batch, so drop the cookie and build a fresh one.
    cookies.delete(SESSION_COOKIE, { path: "/" });
  }

  const batch = clampBatch(Number(url.searchParams.get("n") ?? DEFAULT_BATCH));

  // `previewedAt` is the instant every preview in this batch was built from, and
  // the client measures its grading labels against it rather than against its
  // own clock. A preview already *is* an interval — "press this and the card
  // comes back in …" — so a reference that stays put is what the label means.
  return {
    cards: await buildQueue(locals.supabase, scheduler, now, batch),
    batch,
    graded: 0,
    previewedAt,
  };
};

export const actions: Actions = {
  /** Applies one grade to a card. Only the grade that ends the batch also moves
   *  the day's schedule counter (see `bumpSchedule`). */
  rate: async ({ request, locals }) => {
    const form = await request.formData();
    const id = String(form.get("id") ?? "").trim();
    const grade = Number(form.get("grade"));
    /** Set by the client on the batch's last card. */
    const last = form.get("last") === "1";
    const state = { scope: "rate", error: "" };
    /** The counter after this request, when this request is the batch's last. */
    let schedule: TodaySchedule | null = null;

    if (!id) return fail(400, { ...state, error: "Missing card." });
    if (!GRADES.includes(grade as Grade)) {
      return fail(400, { ...state, error: "Unknown rating." });
    }

    // The stored row is authoritative: never trust card state from the client.
    const { data: row, error: readError } = await locals.supabase
      .from("memories_table")
      .select("*")
      .eq("id", id)
      .maybeSingle();

    if (readError)
      return fail(500, { ...state, error: "Could not load the card." });
    if (!row)
      return fail(404, { ...state, error: "That card no longer exists." });

    const scheduler = await loadScheduler(locals);
    const { card: next } = scheduler.next(
      toCard(row as MemoryRow, new Date()),
      new Date(),
      grade as Grade,
    );

    const storedReps = Number(row.reps);

    // One review, one write. The row only moves if it is still where it was read
    // (`reps` is the card's own counter), so a repeat submit that slipped past
    // the client — a duplicate request racing the first, a browser retry — finds
    // nothing to change and is not counted into the day a second time.
    const review = locals.supabase
      .from("memories_table")
      .update({
        due: next.due.getTime(),
        stability: next.stability,
        difficulty: next.difficulty,
        elapsed_days: next.elapsed_days,
        scheduled_days: next.scheduled_days,
        learning_steps: next.learning_steps,
        reps: next.reps,
        lapses: next.lapses,
        state: next.state,
        last_review: next.last_review?.getTime() ?? 0,
      })
      .eq("id", id);

    const { data: graded, error: writeError } = await (
      Number.isFinite(storedReps) ? review.eq("reps", storedReps) : review
    ).select("id");

    if (writeError)
      return fail(500, { ...state, error: "Could not save the review." });

    // Already graded by the twin of this request: report success so the client
    // moves on, but leave the schedule counter alone.
    if (Number.isFinite(storedReps) && !graded?.length) return { ...state };

    // A batch is what the day's schedule counts, so the counter moves once the
    // batch's loop ends — on the card the client flags as the last one — rather
    // than on every card in it, which made a batch of three read as three.
    if (last) schedule = await bumpSchedule(locals);

    return { ...state, schedule };
  },

  /**
   * Adds a word to `memories_table` as a brand-new card.
   *
   * The panel refuses a word the list already holds, but this is the
   * authoritative pass: the list can have changed since that check. `due: 0` is
   * what marks a row as unseen — `buildQueue` tops a batch up with exactly
   * those, newest first — so the new word shows up in a future session, not
   * this one.
   */
  addWord: async ({ request, locals }) => {
    const state = { scope: "add", error: "" };

    const { claims } = await locals.safeGetClaims();
    if (!claims) return fail(401, { ...state, error: "Sign in again to add words." });

    const form = await request.formData();
    const word = normalizeWord(String(form.get("word") ?? ""));

    if (!word) {
      return fail(400, {
        ...state,
        error: "Use a single word — letters, hyphens or an apostrophe.",
      });
    }

    const { data: existing, error: readError } = await locals.supabase
      .from("memories_table")
      .select("id")
      .ilike("word", word)
      .limit(1);

    if (readError)
      return fail(500, { ...state, error: "Could not check your review list." });
    if (existing?.length) {
      return fail(409, {
        ...state,
        error: `“${word}” is already in your review list.`,
      });
    }

    const { error: writeError } = await locals.supabase
      .from("memories_table")
      .insert({ id: uuidv7(), word, due: 0 });

    if (writeError) {
      // A unique index on `word` turns a race with another tab into a duplicate
      // rather than a second card for the same term.
      if (writeError.code === "23505") {
        return fail(409, {
          ...state,
          error: `“${word}” is already in your review list.`,
        });
      }
      return fail(500, { ...state, error: "Could not add the word." });
    }

    return { ...state, word };
  },
};

/**
 * Moves the day's schedule counter by one: once per batch, from the card that
 * ends the batch's loop — never from a card in the middle of one.
 *
 * The row is the first one open for today, in `id` order (a v7 uuid, so ordering
 * by it is insertion order) — the oldest row already dated today, or, until one
 * exists, the oldest undated row. `id` alone decides that; `DAY_CAP` never takes
 * part in the lookup. Reaching the cap stamps the row with today's date, which
 * claims the row for the day and keeps the next day's batches off it.
 *
 * The block is read whole rather than a row at a time, so the same pass says
 * whether every slot is now dated and full: a finished block is written to
 * `progress_table` by `logBlock`. A block that is already spent is handed to it
 * too, so a write that failed — or a block filled outside the reviewer — is
 * logged by the next batch instead of staying missing forever.
 *
 * "Today" is the reader's day, not the server's (`#lib/server/time.ts`), so a
 * batch finished at 08:00 in Tokyo is counted against the Tokyo day.
 *
 * Returns the counter after the move — the same `{ date, count }` the navbar
 * tile shows (`#lib/server/schedule.ts`), so the tile is never read from a
 * second, disagreeing reading of the table. `null` when nothing moved.
 *
 * Best-effort — the review has already been saved by the time this runs, so a
 * failure here is not worth surfacing. Nothing moves when no row is open.
 */
async function bumpSchedule(locals: App.Locals): Promise<TodaySchedule | null> {
  const supabase = locals.supabase;
  const today = await readerToday(locals);
  const { block, error: readError } = await readBlock(locals);

  if (readError || !block.length) return null;

  const row = openSlot(block, today);

  // Every slot dated away from today: nothing is left to count, but a spent
  // block that never reached `progress_table` is logged now.
  if (!row) {
    await logBlock(locals);
    return null;
  }

  const count = Number(row.count) + 1;
  const updated: { count: number; date?: string } =
    count >= DAY_CAP ? { count, date: today } : { count };
  const isFull = block.every((slot) =>
    slot.id === row.id ? isFilled(updated) : isFilled(slot),
  );

  const { error: writeError } = await supabase
    .from("schedule_table")
    .update(updated)
    .eq("id", row.id);

  // The counter did not move, so the navbar tile must not move either.
  if (writeError) return null;

  if (isFull) await logBlock(locals);

  return { date: today, count };
}

/**
 * Writes a finished block to `progress_table` — the span its first and last
 * slot cover, plus the vocab window it was counted from — once.
 *
 * The span is the row's key, so a block that is already logged (the reader
 * grading more batches before the next schedule is created) writes nothing,
 * and a write that failed is retried by the next batch. `progress_table.index`
 * is not nullable, so it is filled from the block's first slot the way the
 * legacy writer did, `0` when the slots carry none.
 *
 * Best-effort, like its caller: the review is already saved, so a failed write
 * only leaves the row for the next batch to try again.
 */
async function logBlock(locals: App.Locals) {
  const { block, error: readError } = await readBlock(locals);

  if (readError || !block.length || !block.every(isFilled)) return;

  const start = slotDate(block[0]);
  const end = slotDate(block[block.length - 1]);
  if (!start || !end) return;

  const supabase = locals.supabase;
  const { data: logged, error: lookupError } = await supabase
    .from("progress_table")
    .select("id")
    .eq("start_date", start)
    .eq("end_date", end)
    .limit(1);

  // Cannot tell whether the block is already there: leave it to the next batch
  // rather than risk logging the same block twice.
  if (lookupError) return;
  if (logged?.length) return;

  const { error: writeError } = await supabase.from("progress_table").insert({
    id: uuidv7(),
    index: Number(block[0].index) || 0,
    start_date: start,
    end_date: end,
  });

  // Silent by contract, but the console is the only place a missing column or a
  // policy that refuses the insert would ever show.
  if (writeError) console.error("[fsrs] progress write failed", writeError);
}
