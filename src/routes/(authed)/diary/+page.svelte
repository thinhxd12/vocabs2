<script lang="ts">
  import { enhance } from "$app/forms";
  import { goto, preloadData } from "$app/navigation";
  import { format } from "date-fns";
  import { onMount } from "svelte";
  import IconCaretDoubleLeft from "~icons/ph/caret-double-left";
  import IconCaretDoubleRight from "~icons/ph/caret-double-right";
  import IconCaretLeft from "~icons/ph/caret-left";
  import IconCaretRight from "~icons/ph/caret-right";
  import IconFloppyDisk from "~icons/ph/floppy-disk";
  import IconTrash from "~icons/ph/trash";
  import IconX from "~icons/ph/x";

  import month01 from "#lib/assets/images/1.webp";
  import month02 from "#lib/assets/images/2.webp";
  import month03 from "#lib/assets/images/3.webp";
  import month04 from "#lib/assets/images/4.webp";
  import month05 from "#lib/assets/images/5.webp";
  import month06 from "#lib/assets/images/6.webp";
  import month07 from "#lib/assets/images/7.webp";
  import month08 from "#lib/assets/images/8.webp";
  import month09 from "#lib/assets/images/9.webp";
  import month10 from "#lib/assets/images/10.webp";
  import month11 from "#lib/assets/images/11.webp";
  import month12 from "#lib/assets/images/12.webp";
  import Modal from "#lib/components/Modal.svelte";

  import type { PageProps } from "./$types";

  /** `data` is the day being edited; `form` carries the last action's result. */
  let { data, form }: PageProps = $props();

  /** `1.webp` … `12.webp`, the same month plates the schedule uses. */
  const MONTH_IMAGES = [
    month01,
    month02,
    month03,
    month04,
    month05,
    month06,
    month07,
    month08,
    month09,
    month10,
    month11,
    month12,
  ];

  /** True while a save or delete is in flight, so the buttons can lock. */
  let busy = $state(false);

  /** The short-lived "saved" / "deleted" confirmation in the dialog's foot. */
  let flash = $state("");

  const errorMsg = $derived(form?.error ?? "");
  const hasEntry = $derived(data.entry !== null);

  /** The entry dialog. Picking a day loads its row, then opens this. */
  let editing = $state(false);

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
   * `?date=` (a picked day, "Today") snaps the grid back onto it with no effect
   * to keep in sync.
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
   * ceiling.
   */
  function browseTo(next: Date) {
    const ahead =
      next.getFullYear() > todayMonth.year ||
      (next.getFullYear() === todayMonth.year &&
        next.getMonth() > todayMonth.month);
    const at = ahead ? new Date(todayMonth.year, todayMonth.month, 1) : next;
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

  const isCurrentMonth = $derived(
    view.year === todayMonth.year && view.month === todayMonth.month,
  );

  const monthLabel = $derived(
    format(new Date(view.year, view.month, 1), "MMMM yyyy"),
  );

  const image = $derived(MONTH_IMAGES[view.month]);

  /**
   * The plate caption: the selected day when it sits in the month on show, and
   * today (clamped to a shorter month) when the reader has paged elsewhere.
   */
  const plate = $derived.by(() => {
    const [year, month, selected] = data.date.split("-").map(Number);
    const inView = year === view.year && month - 1 === view.month;
    const lastDay = new Date(view.year, view.month + 1, 0).getDate();
    const day = inView
      ? selected
      : Math.min(Number(todayLocal.slice(8, 10)), lastDay);
    return {
      day,
      weekday: format(new Date(view.year, view.month, day), "EEEE"),
    };
  });

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
   * Marked with a tint *and* a dot, and today with an underline, so state never
   * rides on colour alone. Branches stay exclusive so no two utilities collide.
   */
  function dayClass(key: string, selected: boolean, hasEntry: boolean) {
    if (selected) {
      return "bg-emerald-500 font-semibold text-slate-950";
    }
    const today =
      key === todayLocal
        ? " underline decoration-emerald-400 decoration-2 underline-offset-4"
        : "";
    return hasEntry
      ? `bg-emerald-500/10 font-medium text-emerald-50 hover:bg-emerald-500/20${today}`
      : `text-slate-200 hover:bg-white/10 hover:text-white${today}`;
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

  /** Loads the day, then opens it: the dialog never shows another day's text. */
  async function openDay(key: string) {
    flash = "";
    if (key !== data.date) {
      try {
        await goto(`?date=${key}`, { reset: false });
      } catch {
        return;
      }
    }
    editing = true;
  }

  function goToday() {
    browsed = null;
    goToDate(todayLocal);
  }

  let flashTimer: ReturnType<typeof setTimeout> | undefined;

  function announce(message: string) {
    flash = message;
    clearTimeout(flashTimer);
    flashTimer = setTimeout(() => (flash = ""), 2400);
  }

  /** Month and year chevrons on the plate; 2px corners, grown hit area. */
  const NAV =
    "relative inline-flex size-36 touch-manipulation items-center justify-center rounded-2 border border-white/15 bg-black/40 text-white backdrop-blur-sm transition-colors before:absolute before:-inset-4 before:content-[''] hover:bg-black/60 active:bg-black/70 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-300 disabled:cursor-not-allowed disabled:opacity-40 motion-reduce:transition-none";

  /** Shared shell for the dialog's two actions. */
  const BTN =
    "inline-flex h-28 shrink-0 touch-manipulation items-center justify-center gap-6 rounded-2 px-12 text-12 font-semibold transition-colors duration-200 outline-offset-2 focus-visible:outline-2 focus-visible:outline-emerald-600 disabled:cursor-not-allowed disabled:opacity-40 motion-reduce:transition-none";

  const SAVE = `${BTN} bg-emerald-500 text-white hover:bg-emerald-400 active:bg-emerald-600`;
  const DELETE = `${BTN} border border-red-500/40 bg-red-50 text-red-600 hover:bg-red-100 active:bg-red-200`;

  const MODAL_PANEL =
    "flex h-[calc(100dvh_-_68px)] min-h-0 w-[min(94vw,34rem)] flex-col overflow-hidden rounded-2 bg-white text-black shadow-2xl";

  const MODAL_HEADER =
    "flex h-48 shrink-0 items-center justify-between gap-8 bg-black pr-8 pl-16 text-white";

  const MODAL_CLOSE =
    "flex size-36 shrink-0 cursor-pointer items-center justify-center rounded-2 text-slate-200 transition-colors hover:bg-white/15 hover:text-white focus-visible:outline-2 focus-visible:outline-emerald-300";
</script>

<svelte:head>
  <title>diary</title>
</svelte:head>

<section class="mx-auto w-full max-w-382 space-y-2 py-2">
  <!-- The calendar is the picker: a marked day opens its entry in the dialog,
       so past diaries are reached in one tap instead of many pages. -->
  <div
    class="overflow-hidden rounded-2 border border-white/10 glass-dark shadow-[0_8px_40px_rgba(0,0,0,0.5)]"
  >
    <div class="relative aspect-3/2 w-full">
      <img
        src={image}
        alt=""
        aria-hidden="true"
        decoding="async"
        class="pointer-events-none absolute inset-0 h-full w-full object-cover select-none"
      />
      <div
        class="absolute top-1/2 left-8 z-10 flex -translate-y-1/2 items-center gap-4"
      >
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
      </div>

      <div
        class="absolute top-1/2 right-8 z-10 flex -translate-y-1/2 items-center gap-4"
      >
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
      </div>

      <div
        class="absolute inset-x-0 bottom-0 flex items-end justify-between gap-12 p-12 sm:p-16"
      >
        <div
          class="flex min-w-0 items-end gap-12 [text-shadow:0_1px_2px_rgba(0,0,0,0.9),0_2px_12px_rgba(0,0,0,0.65)]"
        >
          <span
            class="font-serif text-48 leading-none font-light text-white tabular-nums sm:text-60"
          >
            {plate.day}
          </span>
          <div class="min-w-0 pb-2">
            <p class="truncate text-18 font-light text-white sm:text-20">
              {plate.weekday}
            </p>
            <p
              class="flex min-w-0 items-center gap-6 truncate text-12 text-white/85 sm:text-14"
            >
              {monthLabel}
              <span class="inline-flex shrink-0 items-center gap-4">
                <span
                  class="size-4 rounded-full bg-emerald-400"
                  aria-hidden="true"
                ></span>
                {entryCount}
              </span>
            </p>
          </div>
        </div>

        <button
          type="button"
          onclick={goToday}
          onpointerenter={() => scheduleWarm(todayLocal)}
          onpointerleave={cool}
          onfocus={() => scheduleWarm(todayLocal)}
          onblur={cool}
          disabled={isCurrentMonth && data.date === todayLocal}
          class="shrink-0 touch-manipulation rounded-2 border border-white/15 bg-black/40 px-12 py-4 text-11 font-medium text-white backdrop-blur-sm transition-colors hover:bg-black/60 active:bg-black/70 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-300 disabled:cursor-not-allowed disabled:opacity-40 motion-reduce:transition-none"
        >
          Today
        </button>
      </div>
    </div>

    <div class="px-8 pt-6 pb-8 sm:px-10">
      <table
        class="w-full table-fixed border-separate border-spacing-x-0 border-spacing-y-4"
      >
        <caption class="sr-only">
          {monthLabel}, {entryCount}
          {entryCount === 1 ? "entry" : "entries"}
        </caption>
        <thead>
          <tr>
            {#each WEEKDAYS as weekday, index (weekday)}
              <th
                scope="col"
                class="border-b border-white/10 pb-4 font-rubik text-10 font-medium tracking-[0.08em] uppercase {index ===
                0
                  ? 'text-red-500'
                  : 'text-white/60'}"
              >
                {weekday}
              </th>
            {/each}
          </tr>
        </thead>
        <tbody>
          {#each weeks as week, weekIndex (weekIndex)}
            <tr>
              {#each week as day, dayIndex (dayIndex)}
                <td class="p-0 text-center">
                  {#if day === null}
                    <div class="mx-auto size-28" aria-hidden="true"></div>
                  {:else}
                    {@const key = isoOf(day)}
                    {@const selected = key === data.date}
                    {@const marked = entrySet.has(key)}
                    <button
                      type="button"
                      onclick={() => openDay(key)}
                      onpointerenter={(event) => warmPointer(event, key)}
                      onpointerleave={cool}
                      onfocus={() => scheduleWarm(key)}
                      onblur={cool}
                      disabled={key > todayLocal}
                      aria-current={key === todayLocal ? "date" : undefined}
                      aria-label={dayLabel(day, marked)}
                      class="relative mx-auto flex size-28 touch-manipulation items-center justify-center rounded-2 font-rubik text-12 tabular-nums transition-colors outline-offset-2 focus-visible:outline-2 focus-visible:outline-emerald-300 disabled:cursor-not-allowed disabled:opacity-30 motion-reduce:transition-none {dayClass(
                        key,
                        selected,
                        marked,
                      )}"
                    >
                      {day}
                      {#if marked && !selected}
                        <span
                          class="absolute top-1 right-1 size-4 rounded-full bg-emerald-400"
                          aria-hidden="true"
                        ></span>
                      {/if}
                    </button>
                  {/if}
                </td>
              {/each}
            </tr>
          {/each}
        </tbody>
      </table>
    </div>
  </div>

  <!-- The day's entry: written, saved and deleted in the dialog, above the
       navbar so the textarea gets the full height of the content area. -->
  <Modal
    bind:showModal={editing}
    label="Diary entry"
    variant="fill"
    onclose={() => (flash = "")}
  >
    <div class={MODAL_PANEL}>
      <div class={MODAL_HEADER}>
        <div class="min-w-0">
          <p class="truncate text-14 font-semibold">{dateLabel}</p>
          <p class="text-11 text-slate-300">
            {hasEntry ? "Saved entry" : "New entry"}
          </p>
        </div>
        <button
          type="button"
          onclick={() => (editing = false)}
          aria-label="Close the entry"
          class={MODAL_CLOSE}
        >
          <IconX class="size-16" aria-hidden="true" />
        </button>
      </div>

      <form
        method="POST"
        use:enhance={() => {
          busy = true;
          flash = "";
          return async ({ result, update }) => {
            // Keep the draft while the row refreshes: the saved text, the day's
            // dot and the delete button all come back from the reloaded data.
            await update({ reset: false, invalidateAll: true });
            busy = false;
            if (result.type === "success") {
              announce(
                result.data?.scope === "delete" ? "Entry deleted" : "Entry saved",
              );
            }
          };
        }}
        aria-busy={busy}
        class="flex min-h-0 flex-1 flex-col"
      >
        <input type="hidden" name="date" value={data.date} />

        <label for="diary-text" class="sr-only">
          Diary entry for {dateLabel}
        </label>
        <textarea
          id="diary-text"
          name="text"
          value={draft}
          placeholder="What happened today?"
          aria-invalid={errorMsg ? "true" : undefined}
          aria-describedby={errorMsg ? "diary-status" : undefined}
          class="block min-h-0 w-full flex-1 resize-none bg-transparent px-16 py-16 font-sfpro text-15 leading-[1.75] text-black outline-none placeholder:text-black/40"
        ></textarea>

        <div
          class="flex flex-wrap items-center gap-8 border-t border-slate-200 bg-slate-50 px-12 py-8"
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
              ? 'text-red-600'
              : 'text-emerald-600'}"
          >
            {errorMsg || flash}
          </span>
        </div>
      </form>
    </div>
  </Modal>
</section>
