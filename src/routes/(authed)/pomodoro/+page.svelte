<script lang="ts">
  import { browser } from "$app/env";
  import Circle from "#lib/components/Circle.svelte";
  import Container from "#lib/components/Container.svelte";
  import Heatmap from "#lib/components/Heatmap.svelte";
  import Modal from "#lib/components/Modal.svelte";
  import Pagination from "#lib/components/Pagination.svelte";
  import { onDestroy, onMount } from "svelte";
  import { fade } from "svelte/transition";
  import IconMoon from "~icons/ph/moon";
  import IconPauseFill from "~icons/ph/pause-fill";
  import IconPlayFill from "~icons/ph/play-fill";
  import IconSpinner from "~icons/svg-spinners/ring-resize";
  import IconSun from "~icons/ph/sun";
  import IconTarget from "~icons/ph/target";
  import IconTimer from "~icons/ph/timer";
  import IconX from "~icons/ph/x";
  import TablerCircleLetterFFilled from "~icons/tabler/circle-letter-f-filled";
  import TablerCircleLetterSFilled from "~icons/tabler/circle-letter-s-filled";
  import TablerCircleLetterLFilled from "~icons/tabler/circle-letter-l-filled";
  import MaterialSymbolsInsertChartOutlineRounded from "~icons/material-symbols/insert-chart-outline-rounded";
  import MaterialSymbolsSettingsRounded from "~icons/material-symbols/settings-rounded";
  import MaterialSymbolsLightBackgroundGridSmallSharp from "~icons/material-symbols-light/background-grid-small-sharp";
  import MaterialSymbolsVolumeUpRounded from "~icons/material-symbols/volume-up-rounded";
  import MaterialSymbolsVolumeOffRounded from "~icons/material-symbols/volume-off-rounded";

  import focusImage from "#lib/assets/images/Hans Adam Weissenkircher-Helios on His Chariot.webp";
  import longbreakImage from "#lib/assets/images/Peder Mork Monsted-Figures Resting in a River Landscape.webp";
  import shortbreakImage from "#lib/assets/images/Giovanni Battista Tiepolo-Hermes.webp";

  import {
    MODE_LABEL,
    formatClock,
    formatDuration,
    formatTimerString,
    pomodoro,
    remainingPercent,
    restoreSettings,
    saveSettings,
    setCurrentInterval,
    setIntervals,
    setMinutes,
    setMode,
    startTimer,
    syncTimer,
    toggleMute,
    toggleTimer,
    todayISO,
    type PomodoroMode,
    type PomodoroRow,
  } from "#lib/store/pomodoro.svelte.ts";

  import type { PageProps } from "./$types";

  let { data }: PageProps = $props();

  /** One lit tone for every mode: the icon already tells focus from break. */
  const MODE_ACTIVE = "bg-emerald-400 text-slate-950 hover:bg-emerald-300";

  const MODES: {
    id: PomodoroMode;
    label: string;
    icon: typeof IconTarget;
  }[] = [
    { id: "focus", label: "Focus", icon: TablerCircleLetterFFilled },
    { id: "shortbreak", label: "Short break", icon: TablerCircleLetterSFilled },
    { id: "longbreak", label: "Long break", icon: TablerCircleLetterLFilled },
  ];

  const MODE_IMAGE: Record<PomodoroMode, string> = {
    focus: focusImage,
    shortbreak: shortbreakImage,
    longbreak: longbreakImage,
  };

  /** A cell of the top strip: one height for every control, so the bar reads as
   *  a single instrument rather than a row of loose buttons. */
  const ICON_BTN =
    "inline-flex h-24 w-30 shrink-0 cursor-pointer touch-manipulation items-center justify-center text-slate-300 transition-colors duration-200 hover:bg-white/10 hover:text-white focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-emerald-300 motion-reduce:transition-none";

  /** Lit state for a cell whose panel is open. */
  const CELL_ON =
    "bg-white/10 text-white shadow-[inset_0_-2px_0_rgba(255,255,255,0.4)]";

  const MODAL_PANEL =
    "flex h-[calc(100dvh_-_68px)] min-h-0 w-[min(94vw,23.625rem)] max-w-378 flex-col overflow-hidden rounded-16 border border-white/10 bg-slate-900 text-slate-100 shadow-2xl";

  /* Settings already read well; keep its compact, centred form. */
  const MODAL_PANEL_COMPACT =
    "flex max-h-[min(84dvh,38rem)] w-[min(94vw,23.625rem)] max-w-378 flex-col overflow-hidden rounded-16 border border-white/10 bg-slate-900 text-slate-100 shadow-2xl";

  const MODAL_HEADER =
    "flex h-48 shrink-0 items-center justify-between gap-8 border-b border-white/10 bg-white/5 pr-8 pl-16 text-white";

  const MODAL_CLOSE =
    "flex size-36 shrink-0 cursor-pointer items-center justify-center rounded-8 text-slate-400 transition-colors hover:bg-white/10 hover:text-white focus-visible:outline-2 focus-visible:outline-emerald-300";

  /** The heatmap keeps 31 fixed 10px columns, so its panel runs a little wider. */
  const MODAL_PANEL_WIDE =
    "flex h-[calc(100dvh_-_68px)] min-h-0 w-[min(96vw,26.5rem)] max-w-424 flex-col overflow-hidden rounded-16 border border-white/10 bg-slate-900 text-slate-100 shadow-2xl";

  const NUM_INPUT =
    "h-36 w-full rounded-8 border border-white/10 bg-white/5 px-10 font-rubik text-sm text-slate-100 tabular-nums outline-hidden transition-colors placeholder:text-slate-500 focus-visible:border-emerald-400 focus-visible:ring-1 focus-visible:ring-emerald-400/30 [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none [appearance:textfield]";

  const todayDate = todayISO();

  const timeText = $derived(formatTimerString(pomodoro.secondsRemaining));
  const modeLabel = $derived(MODE_LABEL[pomodoro.mode]);
  const ModeIcon = $derived(
    MODES.find((mode) => mode.id === pomodoro.mode)?.icon ?? IconTarget,
  );
  /** Share of the session left; the old page drained the artwork's colour. */
  const percent = $derived(remainingPercent());

  const title = $derived(
    pomodoro.isPaused
      ? "Paused!"
      : `${timeText} ${pomodoro.mode === "focus" ? "🍅 Time to focus!" : "🌴 Time for a break!"}`,
  );

  const timerLabel = $derived(
    pomodoro.isPaused
      ? `Resume the ${modeLabel.toLowerCase()} timer, ${timeText} left`
      : `Pause the ${modeLabel.toLowerCase()} timer, ${timeText} left`,
  );

  // === Modals ============================================================
  let showReport = $state(false);
  let showHeatmap = $state(false);
  let showSettings = $state(false);

  const modalOpen = $derived(showReport || showHeatmap || showSettings);

  // === Report ============================================================
  let totalItems = $state(0);
  let currentPage = $state(1);
  let reportItems = $state<PomodoroRow[]>([]);
  let loadingReport = $state(false);
  let reportError = $state("");
  let reportToken = 0;

  /** Rows the panel can show without scrolling the page itself. */
  const itemsPerPage = 15;
  const reportPageCount = $derived(
    Math.max(1, Math.ceil(totalItems / itemsPerPage)),
  );
  const reportTotal = $derived(
    reportItems.reduce((sum, row) => sum + (Number(row.time) || 0), 0),
  );

  /** Six hours fills the bar; a short session still keeps a visible stub. */
  const REPORT_BAR_MAX = 360;
  function barPercent(minutes: number) {
    return Math.min(100, Math.max(3, (minutes / REPORT_BAR_MAX) * 100));
  }

  /** Pages run backwards from the newest day, so page 1 is the latest slice. */
  async function loadReportPage(page: number, pages = reportPageCount) {
    const supabase = data.supabase;
    if (!supabase) return;

    const token = ++reportToken;
    loadingReport = true;
    reportError = "";

    const from = (pages - page) * itemsPerPage;
    const to = from + itemsPerPage - 1;

    const { data: rows, error } = await supabase
      .from("pomodoro_table")
      .select("date, time")
      .order("date", { ascending: true })
      .range(from, to);

    if (token !== reportToken) return;

    loadingReport = false;

    if (error) {
      reportItems = [];
      reportError = "Could not load the report.";
      return;
    }

    reportItems = (rows ?? []) as PomodoroRow[];
  }

  async function openReport() {
    const supabase = data.supabase;
    if (!supabase) return;

    const token = ++reportToken;
    showReport = true;
    loadingReport = true;
    reportError = "";

    const { count, error } = await supabase
      .from("pomodoro_table")
      .select("date", { count: "exact", head: true });

    if (token !== reportToken || !showReport) return;

    if (error) {
      loadingReport = false;
      reportError = "Could not load the report.";
      return;
    }

    totalItems = count ?? 0;
    currentPage = 1;
    await loadReportPage(1, Math.max(1, Math.ceil(totalItems / itemsPerPage)));
  }

  function changePage(page: number) {
    currentPage = page;
    void loadReportPage(page);
  }

  // === Settings ==========================================================
  let wakeEnabled = $state(true);
  let wakeLock: WakeLockSentinel | null = null;
  const wakeSupported = $derived(
    browser && typeof navigator !== "undefined" && "wakeLock" in navigator,
  );

  async function acquireWakeLock() {
    if (
      !wakeEnabled ||
      !wakeSupported ||
      wakeLock ||
      document.visibilityState !== "visible"
    ) {
      return;
    }

    try {
      wakeLock = await navigator.wakeLock.request("screen");
      wakeLock.addEventListener("release", () => {
        wakeLock = null;
      });
    } catch {
      // A denied or unavailable lock only means the screen may still sleep.
    }
  }

  async function releaseWakeLock() {
    const lock = wakeLock;
    wakeLock = null;
    await lock?.release().catch(() => {});
  }

  function toggleWake() {
    wakeEnabled = !wakeEnabled;
    if (wakeEnabled) void acquireWakeLock();
    else void releaseWakeLock();
  }

  /** Only writes settings back once the stored values have been read. */
  let settingsReady = $state(false);

  $effect(() => {
    if (!settingsReady) return;

    saveSettings({
      focusMinutes: pomodoro.focusMinutes,
      shortbreakMinutes: pomodoro.shortbreakMinutes,
      longbreakMinutes: pomodoro.longbreakMinutes,
      intervals: pomodoro.intervals,
    });
  });

  // === Audio =============================================================
  let audioEl = $state<HTMLAudioElement | null>(null);
  let lastSoundToken = 0;

  /**
   * Imperative, because `src` and `paused` fight when bound together: a new
   * track reloads the element and silently re-pauses it. One track, no chime,
   * no loop — a finished session cannot ring repeatedly.
   */
  $effect(() => {
    const audio = audioEl;
    const src = pomodoro.ambient;
    const paused = pomodoro.ambientPaused;
    const token = pomodoro.soundToken;

    if (!audio) return;

    if (audio.getAttribute("src") !== src) audio.src = src;

    if (paused) {
      audio.pause();
      return;
    }

    // A new start replays the short cue from the beginning, even when the
    // track string did not change (pressing the same mode twice).
    if (token !== lastSoundToken) {
      lastSoundToken = token;
      audio.currentTime = 0;
    }

    void audio.play().catch(() => {});
  });

  // === Keyboard ==========================================================
  function onKeyDown(event: KeyboardEvent) {
    const target = event.target;
    if (
      target instanceof HTMLElement &&
      target.closest('input, textarea, select, [contenteditable="true"]')
    ) {
      return;
    }

    if (event.metaKey || event.ctrlKey || event.altKey) return;
    // Holding a key must not fire the shortcut repeatedly.
    if (event.repeat) return;

    if (event.key === " ") {
      if (modalOpen) return;
      event.preventDefault();
      toggleTimer();
      return;
    }

    const key = event.key.toLowerCase();
    if (key === "f") toggleWake();
    if (key === "m") toggleMute();
  }

  // === Lifecycle =========================================================
  onMount(() => {
    restoreSettings();
    settingsReady = true;

    // The old page re-anchored a running session on arrival.
    if (!pomodoro.isPaused) startTimer();
    syncTimer(pomodoro.currentTimestamp || Date.now());

    const onVisibility = () => {
      if (document.visibilityState === "visible") {
        syncTimer(pomodoro.currentTimestamp || Date.now());
        if (wakeEnabled) void acquireWakeLock();
      }
    };
    document.addEventListener("visibilitychange", onVisibility);

    void acquireWakeLock();

    return () => {
      document.removeEventListener("visibilitychange", onVisibility);
      void releaseWakeLock();
    };
  });

  onDestroy(() => {
    // Old page paused the ambient track when it unmounted.
    pomodoro.ambientPaused = true;
  });
