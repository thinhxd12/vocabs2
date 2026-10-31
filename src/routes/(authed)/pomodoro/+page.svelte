<script lang="ts">
  import { browser } from "$app/env";
  import Circle from "#lib/components/Circle.svelte";
  import Container from "#lib/components/Container.svelte";
  import Heatmap from "#lib/components/Heatmap.svelte";
  import Modal from "#lib/components/Modal.svelte";
  import Pagination from "#lib/components/Pagination.svelte";
  import { BTN, BTN_ON } from "#lib/ui/button.ts";
  import { onDestroy, onMount } from "svelte";
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

  /** The app's button (`#lib/ui/button.ts`) at the toolbar's 28px, so these
   *  tiles read as the navbar's dock, one size up. */
  const TILE = `${BTN} h-16 w-18`;
  const TILE_ON = `${BTN_ON} h-16 w-18 bg-green-400/60!`;

  const MODAL_PANEL =
    "flex h-[calc(100dvh_-_68px)] min-h-0 w-[min(94vw,23.625rem)] max-w-378 flex-col overflow-hidden rounded-2 bg-white text-black shadow-2xl";

  /* Settings already read well; keep its compact, centred form. */
  const MODAL_PANEL_COMPACT =
    "flex max-h-[min(84dvh,38rem)] w-[min(94vw,23.625rem)] max-w-378 flex-col overflow-hidden rounded-2 bg-white text-black shadow-2xl";

  const MODAL_HEADER =
    "flex h-48 shrink-0 items-center justify-between gap-8 bg-black pr-8 pl-16 text-white";

  const MODAL_CLOSE =
    "flex size-36 shrink-0 cursor-pointer items-center justify-center rounded-2 text-slate-200 transition-colors hover:bg-white/15 hover:text-white focus-visible:outline-2 focus-visible:outline-emerald-300";

  /** The heatmap keeps 31 fixed 10px columns, so its panel runs a little wider
   *  and only as tall as the grid needs. */
  const MODAL_PANEL_WIDE =
    "flex max-h-[min(84dvh,44rem)] min-h-0 w-[min(96vw,28rem)] max-w-448 flex-col overflow-hidden rounded-2 bg-white text-black shadow-2xl";

  const NUM_INPUT =
    "h-36 w-full rounded-2 border border-slate-300 bg-white px-10 font-rubik text-14 text-black tabular-nums outline-hidden transition-colors placeholder:text-black/50 focus-visible:border-emerald-500 focus-visible:ring-1 focus-visible:ring-emerald-500/30 [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none [appearance:textfield]";

  const todayDate = todayISO();

  const timeText = $derived(formatTimerString(pomodoro.secondsRemaining));
  const modeLabel = $derived(MODE_LABEL[pomodoro.mode]);
  /** Share of the session left; the old page drained the artwork's colour. */
  const percent = $derived(remainingPercent());

  /** Whether the band behind the interval dots is dark. The dots are drawn on
   *  the painting, so they flip to whichever colour contrasts — white on a dark
   *  band, black on a light one. Sampled rather than hand-tuned per artwork: the
   *  image changes with the mode, and each one is different. */
  let artIsDark = $state(true);

  $effect(() => {
    const src = MODE_IMAGE[pomodoro.mode];
    const image = new Image();
    image.src = src;

    let cancelled = false;

    image
      .decode()
      .then(() => {
        if (cancelled) return;

        const canvas = document.createElement("canvas");
        canvas.width = 32;
        canvas.height = 32;
        const context = canvas.getContext("2d");
        if (!context) return;

        // The band the dots sit in: the middle half of the bottom eighth.
        context.drawImage(
          image,
          image.width * 0.25,
          image.height * 0.875,
          image.width * 0.5,
          image.height * 0.125,
          0,
          0,
          32,
          32,
        );

        const { data } = context.getImageData(0, 0, 32, 32);
        let luminance = 0;
        for (let i = 0; i < data.length; i += 4) {
          luminance +=
            0.2126 * data[i] + 0.7152 * data[i + 1] + 0.0722 * data[i + 2];
        }

        artIsDark = luminance / (data.length / 4) < 128;
      })
      .catch(() => {});

    return () => {
      cancelled = true;
    };
  });

  /** The dot pair for that band: solid for elapsed, ring for still to come. */
  const dotOn = $derived(
    artIsDark ? "bg-white shadow-black/50" : "bg-black shadow-white/80",
  );
  const dotOff = $derived(
    artIsDark ? "border border-white/70" : "border border-black/60",
  );

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

  /** Four pixels per six recorded minutes, as the old report drew it. */
  function barWidth(minutes: number) {
    return Math.round((Math.max(0, minutes) / 6) * 4);
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
  <!-- Toolbar: the navbar's tiles, one size up, on nothing but the page — modes
       at one end, panels at the other. The medallion is the play/pause, so no
       pause tile here. -->
  <div class="flex w-full shrink-0 justify-center pt-2">
    <div class="flex w-full max-w-382 items-center justify-between gap-2">
      <div role="group" aria-label="Timer mode" class="flex items-center gap-3">
        {#each MODES as mode (mode.id)}
          {@const active = pomodoro.mode === mode.id}
          {@const ModeIcon = mode.icon}
          <button
            type="button"
            onclick={() => setMode(mode.id)}
            aria-pressed={active}
            aria-label={mode.label}
            title={mode.label}
            class={active ? TILE_ON : TILE}
          >
            <ModeIcon class="size-16" aria-hidden="true" />
          </button>
        {/each}
      </div>

      <div class="flex items-center gap-3">
        <button
          type="button"
          onclick={openReport}
          aria-label="Focus report"
          aria-expanded={showReport}
          title="Report"
          class={showReport ? TILE_ON : TILE}
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
          class={showHeatmap ? TILE_ON : TILE}
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
          class={showSettings ? TILE_ON : TILE}
        >
          <MaterialSymbolsSettingsRounded class="size-14" aria-hidden="true" />
        </button>

        <button
          type="button"
          onclick={toggleMute}
          aria-pressed={pomodoro.isMuted}
          aria-label={pomodoro.isMuted ? "Unmute the timer" : "Mute the timer"}
          title={pomodoro.isMuted ? "Unmute" : "Mute"}
          class={TILE}
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
          class="group absolute inset-0 z-20 flex cursor-pointer touch-manipulation items-center justify-center -outline-offset-6 focus-visible:outline-2 focus-visible:outline-emerald-300"
        >
          <!-- Nothing on the artwork until the reader reaches for it: the image
               is the point, and the control is one click away on hover. -->
          <span
            class="flex size-72 items-center justify-center rounded-full border border-white/25 bg-slate-950/45 text-white opacity-0 backdrop-blur-sm transition-opacity duration-200 group-hover:opacity-100 group-focus-visible:opacity-100 group-active:opacity-100 motion-reduce:transition-none"
          >
            {#if pomodoro.isPaused}
              <IconPlayFill class="size-30" aria-hidden="true" />
            {:else}
              <IconPauseFill class="size-30" aria-hidden="true" />
            {/if}
          </span>
        </button>

        <!-- The interval dots sit on the artwork's bottom edge: the count is
             about the painting, so it belongs to it, not the toolbar. Above the
             button and inert, so the whole square still toggles the timer. -->
        <div
          class="pointer-events-none absolute inset-x-0 bottom-3 z-30 flex items-center justify-center gap-4"
          role="progressbar"
          aria-label="Focus interval"
          aria-valuemin="0"
          aria-valuemax={pomodoro.intervals}
          aria-valuenow={pomodoro.currentInterval}
          aria-valuetext="Interval {pomodoro.currentInterval} of {pomodoro.intervals}"
        >
          {#each { length: pomodoro.intervals } as _, index (index)}
            <span
              class="size-4 shrink-0 rounded-full shadow-sm transition-colors duration-300 {index <
              pomodoro.currentInterval
                ? dotOn
                : dotOff}"
            ></span>
          {/each}
        </div>
      </div>
    </Circle>
  </div>

  <p
    class="hidden w-full items-center justify-center gap-12 pb-8 text-10 text-slate-200 sm:flex"
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
        <p class="truncate text-14 font-semibold text-white">Report</p>
        <p class="text-11 text-slate-300 tabular-nums">
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
        <IconSpinner class="size-20 text-emerald-600" aria-hidden="true" />
        <span class="sr-only">Loading the report</span>
      </div>
    {:else if reportError}
      <p role="alert" class="flex-1 p-16 text-14 text-rose-600">
        {reportError}
      </p>
    {:else if reportItems.length === 0}
      <div
        class="flex flex-1 flex-col items-center justify-center gap-3 py-30 text-center"
      >
        <IconTimer class="size-24 text-emerald-600" aria-hidden="true" />
        <p class="text-14 font-medium text-black">No focus time yet</p>
        <p class="max-w-[26ch] text-12 text-black/60">
          Finished focus sessions are added to your own day.
        </p>
      </div>
    {:else}
      <div class="min-h-0 flex-1 overflow-y-auto">
        <table class="w-full border-collapse text-left">
          <thead
            class="sticky top-0 z-10 bg-slate-50/90 text-10 tracking-[0.18em] text-black/60 uppercase backdrop-blur-sm"
          >
            <tr>
              <th scope="col" class="px-12 py-6 font-semibold">Date</th>
              <th scope="col" class="py-6 pr-15 font-semibold">
                Time (hh:mm)
              </th>
            </tr>
          </thead>
          <tbody class="divide-y divide-slate-200">
            {#each reportItems as row (row.date)}
              <tr>
                <td
                  class="w-0 p-12 py-6 font-rubik text-12 whitespace-nowrap tabular-nums {row.date ===
                  todayDate
                    ? 'text-black'
                    : 'text-black/60'}"
                >
                  {row.date}
                </td>
                <td class="py-6 pr-15">
                  <div
                    class="relative h-18 rounded-2 {row.date === todayDate
                      ? 'bg-blue-400'
                      : 'bg-blue-200'}"
                    style="width: {barWidth(Number(row.time) || 0)}px;"
                  >
                    <span
                      class="absolute {Number(row.time) <= 60
                        ? 'left-3 text-left'
                        : 'right-3 text-right'} min-w-36 font-rubik text-10 leading-18 text-black/70 tabular-nums"
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
        class="flex shrink-0 flex-col gap-8 border-t border-slate-200 bg-slate-50 px-12 py-8"
      >
        <p class="text-11 text-black/60 tabular-nums">
          {formatDuration(reportTotal)} on this page
        </p>
        <Pagination
          bind:page={currentPage}
          pageCount={reportPageCount}
          onchange={changePage}
          label="Report pages"
          tone="light"
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
      <p class="truncate text-14 font-semibold text-white">Heatmap</p>
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
      <div class="min-h-0 flex-1 overflow-y-auto pb-6">
        <Heatmap />
      </div>
    {/if}
  </div>
</Modal>

<!-- === Settings ======================================================== -->
<Modal bind:showModal={showSettings} label="Timer settings">
  <div class={MODAL_PANEL_COMPACT}>
    <div class={MODAL_HEADER}>
      <p class="truncate text-14 font-semibold text-white">Setting</p>
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
        class="mb-8 text-10 font-semibold tracking-[0.2em] text-black/60 uppercase"
      >
        Time (minutes)
      </p>

      <div class="grid grid-cols-3 gap-8">
        <label class="block min-w-0">
          <span class="mb-4 block text-12 text-black/70">Pomodoro</span>
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
          <span class="mb-4 block text-12 text-black/70">Short Break</span>
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
          <span class="mb-4 block text-12 text-black/70">Long Break</span>
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
        class="mt-16 mb-8 text-10 font-semibold tracking-[0.2em] text-black/60 uppercase"
      >
        Long Break interval
      </p>

      <div class="grid grid-cols-2 gap-8">
        <label class="block min-w-0">
          <span class="mb-4 block text-12 text-black/70">Every</span>
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
          <span class="mb-4 block text-12 text-black/70">Current interval</span>
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
        class="mt-16 mb-8 text-10 font-semibold tracking-[0.2em] text-black/60 uppercase"
      >
        Display
      </p>

      <div
        class="flex items-center justify-between gap-12 rounded-2 border border-slate-200 bg-slate-50 p-12"
      >
        <div class="flex min-w-0 items-start gap-10">
          <IconSun
            class="mt-px size-20 shrink-0 text-amber-500"
            aria-hidden="true"
          />
          <div class="min-w-0">
            <p class="text-12 font-medium text-black">Keep screen awake</p>
            <p class="mt-2 text-11 leading-snug text-black/60">
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
          class="relative h-24 w-44 shrink-0 cursor-pointer rounded-full border transition-colors duration-200 outline-offset-2 focus-visible:outline-2 focus-visible:outline-emerald-600 disabled:cursor-not-allowed disabled:opacity-40 motion-reduce:transition-none {wakeEnabled
            ? 'border-emerald-600 bg-emerald-500'
            : 'border-slate-300 bg-slate-200'}"
        >
          <span
            class="absolute top-2 left-2 flex size-18 items-center justify-center rounded-full bg-white text-black shadow-sm ring-1 ring-black/10 transition-transform duration-200 motion-reduce:transition-none {wakeEnabled
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

      <p class="mt-16 text-11 text-black/60">
        Changes apply immediately and are remembered on this device.
      </p>
    </div>

    <div
      class="flex shrink-0 items-center justify-between gap-8 border-t border-slate-200 bg-slate-50 px-12 py-8"
    >
      <p class="text-10 text-black/60">
        {pomodoro.isPaused ? "Timer paused" : "Timer running"}
      </p>
      <button
        type="button"
        onclick={() => (showSettings = false)}
        class="h-36 cursor-pointer rounded-2 bg-emerald-600 px-16 text-12 font-semibold text-white transition-colors hover:bg-emerald-500 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-600 active:scale-97 motion-reduce:transition-none"
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
