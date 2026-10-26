<script lang="ts">
  import { invalidate, refreshAll } from "$app/navigation";
  import { page } from "$app/state";
  import { onMount } from "svelte";
  import icescape from "#lib/assets/images/Icescape.jpg";
  import NavBar from "#lib/components/NavBar.svelte";
  import { BTN, BTN_ON } from "#lib/ui/button.ts";
  import IconImage from "~icons/ph/image";
  import IconArrowCounterClockwise from "~icons/ph/arrow-counter-clockwise";
  import MaterialSymbolsVolumeUpRounded from "~icons/material-symbols/volume-up-rounded";
  import MaterialSymbolsVolumeOffRounded from "~icons/material-symbols/volume-off-rounded";
  import IconSpinner from "~icons/svg-spinners/ring-resize";
  import {
    restoreCountdown,
    stopCountdown,
    syncCountdown,
  } from "#lib/store/countdown.svelte.ts";
  import { pomodoro, syncTimer, todayISO } from "#lib/store/pomodoro.svelte.ts";
  import { registerFocusRecorder } from "#lib/store/pomodoro-db.ts";
  import type { LayoutProps } from "./$types";

  let { children, data }: LayoutProps = $props();

  const DEFAULT_WALLPAPER = {
    url: icescape,
    title: "Stunning Icelandic region of volcanoes, beaches, and glaciers.",
    place: "Snæfellsnes peninsula, Iceland",
  };

  /** The wallpaper and its two-line credit, swapped by the corner button. */
  let wallpaper = $state({ ...DEFAULT_WALLPAPER });
  const isDefaultWallpaper = $derived(wallpaper.url === DEFAULT_WALLPAPER.url);

  /** Loops in `static/layout`; a new file there also needs a line here. */
  const VIDEO_BACKGROUNDS = ["rain1", "rain2", "rain3", "rain4"].map(
    (name) => ({
      src: `/layout/${name}.mp4`,
      label: `${name.slice(4)}`,
    }),
  );

  let videoSrc = $state("");
  let videoMuted = $state(true);

  function saveVideo() {
    try {
      localStorage.setItem("videoWallpaper", videoSrc);
    } catch {
      // Storage blocked: the choice lasts this visit.
    }
  }

  /** A newly picked clip starts muted: an unmuted autoplay would be blocked. */
  function chooseVideo() {
    videoMuted = true;
    saveVideo();
  }

  let shifting = $state(false);
  /** The art page owns its own canvas: no wallpaper credit or swap button. */
  const onArt = $derived(page.url.pathname === "/art");
  /** The visit's first change asks the server to start at 28991 again. */
  let started = false;

  async function shiftBackground() {
    if (shifting) return;
    shifting = true;

    try {
      const response = await fetch(`/api/spotlight${started ? "" : "?start"}`);
      started = true;

      if (!response.ok) return;

      const next = (await response.json()) as typeof wallpaper;
      if (!next.url) return;

      // Decode before painting: a full-screen swap otherwise flashes the old one.
      const image = new Image();
      image.src = next.url;
      await image.decode();

      wallpaper = next;
      localStorage.setItem("wallpaper", JSON.stringify(next));
    } catch {
      // A bad scrape or an offline decode leaves the current wallpaper up.
    } finally {
      shifting = false;
    }
  }

  /** Back to the bundled Iceland shot, and the stored choice goes with it. */
  function resetBackground() {
    wallpaper = { ...DEFAULT_WALLPAPER };
    videoSrc = "";
    try {
      localStorage.removeItem("wallpaper");
      localStorage.removeItem("videoWallpaper");
    } catch {
      // Storage blocked: the default still stands for this visit.
    }
  }

  /**
   * Hands the browser's own zone to the server. The `timezone` cookie is what
   * the server reads (`hooks.server.ts` → `locals.timeZone`), so it is the copy
   * that decides which day "today" is; the POST is only the durable one, for
   * this browser's later sessions and other clients.
   *
   * Once per page load. A serverless host runs on UTC, so the layout load above
   * may have resolved the day eight hours off: when the browser's own day
   * disagrees with the tile's, the schedule counter is read again — this time
   * with the cookie in the request.
   */
  onMount(() => {
    const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
    if (timezone) {
      // Readable client-side by design; a cookie the server writes could not be.
      document.cookie = `timezone=${timezone}; path=/; max-age=31536000; samesite=lax`;

      void fetch("/api/timezone", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ timezone }),
      }).catch(() => {});

      if (todayISO() !== data.schedule.date) {
        void invalidate("app:schedule").catch(() => {});
      }
    }

    // Pick up a countdown that a reload interrupted before the worker starts
    // ticking, so the first tick already has its end time.
    restoreCountdown();

    // The wallpaper chosen last time; read here so SSR and hydration agree.
    try {
      const saved = localStorage.getItem("wallpaper");
      if (saved) {
        const next = JSON.parse(saved) as typeof wallpaper;
        if (next?.url) wallpaper = next;
      }
    } catch {
      // Storage can be blocked or hold an older value; the default stands.
    }

    // The video picked last time, if its file is still offered. Sound always
    // starts muted: a browser blocks unmuted autoplay anyway.
    try {
      const video = localStorage.getItem("videoWallpaper");
      if (VIDEO_BACKGROUNDS.some((choice) => choice.src === video)) {
        videoSrc = video ?? "";
      }
    } catch {
      // Storage blocked: the image wallpaper stands.
    }

    // One worker heartbeat for the whole authed app: every countdown reads the
    // same wall clock, and the pomodoro timer keeps running on other routes.
    // The worker is a real module worker so ticks survive background throttling.
    let worker: Worker | null = null;
    let fallback: ReturnType<typeof setInterval> | null = null;

    const tick = (timestamp: number) => {
      pomodoro.currentTimestamp = timestamp;
      syncTimer(timestamp);
      syncCountdown(timestamp);
    };

    if (typeof Worker !== "undefined") {
      try {
        worker = new Worker(
          new URL("../../lib/workers/timer.worker.ts", import.meta.url),
          { type: "module" },
        );
        worker.onmessage = (event: MessageEvent<{ timestamp?: number }>) => {
          const timestamp = event.data?.timestamp;
          if (typeof timestamp === "number") tick(timestamp);
        };
        // If the worker cannot load, fall back to the main thread rather than
        // leaving every timer frozen.
        worker.onerror = () => {
          worker?.terminate();
          worker = null;
          fallback ??= setInterval(() => tick(Date.now()), 1000);
        };
        worker.postMessage({ action: "START" });
      } catch {
        worker?.terminate();
        worker = null;
      }
    }

    if (!worker) {
      fallback = setInterval(() => tick(Date.now()), 1000);
    }

    const stopRecording = registerFocusRecorder(data.supabase);

    return () => {
      // Leaving the authed shell (signing out) also ends the quick timer: its
      // heartbeat is gone, so a stale countdown would otherwise reappear on
      // the next sign-in.
      stopCountdown();
      stopRecording();
      if (worker) {
        worker.postMessage({ action: "STOP" });
        worker.terminate();
        worker = null;
      }
      if (fallback) {
        clearInterval(fallback);
        fallback = null;
      }
    };
  });

  // The server enforces the session limit only when a request reaches it, so an
  // idle tab would never notice expiry until the next refresh. Re-run the loads
  // (which hit `hooks.server.ts` and clear the cookies → redirect) right when the
  // session lapses.
  $effect(() => {
    const expiresAt = data.sessionExpiresAt;
    if (!expiresAt) return;

    const remaining = expiresAt - Date.now();
    if (remaining <= 0) {
      refreshAll();
      return;
    }

    const timer = setTimeout(() => refreshAll(), remaining);
    return () => clearTimeout(timer);
  });