</script>

<svelte:head>
  <title>{title}</title>
  <meta name="description" content="Pomodoro focus timer" />
</svelte:head>

<!-- One ambient track, as in the old page: no chime and no loop, so a finished
     session can never ring repeatedly. -->
<audio
  bind:this={audioEl}
  src={pomodoro.ambient}
  muted={pomodoro.isMuted}
  preload="auto"
></audio>

<Container fullscreen class="justify-between gap-0">
  <!-- Toolbar: one dark strip on the FSRS scale, centred and capped at 24rem.
       Mode cells, the interval gauge, and the panel buttons share a single 36px
       height, so nothing floats loose and the circle stays the artwork. -->
  <div class="flex w-full shrink-0 justify-center pt-2">
    <div
      class="flex w-full max-w-382 items-stretch overflow-hidden rounded-2 border border-white/10 bg-black/45 shadow-[0_4px_18px_rgba(0,0,0,0.45)] backdrop-blur-md"
    >
      <div role="group" aria-label="Timer mode" class="flex items-stretch">
        {#each MODES as mode, index (mode.id)}
          {@const active = pomodoro.mode === mode.id}
          {@const ModeIcon = mode.icon}
          <button
            type="button"
            onclick={() => setMode(mode.id)}
            aria-pressed={active}
            aria-label={mode.label}
            title={mode.label}
            class="flex h-24 w-30 cursor-pointer touch-manipulation items-center justify-center transition-colors duration-200 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-emerald-300 motion-reduce:transition-none {index >
            0
              ? 'border-l border-white/10'
              : ''} {active
              ? MODE_ACTIVE
              : 'text-slate-300 hover:bg-white/10 hover:text-white'}"
          >
            <ModeIcon class="size-16" aria-hidden="true" />
          </button>
        {/each}
      </div>

      <div
        class="flex min-w-0 flex-1 items-center gap-2 border-l border-white/10 px-12"
        role="progressbar"
        aria-label="Focus interval"
        aria-valuemin="0"
        aria-valuemax={pomodoro.intervals}
        aria-valuenow={pomodoro.currentInterval}
        aria-valuetext="Interval {pomodoro.currentInterval} of {pomodoro.intervals}"
      >
        {#each { length: pomodoro.intervals } as _, index (index)}
          <span
            class="h-4 min-w-0 flex-1 rounded-full transition-colors duration-300 {index <
            pomodoro.currentInterval
              ? 'bg-slate-200'
              : 'bg-white/20'}"
          ></span>
        {/each}
      </div>

      <div
        class="flex items-stretch divide-x divide-white/10 border-l border-white/10"
      >
        <button
          type="button"
          onclick={openReport}
          aria-label="Focus report"
          aria-expanded={showReport}
          title="Report"
          class="{ICON_BTN} {showReport ? CELL_ON : ''}"
        >
          <MaterialSymbolsInsertChartOutlineRounded
            class="size-14"
            aria-hidden="true"
          />
        </button>

        <button
          type="button"
          onclick={() => (showHeatmap = true)}
          aria-label="Focus heatmap"
          aria-expanded={showHeatmap}
          title="Heatmap"
          class="{ICON_BTN} {showHeatmap ? CELL_ON : ''}"
        >
          <MaterialSymbolsLightBackgroundGridSmallSharp
            class="size-14"
            aria-hidden="true"
          />
        </button>

        <button
          type="button"
          onclick={() => (showSettings = true)}
          aria-label="Timer settings"
          aria-expanded={showSettings}
          title="Settings"
          class="{ICON_BTN} {showSettings ? CELL_ON : ''}"
        >
          <MaterialSymbolsSettingsRounded class="size-14" aria-hidden="true" />
        </button>

        <button
          type="button"
          onclick={toggleMute}
          aria-pressed={pomodoro.isMuted}
          aria-label={pomodoro.isMuted ? "Unmute the timer" : "Mute the timer"}
          title={pomodoro.isMuted ? "Unmute" : "Mute"}
          class="{ICON_BTN} {pomodoro.isMuted
            ? 'text-slate-500 hover:text-white'
            : ''}"
        >
          {#if pomodoro.isMuted}
            <MaterialSymbolsVolumeOffRounded
              class="size-14"
              aria-hidden="true"
            />
          {:else}
            <MaterialSymbolsVolumeUpRounded
              class="size-14"
              aria-hidden="true"
            />
          {/if}
        </button>
      </div>
    </div>
  </div>

  <div
    class="flex min-h-0 w-full flex-1 items-center justify-center px-8 pt-6"
    style="--width: min(92vw, 540px, calc(100dvh - 180px));"
  >
    <Circle>
      <div class="relative h-full w-full overflow-hidden">
        <img
          src={MODE_IMAGE[pomodoro.mode]}
          alt=""
          aria-hidden="true"
          decoding="async"
          class="absolute inset-0 size-full object-cover transition-[filter] duration-1000 ease-linear"
          style="filter: grayscale({percent / 100});"
        />

        <button
          type="button"
          onclick={toggleTimer}
          aria-label={timerLabel}
          class="group absolute inset-0 z-20 flex cursor-pointer flex-col items-center justify-center gap-8 -outline-offset-6 focus-visible:outline-2 focus-visible:outline-emerald-300"
        >
          {#if pomodoro.isPaused}
            <span
              transition:fade={{ duration: 150 }}
              class="absolute inset-0 bg-slate-950/55"
              aria-hidden="true"
            ></span>
          {/if}

          <!-- A soft vignette, so the readout stays legible over a bright painting. -->
          <span
            class="absolute inset-0 bg-[radial-gradient(circle_at_center,rgba(2,6,23,0.85)_0%,rgba(2,6,23,0.5)_45%,transparent_72%)]"
            aria-hidden="true"
          ></span>

          <span
            class="relative flex items-center gap-6 rounded-full border border-white/15 bg-white/10 px-12 py-3 text-10 font-semibold tracking-[0.18em] text-white/90 uppercase backdrop-blur-sm"
          >
            <ModeIcon class="size-14" aria-hidden="true" />
            {modeLabel}
          </span>

          <span
            class="relative font-rubik text-[clamp(2.5rem,8.5vw,4rem)] leading-none font-300 text-white tabular-nums [text-shadow:0_2px_14px_rgba(2,6,23,0.9)]"
          >
            {timeText}
          </span>

          <span
            class="relative flex items-center gap-6 rounded-full border border-white/20 bg-black/45 py-5 pr-12 pl-10 text-11 font-medium text-white backdrop-blur-sm transition-colors duration-200 group-hover:border-white/40 group-hover:bg-black/65 motion-reduce:transition-none"
          >
            {#if pomodoro.isPaused}
              <IconPlayFill class="size-14" aria-hidden="true" />
              Resume
            {:else}
              <IconPauseFill class="size-14" aria-hidden="true" />
              Pause
            {/if}
          </span>

          <span
            class="relative flex items-center gap-6 text-10 tracking-[0.14em] text-white/65 uppercase tabular-nums"
          >
            <IconTimer class="size-14" aria-hidden="true" />
            Interval {pomodoro.currentInterval} / {pomodoro.intervals}
          </span>
        </button>

        <div
          class="pointer-events-none absolute inset-x-0 bottom-0 z-10 h-64 bg-linear-to-t from-slate-950/70 to-transparent"
          aria-hidden="true"
        ></div>
      </div>
    </Circle>
  </div>

  <p
    class="hidden w-full items-center justify-center gap-12 pb-8 text-10 text-slate-500 sm:flex"
  >
    <span><kbd class="key">Space</kbd> play / pause</span>
    <span><kbd class="key">F</kbd> keep awake</span>
    <span><kbd class="key">M</kbd> mute</span>
  </p>
</Container>

<svelte:window onkeydown={onKeyDown} />

<!-- === Report ========================================================== -->
<Modal bind:showModal={showReport} label="Focus report" variant="fill">
  <div class={MODAL_PANEL}>
    <div class={MODAL_HEADER}>
      <div class="min-w-0">
        <p class="truncate text-sm font-semibold text-white">Report</p>
        <p class="text-11 text-slate-400 tabular-nums">
          {totalItems}
          {totalItems === 1 ? "day" : "days"} recorded
        </p>
      </div>
      <button
        type="button"
        onclick={() => (showReport = false)}
        aria-label="Close the report"
        class={MODAL_CLOSE}
      >
        <IconX class="size-16" aria-hidden="true" />
      </button>
    </div>

    {#if loadingReport}
      <div class="flex flex-1 items-center justify-center py-40">
        <IconSpinner class="size-20 text-emerald-500" aria-hidden="true" />
        <span class="sr-only">Loading the report</span>
      </div>
    {:else if reportError}
      <p role="alert" class="flex-1 p-16 text-sm text-rose-400">
        {reportError}
      </p>
    {:else if reportItems.length === 0}
      <div
        class="flex flex-1 flex-col items-center justify-center gap-4 py-40 text-center"
      >
        <IconTimer class="size-24 text-emerald-400" aria-hidden="true" />
        <p class="text-sm font-medium text-slate-100">No focus time yet</p>
        <p class="max-w-[26ch] text-xs text-slate-400">
          Finished focus sessions are added to your own day.
        </p>
      </div>
    {:else}
      <div class="min-h-0 flex-1 overflow-y-auto">
        <table class="w-full border-collapse text-left">
          <thead
            class="sticky top-0 z-10 bg-slate-950/90 text-10 tracking-[0.18em] text-slate-400 uppercase backdrop-blur-sm"
          >
            <tr>
              <th scope="col" class="px-16 py-8 font-semibold">Date</th>
              <th scope="col" class="px-16 py-8 text-right font-semibold">
                Time (hh:mm)
              </th>
            </tr>
          </thead>
          <tbody class="divide-y divide-white/5">
            {#each reportItems as row (row.date)}
              <tr class={row.date === todayDate ? "bg-emerald-400/10" : ""}>
                <td
                  class="px-16 py-8 font-rubik text-xs tabular-nums {row.date ===
                  todayDate
                    ? 'text-emerald-300'
                    : 'text-slate-400'}"
                >
                  {row.date}
                </td>
                <td class="px-16 py-8">
                  <div class="flex items-center gap-8">
                    <div
                      class="h-8 min-w-0 flex-1 overflow-hidden rounded-full bg-white/10"
                      aria-hidden="true"
                    >
                      <div
                        class="h-full rounded-full {row.date === todayDate
                          ? 'bg-emerald-400'
                          : 'bg-emerald-600/45'}"
                        style="width: {barPercent(Number(row.time) || 0)}%"
                      ></div>
                    </div>
                    <span
                      class="w-44 shrink-0 text-right font-rubik text-xs tabular-nums {row.date ===
                      todayDate
                        ? 'text-emerald-300'
                        : 'text-slate-400'}"
                    >
                      {formatClock(Number(row.time) || 0)}
                    </span>
                  </div>
                </td>
              </tr>
            {/each}
          </tbody>
        </table>
      </div>

      <div
        class="flex shrink-0 flex-col gap-8 border-t border-white/10 bg-slate-950/60 px-12 py-8"
      >
        <p class="text-11 text-slate-400 tabular-nums">
          {formatDuration(reportTotal)} on this page
        </p>
        <Pagination
          bind:page={currentPage}
          pageCount={reportPageCount}
          onchange={changePage}
          label="Report pages"
          class="w-full"
        />
      </div>
    {/if}
  </div>
</Modal>

<!-- === Heatmap ========================================================= -->
<Modal bind:showModal={showHeatmap} label="Focus heatmap" variant="fill">
  <div class={MODAL_PANEL_WIDE}>
    <div class={MODAL_HEADER}>
      <p class="truncate text-sm font-semibold text-white">Heatmap</p>
      <button
        type="button"
        onclick={() => (showHeatmap = false)}
        aria-label="Close the heatmap"
        class={MODAL_CLOSE}
      >
        <IconX class="size-16" aria-hidden="true" />
      </button>
    </div>

    {#if showHeatmap}
      <div class="min-h-0 flex-1 overflow-y-auto">
        <Heatmap />
      </div>
    {/if}
  </div>
</Modal>

<!-- === Settings ======================================================== -->
<Modal bind:showModal={showSettings} label="Timer settings">
  <div class={MODAL_PANEL_COMPACT}>
    <div class={MODAL_HEADER}>
      <p class="truncate text-sm font-semibold text-white">Setting</p>
      <button
        type="button"
        onclick={() => (showSettings = false)}
        aria-label="Close the settings"
        class={MODAL_CLOSE}
      >
        <IconX class="size-16" aria-hidden="true" />
      </button>
    </div>

    <div class="min-h-0 flex-1 overflow-y-auto p-16">
      <p
        class="mb-8 text-10 font-semibold tracking-[0.2em] text-slate-500 uppercase"
      >
        Time (minutes)
      </p>

      <div class="grid grid-cols-3 gap-8">
        <label class="block min-w-0">
          <span class="mb-4 block text-xs text-slate-300">Pomodoro</span>
          <input
            type="number"
            name="pomodoro"
            min="1"
            max="180"
            step="1"
            inputmode="numeric"
            value={pomodoro.focusMinutes}
            oninput={(event) =>
              setMinutes("focus", event.currentTarget.valueAsNumber)}
            class={NUM_INPUT}
          />
        </label>

        <label class="block min-w-0">
          <span class="mb-4 block text-xs text-slate-300">Short Break</span>
          <input
            type="number"
            name="shortBreak"
            min="1"
            max="180"
            step="1"
            inputmode="numeric"
            value={pomodoro.shortbreakMinutes}
            oninput={(event) =>
              setMinutes("shortbreak", event.currentTarget.valueAsNumber)}
            class={NUM_INPUT}
          />
        </label>

        <label class="block min-w-0">
          <span class="mb-4 block text-xs text-slate-300">Long Break</span>
          <input
            type="number"
            name="longBreak"
            min="1"
            max="180"
            step="1"
            inputmode="numeric"
            value={pomodoro.longbreakMinutes}
            oninput={(event) =>
              setMinutes("longbreak", event.currentTarget.valueAsNumber)}
            class={NUM_INPUT}
          />
        </label>
      </div>

      <p
        class="mt-16 mb-8 text-10 font-semibold tracking-[0.2em] text-slate-500 uppercase"
      >
        Long Break interval
      </p>

      <div class="grid grid-cols-2 gap-8">
        <label class="block min-w-0">
          <span class="mb-4 block text-xs text-slate-300">Every</span>
          <input
            type="number"
            name="longBreakInterval"
            min="1"
            max="12"
            step="1"
            inputmode="numeric"
            value={pomodoro.intervals}
            oninput={(event) => setIntervals(event.currentTarget.valueAsNumber)}
            class={NUM_INPUT}
          />
        </label>

        <label class="block min-w-0">
          <span class="mb-4 block text-xs text-slate-300">Current interval</span
          >
          <input
            type="number"
            name="currentInterval"
            min="1"
            max={pomodoro.intervals}
            step="1"
            inputmode="numeric"
            value={pomodoro.currentInterval}
            oninput={(event) =>
              setCurrentInterval(event.currentTarget.valueAsNumber)}
            class={NUM_INPUT}
          />
        </label>
      </div>

      <p
        class="mt-16 mb-8 text-10 font-semibold tracking-[0.2em] text-slate-500 uppercase"
      >
        Display
      </p>

      <div
        class="flex items-center justify-between gap-12 rounded-12 border border-white/10 bg-white/5 p-12"
      >
        <div class="flex min-w-0 items-start gap-10">
          <IconSun
            class="mt-px size-20 shrink-0 text-amber-300"
            aria-hidden="true"
          />
          <div class="min-w-0">
            <p class="text-xs font-medium text-slate-100">Keep screen awake</p>
            <p class="mt-2 text-11 leading-snug text-slate-400">
              {wakeSupported
                ? "Stops the display from sleeping while the timer runs."
                : "This browser cannot keep the screen awake."}
            </p>
          </div>
        </div>

        <button
          type="button"
          role="switch"
          aria-checked={wakeEnabled}
          aria-label="Keep the screen awake"
          onclick={toggleWake}
          disabled={!wakeSupported}
          class="relative h-24 w-44 shrink-0 cursor-pointer rounded-full border transition-colors duration-200 outline-offset-2 focus-visible:outline-2 focus-visible:outline-emerald-400 disabled:cursor-not-allowed disabled:opacity-40 motion-reduce:transition-none {wakeEnabled
            ? 'border-emerald-300/50 bg-emerald-400'
            : 'border-white/10 bg-white/15'}"
        >
          <span
            class="absolute top-2 left-2 flex size-18 items-center justify-center rounded-full bg-white text-slate-900 shadow-sm transition-transform duration-200 motion-reduce:transition-none {wakeEnabled
              ? 'translate-x-20'
              : ''}"
            aria-hidden="true"
          >
            {#if wakeEnabled}
              <IconSun class="size-12" />
            {:else}
              <IconMoon class="size-12" />
            {/if}
          </span>
        </button>
      </div>

      <p class="mt-16 text-11 text-slate-400">
        Changes apply immediately and are remembered on this device.
      </p>
    </div>

    <div
      class="flex shrink-0 items-center justify-between gap-8 border-t border-white/10 bg-slate-950/60 px-12 py-8"
    >
      <p class="text-10 text-slate-400">
        {pomodoro.isPaused ? "Timer paused" : "Timer running"}
      </p>
      <button
        type="button"
        onclick={() => (showSettings = false)}
        class="h-36 cursor-pointer rounded-8 bg-emerald-500 px-16 text-xs font-semibold text-slate-950 transition-colors hover:bg-emerald-400 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-600 active:scale-97 motion-reduce:transition-none"
      >
        Done
      </button>
    </div>
  </div>
</Modal>

<style lang="postcss">
  .key {
    display: inline-block;
    padding: 0 4px;
    border: 1px solid rgb(255 255 255 / 0.15);
    border-radius: 4px;
    background-color: rgb(255 255 255 / 0.06);
    font-family: var(--font-rubik);
    font-size: 10px;
    line-height: 16px;
  }
</style>
