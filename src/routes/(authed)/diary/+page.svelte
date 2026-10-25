<script lang="ts">
  import { enhance } from "$app/forms";
  import { goto, preloadData } from "$app/navigation";
  import { format } from "date-fns";
  import { onMount } from "svelte";
  import IconCalendarBlank from "~icons/ph/calendar-blank";
  import IconCaretDoubleLeft from "~icons/ph/caret-double-left";
  import IconCaretDoubleRight from "~icons/ph/caret-double-right";
  import IconCaretLeft from "~icons/ph/caret-left";
  import IconCaretRight from "~icons/ph/caret-right";
  import IconFloppyDisk from "~icons/ph/floppy-disk";
  import IconTrash from "~icons/ph/trash";

  import type { PageProps } from "./$types";

  /** `data` is the day being edited; `form` carries the last action's result. */
  let { data, form }: PageProps = $props();

  /** True while a save or delete is in flight, so the buttons can lock. */
  let busy = $state(false);

  /** The short-lived "saved" / "deleted" confirmation under the buttons. */
  let flash = $state("");

  const errorMsg = $derived(form?.error ?? "");
  const hasEntry = $derived(data.entry !== null);

  /**
   * The textarea stays uncontrolled: its value *is* the day's stored text, so it
   * reseeds on navigation (and empties after a delete) with no local draft
   * state to keep in sync — and typing is never clobbered, because the value
   * only changes when the stored text does.
   */
  const draft = $derived(data.entry?.text ?? "");

  /**
   * The reader's own day, for the date ceiling and the default. Resolved after
   * hydration so a server in another timezone can't pull the two apart.
   */
  let clientToday = $state<string | null>(null);
  const todayLocal = $derived(clientToday ?? data.today);

  onMount(() => {
    clientToday = isoLocal(new Date());
    // The server may sit in another zone; hop to the local day once, and
    // replace the entry so the correction never lands in the back button.
    if (data.isDefault && clientToday !== data.date) {
      goto(`?date=${clientToday}`, { replace: true });
    }
  });

  function isoLocal(value: Date) {
    return format(value, "yyyy-MM-dd");
  }

  /** "Sunday, October 18, 2026", built from the parts so no zone can shift it. */
  const dateLabel = $derived.by(() => {
    const [year, month, day] = data.date.split("-").map(Number);
    return format(new Date(year, month - 1, day), "EEEE, MMMM d, yyyy");
  });

  const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

  type Month = { year: number; month: number };

  function monthOf(iso: string): Month {
    const [year, month] = iso.split("-").map(Number);
    return { year, month: month - 1 };
  }

  /**
   * The month on show. It follows the selected day unless the reader has paged
   * away — `from` records the selection the browse started at, so any change to
   * `?date=` (a picked day, the date input, "Today") snaps the grid back onto
   * it with no effect to keep in sync.
   */
  let browsed = $state<(Month & { from: string }) | null>(null);

  const view = $derived(
    browsed && browsed.from === data.date
      ? { year: browsed.year, month: browsed.month }
      : monthOf(data.date),
  );

  const todayMonth = $derived(monthOf(todayLocal));

  /**
   * Move the grid to `next`, but never past the current month: today is the
   * ceiling. Shared by the month and year chevrons so both clamp alike.
   */
  function browseTo(next: Date) {
    const ahead =
      next.getFullYear() > todayMonth.year ||
      (next.getFullYear() === todayMonth.year &&
        next.getMonth() > todayMonth.month);
    const at = ahead
      ? new Date(todayMonth.year, todayMonth.month, 1)
      : next;
    browsed = {
      from: data.date,
      year: at.getFullYear(),
      month: at.getMonth(),
    };
  }

  function stepMonth(delta: number) {
    browseTo(new Date(view.year, view.month + delta, 1));
  }

  function stepYear(delta: number) {
    browseTo(new Date(view.year + delta, view.month, 1));
  }

  const canStepForward = $derived(
    view.year < todayMonth.year ||
      (view.year === todayMonth.year && view.month < todayMonth.month),
  );

  const canStepYearForward = $derived(view.year < todayMonth.year);

  const monthLabel = $derived(
    format(new Date(view.year, view.month, 1), "MMMM yyyy"),
  );

  /** The days that already hold an entry, so the grid can mark them. */
  const entrySet = $derived(new Set(data.dates));

  const entryCount = $derived(
    data.dates.filter((day) => {
      const at = monthOf(day);
      return at.year === view.year && at.month === view.month;
    }).length,
  );

  /** Each week is seven cells; `null` pads the blanks before and after. */
  const weeks = $derived.by(() => {
    const { year, month } = view;
    const lead = new Date(year, month, 1).getDay();
    const length = new Date(year, month + 1, 0).getDate();
    const cells: (number | null)[] = Array.from({ length: lead }, () => null);
    for (let day = 1; day <= length; day++) cells.push(day);
    while (cells.length % 7 !== 0) cells.push(null);
    const rows: (number | null)[][] = [];
    for (let i = 0; i < cells.length; i += 7) rows.push(cells.slice(i, i + 7));
    return rows;
  });

  function isoOf(day: number) {
    const month = String(view.month + 1).padStart(2, "0");
    return `${view.year}-${month}-${String(day).padStart(2, "0")}`;
  }

  /**
   * Marked with a tint *and* a dot, and today with a ring, so state never rides
   * on colour alone. Branches stay exclusive so no two utilities collide.
   */
  function dayClass(key: string, selected: boolean, hasEntry: boolean) {
    if (selected) {
      return "bg-emerald-500 font-semibold text-slate-950 shadow-[0_2px_12px_rgba(16,185,129,0.5)]";
    }
    const today =
      key === todayLocal ? " ring-1 ring-inset ring-emerald-400/60" : "";
    return hasEntry
      ? `bg-emerald-500/15 font-medium text-emerald-50 hover:bg-emerald-500/25${today}`
      : `text-slate-300 hover:bg-white/10 hover:text-white active:bg-white/15${today}`;
  }

  function dayLabel(day: number, hasEntry: boolean) {
    const label = format(
      new Date(view.year, view.month, day),
      "EEEE, MMMM d, yyyy",
    );
    return hasEntry ? `${label}, has an entry` : label;
  }

  /**
   * Warm the next day a beat after the pointer settles on it. The short delay
   * collapses a slow sweep across the grid into one request, and SvelteKit
   * caches the preloaded data, so the tap that follows lands instantly.
   * Touch is skipped: it fires `pointerenter` right before the tap anyway.
   */
  let warmTimer: ReturnType<typeof setTimeout> | undefined;

  function scheduleWarm(date: string) {
    if (date === data.date) return;
    clearTimeout(warmTimer);
    warmTimer = setTimeout(() => {
      void preloadData(`?date=${date}`).catch(() => {});
    }, 80);
  }

  function warmPointer(event: PointerEvent, date: string) {
    if (event.pointerType === "touch") return;
    scheduleWarm(date);
  }

  function cool() {
    clearTimeout(warmTimer);
  }

  /** The URL's `?date=` is the single source of truth, so a day is shareable. */
  function goToDate(date: string) {
    if (!date || date === data.date) return;
    goto(`?date=${date}`, { reset: false });
  }

  function selectDay(day: number) {
    goToDate(isoOf(day));
  }

  function goToday() {
    browsed = null;
    goToDate(todayLocal);
  }

  function onDateChange(event: Event) {
    goToDate((event.currentTarget as HTMLInputElement).value);
  }

  let flashTimer: ReturnType<typeof setTimeout> | undefined;

  function announce(message: string) {
    flash = message;
    clearTimeout(flashTimer);
    flashTimer = setTimeout(() => (flash = ""), 2400);
  }

  /** Chevrons either side of the month; disabled at the ceiling. */
  const NAV =
    "inline-flex size-32 shrink-0 touch-manipulation items-center justify-center rounded-full text-slate-300 transition-colors duration-200 outline-offset-2 hover:bg-white/10 hover:text-white focus-visible:outline-2 focus-visible:outline-emerald-300 disabled:cursor-not-allowed disabled:opacity-30 motion-reduce:transition-none";

  /** Shared pill shell for the two actions. */
  const BTN =
    "inline-flex shrink-0 touch-manipulation items-center justify-center gap-6 rounded-full px-12 py-6 text-xs font-semibold transition-colors duration-200 outline-offset-2 focus-visible:outline-2 focus-visible:outline-emerald-300 disabled:cursor-not-allowed disabled:opacity-40 motion-reduce:transition-none";

  const SAVE = `${BTN} bg-emerald-500 text-slate-950 hover:bg-emerald-400 active:bg-emerald-600`;
  const DELETE = `${BTN} border border-red-500/30 bg-red-500/10 text-red-300 hover:border-red-500/50 hover:bg-red-500/20 hover:text-red-200 active:bg-red-500/25`;
