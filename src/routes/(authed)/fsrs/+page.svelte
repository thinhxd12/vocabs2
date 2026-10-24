<script lang="ts">
  import { enhance } from "$app/forms";
  import { afterNavigate, goto, refreshAll } from "$app/navigation";
  import { differenceInHours, differenceInMinutes } from "date-fns";
  import { onDestroy, onMount, untrack } from "svelte";
  import { prefersReducedMotion } from "svelte/motion";
  import { SvelteMap } from "svelte/reactivity";
  import { fly } from "svelte/transition";
  import AddWord from "#lib/components/AddWord.svelte";
  import Circle from "#lib/components/Circle.svelte";
  import Toaster from "#lib/components/Toaster.svelte";
  import { addToast } from "#lib/store/toast.svelte.ts";
  import { reviewProgress } from "#lib/store/review-progress.svelte.ts";
  import {
    encodeSession,
    SESSION_COOKIE,
    SESSION_MAX_AGE,
  } from "#lib/review-session.ts";
  import IconPlus from "~icons/ph/plus";
  import IconSpinner from "~icons/svg-spinners/ring-resize";
  import type { PageProps } from "./$types";
  import PhListStar from "~icons/ph/list-star";
  import MaterialSymbolsVolumeUpRounded from "~icons/material-symbols/volume-up-rounded";
  import BiTranslate from "~icons/bi/translate";

  /** `cards` is the batch to review, previewed on the server; `batch` is its size. */
  let { data }: PageProps = $props();

  type Grade = 1 | 2 | 3 | 4;
  type DueKey = "again" | "hard" | "good" | "easy";
  type Translation = { partOfSpeech: string; translation: string[] };

  /** Rating buttons, darkest to lightest.
   *
   *  The row sits under the medallion and must not compete with it, so it is
   *  drawn in warm black rather than the circle's metal: four steps of the same
   *  stone, from near-black at `Again` to charcoal at `Easy`. Lightness still
   *  carries the ramp, the labels still name the grade, and the printed grain
   *  (`glass-noise`) keeps the paper texture the metal used to bring. */
  const RATINGS: { grade: Grade; key: DueKey; label: string; tone: string }[] =
    [
      {
        grade: 1,
        key: "again",
        label: "Again",
        tone: "bg-stone-950 text-white",
      },
      {
        grade: 2,
        key: "hard",
        label: "Hard",
        tone: "bg-stone-900 text-white",
      },
      {
        grade: 3,
        key: "good",
        label: "Good",
        tone: "bg-stone-800 text-white",
      },
      {
        grade: 4,
        key: "easy",
        label: "Easy",
        tone: "bg-stone-700 text-white",
      },
    ];

  const MIN_BATCH = 1;
  const MAX_BATCH = 99;

  const cards = $derived(data.cards);

  /** The reader's motion preference, so the card turn is a cut when asked. */
  const reduceMotion = $derived(prefersReducedMotion.current);

  /** The instant those previews were built from: the reference every grading
   *  label is measured against, so a label is the interval and nothing else. */
  const previewedAt = $derived(data.previewedAt);

  /** Cards of this batch already graded before the page was loaded: the page
   *  server resumes a batch from a session cookie (see
   *  `#lib/review-session.ts`), and hands back the progress it had reached. */
  const graded = $derived(data.graded);

  /** The batch's size: what is left to grade plus what was already graded. */
  const total = $derived(graded + cards.length);

  /** The reader's place in the batch; parked past the end while it refills. */
  let index = $state(0);
  const card = $derived(cards[index] ?? null);

  /** How far into the batch the reader is: the cards already graded. Parked at
   *  the end while the next batch loads, which reads as a full bar. */
  const learned = $derived(Math.min(graded + index, total));

  // The gauge itself lives in the navbar's sunrise tile.
  $effect(() => {
    reviewProgress.learned = learned;
    reviewProgress.total = total;
  });

  /** Live handle on the rating form, so shortcuts can submit it. Not reactive:
   *  nothing renders from it. */
  let formEl: HTMLFormElement | null = null;
  const attachForm = (node: HTMLFormElement) => {
    formEl = node;
  };

  let showTranslate = $state(false);
  let translations = $state<Translation[]>([]);
  let translating = $state(false);

  /** The "add a word" dialog, opened from the toolbar. While it is open the
   *  review shortcuts must stand down — the dialog is the only surface. */
  let showAdd = $state(false);

  /** Answers already fetched this session, keyed by word, so revisiting a card
   *  (or flipping back) never pays for the same lookup twice. */
  const lookupCache = new SvelteMap<string, Translation[]>();

  /** Lookups in flight, so the prefetch below and a click share one request. */
  const lookups = new SvelteMap<string, Promise<Translation[]>>();

  /** Bumped whenever the card changes, so a lookup that lands late cannot
   *  paint the previous word's translation over the new card. */
  let translateRequest = 0;

  function fetchTranslation(word: string) {
    const cached = lookupCache.get(word);
    if (cached) return Promise.resolve(cached);

    const pending = lookups.get(word);
    if (pending) return pending;

    const request = fetch(`/api/translate?word=${encodeURIComponent(word)}`)
      .then((response) => (response.ok ? response.json() : []))
      .then((list: Translation[]) => {
        const result = Array.isArray(list) ? list : [];
        lookupCache.set(word, result);
        return result;
      })
      .catch(() => [] as Translation[])
      .finally(() => lookups.delete(word));

    lookups.set(word, request);
    return request;
  }

  /** Warms a card's lookup ahead of the translate button: the reader's first
   *  glance at the word usually outlasts the request, so opening the
   *  translation is a cut rather than a wait. */
  function prefetch(word: string | undefined) {
    if (word) void fetchTranslation(word);
  }

  /** Warm the card on screen and the one behind it, so the next turn does not
   *  start its lookup from scratch either. A batch with nothing left to show
   *  also has nothing left to resume, so a stale cookie goes with it. */
  onMount(() => {
    if (!cards.length) clearSession();

    prefetch(cards[0]?.word);
    prefetch(cards[1]?.word);
  });

  /** The batch the reader's place belongs to. Page data can rerun on this
   *  *same* component — the size control is a GET for this route — without
   *  recreating it, so without this the place in the old batch would survive
   *  the swap. `afterNavigate` is where state owned by the URL that was left is
   *  dropped, and it stays silent on a plain re-render. */
  let batchRef = untrack(() => previewedAt);

  /**
   * Forgets the previous card's translation, and any lookup still in flight
   * for it, so a late answer cannot paint over the next card.
   */
  function resetTranslation() {
    showTranslate = false;
    translations = [];
    translating = false;
    translateRequest += 1;
  }

  afterNavigate(() => {
    if (previewedAt === batchRef) return;
    batchRef = previewedAt;

    index = 0;
    resetTranslation();

    prefetch(cards[0]?.word);
    prefetch(cards[1]?.word);
  });

  /**
   * Writes the batch's remaining cards to the session cookie
   * (`#lib/review-session.ts`), so going to another page and coming back
   * resumes this batch at this progress instead of building a different one.
   * Also used to put the batch back as it stood at `cardIndex` when the server
   * refuses a write, so the answered card stays in the session.
   *
   * The browser writes it directly — one line, no request, no round trip in
   * front of the card turn. The page server only ever reads it.
   */
  function saveProgress(cardIndex: number) {
    const session = encodeSession({
      graded: graded + cardIndex,
      total: graded + cards.length,
      ids: cards.slice(cardIndex).map((entry) => entry.id),
    });

    document.cookie = `${SESSION_COOKIE}=${session}; path=/; max-age=${SESSION_MAX_AGE}; samesite=lax`;
  }

  /** Nothing left to resume: the next visit builds a new batch. */
  function clearSession() {
    document.cookie = `${SESSION_COOKIE}=; path=/; max-age=0; samesite=lax`;
  }

  /** True while a grade is being written, so the buttons lock. */
  let busy = $state(false);

  /** True while the next batch is being fetched, once a batch runs out. */
  let loading = $state(false);

  /** The grade whose button is briefly lit, for keyboard feedback. */
  let flash = $state(0);
  let flashTimer: ReturnType<typeof setTimeout> | undefined;

  let src = $state("");
  let paused = $state(true);

  onDestroy(() => clearTimeout(flashTimer));

  /** Compact label for how far off a card's next review is: `9m`, `14h`, `3d`.
   *
   *  Measured from `previewedAt` — the instant the server built these previews —
   *  and not from the clock at the moment of render. A preview is an interval:
   *  "press this and the card comes back in …". Read against a live clock it
   *  shrank while the reader thought, and the grades whose interval is minutes
   *  went negative: a new card's `Again` falls due one minute after the batch was
   *  built, so a card dwelt on for ninety seconds was labelled `-1m`.
   *
   *  A reference that does not move also keeps the two renders in step — the
   *  same reason `createdLabel` is formatted on the server. Server and browser
   *  are a round trip apart, and a label straddling a minute boundary would
   *  hydrate to something the server never sent.
   *
   *  Each unit is rounded before the next one is tried, so a label can never
   *  come out as zero: the shortest interval FSRS gives is the minute `Again`
   *  takes on a new card, and the day-scale grades are not whole days.
   *
   *  Days are read off the rounded hours rather than `differenceInDays`, which
   *  only truncates — and counts local days, one of which DST can shorten. */
  function calculateTimeDiff(due: number) {
    const at = new Date(previewedAt);
    const schedule = new Date(due);
    const roundingMethod = "round" as const;

    const minutes = differenceInMinutes(schedule, at, { roundingMethod });
    if (!Number.isFinite(minutes)) return "—";
    if (minutes < 60) return `${minutes}m`;

    const hours = differenceInHours(schedule, at, { roundingMethod });
    if (hours < 24) return `${hours}h`;

    return `${Math.round(hours / 24)}d`;
  }

  function interval(key: DueKey) {
    const due = card?.due[key];
    return due ? calculateTimeDiff(due) : "—";
  }

  /** Match the element's own pause state before swapping `src`, so the binding
   *  can't fight the play call. */
  function play(clip: string) {
    paused = true;
    src = clip;
    paused = false;
  }

  function playSpeech() {
    if (card) {
      play(
        `https://vocabs3.vercel.app/public/speech?text=${encodeURIComponent(card.word)}`,
      );
    }
  }

  function playDing() {
    play("/sounds/mp3_Ding.mp3");
  }

  async function toggleTranslate() {
    showTranslate = !showTranslate;

    const word = card?.word;
    if (!showTranslate || !word) return;

    // The prefetch has usually landed already: show it without a spinner.
    const cached = lookupCache.get(word);
    if (cached) {
      translations = cached;
      translating = false;
      return;
    }

    const request = ++translateRequest;
    translating = true;

    const list = await fetchTranslation(word);

    // The card turned while this was in flight; its answer belongs to a card
    // that is no longer on screen.
    if (request !== translateRequest) return;

    translations = list;
    translating = false;
  }

  /** Lights a rating for a beat; short enough to read as a tap, not a state. */
  function flashButton(grade: Grade) {
    flash = grade;
    clearTimeout(flashTimer);
    flashTimer = setTimeout(() => (flash = 0), 160);
  }

  /** Keyboard shortcuts drive the same submit path as a click. */
  function pressGrade(grade: Grade) {
    formEl
      ?.querySelector<HTMLButtonElement>(`button[value="${grade}"]`)
      ?.click();
  }

  function onKeyDown(event: KeyboardEvent) {
    if (event.ctrlKey || event.altKey || event.shiftKey || event.metaKey)
      return;

    // A modal is modal: space and 1–4 belong to the dialog, not the card behind
    // it. The dialog element handles Escape itself.
    if (showAdd) return;

    const target = event.target as HTMLElement | null;
    if (target?.closest("input, textarea, [contenteditable='true']")) return;

    if (event.key === " ") {
      event.preventDefault();
      toggleTranslate();
      if (showTranslate) playSpeech();
      return;
    }

    const grade = RATINGS[Number(event.key) - 1]?.grade;
    if (grade) {
      event.preventDefault();
      pressGrade(grade);
    }
  }

  function onBatchInput(event: Event) {
    const input = event.currentTarget as HTMLInputElement;
    if (input.value === "") return;

    const value = Number(input.value);
    if (value > MAX_BATCH) input.value = String(MAX_BATCH);
    else if (value < MIN_BATCH) input.value = String(MIN_BATCH);
  }

  /** The card the in-flight grade was sent from, so a write the server refuses
   *  can put that card back under the reader's feet. */
  let sentIndex = 0;

  /**
   * Turns to the next card at once, or, on the batch's last card, rings out into
   * the loading state — the next batch is built by the server, so there is no
   * card to show until it answers. Returns whether the batch just ended.
   *
   * The tap should feel like the card turned, not like a request was filed:
   * waiting for the write before moving left the answered card on screen for a
   * round trip, every button dimmed, which is what made a review drag.
   */
  function step() {
    resetTranslation();

    if (index + 1 < cards.length) {
      index += 1;
      saveProgress(index);
      prefetch(cards[index]?.word);
      prefetch(cards[index + 1]?.word);
      return false;
    }

    // The batch is spent: nothing is left to resume, so the next visit builds
    // a new one rather than reopening an empty session.
    index = cards.length;
    clearSession();
    loading = true;
    playDing();
    return true;
  }

  /** A cell of the toolbar strip: squared off, brighter on hover, and a compact
   *  32px tall so the 540px medallion plus its chrome fits a laptop viewport
   *  without scrolling. 32px is still above the 24px WCAG web target. */
  const ICON_BTN =
    "inline-flex size-32 shrink-0 touch-manipulation items-center justify-center text-slate-300 transition-colors duration-200 hover:bg-white/10 hover:text-white focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-emerald-300 motion-reduce:transition-none";

  /** The batch size, read out between two hairlines instead of boxed in. */
  const NUMBER_INPUT =
    "h-32 w-60 shrink-0 border-l border-white/10 bg-transparent text-center font-rubik text-13 text-slate-100 tabular-nums outline-0";
