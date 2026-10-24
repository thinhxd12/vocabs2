<script lang="ts">
  import { enhance } from '$app/forms';
  import { invalidate, invalidateAll } from '$app/navigation';
  import { onMount } from 'svelte';
  import IconCaretDown from '~icons/ph/caret-down';
  import IconMapPin from '~icons/ph/map-pin';
  import IconSpinner from '~icons/svg-spinners/ring-resize';
  import Container from '#lib/components/Container.svelte';
  import Rainviewer from '#lib/components/Rainviewer.svelte';
  import Toaster from '#lib/components/Toaster.svelte';
  import { addToast } from '#lib/store/toast.svelte.ts';
  import {
    getAQIDescription,
    getAQILevel,
    getBeaufortInfo,
    getCloudCoverDescription,
    getFeelsLikeDescription,
    getHumidityDescription,
    getPressureDescription,
    getUVInfo,
    getVisibilityDescription,
    getWeatherInfo,
    getWindDirection,
  } from '#lib/weather/conditions.ts';
  import {
    calculateSunPosition,
    generateForecastStatement,
    getHourFromISO,
  } from '#lib/weather/calculations.ts';
  import {
    formatDay,
    formatPrecipitation,
    formatRelativeFromMs,
    formatSnowDepth,
    formatTemperature,
    formatTime,
    formatTimeWithMinutes,
  } from '#lib/weather/formatting.ts';
  import type { OpenMeteoResponse } from '#lib/weather/types.ts';
  import type { PageProps } from './$types';

  let { data }: PageProps = $props();

  const CARD =
    'relative flex flex-col overflow-hidden rounded-2 border border-white/10 bg-black/40 p-12 backdrop-blur-sm';
  const LABEL =
    'text-10 font-semibold uppercase tracking-[0.14em] text-white/55';
  const MUTED = 'text-10.5 leading-snug text-white/60';

  /**
   * The hero is a video, but the videos are optional on a fresh checkout (and
   * can fail on a slow connection). These gradients keep the current conditions
   * readable when no video is painted.
   */
  const HERO_TONES: Record<string, string> = {
    clear: 'from-sky-400 via-sky-700 to-slate-950',
    'clear-night': 'from-indigo-950 via-slate-900 to-slate-950',
    partlycloudy: 'from-sky-500 via-slate-600 to-slate-950',
    'partlycloudy-night': 'from-slate-700 via-slate-900 to-slate-950',
    cloudy: 'from-slate-500 via-slate-700 to-slate-950',
    'cloudy-night': 'from-slate-800 via-slate-900 to-slate-950',
    foggy: 'from-slate-400 via-slate-600 to-slate-950',
    drizzle: 'from-slate-600 via-slate-800 to-slate-950',
    rain: 'from-slate-600 via-slate-800 to-slate-950',
    showers: 'from-slate-600 via-slate-800 to-slate-950',
    'light-showers': 'from-slate-600 via-slate-800 to-slate-950',
    thunderstorm: 'from-slate-700 via-slate-900 to-slate-950',
    snow: 'from-slate-300 via-slate-500 to-slate-950',
  };

  /** The same twelve markers the old gauge hung on its arc, clockwise. */
  const UV_POINTS = [
    { cx: 36.6, cy: 133.6, color: '#73aa24' },
    { cx: 18.7, cy: 105, color: '#73aa24' },
    { cx: 14.5, cy: 80, color: '#fde300' },
    { cx: 18.7, cy: 55.2, color: '#fde300' },
    { cx: 36.2, cy: 26.8, color: '#fde300' },
    { cx: 56.6, cy: 12, color: '#ff8c00' },
    { cx: 90.5, cy: 4, color: '#ff8c00' },
    { cx: 124.4, cy: 12, color: '#d13438' },
    { cx: 144.8, cy: 26.8, color: '#d13438' },
    { cx: 162.3, cy: 55.2, color: '#d13438' },
    { cx: 166.3, cy: 85.3, color: '#5c2e91' },
    { cx: 144.8, cy: 133.6, color: '#5c2e91' },
  ];

  let now = $state(Date.now());
  let sunPath = $state<SVGPathElement | null>(null);

  /**
   * The place the user picked and the weather the action answered with.
   *
   * The action returns the new place's forecast, so the page can repaint as
   * soon as the form request lands instead of waiting for a reload to fetch it.
   * Once the refreshed load agrees on the place, `data` takes over again — so
   * the navbar's periodic refresh keeps updating the numbers.
   */
  let pickedId = $state<string | null>(null);
  let pickedWeather = $state<OpenMeteoResponse | null>(null);
  let changing = $state(false);

  const activeId = $derived(pickedId ?? data.currentId);

  const weather = $derived(
    pickedId !== null && pickedId !== data.currentId
      ? (pickedWeather ?? data.weather)
      : (data.weather ?? pickedWeather),
  );

  const currentLocation = $derived(
    data.locations.find((item) => item.id === activeId) ?? null,
  );

  /** The page re-renders "updated 3 mins ago" without refetching the weather. */
  onMount(() => {
    const interval = setInterval(() => (now = Date.now()), 30_000);
    return () => clearInterval(interval);
  });

  /** Captures the sunrise curve so the sun dot can ride along it. */
  function captureSunPath(node: SVGPathElement) {
    sunPath = node;
    return () => {
      sunPath = null;
    };
  }

  function getSunPosition(dayPercent: number) {
    if (!sunPath) return null;

    const startPoint = 0.22;
    const endPoint = 0.78;
    const position = (dayPercent / 100) * (endPoint - startPoint) + startPoint;
    const point = sunPath.getPointAtLength(sunPath.getTotalLength() * position);
    return { x: point.x, y: point.y };
  }

  /** Everything the page shows, derived once from the current payload. */
  const wx = $derived.by(() => {
    const snapshot = weather;
    if (!snapshot) return null;

    const { current, hourly, daily } = snapshot;
    const info = getWeatherInfo(current.weather_code, current.is_day);
    const updatedMs =
      Date.parse(`${current.time}Z`) - snapshot.utc_offset_seconds * 1000;

    const feels = Math.round(current.apparent_temperature);
    const actual = Math.round(current.temperature_2m);

    const direction = current.wind_direction_10m || 0;
    const windInfo = getBeaufortInfo(current.wind_speed_10m || 0);

    const totalLiquid = (current.rain ?? 0) + (current.showers ?? 0);
    const hasRain = totalLiquid > 0;
    const hasSnow = (current.snowfall ?? 0) > 0;

    const uvValue = Math.max(0, Math.round(current.uv_index || 0));
    const uvInfo = getUVInfo(uvValue);
    // Zero is a real UV value (after dark): there is no marker for it.
    const uvPoint =
      uvValue > 0
        ? UV_POINTS[Math.min(uvValue, UV_POINTS.length) - 1] ?? null
        : null;

    const pressureHpa = current.pressure_msl || 1013;
    const humidity = Math.round(current.relative_humidity_2m);
    const cloudCover = Math.round(current.cloud_cover);

    const sunriseISO = daily.sunrise[0];
    const sunsetISO = daily.sunset[0];

    const snowDepth = current.snow_depth ?? 0;

    const hours = hourly.time.slice(0, 12).map((time, index) => {
      const hourInfo = getWeatherInfo(
        hourly.weather_code[index],
        hourly.is_day[index],
      );
      return {
        time,
        label: formatTime(time),
        temp: hourly.temperature_2m[index],
        icon: hourInfo.icon,
        background: hourInfo.background,
        description: hourInfo.description,
        precipitation: hourly.precipitation_probability[index] ?? 0,
      };
    });

    // After 8 pm today's row adds nothing the hourly strip has not covered.
    const skipToday = getHourFromISO(current.time) >= 20;
    const rows = daily.time.map((date, index) => {
      const dayInfo = getWeatherInfo(daily.weather_code[index], 1);
      return {
        date,
        icon: dayInfo.icon,
        description: dayInfo.description,
        low: Math.round(daily.temperature_2m_min[index]),
        high: Math.round(daily.temperature_2m_max[index]),
        precipitation: daily.precipitation_probability_max[index] ?? 0,
      };
    });
    const days = skipToday ? rows.slice(1) : rows;

    const allTemps = days.flatMap((day) => [day.low, day.high]);
    const scaleLow = allTemps.length ? Math.min(...allTemps) : 0;
    const scaleHigh = allTemps.length ? Math.max(...allTemps) : 1;
    const scaleRange = scaleHigh - scaleLow || 1;

    const forecastDays = days.map((day) => ({
      ...day,
      barLeft: ((day.low - scaleLow) / scaleRange) * 100,
      barWidth: Math.max(6, ((day.high - day.low) / scaleRange) * 100),
    }));

    return {
      time: current.time,
      current: {
        temperature: actual,
        icon: info.icon,
        background: info.background,
        description: info.description,
        statement: generateForecastStatement(snapshot),
        lastUpdated: formatRelativeFromMs(now - updatedMs),
      },
      feelsLike: {
        temperature: feels,
        description: getFeelsLikeDescription(
          feels,
          actual,
          current.wind_speed_10m,
          current.relative_humidity_2m,
        ),
      },
      wind: {
        direction: Math.round(direction),
        directionLabel: getWindDirection(direction),
        speed: Math.round(current.wind_speed_10m || 0),
        gusts: Math.round(current.wind_gusts_10m || 0),
        description: windInfo.description,
      },
      precipitation: {
        hasPrecipitation: hasRain || hasSnow,
        hasRain,
        hasSnow,
        amount: formatPrecipitation(
          'c',
          hasRain ? totalLiquid : (current.snowfall ?? 0),
        ),
        description: !hasRain && !hasSnow
          ? 'No precipitation'
          : hasRain && hasSnow
            ? 'Mixed precipitation'
            : hasRain
              ? totalLiquid < 0.1
                ? 'Light rain'
                : 'Rain'
              : (current.snowfall ?? 0) < 0.1
                ? 'Light snow'
                : 'Snow',
      },
      uv: {
        value: uvValue,
        level: uvInfo.level,
        description: uvInfo.description,
        point: uvPoint,
      },
      pressure: {
        value: pressureHpa,
        percent: Math.round(
          Math.max(0, Math.min(100, ((pressureHpa - 1000) / 40) * 100)),
        ),
        description: getPressureDescription(pressureHpa),
      },
      humidity: {
        value: humidity,
        dewpoint: Math.round(current.dew_point_2m),
        description: getHumidityDescription(humidity),
      },
      cloud: {
        value: cloudCover,
        description: getCloudCoverDescription(cloudCover),
      },
      visibility: {
        value: Math.round(current.visibility / 1000),
        description: getVisibilityDescription(
          Math.round(current.visibility / 1000),
          true,
        ),
      },
      sun: {
        sunrise: sunriseISO ? formatTimeWithMinutes(sunriseISO) : '--:--',
        sunset: sunsetISO ? formatTimeWithMinutes(sunsetISO) : '--:--',
        percent: Math.round(
          calculateSunPosition(current.time, sunriseISO, sunsetISO),
        ),
      },
      air: (() => {
        const value = current.us_aqi || 0;
        const level = getAQILevel(value);
        return {
          value,
          level: level.level,
          color: level.color,
          description: getAQIDescription(value),
        };
      })(),
      snow: {
        hasSnow: snowDepth > 0,
        depth: snowDepth > 0 ? formatSnowDepth('c', snowDepth) : '0',
        description:
          snowDepth <= 0
            ? 'No snow on ground'
            : snowDepth * 39.3701 < 1
              ? 'Light snow cover'
              : snowDepth * 39.3701 < 6
                ? 'Moderate snow depth'
                : 'Significant snow depth',
      },
      hours,
      forecastDays,
      dayCount: forecastDays.length,
    };
  });

  const heroTone = $derived(
    HERO_TONES[wx?.current.background ?? ''] ??
      'from-[#3f88b4] via-[#1d4e6b] to-slate-950',
  );

  const sunPoint = $derived(wx ? getSunPosition(wx.sun.percent) : null);