</script>

<svelte:head>
  <title>diary</title>
</svelte:head>

<section class="mx-auto w-full max-w-378 space-y-8 py-8">
  <!-- The calendar is the picker: marked days open straight into the editor
       below, so past diaries are reached in one tap instead of many pages. -->
  <div
    class="overflow-hidden rounded-16 border border-white/10 bg-slate-800/70 backdrop-blur-lg"
  >
    <div class="flex items-center gap-4 border-b border-white/10 px-8 py-8">
      <button
        type="button"
        onclick={() => stepYear(-1)}
        aria-label="Previous year"
        title="Previous year"
        class={NAV}
      >
        <IconCaretDoubleLeft class="size-16" aria-hidden="true" />
      </button>

      <button
        type="button"
        onclick={() => stepMonth(-1)}
        aria-label="Previous month"
        title="Previous month"
        class={NAV}
      >
        <IconCaretLeft class="size-16" aria-hidden="true" />
      </button>

      <div class="min-w-0 flex-1 text-center">
        <p class="truncate font-serif text-sm text-white">{monthLabel}</p>
        <p
          class="font-rubik text-10 text-slate-400 tabular-nums"
          aria-live="polite"
        >
          {entryCount}
          {entryCount === 1 ? "entry" : "entries"}
        </p>
      </div>

      <button
        type="button"
        onclick={() => stepMonth(1)}
        disabled={!canStepForward}
        aria-label="Next month"
        title="Next month"
        class={NAV}
      >
        <IconCaretRight class="size-16" aria-hidden="true" />
      </button>

      <button
        type="button"
        onclick={() => stepYear(1)}
        disabled={!canStepYearForward}
        aria-label="Next year"
        title="Next year"
        class={NAV}
      >
        <IconCaretDoubleRight class="size-16" aria-hidden="true" />
      </button>

      <button
        type="button"
        onclick={goToday}
        onpointerenter={() => scheduleWarm(todayLocal)}
        onpointerleave={cool}
        onfocus={() => scheduleWarm(todayLocal)}
        onblur={cool}
        disabled={data.date === todayLocal}
        class="ml-4 shrink-0 touch-manipulation rounded-full border border-white/15 bg-black/40 px-12 py-4 text-11 font-medium text-white transition-colors duration-200 hover:bg-black/60 active:bg-black/70 outline-offset-2 focus-visible:outline-2 focus-visible:outline-emerald-300 disabled:cursor-not-allowed disabled:opacity-40 motion-reduce:transition-none"
      >
        Today
      </button>
    </div>

    <div class="px-8 py-8">
      <div
        class="grid grid-cols-7 items-center gap-y-4"
        role="group"
        aria-label="Diary calendar, {monthLabel}"
      >
        {#each WEEKDAYS as weekday, index (weekday)}
          <span
            class="pb-4 text-center font-rubik text-10 font-medium tracking-[0.08em] uppercase {index ===
            0
              ? 'text-red-400'
              : 'text-white/50'}"
          >
            {weekday}
          </span>
        {/each}

        {#each weeks as week, weekIndex (weekIndex)}
          {#each week as day, dayIndex (dayIndex)}
            {#if day === null}
              <span aria-hidden="true"></span>
            {:else}
              {@const key = isoOf(day)}
              {@const selected = key === data.date}
              {@const marked = entrySet.has(key)}
              <button
                type="button"
                onclick={() => selectDay(day)}
                onpointerenter={(event) => warmPointer(event, key)}
                onpointerleave={cool}
                onfocus={() => scheduleWarm(key)}
                onblur={cool}
                disabled={key > todayLocal}
                aria-pressed={selected}
                aria-label={dayLabel(day, marked)}
                class="relative mx-auto flex size-36 touch-manipulation items-center justify-center rounded-full font-rubik text-xs tabular-nums transition-colors duration-200 outline-offset-2 focus-visible:outline-2 focus-visible:outline-emerald-300 disabled:cursor-not-allowed disabled:opacity-30 motion-reduce:transition-none {dayClass(
                  key,
                  selected,
                  marked,
                )}"
              >
                {day}
                {#if marked && !selected}
                  <span
                    class="absolute bottom-4 size-4 rounded-full bg-emerald-400"
                    aria-hidden="true"
                  ></span>
                {/if}
              </button>
            {/if}
          {/each}
        {/each}
      </div>
    </div>

    <div
      class="flex items-center justify-center gap-16 border-t border-white/10 px-8 py-8 font-rubik text-10 text-slate-400"
    >
      <span class="inline-flex items-center gap-6">
        <span
          class="size-10 rounded-full bg-emerald-500/15 ring-1 ring-emerald-400/30"
        ></span>
        Entry
      </span>
      <span class="inline-flex items-center gap-6">
        <span class="size-10 rounded-full ring-1 ring-emerald-400/60"></span>
        Today
      </span>
    </div>
  </div>

  <form
    method="POST"
    use:enhance={() => {
      busy = true;
      flash = "";
      return async ({ result, update }) => {
        // Keep the draft on screen while the page reloads underneath it.
        await update({ reset: false });
        busy = false;
        if (result.type === "success") {
          announce(
            result.data?.scope === "delete" ? "Entry deleted" : "Entry saved",
          );
        }
      };
    }}
    aria-busy={busy}
    class="overflow-hidden rounded-16 border border-white/10 bg-slate-800/70 backdrop-blur-lg"
  >
    <!-- The editor always edits the day picked above; the input is a shortcut
         to jump months the chevrons would take too long to walk. -->
    <div
      class="flex flex-wrap items-center gap-x-8 gap-y-6 border-b border-white/10 px-12 py-10"
    >
      <label
        for="diary-date"
        class="text-10 font-semibold tracking-[0.2em] text-slate-400 uppercase"
      >
        Date
      </label>
      <input
        id="diary-date"
        name="date"
        type="date"
        value={data.date}
        max={todayLocal}
        onchange={onDateChange}
        class="rounded-full border border-white/10 bg-black/30 px-12 py-6 font-rubik text-xs text-slate-100 tabular-nums outline-offset-2 focus-visible:outline-2 focus-visible:outline-emerald-300"
      />
      <span
        class="ml-auto inline-flex items-center gap-6 font-rubik text-11 text-slate-400 tabular-nums"
      >
        <IconCalendarBlank class="size-14" aria-hidden="true" />
        {dateLabel}
      </span>
    </div>

    <label for="diary-text" class="sr-only">Diary entry for {dateLabel}</label>
    <textarea
      id="diary-text"
      name="text"
      rows={10}
      value={draft}
      placeholder="What happened today?"
      aria-invalid={errorMsg ? "true" : undefined}
      aria-describedby={errorMsg ? "diary-status" : undefined}
      class="block w-full resize-none bg-transparent px-16 py-16 font-sfpro text-15 leading-[1.75] text-slate-100 outline-none placeholder:text-slate-500"
    ></textarea>

    <div
      class="flex flex-wrap items-center gap-8 border-t border-white/10 px-12 py-10"
    >
      <button type="submit" formaction="?/save" disabled={busy} class={SAVE}>
        <IconFloppyDisk class="size-16" aria-hidden="true" />
        Save
      </button>
      <button
        type="submit"
        formaction="?/delete"
        formnovalidate
        disabled={!hasEntry || busy}
        class={DELETE}
      >
        <IconTrash class="size-16" aria-hidden="true" />
        Delete
      </button>

      <span
        id="diary-status"
        aria-live="polite"
        class="ml-auto min-w-0 truncate text-11 font-medium {errorMsg
          ? 'text-red-400'
          : 'text-emerald-300'}"
      >
        {errorMsg || flash}
      </span>
    </div>
  </form>
</section>
