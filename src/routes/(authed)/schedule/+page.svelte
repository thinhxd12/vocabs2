<script lang="ts">
  import { enhance } from "$app/forms";
  import { goto } from "$app/navigation";
  import { navigating, page as current } from "$app/state";
  import { format } from "date-fns";
  import { onMount } from "svelte";
  import IconCalendarPlus from "~icons/ph/calendar-plus";
  import IconCaretLeft from "~icons/ph/caret-left";
  import IconCaretRight from "~icons/ph/caret-right";
  import IconCheck from "~icons/ph/check";
  import IconFloppyDisk from "~icons/ph/floppy-disk";
  import IconPencilSimple from "~icons/ph/pencil-simple";
  import IconX from "~icons/ph/x";
  import IconSpinner from "~icons/svg-spinners/ring-resize";
  import IconWarning from "~icons/ph/warning";

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

  import Pagination from "#lib/components/Pagination.svelte";
  import QuoteCard from "#lib/components/QuoteCard.svelte";

  import type { PageProps } from "./$types";

  /** `rows` is the current page of `progress_table`, loaded on the server. */
  let { data, form }: PageProps = $props();

  /** `1.webp` … `12.webp` are the January … December plates. */
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

  /** Sunday-first, matching `Date.getDay()`. */
  const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

  /** A quotation kept under the month. */
  const QUOTE =
    "The tree that is supposed to grow to a proud height can dispense with bad weather and storms. Whether misfortune and external resistance, some kinds of hatred, jealousy, stubbornness, mistrust, hardness, avarice, and violence do not belong among the favorable conditions without which any great growth. The poison of which weaker natures perish strengthens the strong — nor do they call it poison.";

  /** True while the `?page=` load is in flight, so the list can dim. */
  const pending = $derived(
    navigating.to?.url.pathname === current.url.pathname,
  );

  /** The window of rows this page covers, e.g. `6–10 of 253`. */
  const shown = $derived.by(() => {
    if (data.rows.length === 0) return `0 of ${data.total}`;
    const first = data.offset + 1;
    return `${first}–${first + data.rows.length - 1} of ${data.total}`;
  });

  /**
   * The final page holds fewer than `pageSize` rows; blank slots top it back
   * up so the card keeps the same height on every page instead of collapsing.
   */
  const emptySlots = $derived(Math.max(0, data.pageSize - data.rows.length));

  /**
   * Paging moves `?page=`, so the URL stays the single source of truth: the
   * rows are re-read on the server for that offset and back/forward, reload
   * and sharing all keep working.
   */
  function goToPage(next: number) {
    const url = new URL(current.url.href);
    url.searchParams.set("page", String(next));
    // `reset: false` keeps the reader where they are — both scroll and focus.
    // The list sits below the fold on a phone, so resetting on every page
    // change would throw away the spot the reader was looking at.
    goto(url, { reset: false });
  }

  // === Schedule ==========================================================
  const slots = $derived(data.schedule.slots);

  /** Rebuilds the fields whenever the slots on screen change, so no input is
   *  left holding a value from the day before. */
  const slotsKey = $derived(slots.map((slot) => slot.id).join(":"));

  // Both actions report their failures through `page.form`, so the message is
  // the same whether the form was enhanced or posted by the browser itself.
  const createError = $derived(
    form?.scope === "create" ? (form.error ?? "") : "",
  );

  /** Set when the reader closes the panel, so a failure from a minute ago is
   *  not shown again as if it had just happened. */
  let errorDismissed = $state(false);

  const editFailure = $derived(
    form?.scope === "edit" && !errorDismissed
      ? { error: form.error ?? "", field: form.field ?? "" }
      : { error: "", field: "" },
  );

  /** True when the last failure was this input, so it can be marked. */
  function isBadField(kind: "date" | "count", slot: number) {
    return editFailure.field === `${kind}-${slot}`;
  }

  let showEdit = $state(false);
  let creating = $state(false);
  let saving = $state(false);
  let justSaved = $state(false);

  /** "Create" deletes the whole schedule, so it takes a second click to fire.
   *  The arming lapses on its own, so one stray click minutes later cannot
   *  still wipe the block. */
  let confirmingCreate = $state(false);
  let confirmTimer: ReturnType<typeof setTimeout> | undefined;

  function armCreate(event: MouseEvent) {
    if (confirmingCreate) return;
    event.preventDefault();
    confirmingCreate = true;
    clearTimeout(confirmTimer);
    confirmTimer = setTimeout(() => (confirmingCreate = false), 6000);
  }

  function cancelCreate() {
    confirmingCreate = false;
    clearTimeout(confirmTimer);
  }

  function toggleEdit() {
    showEdit = !showEdit;
    justSaved = false;
    errorDismissed = true;
  }

  /** Runs as the failure message mounts: it says why nothing saved, so hand it
   *  the focus rather than making the reader hunt for it. */
  const focusFailure = (node: HTMLParagraphElement) => {
    node.focus();
  };

  // Schedule controls: one surface per action, matching the dashboard's forms.
  const BUTTON =
    "inline-flex h-28 shrink-0 touch-manipulation cursor-pointer items-center gap-6 rounded-6 px-12 text-xs font-semibold transition-colors outline-offset-2 focus-visible:outline-2 focus-visible:outline-emerald-300 disabled:cursor-not-allowed disabled:opacity-60 motion-reduce:transition-none";
  const BUTTON_CREATE = `${BUTTON} bg-emerald-500 text-white hover:bg-emerald-400 active:scale-97`;
  const BUTTON_DANGER = `${BUTTON} bg-red-500 text-white hover:bg-red-400 active:scale-97`;
  const BUTTON_EDIT = `${BUTTON} border border-white/15 bg-white/5 text-slate-200 hover:bg-white/10 hover:text-white`;
  const BUTTON_EDIT_OPEN = `${BUTTON} border border-white/15 bg-white/10 text-white`;
  const BUTTON_CANCEL = `${BUTTON} px-14 font-medium text-slate-300 hover:bg-white/5 hover:text-white`;

  const FIELD_BASE =
    "h-32 min-w-0 w-full rounded-6 border bg-white/8 px-8 text-xs text-white backdrop-blur-sm transition-colors outline-hidden placeholder:text-slate-400 focus-visible:bg-white/12 focus-visible:ring-1";
  const FIELD_OK = `${FIELD_BASE} border-white/15 focus-visible:border-emerald-300/60 focus-visible:ring-emerald-400/40`;
  const FIELD_ERROR = `${FIELD_BASE} border-rose-400/60 focus-visible:border-rose-400/70 focus-visible:ring-rose-400/40`;
  const FIELD_LABEL =
    "mb-4 block text-10 font-semibold tracking-[0.15em] text-slate-400 uppercase";

  const now = new Date();
  let year = $state(now.getFullYear());
  let month = $state(now.getMonth());

  // Resolved after hydration so the "today" marker can never pull the server
  // and client clocks apart.
  let today = $state<Date | null>(null);

  onMount(() => {
    today = new Date();
  });

  const image = $derived(MONTH_IMAGES[month]);
  const monthName = $derived(format(new Date(year, month, 1), "MMMM"));

  /** `YYYYMMDD`, so days compare as plain numbers. */
  function dayKey(date: Date) {
    return (
      date.getFullYear() * 10000 + (date.getMonth() + 1) * 100 + date.getDate()
    );
  }

  const todayKey = $derived(today ? dayKey(today) : null);

  /** Reviews counted into each dated day, keyed by `dayKey` so the cells compare locally. */
  const dayCounts = $derived(
    Object.fromEntries(
      Object.entries(data.schedule.counts).map(([date, count]) => {
        const [y, m, d] = date.split("-").map(Number);
        return [dayKey(new Date(y, m - 1, d)), count];
      }),
    ),
  );

  const isCurrentMonth = $derived(
    today !== null &&
      today.getFullYear() === year &&
      today.getMonth() === month,
  );

  /**
   * The plate caption. It follows the month you are viewing: the day number
   * stays on today's date (clamped to shorter months) while the weekday and
   * "Month Year" line move with the month.
   */
  const plate = $derived.by(() => {
    const lastDay = new Date(year, month + 1, 0).getDate();
    const day = today ? Math.min(today.getDate(), lastDay) : 1;
    const shown = new Date(year, month, day);
    return {
      day,
      weekday: format(shown, "EEEE"),
      monthYear: format(shown, "MMMM yyyy"),
    };
  });

  type Day = { date: Date; outside: boolean };

  /** Weeks are Sun-first, padded with the neighbouring months' days. */
  const weeks = $derived.by(() => {
    const firstWeekday = new Date(year, month, 1).getDay();
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const daysInPrev = new Date(year, month, 0).getDate();

    const cells: Day[] = [];
    for (let k = 0; k < firstWeekday; k++) {
      cells.push({
        date: new Date(year, month - 1, daysInPrev - firstWeekday + 1 + k),
        outside: true,
      });
    }
    for (let day = 1; day <= daysInMonth; day++) {
      cells.push({ date: new Date(year, month, day), outside: false });
    }
    for (let day = 1; cells.length % 7 !== 0; day++) {
      cells.push({ date: new Date(year, month + 1, day), outside: true });
    }

    const rows: Day[][] = [];
    for (let i = 0; i < cells.length; i += 7) rows.push(cells.slice(i, i + 7));
    return rows;
  });

  function step(delta: number) {
    const next = new Date(year, month + delta, 1);
    year = next.getFullYear();
    month = next.getMonth();
  }

  function goToToday() {
    const base = today ?? new Date();
    year = base.getFullYear();
    month = base.getMonth();
  }

  // The arrows keep a 36px face, but `before:-inset-8` grows the hit area to
  // 52px (past the 44px minimum) and `touch-manipulation` stops a fast second
  // tap from being read as double-tap-to-zoom.
  const navButton =
    "absolute top-1/2 z-10 inline-flex size-36 -translate-y-1/2 touch-manipulation items-center justify-center rounded-full border border-white/15 bg-black/40 text-white backdrop-blur-sm transition-colors before:absolute before:-inset-8 before:content-[''] hover:bg-black/60 active:bg-black/70 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-300 motion-reduce:transition-none";