</script>

<svelte:head>
  <title>Weather</title>
</svelte:head>

<Container scrollable class="gap-3 pt-0 pb-16">
  {#if !data.locations.length}
    <div
      class="flex w-full flex-col items-center gap-12 rounded-2 border border-white/10 bg-black/40 px-32 py-48 text-center backdrop-blur-sm"
    >
      <span
        class="flex size-44 items-center justify-center rounded-full bg-white/5 text-white/40"
      >
        <IconMapPin class="size-20" aria-hidden="true" />
      </span>
      <p class="text-sm font-medium text-white">No locations saved</p>
      <p class="text-xs leading-relaxed text-white/55">
        Add a place on the dashboard and its forecast will appear here.
      </p>
      <a
        href="/dashboard"
        class="rounded-full bg-emerald-300 px-16 py-8 text-xs font-semibold text-emerald-950 transition-colors hover:bg-emerald-200"
      >
        Open dashboard
      </a>
    </div>
  {:else}
    <section
      class="relative isolate w-full min-h-300 shrink-0 overflow-hidden rounded-b-2 border border-t-0 border-white/10 bg-linear-to-b {heroTone}"
    >
      {#if wx}
        {#key wx.current.background}
          <video
            src="/weathervideos/{wx.current.background}.mp4"
            autoplay
            loop
            muted
            playsinline
            aria-hidden="true"
            class="absolute inset-0 -z-10 h-full w-full object-cover object-top opacity-80"
          ></video>
        {/key}
        <div
          aria-hidden="true"
          class="absolute inset-0 -z-10 bg-linear-to-b from-slate-950/15 via-slate-950/5 to-slate-950/85"
        ></div>
      {/if}

      <div class="flex flex-col items-center px-16 pt-14 pb-20 text-center">
        <form
          method="POST"
          action="?/selectLocation"
          use:enhance={() => {
            changing = true;
            return async ({ result }) => {
              // The action already carries the new place and its forecast, so
              // nothing below waits for a page reload.
              changing = false;

              if (result.type === 'success') {
                const payload = result.data as {
                  currentId?: string;
                  weather?: OpenMeteoResponse | null;
                };

                if (payload.currentId) pickedId = payload.currentId;
                pickedWeather = payload.weather ?? null;

                // Refresh the navbar's copy in the background; the page is
                // already showing the new place. Both loads read the weather
                // the action just cached, so this is cheap.
                void invalidate('app:weather').catch(() => {});
                return;
              }

              if (result.type === 'redirect') return;

              const failure =
                result.type === 'failure'
                  ? (result.data as { error?: string } | undefined)
                  : undefined;
              addToast({
                type: 'error',
                title: 'Location not changed',
                message: failure?.error || 'Please try again.',
              });
              // The server kept the old place: put the select back.
              pickedId = null;
              pickedWeather = null;
            };
          }}
          class="relative z-10 w-full"
        >
          <div class="flex items-center justify-center gap-6">
            {#if changing}
              <IconSpinner
                class="size-16 shrink-0 animate-spin text-white/70"
                aria-hidden="true"
              />
            {:else}
              <IconMapPin
                class="size-16 shrink-0 text-white/70"
                aria-hidden="true"
              />
            {/if}

            <label class="sr-only" for="location">Location</label>
            <select
              id="location"
              name="id"
              value={activeId}
              disabled={changing}
              onchange={(event) => {
                pickedId = event.currentTarget.value;
                pickedWeather = null;
                event.currentTarget.form?.requestSubmit();
              }}
              class="max-w-256 cursor-pointer appearance-none truncate bg-transparent text-center text-17 font-medium text-white outline-hidden disabled:cursor-wait disabled:opacity-60"
            >
              {#each data.locations as location (location.id)}
                <option value={location.id} class="bg-slate-900 text-white">
                  {location.name}
                </option>
              {/each}
            </select>

            <IconCaretDown
              class="size-16 shrink-0 text-white/70"
              aria-hidden="true"
            />
          </div>
        </form>

        {#if wx}
          <div
            class="flex flex-col items-center transition-opacity duration-200 {changing
              ? 'opacity-50'
              : ''}"
            aria-busy={changing}
          >
            <p
              class="mt-12 text-100 leading-[0.82] font-extralight tracking-[-0.05em] text-white drop-shadow-[0_2px_14px_rgba(2,6,23,0.35)] select-none"
            >
              {wx.current.temperature}°
            </p>

            <div class="mt-4 flex items-center justify-center gap-12">
              <img
                src="/metoffice/{wx.current.icon}.svg"
                alt=""
                class="size-64 object-contain drop-shadow-[0_2px_8px_rgba(2,6,23,0.5)]"
              />
              <span class="text-15 font-medium text-white">
                {wx.current.description}
              </span>
            </div>

            <p class="mt-8 max-w-288 text-12 leading-relaxed text-white/80">
              {wx.current.statement}
            </p>
            <p class="mt-8 text-10.5 font-medium text-white/55">
              Updated {wx.current.lastUpdated}
            </p>
          </div>
        {:else}
          <div class="mt-32 mb-8 flex flex-col items-center gap-8">
            <p class="text-sm font-medium text-white">Forecast unavailable</p>
            <p class="max-w-256 text-11.5 leading-relaxed text-white/65">
              Open-Meteo could not be reached for this location.
            </p>
            <button
              type="button"
              onclick={() => invalidateAll()}
              class="mt-4 rounded-full border border-white/20 bg-white/10 px-16 py-6 text-11 font-medium text-white transition-colors hover:bg-white/15"
            >
              Try again
            </button>
          </div>
        {/if}
      </div>
    </section>

    {#if currentLocation}
      <Rainviewer
        latitude={currentLocation.latitude}
        longitude={currentLocation.longitude}
      />
    {/if}

    {#if wx}
      <div class="grid w-full grid-cols-2 gap-3">
        <div class="{CARD} aspect-square justify-between">
          <p class={LABEL}>Feels like</p>
          <p class="text-36 leading-none font-light text-white">
            {wx.feelsLike.temperature}°
          </p>
          <p class={MUTED}>{wx.feelsLike.description}</p>
        </div>

        <div class="{CARD} aspect-square">
          <p class={LABEL}>Wind</p>
          <div class="flex flex-1 items-center gap-6">
            <div class="relative size-80 shrink-0" aria-hidden="true">
              <svg
                viewBox="0 0 120 120"
                fill="none"
                xmlns="http://www.w3.org/2000/svg"
                class="size-full"
              >
                {#each [10, 100, 190, 280] as rotation (rotation)}
                  <g transform="translate(60, 60) rotate({rotation})">
                    <circle
                      r="40"
                      stroke="#ffffff1a"
                      stroke-width="4"
                      pathLength="360"
                      stroke-dasharray="70 290"
                      stroke-linecap="round"
                      fill="none"
                    />
                  </g>
                {/each}
                <path
                  fill="#34d399"
                  d="M 61.0453 41.1725 A 1.125 1.125 90 0 0 58.9547 41.1725 l -12.728 31.8197 a 1.125 1.125 90 0 0 1.548 1.424 l 12.2251 -6.1126 l 12.2236 6.1142 a 1.125 1.125 90 0 0 1.5496 -1.4256 z"
                  transform="rotate({wx.wind.direction - 180} 60 60)"
                />
              </svg>
              <span
                class="absolute top-0 left-1/2 -translate-x-1/2 text-8 text-white/55"
                >N</span
              >
              <span
                class="absolute bottom-0 left-1/2 -translate-x-1/2 text-8 text-white/55"
                >S</span
              >
              <span
                class="absolute top-1/2 left-0 -translate-y-1/2 text-8 text-white/55"
                >W</span
              >
              <span
                class="absolute top-1/2 right-0 -translate-y-1/2 text-8 text-white/55"
                >E</span
              >
            </div>

            <div class="min-w-0">
              <p class="text-9 text-white/55">From</p>
              <p class="text-11 font-medium text-white">
                {wx.wind.directionLabel}
                <span class="text-9 text-white/55"
                  >{wx.wind.direction}°</span
                >
              </p>
              <p class="mt-6 text-9 text-white/55">Speed</p>
              <p class="text-11 font-medium text-white">
                {wx.wind.speed}
                <span class="text-9 text-white/55">km/h</span>
              </p>
              <p class="mt-2 text-9 text-white/55">
                Gusts {wx.wind.gusts} km/h
              </p>
            </div>
          </div>
          <p class="mt-4 text-9.5 leading-snug text-white/55">
            {wx.wind.description}
          </p>
        </div>

        <div class="{CARD} aspect-square">
          <p class={LABEL}>Precipitation</p>
          <div class="flex flex-1 flex-col items-center justify-center">
            {#if wx.precipitation.hasPrecipitation}
              <img
                src="/navweather/{wx.precipitation.hasRain
                  ? 'drizzle'
                  : 'snow'}.webp"
                alt=""
                class="size-56 rounded-full object-cover object-bottom"
              />
              <p class="mt-8 text-13 font-semibold text-white">
                {wx.precipitation.amount}
              </p>
              <p class="text-9.5 text-white/50">in 15 minutes</p>
            {:else}
              <p class="text-24 font-light text-white">None</p>
              <p class="mt-2 text-9.5 text-white/50">
                {wx.precipitation.description}
              </p>
            {/if}
          </div>
        </div>

        <div class="{CARD} aspect-square">
          <p class={LABEL}>UV index</p>
          <div class="flex flex-1 flex-col items-center justify-center">
            <div class="relative flex justify-center" aria-hidden="true">
              <svg
                width="80"
                height="80"
                viewBox="5 -12 171 178"
                fill="none"
                xmlns="http://www.w3.org/2000/svg"
              >
                {#each [
                  { rotate: 13, color: '#5c2e91' },
                  { rotate: -52, color: '#d13438' },
                  { rotate: -115, color: '#ff8c00' },
                  { rotate: -178, color: '#fde300' },
                  { rotate: -243, color: '#73aa24' },
                ] as band (band.color)}
                  <path
                    d="M 90.5 80 m 76 0 a 76 76 0 0 1 -32 62.3 "
                    transform="rotate({band.rotate} 90.5 80)"
                    fill="none"
                    stroke={band.color}
                    stroke-width="10"
                    stroke-linecap="round"
                  />
                {/each}

                {#if wx.uv.point}
                  <circle
                    cx={wx.uv.point.cx}
                    cy={wx.uv.point.cy}
                    r="10"
                    fill={wx.uv.point.color}
                  />
                  <circle
                    cx={wx.uv.point.cx}
                    cy={wx.uv.point.cy}
                    r="12"
                    stroke="white"
                    stroke-width="3"
                  />
                {/if}
              </svg>
              <div
                class="absolute inset-0 flex items-center justify-center pt-8"
              >
                <span class="text-26 leading-none font-light text-white">
                  {wx.uv.value}
                </span>
              </div>
            </div>
            <p class="mt-4 text-11 font-medium text-white">
              {wx.uv.level}
            </p>
            <p class="mt-2 line-clamp-2 text-center text-9 leading-tight text-white/50">
              {wx.uv.description}
            </p>
          </div>
        </div>

        <div class="{CARD} aspect-square">
          <p class={LABEL}>Pressure</p>
          <div class="flex flex-1 items-center justify-center gap-12">
            <div
              class="relative h-72 w-8 rounded-full bg-linear-to-b from-white/80 via-white/40 to-white/10"
              aria-hidden="true"
            >
              <span
                class="absolute -left-4 h-6 w-16 -translate-y-1/2 rounded-full bg-white shadow-sm shadow-black/40"
                style="bottom: {wx.pressure.percent}%"
              ></span>
            </div>
            <div class="min-w-0">
              <p class="text-17 leading-none font-light text-white">
                {wx.pressure.value}
                <span class="text-9 text-white/50">hPa</span>
              </p>
              <p class="mt-4 text-9.5 leading-tight text-white/55">
                {wx.pressure.description}
              </p>
            </div>
          </div>
        </div>

        <div class="{CARD} aspect-square">
          <p class={LABEL}>Humidity</p>
          <div class="flex flex-1 items-center justify-center gap-12">
            <div
              class="relative h-72 w-8 overflow-hidden rounded-full bg-white/10"
              aria-hidden="true"
            >
              <div
                class="absolute inset-x-0 bottom-0 rounded-full bg-white/80"
                style="height: {wx.humidity.value}%"
              ></div>
            </div>
            <div class="min-w-0">
              <p class="text-9 text-white/55">Relative humidity</p>
              <p class="text-14 font-medium text-white">
                {wx.humidity.value}%
              </p>
              <p class="mt-6 text-9 text-white/55">Dew point</p>
              <p class="text-14 font-medium text-white">
                {wx.humidity.dewpoint}°
              </p>
            </div>
          </div>
        </div>

        <div class="{CARD} aspect-square">
          <p class={LABEL}>Cloud cover</p>
          <div class="flex flex-1 flex-col items-center justify-center">
            <img
              src="/cloud/{wx.cloud.description}.webp"
              alt=""
              class="size-56 rounded-full object-cover"
            />
            <p class="mt-8 text-13 font-semibold text-white">
              {wx.cloud.value}%
            </p>
            <p class="text-9.5 text-white/50">{wx.cloud.description}</p>
          </div>
        </div>

        <div class="{CARD} aspect-square justify-between">
          <p class={LABEL}>Visibility</p>
          <p class="text-32 leading-none font-light text-white">
            {wx.visibility.value}
            <span class="text-12 text-white/50">km</span>
          </p>
          <p class={MUTED}>{wx.visibility.description}</p>
        </div>

        <div class="{CARD} aspect-square">
          <p class={LABEL}>Sunrise / sunset</p>
          <div class="flex flex-1 items-center justify-center">
            <svg
              width="116"
              height="92"
              viewBox="0 0 150 118"
              xmlns="http://www.w3.org/2000/svg"
              aria-hidden="true"
            >
              <defs>
                <path
                  id="sun-curve"
                  d="M 0 108 C 40 93 45 53 75 53 S 110 93 150 108"
                  fill="none"
                  {@attach captureSunPath}
                />
                <mask id="sun-above">
                  <rect x="0" y="0" width="150" height="83" fill="white" />
                </mask>
                <mask id="sun-below">
                  <rect x="0" y="83" width="150" height="35" fill="white" />
                </mask>
              </defs>

              <use
                href="#sun-curve"
                stroke="#efb839"
                stroke-width="5"
                mask="url(#sun-above)"
              />
              <use
                href="#sun-curve"
                stroke="#ffffff1f"
                stroke-width="5"
                mask="url(#sun-below)"
              />
              <line
                x1="0"
                y1="83"
                x2="150"
                y2="83"
                stroke="white"
                stroke-opacity="0.14"
                stroke-width="1"
              />

              {#if sunPoint}
                <circle
                  cx={sunPoint.x}
                  cy={sunPoint.y}
                  r="5.5"
                  fill="#ff7a1a"
                  style="filter: drop-shadow(0 0 6px #ff7a1a)"
                />
              {/if}
            </svg>
          </div>
          <div class="flex items-end justify-between">
            <div class="flex flex-col">
              <span class="text-9 text-white/55">Sunrise</span>
              <span class="text-12 font-medium text-white">
                {wx.sun.sunrise}
              </span>
            </div>
            <div class="flex flex-col items-end">
              <span class="text-9 text-white/55">Sunset</span>
              <span class="text-12 font-medium text-white">
                {wx.sun.sunset}
              </span>
            </div>
          </div>
        </div>

        <div class="{CARD} aspect-square">
          <p class={LABEL}>Air quality</p>
          <div class="flex flex-1 flex-col items-center justify-center">
            <div class="relative flex size-72 items-center justify-center">
              <svg
                width="72"
                height="72"
                viewBox="-15 -15 150 150"
                xmlns="http://www.w3.org/2000/svg"
                class="absolute -rotate-90"
                aria-hidden="true"
              >
                <circle
                  r="50"
                  cx="60"
                  cy="60"
                  fill="transparent"
                  stroke="#ffffff1a"
                  stroke-width="10"
                />
                <circle
                  r="50"
                  cx="60"
                  cy="60"
                  stroke={wx.air.color}
                  stroke-width="10"
                  stroke-dashoffset={(100 - wx.air.value / 3) * 3}
                  fill="transparent"
                  stroke-dasharray="314"
                />
              </svg>
              <div class="flex flex-col items-center">
                <span class="text-15 font-semibold text-white">
                  {wx.air.value}
                </span>
                <span class="text-8 text-white/55">AQI</span>
              </div>
            </div>

            <span
              class="mt-6 rounded-full px-8 py-2 text-9 font-semibold text-black"
              style="background-color: {wx.air.color}"
            >
              {wx.air.level}
            </span>
          </div>
          <p class="line-clamp-2 text-center text-9 leading-tight text-white/50">
            {wx.air.description}
          </p>
        </div>

        {#if wx.snow.hasSnow}
          <div class="{CARD} aspect-square">
            <p class={LABEL}>Snow depth</p>
            <div class="flex flex-1 flex-col items-center justify-center">
              <img
                src="/navweather/snow.webp"
                alt=""
                class="size-56 rounded-full object-cover"
              />
              <p class="mt-8 text-13 font-semibold text-white">
                {wx.snow.depth}
              </p>
              <p class="text-9.5 text-white/50">{wx.snow.description}</p>
            </div>
          </div>
        {/if}
      </div>

      {#if wx.hours.length}
        <section class="w-full space-y-6">
          <h2 class="px-4 text-13 font-semibold text-white/80">
            Hourly forecast
          </h2>
          <div class="grid w-full grid-cols-4 gap-3">
            {#each wx.hours as hour (hour.time)}
              <div
                class="flex flex-col overflow-hidden rounded-2 border border-white/10 bg-black/40 backdrop-blur-sm"
              >
                <p
                  class="py-4 text-center text-11 font-semibold text-white/85 tabular-nums"
                >
                  {hour.label.hour}<span class="text-7.5 text-white/55"
                    >{hour.label.period}</span
                  >
                </p>

                <div
                  class="relative flex flex-1 flex-col items-center bg-linear-to-b from-sky-800/55 to-slate-950/80 px-4 pt-6 pb-6"
                >
                  <img
                    src="/navweather/{hour.background}.webp"
                    alt=""
                    class="absolute inset-0 size-full object-cover opacity-55"
                  />
                  <img
                    src="/metoffice/{hour.icon}.svg"
                    alt=""
                    class="relative size-32 object-contain drop-shadow-[0_1px_4px_rgba(2,6,23,0.6)]"
                  />
                  <p
                    class="relative mt-2 line-clamp-1 text-center text-8 leading-tight text-white/85"
                  >
                    {hour.description}
                  </p>
                  <p
                    class="relative mt-2 text-12.5 font-medium text-white"
                  >
                    {formatTemperature(hour.temp)}
                  </p>
                  {#if hour.precipitation}
                    <p class="relative text-9 font-medium text-sky-200">
                      {hour.precipitation}%
                    </p>
                  {/if}
                </div>
              </div>
            {/each}
          </div>
        </section>
      {/if}

      {#if wx.forecastDays.length}
        <section class="w-full space-y-6">
          <h2 class="px-4 text-13 font-semibold text-white/80">
            {wx.dayCount}-day forecast
          </h2>
          <div class="flex w-full flex-col gap-3">
            {#each wx.forecastDays as day (day.date)}
              <div
                class="flex h-52 w-full items-center gap-6 rounded-2 border border-white/10 bg-black/40 px-10 backdrop-blur-sm"
              >
                <span
                  class="w-36 shrink-0 text-11.5 font-medium text-white/85"
                >
                  {formatDay(day.date, wx.time)}
                </span>
                <img
                  src="/metoffice/{day.icon}.svg"
                  alt=""
                  class="size-26 shrink-0 object-contain"
                />
                <span
                  class="w-28 shrink-0 text-center text-9.5 font-semibold text-sky-300 tabular-nums"
                >
                  {#if day.precipitation}{day.precipitation}%{/if}
                </span>
                <span
                  class="min-w-0 flex-1 truncate text-9.5 text-white/55"
                >
                  {day.description}
                </span>
                <div class="flex w-84 shrink-0 items-center justify-end gap-4">
                  <span
                    class="w-22 text-right text-10 text-white/55 tabular-nums"
                  >
                    {day.low}°
                  </span>
                  <div
                    class="relative h-4 w-32 overflow-hidden rounded-full bg-white/10"
                  >
                    <div
                      class="absolute inset-y-0 rounded-full bg-linear-to-r from-sky-400 to-amber-300"
                      style="left: {day.barLeft}%; width: {day.barWidth}%"
                    ></div>
                  </div>
                  <span
                    class="w-22 text-10 font-medium text-white tabular-nums"
                  >
                    {day.high}°
                  </span>
                </div>
              </div>
            {/each}
          </div>
        </section>
      {/if}

      <p class="pt-4 text-center text-9 text-white/45">
        Forecast by Open-Meteo · radar by Hymetnet
      </p>
    {/if}
  {/if}
</Container>

<Toaster />
