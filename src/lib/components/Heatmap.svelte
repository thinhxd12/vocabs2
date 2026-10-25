<script lang="ts">
  import { page } from "$app/state";
  import { format, parseISO } from "date-fns";
  import { onMount } from "svelte";
  import IconCaretLeft from "~icons/ph/caret-left";
  import IconCaretRight from "~icons/ph/caret-right";
  import IconSpinner from "~icons/svg-spinners/ring-resize";
  import { formatDuration, todayISO } from "#lib/store/pomodoro.svelte.ts";

  type Day = {
    /** `YYYY-MM-DD`, or `''` for the padding cells that square the weeks. */
    date: string;
    time: number;
    enabled: boolean;
  };

  type Row = {
    date: string | null;
    time: number | string | null;
  };

  /** One day slot inside a month strip; `null` pads a month shorter than 31. */
  type MonthCell = { day: Day; index: number } | null;

  type MonthRow = {
    name: string;
    cells: MonthCell[];
  };

  const MONTHS = [
    "January",
    "February",
    "March",
    "April",
    "May",
    "June",
    "July",
    "August",
    "September",
    "October",
    "November",
    "December",
  ];

  /** The header ticks on a month strip: 1, 8, 15, 22, 29. */
  const DAY_AXIS = Array.from({ length: 31 }, (_, index) => index + 1);

  /** Empty days are a faint fill; more focus darkens the green. */
  const LEVEL_CLASS = [
    "bg-slate-200",
    "bg-emerald-100",
    "bg-emerald-200",
    "bg-emerald-300",
    "bg-emerald-400",
    "bg-emerald-500",
    "bg-emerald-600",
    "bg-emerald-700",
    "bg-emerald-800",
    "bg-emerald-900",
    "bg-emerald-950",
  ];

  let year = $state(new Date().getFullYear());
  let days = $state<Day[]>([]);
  let selected = $state<Day | null>(null);
  let maxValue = $state(1);
  let loading = $state(true);
  let errorMessage = $state("");

  let gridEl = $state<HTMLDivElement | null>(null);
  /** Index the arrow keys move from — the grid keeps a single tab stop. */
  let cursor = $state(0);

  const yearTotal = $derived(
    days.reduce((sum, day) => sum + (day.enabled ? day.time : 0), 0),
  );

  /**
   * The whole year as twelve vertical strips: one month per row, days running
   * left to right. It fits the narrow panel without horizontal or vertical
   * scrolling, unlike a 53-column GitHub grid.
   */
  const monthRows = $derived.by<MonthRow[]>(() => {
    if (days.length === 0) return [];

    const rows: MonthRow[] = MONTHS.map((name) => ({
      name,
      cells: Array.from({ length: 31 }, (): MonthCell => null),
    }));

    days.forEach((day, index) => {
      if (!day.enabled) return;

      const month = Number(day.date.slice(5, 7)) - 1;
      const slot = Number(day.date.slice(8, 10)) - 1;
      const row = rows[month];
      if (row && !row.cells[slot]) row.cells[slot] = { day, index };
    });

    return rows;
  });

  /** Guards against a slow response for a year the reader already left. */
  let token = 0;

  function level(time: number): number {
    if (time <= 0) return 0;
    return Math.max(1, Math.round((time / maxValue) * 10));
  }

  function buildDays(target: number, times: Map<string, number>): Day[] {
    const cells: Day[] = [];
    const first = new Date(target, 0, 1);
    const last = new Date(target, 11, 31);

    // Pad the days before the 1st so every column is one week.
    for (let i = 0; i < first.getDay(); i += 1) {
      cells.push({ date: "", time: 0, enabled: false });
    }

    // A leap year has 366 days. Counting them by offset avoids mutating a Date
    // through every step, and stays exact across DST boundaries.
    const leap = (target % 4 === 0 && target % 100 !== 0) || target % 400 === 0;
    const dayCount = leap ? 366 : 365;

    for (let offset = 0; offset < dayCount; offset += 1) {
      const date = new Date(target, 0, 1 + offset);
      const iso = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(
        date.getDate(),
      ).padStart(2, "0")}`;
      cells.push({ date: iso, time: times.get(iso) ?? 0, enabled: true });
    }

    // ...and the days after the 31st.
    for (let i = last.getDay() + 1; i < 7; i += 1) {
      cells.push({ date: "", time: 0, enabled: false });
    }

    return cells;
  }

  async function load(target: number) {
    const current = ++token;
    loading = true;
    errorMessage = "";

    const supabase = page.data.supabase;
    if (!supabase) {
      days = [];
      selected = null;
      errorMessage = "Could not load this year.";
      loading = false;
      return;
    }

    const from = `${target}-01-01`;
    const to = `${target + 1}-01-01`;

    const [rows, peak] = await Promise.all([
      supabase
        .from("pomodoro_table")
        .select("date, time")
        .gte("date", from)
        .lt("date", to),
      supabase
        .from("pomodoro_table")
        .select("time")
        .order("time", { ascending: false })
        .limit(1),
    ]);

    if (current !== token) return;

    if (rows.error) {
      days = [];
      selected = null;
      errorMessage = "Could not load this year.";
      loading = false;
      return;
    }

    maxValue = Math.max(1, Number((peak.data as Row[] | null)?.[0]?.time ?? 1));

    const times = new Map<string, number>(
      ((rows.data ?? []) as Row[]).map((row) => [
        String(row.date ?? "").slice(0, 10),
        Number(row.time) || 0,
      ]),
    );

    days = buildDays(target, times);

    const start = days.findIndex((day) => day.date === todayISO());
    const fallback = days.findIndex((day) => day.enabled);
    cursor = start === -1 ? Math.max(0, fallback) : start;
    selected = days[cursor] ?? null;
    loading = false;
  }

  /** The nearest enabled cell in `step` direction, or `-1` past the edge. */
  function nextEnabled(from: number, step: number): number {
    for (let i = from; i >= 0 && i < days.length; i += step) {
      if (days[i].enabled) return i;
    }
    return -1;
  }

  function pick(index: number) {
    const day = days[index];
    if (!day?.enabled) return;

    cursor = index;
    selected = day;
  }

  function move(delta: number) {
    const index = nextEnabled(cursor + delta, delta > 0 ? 1 : -1);
    if (index === -1) return;

    pick(index);
    gridEl?.querySelector<HTMLElement>(`[data-index="${index}"]`)?.focus();
  }

  function jumpTo(edge: "first" | "last") {
    const index =
      edge === "first" ? nextEnabled(0, 1) : nextEnabled(days.length - 1, -1);
    if (index === -1) return;

    pick(index);
    gridEl?.querySelector<HTMLElement>(`[data-index="${index}"]`)?.focus();
  }

  function handleGridKey(event: KeyboardEvent) {
    // Left/right step a day; up/down step a week inside the month strips.
    const steps: Record<string, number> = {
      ArrowLeft: -1,
      ArrowRight: 1,
      ArrowUp: -7,
      ArrowDown: 7,
    };

    if (event.key in steps) {
      event.preventDefault();
      move(steps[event.key]);
      return;
    }

    if (event.key === "Home" || event.key === "End") {
      event.preventDefault();
      jumpTo(event.key === "Home" ? "first" : "last");
    }
  }

  // `page.data.supabase` only exists in the browser, so the year is read here
  // rather than in a load function that would ship nothing.
  onMount(() => {
    void load(year);
  });

  function shiftYear(delta: number) {
    year += delta;
    void load(year);
  }
</script>

<div class="flex min-h-0 w-full flex-1 flex-col gap-16 p-16">
  <div class="flex flex-wrap items-center justify-between gap-8">
    <div class="flex items-center gap-8">
      <button
        type="button"
        onclick={() => shiftYear(-1)}
        aria-label="Previous year"
        class="flex size-36 cursor-pointer items-center justify-center rounded-8 border border-slate-200 bg-white text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-900 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-600"
      >
        <IconCaretLeft class="size-16" aria-hidden="true" />
      </button>

      <p
        aria-live="polite"
        class="min-w-64 text-center font-rubik text-lg font-semibold text-slate-900 tabular-nums"
      >
        {year}
      </p>

      <button
        type="button"
        onclick={() => shiftYear(1)}
        aria-label="Next year"
        class="flex size-36 cursor-pointer items-center justify-center rounded-8 border border-slate-200 bg-white text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-900 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-600"
      >
        <IconCaretRight class="size-16" aria-hidden="true" />
      </button>
    </div>

    <p class="text-12 text-black font-500 tabular-nums">
      {formatDuration(yearTotal)} focused
    </p>
  </div>

  {#if loading}
    <div class="flex flex-1 items-center justify-center py-40">
      <IconSpinner class="size-20 text-emerald-600" aria-hidden="true" />
      <span class="sr-only">Loading the year</span>
    </div>
  {:else if errorMessage}
    <p role="alert" class="text-sm text-rose-600">{errorMessage}</p>
  {:else}
    <div class="flex flex-col gap-8">
      <div class="no-scrollbar overflow-x-auto py-6">
        <div class="flex w-max flex-col gap-1">
          <div class="flex items-start gap-6" aria-hidden="true">
            <span class="w-20 shrink-0"></span>
            <div
              class="grid grid-cols-[repeat(31,10px)] gap-0.5 text-center text-7 leading-none text-black font-400"
            >
              {#each DAY_AXIS as day (day)}
                <span>{day === 1 || (day - 1) % 7 === 0 ? day : ""}</span>
              {/each}
            </div>
          </div>

          <div
            bind:this={gridEl}
            role="group"
            aria-label="Focus time by day"
            class="flex flex-col gap-0.5"
          >
            {#each monthRows as row (row.name)}
              <div class="flex items-center gap-6">
                <span
                  class="w-20 shrink-0 text-right text-9 leading-none text-black font-500"
                >
                  {row.name.slice(0, 3)}
                </span>

                <div
                  class="grid grid-cols-[repeat(31,10px)] gap-0.5"
                  role="group"
                  aria-label="{row.name} focus time"
                >
                  {#each row.cells as cell, slot (slot)}
                    {#if cell}
                      {@const isSelected = selected?.date === cell.day.date}
                      <button
                        type="button"
                        data-index={cell.index}
                        tabindex={isSelected ? 0 : -1}
                        aria-label="{format(
                          parseISO(cell.day.date),
                          'd MMMM yyyy',
                        )} — {formatDuration(cell.day.time)}"
                        title="{cell.day.date} · {formatDuration(
                          cell.day.time,
                        )}"
                        onmouseenter={() => pick(cell.index)}
                        onfocus={() => pick(cell.index)}
                        onclick={() => pick(cell.index)}
                        onkeydown={handleGridKey}
                        class="size-10 cursor-pointer rounded-2 p-0 ring-1 ring-black/5 ring-inset transition-colors duration-150 hover:ring-slate-400 focus-visible:outline-2 focus-visible:outline-emerald-600 focus-visible:outline-offset-1 {LEVEL_CLASS[
                          level(cell.day.time)
                        ]} {isSelected
                          ? 'border border-black'
                          : ''}"
                      ></button>
                    {:else}
                      <span class="size-10" aria-hidden="true"></span>
                    {/if}
                  {/each}
                </div>
              </div>
            {/each}
          </div>
        </div>
      </div>

      <div class="flex flex-wrap items-center justify-start gap-6">
        <span class="text-10 text-black font-500">Less</span>
        {#each LEVEL_CLASS as tone, index (index)}
          <span class="size-12 rounded-2 ring-1 ring-black/10 {tone}"></span>
        {/each}
        <span class="text-10 text-black font-500">More</span>
      </div>
    </div>

    <div class="mt-auto" aria-live="polite">
      {#if selected && selected.enabled}
        <div
          class="flex items-center gap-12 rounded-16 border border-emerald-300 bg-emerald-50 p-12"
        >
          <div class="text-center">
            <p
              class="font-rubik text-3xl leading-none font-semibold text-emerald-700 tabular-nums"
            >
              {format(parseISO(selected.date), "d")}
            </p>
            <p
              class="mt-4 text-10 tracking-[0.15em] text-emerald-600 uppercase"
            >
              {format(parseISO(selected.date), "EEE")}
            </p>
          </div>

          <div class="min-w-0 flex-1">
            <p class="truncate text-sm font-medium text-slate-900">
              {format(parseISO(selected.date), "MMMM yyyy")}
            </p>
            <p class="mt-2 text-xs text-emerald-700/80 tabular-nums">
              {formatDuration(selected.time)}
            </p>
          </div>
        </div>
      {:else}
        <p
          class="rounded-16 border border-slate-200 bg-slate-50 p-12 text-xs text-slate-500"
        >
          Pick a day to see the focus time recorded on it.
        </p>
      {/if}
    </div>
  {/if}
</div>