</script>

<svelte:head>
  <title>schedule</title>
</svelte:head>

<section class="mx-auto w-full max-w-382 space-y-2 py-2">
  <div
    class="overflow-hidden rounded-2 border border-white/10 bg-slate-800/70 shadow-[0_8px_40px_rgba(0,0,0,0.5)] backdrop-blur-lg"
  >
    <!-- Month plate: `1.webp` … `12.webp`, full-bleed at the top of the card. -->
    <div class="relative aspect-3/2 w-full">
      <img
        src={image}
        alt=""
        aria-hidden="true"
        decoding="async"
        class="pointer-events-none absolute inset-0 h-full w-full object-cover select-none"
      />
      <div
        class="pointer-events-none absolute inset-0 bg-linear-to-t from-slate-950/95 via-slate-950/20 to-transparent"
        aria-hidden="true"
      ></div>

      <button
        type="button"
        onclick={() => step(-1)}
        aria-label="Previous month"
        class="{navButton} left-8"
      >
        <IconCaretLeft class="size-16" aria-hidden="true" />
      </button>
      <button
        type="button"
        onclick={() => step(1)}
        aria-label="Next month"
        class="{navButton} right-8"
      >
        <IconCaretRight class="size-16" aria-hidden="true" />
      </button>

      <div
        class="absolute inset-x-0 bottom-0 flex items-end justify-between gap-12 p-12 sm:p-16"
      >
        <div
          class="flex min-w-0 items-end gap-12 [text-shadow:0_2px_16px_rgba(0,0,0,0.7)]"
        >
          <span
            class="font-serif text-5xl leading-none font-light text-white tabular-nums sm:text-6xl"
          >
            {plate.day}
          </span>
          <div class="min-w-0 pb-2">
            <p class="truncate text-lg font-light text-white/90 sm:text-xl">
              {plate.weekday}
            </p>
            <p class="truncate text-xs text-white/60 sm:text-sm">
              {plate.monthYear}
            </p>
          </div>
        </div>

        <button
          type="button"
          onclick={goToToday}
          disabled={isCurrentMonth}
          class="shrink-0 touch-manipulation rounded-full border border-white/15 bg-black/40 px-12 py-4 text-11 font-medium text-white backdrop-blur-sm transition-colors hover:bg-black/60 active:bg-black/70 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-300 disabled:cursor-not-allowed disabled:opacity-40 motion-reduce:transition-none"
        >
          Today
        </button>
      </div>
    </div>

    <!-- Date grid for the month above, on the card surface. -->
    <div class="glass-input px-8 pt-6 pb-8 sm:px-10">
      <table
        class="w-full table-fixed border-separate border-spacing-x-0 border-spacing-y-4"
      >
        <caption class="sr-only">{monthName} {year}</caption>
        <thead>
          <tr>
            {#each WEEKDAYS as weekday, wd (weekday)}
              <th
                scope="col"
                class="border-b border-white/10 pb-4 font-rubik text-10 font-medium tracking-[0.08em] uppercase {wd ===
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
          {#each weeks as week, w (w)}
            <tr>
              {#each week as cell, d (d)}
                {@const isToday =
                  !cell.outside &&
                  todayKey !== null &&
                  dayKey(cell.date) === todayKey}
                {@const count = dayCounts[dayKey(cell.date)]}
                <td class="p-0 text-center">
                  <div
                    class="relative mx-auto flex size-28 items-center justify-center font-rubik text-xs font-light tabular-nums"
                    aria-current={isToday ? "date" : undefined}
                    aria-hidden={cell.outside ? "true" : undefined}
                  >
                    <span
                      class="{cell.outside
                        ? 'text-white/20'
                        : d === 0
                          ? 'text-red-500'
                          : 'text-slate-200'} {isToday
                        ? 'font-normal underline decoration-emerald-400 decoration-2 underline-offset-4'
                        : ''}"
                    >
                      {cell.date.getDate()}
                    </span>
                    {#if count}
                      <span
                        class="absolute top-0 -right-3 font-rubik text-8 leading-none font-normal text-slate-300 tabular-nums"
                        aria-hidden="true"
                      >
                        {count}
                      </span>
                    {/if}
                  </div>
                </td>
              {/each}
            </tr>
          {/each}
        </tbody>
      </table>
    </div>
  </div>

  <QuoteCard quote={QUOTE} author="Friedrich Nietzsche" />

  <!-- Schedule: "Create" replaces the table with a fresh block of undated
       slots, "Edit" opens the rows the reviewer counts into — today's. -->
  <div
    class="overflow-hidden rounded-2 border border-white/10 bg-slate-800/70 backdrop-blur-lg"
  >
    <div
      class="flex items-baseline justify-between gap-12 border-b border-white/10 px-12 py-8"
    >
      <h2
        class="text-10 font-semibold tracking-[0.2em] text-slate-400 uppercase"
      >
        Schedule
      </h2>
      <p class="font-rubik text-10 text-slate-500 tabular-nums">
        {data.schedule.today} · {data.schedule.total === 0
          ? "empty"
          : `${data.schedule.total} rows`}
      </p>
    </div>

    <div class="flex flex-wrap items-center gap-8 px-12 py-10">
      <form
        method="POST"
        action="?/create"
        class="flex flex-wrap items-center gap-8"
        use:enhance={() => {
          creating = true;
          return async ({ update }) => {
            creating = false;
            cancelCreate();
            // The block arrives undated, so there is nothing for the editor to
            // open on: it only ever shows the rows dated today.
            await update();
          };
        }}
      >
        <button
          type="submit"
          disabled={creating}
          onclick={armCreate}
          title={confirmingCreate
            ? "Click again to delete every row and lay down 6 fresh ones"
            : "Deletes every row in the schedule and lays down 6 fresh ones"}
          class={confirmingCreate ? BUTTON_DANGER : BUTTON_CREATE}
        >
          {#if creating}
            <IconSpinner class="size-14" aria-hidden="true" />
            Creating
          {:else if confirmingCreate}
            <IconWarning class="size-14" aria-hidden="true" />
            Delete &amp; create
          {:else}
            <IconCalendarPlus class="size-14" aria-hidden="true" />
            Create schedule
          {/if}
        </button>

        {#if confirmingCreate}
          <p role="status" class="text-10 font-medium text-red-500">
            This discards every row in the schedule.
          </p>

          <button type="button" onclick={cancelCreate} class={BUTTON_CANCEL}>
            Cancel
          </button>
        {/if}
      </form>

      <button
        type="button"
        onclick={toggleEdit}
        aria-expanded={showEdit}
        aria-controls="edit-schedule-form"
        class={showEdit ? BUTTON_EDIT_OPEN : BUTTON_EDIT}
      >
        {#if showEdit}
          <IconX class="size-14" aria-hidden="true" />
          Close
        {:else}
          <IconPencilSimple class="size-14" aria-hidden="true" />
          Edit schedule
        {/if}
      </button>
    </div>

    {#if createError}
      <p role="alert" class="px-12 pb-10 text-xs font-medium text-rose-300">
        {createError}
      </p>
    {/if}

    {#if showEdit}
      <form
        id="edit-schedule-form"
        method="POST"
        action="?/edit"
        aria-busy={saving}
        use:enhance={() => {
          saving = true;
          justSaved = false;
          errorDismissed = false;
          return async ({ result, update }) => {
            saving = false;
            if (result.type === "success") justSaved = true;
            await update();
          };
        }}
        class="space-y-8 border-t border-white/10 px-12 py-10"
      >
        {#if slots.length === 0}
          <p class="font-rubik text-xs text-slate-400">
            No slots are dated {data.schedule.today} — only today's rows can be edited
            here.
          </p>
        {:else}
          <p class="text-11 leading-snug text-slate-400">
            Today's slots. Saving writes the day and the review count of each
            row.
          </p>

          {#if editFailure.error}
            <p
              {@attach focusFailure}
              id="edit-schedule-error"
              role="alert"
              tabindex="-1"
              class="rounded-6 text-xs font-medium text-rose-300 outline-offset-2 focus-visible:outline-2 focus-visible:outline-rose-300"
            >
              {editFailure.error}
            </p>
          {/if}

          {#key slotsKey}
            {#each slots as slot, i (slot.id)}
              {@const badDate = isBadField("date", i)}
              {@const badCount = isBadField("count", i)}
              <div class="rounded-6 border border-white/10 bg-black/20 p-10">
                <input type="hidden" name="id" value={slot.id} />

                {#if slots.length > 1}
                  <p
                    class="mb-6 text-10 font-semibold tracking-[0.15em] text-slate-400 uppercase"
                  >
                    Slot {i + 1}
                  </p>
                {/if}

                <div class="grid grid-cols-[1.4fr_1fr] gap-8">
                  <label class="block min-w-0">
                    <span class={FIELD_LABEL}>Date</span>
                    <input
                      type="date"
                      name="date"
                      required
                      value={slot.date ?? data.schedule.today}
                      oninput={() => (justSaved = false)}
                      aria-invalid={badDate ? "true" : undefined}
                      aria-describedby={badDate
                        ? "edit-schedule-error"
                        : undefined}
                      class="{badDate
                        ? FIELD_ERROR
                        : FIELD_OK} [&::-webkit-calendar-picker-indicator]:cursor-pointer [&::-webkit-calendar-picker-indicator]:opacity-60"
                    />
                  </label>

                  <label class="block min-w-0">
                    <span class={FIELD_LABEL}>Count</span>
                    <input
                      type="number"
                      name="count"
                      min="0"
                      step="1"
                      inputmode="numeric"
                      required
                      value={slot.count}
                      oninput={() => (justSaved = false)}
                      aria-invalid={badCount ? "true" : undefined}
                      aria-describedby={badCount
                        ? "edit-schedule-error"
                        : undefined}
                      class="{badCount
                        ? FIELD_ERROR
                        : FIELD_OK} [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none [appearance:textfield]"
                    />
                  </label>
                </div>
              </div>
            {/each}
          {/key}

          <div class="flex items-center gap-8">
            <button type="submit" disabled={saving} class={BUTTON_CREATE}>
              {#if saving}
                <IconSpinner class="size-14" aria-hidden="true" />
                Saving
              {:else}
                <IconFloppyDisk class="size-14" aria-hidden="true" />
                Save
              {/if}
            </button>

            <button type="button" onclick={toggleEdit} class={BUTTON_CANCEL}>
              Cancel
            </button>

            {#if justSaved && !editFailure.error}
              <span
                class="ml-auto inline-flex items-center gap-4 text-11 font-medium text-emerald-300"
              >
                <IconCheck class="size-14" aria-hidden="true" />
                Saved
              </span>
            {/if}
          </div>
        {/if}
      </form>
    {/if}
  </div>

  <!-- Five `progress_table` blocks per page, oldest first (`id` ascending),
       with the leftover rows on the first page so the last page is full. -->
  <div
    class="overflow-hidden rounded-2 border border-white/10 bg-slate-800/70 backdrop-blur-lg"
  >
    <div
      class="flex items-baseline justify-between gap-12 border-b border-white/10 px-12 py-8"
    >
      <h2
        class="text-10 font-semibold tracking-[0.2em] text-slate-400 uppercase"
      >
        Progress
      </h2>
      <p class="font-rubik text-10 text-slate-500 tabular-nums">
        {shown}
      </p>
    </div>

    {#if data.rows.length === 0}
      <p class="px-12 py-24 text-center font-rubik text-xs text-slate-500">
        No progress entries yet.
      </p>
    {:else}
      <ul
        class="min-h-168 transition-opacity duration-200 motion-reduce:transition-none"
        class:opacity-60={pending}
        aria-busy={pending}
      >
        {#each data.rows as row, i (row.id)}
          <li
            class="flex items-baseline gap-12 px-12 py-8 not-last:border-b not-last:border-white/8"
          >
            <span
              class="w-24 shrink-0 text-right font-rubik text-11 text-slate-500 tabular-nums"
            >
              {data.offset + i + 1}
            </span>
            <span
              class="min-w-0 ml-48 font-rubik text-xs text-slate-200 tabular-nums"
            >
              {row.start_date}
            </span>
            <span
              class="ml-48 shrink-0 font-rubik text-xs text-slate-200 tabular-nums"
            >
              {row.end_date}
            </span>
          </li>
        {/each}
      </ul>
    {/if}
  </div>

  <Pagination
    page={data.page}
    pageCount={data.pageCount}
    wrap
    onchange={goToPage}
  />
</section>
