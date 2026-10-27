<script lang="ts">
  import { enhance } from "$app/forms";
  import { invalidate } from "$app/navigation";
  import { page } from "$app/state";
  import { onMount } from "svelte";
  import IconCloudSun from "~icons/ph/cloud-sun";
  import IconSpinner from "~icons/ph/spinner-gap";
  import sunrise from "#lib/assets/images/sunrise.webp";
  import sunset from "#lib/assets/images/sunset.webp";
  import { reviewProgress } from "#lib/store/review-progress.svelte.ts";
  import { BTN, BTN_ON } from "#lib/ui/button.ts";
  import {
    countdown,
    QUICK_TIMER_MINUTES,
    startCountdown,
    stopCountdown,
  } from "#lib/store/countdown.svelte.ts";
  import { formatTimerString } from "#lib/store/pomodoro.svelte.ts";
  import { getWeatherInfo } from "#lib/weather/conditions.ts";
  import type { NavWeather } from "#lib/weather/types.ts";
  import MaterialSymbolsAdjust from "~icons/material-symbols/adjust";
  import GravityUiFrames from "~icons/gravity-ui/frames";
  import BxsBookBookmark from "~icons/bxs/book-bookmark";
  import MaterialSymbolsDashboardRounded from "~icons/material-symbols/dashboard-rounded";
  import SolarSadSquareOutline from "~icons/solar/sad-square-outline";
  import MajesticonsUnlockOpenLine from "~icons/majesticons/unlock-open-line";
  import SimpleIconsAnki from "~icons/simple-icons/anki";
  import RiAlarmLine from "~icons/ri/alarm-line";
  import MaterialSymbolsFeatureSearchOutline from "~icons/material-symbols/feature-search-outline";

  /** Two rows: the bar is capped at 384px and the two 90px tiles take half. */
  const primary = [
    {
      href: "/vocabs",
      label: "Vocabulary",
      icon: MaterialSymbolsFeatureSearchOutline,
    },
    {
      href: "/dashboard",
      label: "Dashboard",
      icon: MaterialSymbolsDashboardRounded,
    },
    { href: "/pomodoro", label: "Focus", icon: MaterialSymbolsAdjust },
  ];
  const secondary = [
    { href: "/highlights", label: "Highlight", icon: BxsBookBookmark },
    { href: "/art", label: "Art", icon: GravityUiFrames },
    { href: "/sad", label: "Sad days", icon: SolarSadSquareOutline },
    { href: "/fsrs", label: "Review", icon: SimpleIconsAnki },
  ];

  interface Props {
    schedule: { date: string; count: number | null };
    /** Rows in `memories_table`, read once per layout load. */
    memories: number;
    /** Current conditions for the tile at the right, from the authed layout. */
    weather: NavWeather | null;
  }

  let { schedule, memories, weather }: Props = $props();

  /** Two letters fit the tile's foot; Sunday-first, matching `Date.getDay()`. */
  const WEEKDAYS = ["SU", "MO", "TU", "WE", "TH", "FR", "SA"];

  /** The browser's own clock, read after mount. `null` until then, so both the
   *  server render and the first client render paint the server's day. */
  let clock = $state<Date | null>(null);

  function weekdayOf(date: Date) {
    return WEEKDAYS[date.getDay()];
  }

  function dateOfIso(iso: string) {
    const [year, month, day] = iso.split("-").map(Number);
    return new Date(year, month - 1, day);
  }

  const stamp = $derived(
    clock ? weekdayOf(clock) : weekdayOf(dateOfIso(schedule.date)),
  );

  /** The sky behind the weather tile, resolved from the compact payload. */
  const sky = $derived(
    weather ? getWeatherInfo(weather.weatherCode, weather.isDay) : null,
  );

  /** The image's third weather line: whatever is falling, in its own unit. */
  const precipitation = $derived.by(() => {
    if (!weather) return "";
    const amount = (value: number, unit: string) =>
      `${Math.round(value * 10) / 10} ${unit}`;
    if (weather.rain > 0) return amount(weather.rain, "mm");
    if (weather.showers > 0) return amount(weather.showers, "mm");
    if (weather.snowfall > 0) return amount(weather.snowfall, "cm");
    return "";
  });

  const currentPath = $derived(page.url.pathname);

  /** The tile's number, spoken and hovered: `N` once the block has no open slot. */
  const scheduleLabel = $derived(
    schedule.count === null
      ? "Schedule: no open slot left"
      : `Today: ${schedule.count} reviews counted`,
  );

  /** The /fsrs batch's fill, from the store the reviewer writes. */
  const reviewPercent = $derived(
    reviewProgress.total === 0
      ? 0
      : Math.min(100, (reviewProgress.learned / reviewProgress.total) * 100),
  );

  /** The memories counter, split into two two-digit lines as the old dock did. */
  const memoryLines = $derived([
    String(Math.floor(memories / 100)).padStart(2, "0"),
    String(memories % 100).padStart(2, "0"),
  ]);

  /** The quick timer, shown in place of its alarm icon while it runs. */
  const countdownRunning = $derived(countdown.endTimestamp > 0);
  const countdownText = $derived(formatTimerString(countdown.secondsRemaining));

  /** While the timer runs, the tab shows its time in front of the page's title. */
  $effect(() => {
    if (!countdownRunning) return;

    // Re-run each second, so strip our own prefix back off first and the page's
    // title (which may have changed by navigating) is what we prefix again.
    const prefix = /^\d+:\d+ · /;
    document.title = `${countdownText} · ${document.title.replace(prefix, "")}`;

    return () => {
      document.title = document.title.replace(prefix, "");
    };
  });

  function toggleCountdown() {
    countdownRunning ? stopCountdown() : startCountdown();
  }

  /** Spoken label for the weather tile, which is otherwise a picture. */
  const weatherLabel = $derived(
    weather && sky
      ? `Weather: ${weather.temperature} degrees, ${sky.description}. Open the weather page`
      : "Open the weather page",
  );

  let signingOut = $state(false);

  function isActive(href: string) {
    return currentPath === href || currentPath.startsWith(`${href}/`);
  }

  /**
   * Keeps the date tile on the reader's own day while the tab stays open, and
   * pulls the schedule count and the weather across midnight / every quarter
   * hour so a long-lived tab never shows a stale sky.
   */
  onMount(() => {
    let timer: ReturnType<typeof setTimeout>;
    let last = new Date();

    const tick = () => {
      const now = new Date();

      if (now.getDate() !== last.getDate()) {
        void invalidate("app:schedule").catch(() => {});
        void invalidate("app:weather").catch(() => {});
      }
      last = now;
      clock = now;

      const midnight = new Date(
        now.getFullYear(),
        now.getMonth(),
        now.getDate() + 1,
      );
      timer = setTimeout(tick, midnight.getTime() - now.getTime() + 1000);
    };

    tick();

    const weatherTimer = setInterval(() => {
      void invalidate("app:weather").catch(() => {});
    }, 15 * 60_000);

    return () => {
      clearTimeout(timer);
      clearInterval(weatherTimer);
    };
  });