</script>

<svelte:head>
  <title>weather</title>
</svelte:head>

<div class="relative h-dvh overflow-hidden bg-slate-950">
  <img
    src={wallpaper.url}
    alt=""
    aria-hidden="true"
    fetchpriority="high"
    decoding="async"
    class="pointer-events-none fixed inset-0 h-full w-full transform-gpu object-cover select-none"
  />

  {#if videoSrc}
    {#key videoSrc}
      <video
        src={videoSrc}
        autoplay
        loop
        playsinline
        bind:muted={videoMuted}
        aria-hidden="true"
        class="pointer-events-none fixed inset-0 h-full w-full transform-gpu object-cover select-none"
      ></video>
    {/key}
  {/if}

  {#if !onArt}
    {#if !videoSrc}
      <!-- The wallpaper's credit, two lines, clear of the button on the other side. -->
      <div
        class="pointer-events-none hidden md:block fixed top-3 left-3 z-20 max-w-[calc(100vw-12rem)] text-white [text-shadow:0_1px_2px_rgba(0,0,0,0.9),0_2px_10px_rgba(0,0,0,0.6)]"
      >
        <p class="truncate text-11.5 font-medium">{wallpaper.title}</p>
        <p class="truncate text-10 text-white/80">{wallpaper.place}</p>
      </div>
    {/if}

    <!-- One rail across the corner: wallpaper swap, video picker, its sound, the way back. -->
    <div class="fixed top-3 right-3 z-20 hidden items-center gap-2 md:flex">
      <button
        type="button"
        onclick={shiftBackground}
        disabled={shifting}
        aria-label="Change background"
        title="Change background"
        class="{BTN} h-16 w-18"
      >
        {#if shifting}
          <IconSpinner
            class="size-14 animate-spin motion-reduce:animate-none"
            aria-hidden="true"
          />
        {:else}
          <IconImage class="size-14" aria-hidden="true" />
        {/if}
      </button>

      <select
        bind:value={videoSrc}
        onchange={chooseVideo}
        aria-label="Background video"
        title="Background video"
        class="h-16 w-18 cursor-pointer appearance-none rounded-2 bg-white/25 px-2 text-center text-10 font-medium text-black shadow-[0_1px_2px_rgba(2,6,23,0.3)] transition-colors outline-hidden hover:bg-white/45 focus-visible:outline-2 focus-visible:outline-emerald-300 [&>option]:bg-white/25 [&>option]:text-center [&>option]:text-10 [&>option]:text-black"
      >
        <option value=""></option>
        {#each VIDEO_BACKGROUNDS as video (video.src)}
          <option value={video.src}>{video.label}</option>
        {/each}
      </select>

      {#if videoSrc}
        <button
          type="button"
          onclick={() => (videoMuted = !videoMuted)}
          aria-pressed={videoMuted}
          aria-label={videoMuted ? "Unmute the video" : "Mute the video"}
          title={videoMuted ? "Unmute" : "Mute"}
          class="{videoMuted ? BTN : BTN_ON} h-16 w-18"
        >
          {#if videoMuted}
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
      {/if}

      {#if !isDefaultWallpaper || videoSrc}
        <button
          type="button"
          onclick={resetBackground}
          aria-label="Reset background"
          title="Default background"
          class="{BTN} h-16 w-18"
        >
          <IconArrowCounterClockwise class="size-14" aria-hidden="true" />
        </button>
      {/if}
    </div>
  {/if}

  <div
    class="relative z-10 flex h-full w-full flex-col justify-start pb-[calc(44px+env(safe-area-inset-bottom))]"
  >
    <main
      class="no-scrollbar min-h-0 flex-1 overflow-y-auto overscroll-contain"
    >
      {@render children()}
    </main>
  </div>

  <NavBar
    schedule={data.schedule}
    memories={data.memories}
    weather={data.navWeather}
  />
</div>
