<script lang="ts">
  import { invalidate, refreshAll } from "$app/navigation";
  import { onMount } from "svelte";
  import icescape from "#lib/assets/images/Icescape.jpg";
  import NavBar from "#lib/components/NavBar.svelte";
  import { BTN } from "#lib/ui/button.ts";
  import IconImage from "~icons/ph/image";
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

  /** The wallpaper and its two-line credit, swapped by the corner button. */
  let wallpaper = $state({
    url: icescape,
    title: "Stunning Icelandic region of volcanoes, beaches, and glaciers.",
    place: "Snæfellsnes peninsula, Iceland",
  });
  let shifting = $state(false);
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

  <!-- The wallpaper's credit, two lines, clear of the button on the other side. -->
  <div
    class="pointer-events-none hidden md:block fixed top-3 left-3 z-20 max-w-[calc(100vw-6rem)] text-white [text-shadow:0_1px_2px_rgba(0,0,0,0.9),0_2px_10px_rgba(0,0,0,0.6)]"
  >
    <p class="truncate text-11.5 font-medium">{wallpaper.title}</p>
    <p class="truncate text-10 text-white/80">{wallpaper.place}</p>
  </div>

  <button
    type="button"
    onclick={shiftBackground}
    disabled={shifting}
    aria-label="Change background"
    title="Change background"
    class="{BTN} hidden md:fixed top-3 right-3 z-20 h-16 w-18"
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

  <div
    class="relative z-10 flex h-full w-full flex-col pb-[calc(44px+env(safe-area-inset-bottom))]"
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