</script>

<nav
  aria-label="Primary"
  data-sveltekit-preload-data="hover"
  class="pointer-events-none fixed inset-x-0 bottom-0 z-20 flex justify-center pb-[calc(2px+env(safe-area-inset-bottom))]"
>
  <div
    class="pointer-events-auto flex h-42 w-full max-w-382 gap-2 p-1 backdrop-blur-sm"
  >
    <!-- Today's review count, with the weekday on the paper's edge. -->
    <a
      href="/schedule"
      title={scheduleLabel}
      aria-label={scheduleLabel}
      aria-current={currentPath === "/schedule" ? "page" : undefined}
      class="flex w-18 shrink-0 touch-manipulation flex-col overflow-hidden rounded-2 transition-colors select-none active:scale-97 motion-reduce:transition-none motion-reduce:active:scale-100"
    >
      <span
        class="flex min-h-0 flex-1 items-center justify-center bg-slate-950/80"
      >
        <span
          class="font-rubik text-10 leading-none font-600 text-white tabular-nums"
        >
          {schedule.count ?? "N"}
        </span>
      </span>
      <span
        class="flex h-12 shrink-0 items-center justify-center bg-slate-200 font-rubik text-7 font-bold tracking-[0.06em] text-slate-900 uppercase"
      >
        {stamp}
      </span>
    </a>

    <!-- The dock: two rows, so eleven buttons fit the 384px bar. -->
    <div class="glass-dark flex min-w-0 flex-1 flex-col rounded-2 gap-1">
      <div class="flex min-h-0 flex-1 items-center justify-center gap-2">
        {#each primary as item (item.href)}
          {@const active = isActive(item.href)}
          {@const Icon = item.icon}
          <a
            href={item.href}
            title={item.label}
            aria-label={item.label}
            aria-current={active ? "page" : undefined}
            class={`${active ? BTN_ON : BTN} h-16 w-18`}
          >
            <Icon class="size-14 shrink-0" aria-hidden="true" />
          </a>
        {/each}

        <!-- Six-minute timer: the alarm becomes the remaining time, and
           hovering turns that into STOP, so a single click cancels it. -->
        <button
          type="button"
          onclick={toggleCountdown}
          title={countdownRunning
            ? "Stop the timer"
            : `Start a ${QUICK_TIMER_MINUTES} minute timer`}
          aria-label={countdownRunning
            ? `${countdownText} left. Stop the timer`
            : `Start a ${QUICK_TIMER_MINUTES} minute timer`}
          class={`${BTN} group relative h-16 min-w-18 ${
            countdownRunning
              ? "min-w-36 bg-black! text-white! shadow-none!"
              : ""
          }`}
        >
          {#if countdownRunning}
            <span
              class="font-rubik text-9 leading-none font-400 tabular-nums transition-opacity duration-150 group-hover:opacity-0 motion-reduce:transition-none"
            >
              {countdownText}
            </span>
            <span
              class="absolute inset-0 flex items-center justify-center text-9 leading-none font-bold tracking-[0.08em] text-[#fe3d2c] opacity-0 transition-opacity duration-150 group-hover:opacity-100 motion-reduce:transition-none"
              style="text-shadow: 0 0 3px #ea504a;"
              aria-hidden="true"
            >
              STOP
            </span>
          {:else}
            <RiAlarmLine class="size-14 shrink-0" aria-hidden="true" />
          {/if}
        </button>
      </div>

      <div class="flex min-h-0 flex-1 items-center justify-center gap-2">
        {#each secondary as item (item.href)}
          {@const active = isActive(item.href)}
          {@const Icon = item.icon}
          <a
            href={item.href}
            title={item.label}
            aria-label={item.label}
            aria-current={active ? "page" : undefined}
            class={`${active ? BTN_ON : BTN} h-16 w-18`}
          >
            <Icon class="size-14 shrink-0" aria-hidden="true" />
          </a>
        {/each}

        <!-- Wrapper must not create a line box, or the button breaks the flex row alignment. -->
        <form
          class="contents"
          method="POST"
          action="/logout"
          use:enhance={() => {
            signingOut = true;
            return async ({ update }) => {
              await update();
              signingOut = false;
            };
          }}
        >
          <button
            type="submit"
            disabled={signingOut}
            title={signingOut ? "Signing out" : "Sign out"}
            aria-label={signingOut ? "Signing out" : "Sign out"}
            aria-busy={signingOut}
            class={`${BTN} h-16 w-18`}
          >
            {#if signingOut}
              <IconSpinner
                class="size-14 shrink-0 animate-spin motion-reduce:animate-none"
                aria-hidden="true"
              />
            {:else}
              <MajesticonsUnlockOpenLine
                class="size-14 shrink-0"
                aria-hidden="true"
              />
            {/if}
          </button>
        </form>
      </div>
    </div>

    <!-- Memories count, the old dock's seven-segment tile: two digits a line,
         hundreds above, the last two below. A readout, not a link. -->
    <div
      title="{memories} memories"
      class="flex px-2 rounded-2 shrink-0 flex-col overflow-hidden border border-white/10 bg-black/80 font-tupa font-600 text-white"
    >
      <span class="sr-only">{memories} memories</span>
      <span
        class="flex min-h-0 flex-1 text-18 leading-21 items-center justify-center"
        aria-hidden="true"
      >
        {memoryLines[0]}
      </span>
      <span
        class="flex min-h-0 flex-1 text-18 leading-20 items-center justify-center"
        aria-hidden="true"
      >
        {memoryLines[1]}
      </span>
    </div>

    <!-- Weather, as in the reference: the sky video itself is the link. -->
    <a
      href="/weather"
      aria-label={weatherLabel}
      aria-current={currentPath === "/weather" ? "page" : undefined}
      class="relative isolate flex w-90 shrink-0 touch-manipulation flex-col overflow-hidden rounded-2 border bg-slate-900 outline-offset-1 transition-colors active:scale-97 motion-reduce:transition-none motion-reduce:active:scale-100 {currentPath ===
      '/weather'
        ? 'border-emerald-300/60'
        : 'border-white/10 hover:border-white/25'}"
    >
      {#if weather && sky}
        <video
          src="/weathervideos/{sky.background}.mp4"
          autoplay
          loop
          muted
          playsinline
          aria-hidden="true"
          class="absolute inset-0 -z-10 h-full w-full object-cover object-top"
        ></video>

        <!-- Two rows inside the tile's 38px of content height: the reading
             pinned to the top, the description on the foot. Each row is sized
             rather than grown, so a third line (precipitation) or a long
             description cannot push the other out of the tile. -->
        <div class="relative flex items-start justify-between gap-4 px-6 pt-2">
          <img
            src="/metoffice/{sky.icon}.svg"
            alt=""
            class="size-16 shrink-0 object-contain drop-shadow-[0_1px_3px_rgba(2,6,23,0.7)]"
          />
          <div
            class="text-right text-8 leading-[1.1] font-semibold text-white drop-shadow-[0_1px_2px_rgba(2,6,23,0.8)]"
          >
            <p class="text-10 leading-[1.1]">{weather.temperature}°</p>
            <p class="text-white/85">{weather.apparent}°</p>
            {#if precipitation}<p class="text-white/85">{precipitation}</p>{/if}
          </div>
        </div>

        <div class="relative mt-auto h-12 overflow-hidden pb-2">
          <div
            class="flex h-full w-max animate-marquee items-center motion-reduce:animate-none"
          >
            <span
              class="pr-16 pl-6 text-8 font-medium whitespace-nowrap text-white"
              style="text-shadow: 0px 0px 3px #000000"
            >
              {sky.description}
            </span>
            <span
              class="pr-16 pl-6 text-8 font-medium whitespace-nowrap text-white"
              aria-hidden="true"
              style="text-shadow: 0px 0px 3px #000000"
            >
              {sky.description}
            </span>
            <span
              class="pr-16 pl-6 text-8 font-medium whitespace-nowrap text-white"
              aria-hidden="true"
              style="text-shadow: 0px 0px 3px #000000"
            >
              {sky.description}
            </span>
          </div>
        </div>
      {:else}
        <div
          class="flex size-full flex-col items-center justify-center gap-2 bg-linear-to-br from-sky-900/70 to-slate-950"
        >
          <IconCloudSun class="size-16 text-white/60" aria-hidden="true" />
          <span class="text-8 font-medium text-white/60">Weather</span>
        </div>
      {/if}
    </a>

    <!-- Sunrise tile from the old dock: a grey sunset at rest, and on /fsrs the
         same frame in colour revealed from the left as the batch advances. -->
    <div
      class="relative flex w-90 shrink-0 overflow-hidden rounded-2 border border-white/10 bg-slate-900"
    >
      {#if currentPath === "/fsrs"}
        <img
          src={sunrise}
          alt=""
          aria-hidden="true"
          class="absolute inset-0 size-full object-cover object-left grayscale"
        />
        <div
          role="progressbar"
          aria-label="Batch progress"
          aria-valuemin="0"
          aria-valuemax={reviewProgress.total}
          aria-valuenow={reviewProgress.learned}
          aria-valuetext="{reviewProgress.learned} of {reviewProgress.total} cards reviewed"
          class="absolute inset-0"
        >
          {#if reviewPercent > 0}
            <img
              src={sunrise}
              alt=""
              aria-hidden="true"
              class="absolute top-0 left-0 h-full object-cover object-left transition-[width] duration-300 ease-out motion-reduce:transition-none"
              style="box-shadow: rgba(0, 0, 0, 0.8) 2px 0px 3px; width: {reviewPercent}%"
            />
          {/if}
        </div>
      {:else}
        <img
          src={sunset}
          alt=""
          aria-hidden="true"
          class="absolute inset-0 size-full object-cover object-left"
        />
      {/if}
    </div>
  </div>
</nav>