</script>

<svelte:head>
  <title>Review · FSRS</title>
</svelte:head>

<svelte:window onkeydown={onKeyDown} />

<audio {src} bind:paused preload="auto"></audio>

<!-- Page column. `min-h-full` rather than `h-full`, so a viewport shorter than
     the card grows and scrolls instead of centring content past the top edge.
     The medallion keeps its designed 540px (only narrow screens shrink it).
     With cards loaded the chrome is pinned to the two edges — toolbar at the
     top, grade row at the bottom — and the medallion takes the space between;
     the caught-up state has no grade row, so it stays centred as a unit. -->
<div
  class="flex min-h-full w-full flex-col items-center gap-3 pt-[env(safe-area-inset-top)] {cards.length >
  0
    ? 'justify-between'
    : 'justify-center'}"
  style="--width: min(92vw, 540px);"
>
  <!-- Toolbar: the medallion's opposite — a quiet strip of dark chrome rather
       than another plate of its metal, so the circle stays the only gold on the
       page. The cells are divided by hairlines of the same glass. -->
  <div
    class="w-full max-w-382 mt-2 overflow-hidden rounded-2 border border-white/10 bg-black/45 shadow-[0_4px_18px_rgba(0,0,0,0.45)] backdrop-blur-md"
  >
    <div class="flex items-center">
      <!-- A new batch is asked for here, so the batch in progress is forgotten
           before the GET runs: its session cookie is what the page server would
           otherwise resume. `clearSession` runs on the form's own submit, ahead
           of SvelteKit's handler. -->
      <form method="GET" class="flex items-center" onsubmit={clearSession}>
        <button
          type="submit"
          aria-label="Start a new batch"
          title="Start a new batch"
          class={ICON_BTN}
        >
          <PhListStar class="size-16" aria-hidden="true" />
        </button>

        <input
          name="n"
          type="number"
          min={MIN_BATCH}
          max={MAX_BATCH}
          step="1"
          inputmode="numeric"
          value={data.batch}
          oninput={onBatchInput}
          aria-label="Cards per batch"
          class={NUMBER_INPUT}
        />
      </form>

      {#if cards.length > 0}
        <!-- Batch progress: the gauge is the navbar's sunrise tile now; the
             count stays here, in the elastic middle of the strip. -->
        <div
          class="flex min-w-0 flex-1 items-center justify-center border-l border-white/10 px-12"
        >
          <span class="shrink-0 font-rubik text-10 text-slate-300 tabular-nums">
            {learned}/{total}
          </span>
        </div>
      {:else}
        <div class="flex-1"></div>
      {/if}

      <!-- Always available, even when nothing is due: adding a word is how an
           empty batch gets filled next time. -->
      <button
        type="button"
        onclick={() => (showAdd = true)}
        aria-label="Add a word to review"
        title="Add a word"
        class="{ICON_BTN} border-l border-white/10"
      >
        <IconPlus class="size-16" aria-hidden="true" />
      </button>

      {#if card}
        <button
          type="button"
          onclick={toggleTranslate}
          aria-pressed={showTranslate}
          aria-label="Show translation"
          title="Translate (space)"
          class="{ICON_BTN} border-l border-white/10 {showTranslate
            ? 'bg-white/10 text-white shadow-[inset_0_-2px_0_rgba(255,255,255,0.4)]'
            : ''}"
        >
          <BiTranslate class="size-16" aria-hidden="true" />
        </button>

        <button
          type="button"
          onclick={playSpeech}
          aria-label="Play pronunciation"
          title="Pronounce"
          class="{ICON_BTN} border-l border-white/10"
        >
          <MaterialSymbolsVolumeUpRounded class="size-16" aria-hidden="true" />
        </button>
      {/if}
    </div>
  </div>

  <!-- The circle is the card: word, or its translation, centred in the square. -->
  <Circle>
    <div class="relative h-full w-full" aria-live="polite">
      {#if !cards.length}
        <div
          class="flex h-full w-full flex-col items-center justify-center gap-6 px-40 text-center"
        >
          <p class="font-constantine text-xl text-white/85">All caught up</p>
          <p class="text-11 leading-snug text-slate-400">
            Nothing is due. Type a batch size and tap the star to load more.
          </p>
        </div>
      {:else if loading}
        <div
          class="flex h-full w-full items-center justify-center gap-8 text-white/75"
        >
          <IconSpinner class="size-16" aria-hidden="true" />
          <p class="text-xs">Loading the next batch…</p>
        </div>
      {:else if showTranslate}
        <!-- Copied from the legacy client: the translation panel starts 90px
             down (clear of the circle's top curve), is inset 15px, and scrolls
             with its scrollbar hidden. Sizes are the old pixel scale. -->
        <div
          class="no-scrollbar relative z-3 h-full w-full overflow-y-scroll px-15 pt-90 pb-15 text-white"
          style="text-shadow: 0 0 3px black;"
        >
          {#if translating}
            <p class="text-center text-13 leading-18 font-medium">
              Translating…
            </p>
          {:else if translations.length === 0}
            <p class="text-center text-13 leading-18 font-medium">
              No translation found.
            </p>
          {:else}
            {#each translations as item, i (i)}
              <h3
                class="text-16 leading-24 font-extrabold italic [&:not(:first-of-type)]:mt-2.25"
              >
                {item.partOfSpeech}
              </h3>
              {#each item.translation as line, j (j)}
                <p class="text-13 leading-18 indent-15 font-medium">
                  {line}
                </p>
              {/each}
            {/each}
          {/if}
        </div>
      {:else if card}
        <div
          class="relative z-3 flex h-full w-full items-center justify-center text-white"
          style="text-shadow: 0 0 3px black;"
        >
          {#key card.id}
            <p
              in:fly={reduceMotion
                ? { duration: 0 }
                : { y: -30, duration: 600 }}
              class="w-full wrap-break-word text-center font-constantine text-30 font-bold uppercase leading-36"
            >
              {card.word}
            </p>
          {/key}

          <p
            class="absolute right-0 bottom-4 left-0 text-center text-11 leading-15 font-medium"
          >
            {card.createdLabel}
          </p>
        </div>
      {/if}
    </div>
  </Circle>

  <!-- Grades. The card turns the moment a grade is pressed and the write lands
       behind it; a refused write turns back to the answered card. The row stays
       put while the next batch loads, just disabled. A black cell per grade,
       darkest at Again, hairlines between them: no metal here either, so the
       medallion keeps the gold. -->
  {#if cards.length > 0}
    <form
      {@attach attachForm}
      method="POST"
      action="?/rate"
      use:enhance={({ cancel, formData }) => {
        // A tap that lands twice, or a key held down, can fire a second submit
        // before the rating buttons have been disabled. Drop it here: one card,
        // one review, one step on the day's counter.
        if (busy) {
          cancel();
          return;
        }

        busy = true;
        flashButton(Number(formData.get("grade")) as Grade);

        // Turn the card now, not when the write lands. The form data above is
        // already a snapshot, so changing `index` here cannot post the next
        // card's id, and the answered card is put back if the write is refused.
        sentIndex = index;
        const lastCard = step();

        return async ({ result }) => {
          busy = false;

          if (result.type === "success") {
            if (!lastCard) return;

            // The batch is spent and the server builds the next one; hold the
            // spinner until it lands rather than the answered card.
            try {
              await refreshAll();
              index = 0;
              prefetch(cards[0]?.word);
              prefetch(cards[1]?.word);
            } catch {
              // The batch never arrived: put the answered card back so the
              // reader can try again instead of facing an empty circle.
              index = sentIndex;
              saveProgress(sentIndex);
              addToast({
                type: "error",
                title: "Could not load the next batch",
                message: "Please try again.",
              });            } finally {
              loading = false;
            }
            return;
          }

          if (result.type === "redirect") {
            await goto(result.location);
            return;
          }

          // Nothing was stored: turn back to the card that was answered, and
          // put back the batch the session holds for it.
          if (lastCard) loading = false;
          index = sentIndex;
          saveProgress(sentIndex);

          if (result.type === "failure") {
            const message = (result.data as { error?: string } | undefined)
              ?.error;
            addToast({
              type: "error",
              title: "Review not saved",
              message: message ?? "Please try again.",
            });
          } else {
            addToast({
              type: "error",
              title: "Something went wrong",
              message: result.error?.message ?? "Please try again.",
            });
          }
        };
      }}
      class="flex w-full max-w-382 overflow-hidden rounded-2 border border-white/10 shadow-[0_6px_20px_rgba(0,0,0,0.5)]"
    >
      <input type="hidden" name="id" value={card?.id ?? ""} />

      <!-- The schedule counter rides the card that ends the batch's loop, so it
           moves once per batch rather than once per card. -->
      <input
        type="hidden"
        name="last"
        value={index + 1 >= cards.length ? "1" : ""}
      />

      <div class="flex w-full">
        {#each RATINGS as rating, i (rating.grade)}
          <button
            type="submit"
            name="grade"
            value={rating.grade}
            disabled={busy || loading || !card}
            aria-label="{rating.label}, next in {interval(rating.key)}"
            class="glass-noise group relative flex h-42 flex-1 touch-manipulation flex-col items-center justify-center gap-2 px-4 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-emerald-300 disabled:cursor-not-allowed disabled:text-white/35 {i >
            0
              ? 'border-l border-white/10'
              : ''} {rating.tone}"
          >
            <!-- Hover, press and key-flash feedback, on a layer of its own: a flat
                 wash whose opacity is all that animates. The button underneath is
                 then rasterised once — the grain is a filtered SVG, and the
                 `scale` this replaces re-rasterised it on every frame of the
                 transition, which is what made a tap stutter. Nothing here
                 changes bounds either, so the row never jitters. -->
            <span
              aria-hidden="true"
              class="pointer-events-none absolute inset-0 bg-white/10 opacity-0 transition-opacity duration-150 ease-out group-hover:opacity-100 group-active:opacity-100 group-disabled:opacity-0 motion-reduce:transition-none {flash ===
              rating.grade
                ? 'opacity-100'
                : ''}"
            ></span>

            <span
              class="relative font-rubik text-10 leading-12 text-white/55 tabular-nums group-disabled:text-white/20"
            >
              {interval(rating.key)}
            </span>
            <span
              class="relative text-sm leading-16 font-semibold tracking-[0.04em] uppercase"
            >
              {rating.label}
            </span>
          </button>
        {/each}
      </div>
    </form>
  {/if}
</div>

<AddWord bind:showModal={showAdd} />

<Toaster />
