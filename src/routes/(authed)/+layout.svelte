<script lang="ts">
  import { refreshAll } from "$app/navigation";
  import { onMount } from "svelte";
  import icescape from "#lib/assets/images/Icescape.jpg";
  import NavBar from "#lib/components/NavBar.svelte";
  import {
    restoreCountdown,
    stopCountdown,
    syncCountdown,
  } from "#lib/store/countdown.svelte.ts";
  import { pomodoro, syncTimer } from "#lib/store/pomodoro.svelte.ts";
  import { registerFocusRecorder } from "#lib/store/pomodoro-db.ts";
  import type { LayoutProps } from "./$types";

  let { children, data }: LayoutProps = $props();

  /**
   * Hands the browser's own zone to the server, which stores it against the
   * account and reads it back whenever it has to compare against a date in the
   * database — `schedule_table.date` is a day, and the day that counts is the
   * reader's, not the server's.
   *
   * Once per page load: the endpoint ignores a zone it already holds, and a
   * failed sync only leaves the previously stored one in place.
   */
  onMount(() => {
    const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
    if (timezone) {
      void fetch("/api/timezone", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ timezone }),
      }).catch(() => {});
    }

    // Pick up a countdown that a reload interrupted before the worker starts
    // ticking, so the first tick already has its end time.
    restoreCountdown();

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
  <title>App</title>
</svelte:head>

<div class="relative h-dvh overflow-hidden bg-slate-950">
  <img
    src={icescape}
    alt=""
    aria-hidden="true"
    fetchpriority="high"
    decoding="async"
    class="pointer-events-none fixed inset-0 h-full w-full transform-gpu object-cover select-none"
  />

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
