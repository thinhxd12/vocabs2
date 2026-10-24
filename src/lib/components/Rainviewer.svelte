<script lang="ts">
  import { format } from 'date-fns';
  import { setWorkerUrl, type StyleSpecification } from 'maplibre-gl';
  import 'maplibre-gl/dist/maplibre-gl.css';
  // MapLibre v6 loads its worker by appending a fixed filename to
  // `import.meta.url`; that filename is not emitted by the bundler. Importing
  // the worker as an asset pins it to a real, hashed URL instead.
  import maplibreWorkerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?url';
  import { onMount } from 'svelte';
  import { SvelteDate } from 'svelte/reactivity';
  import {
    FullScreenControl,
    GlobeControl,
    HillshadeLayer,
    ImageSource,
    MapLibre,
    Marker,
    NavigationControl,
    RasterDEMTileSource,
    RasterLayer,
    ScaleControl,
  } from 'svelte-maplibre-gl';
  import IconPause from '~icons/ph/pause';
  import IconPlay from '~icons/ph/play';
  import protomaps from '#lib/assets/json/protomaps.json';
  import type { RadarFrame } from '#lib/weather/types.ts';

  setWorkerUrl(maplibreWorkerUrl);

  interface Props {
    latitude: string;
    longitude: string;
  }

  let { latitude, longitude }: Props = $props();

  /** Ten-minute frames; the mosaic is published with a short delay. */
  const FRAME_COUNT = 12;
  const FRAME_STEP = 700;
  const REFRESH_MS = 5 * 60_000;

  /** The radar mosaic covers the whole country; these are its corners. */
  const RADAR_BOUNDS: [[number, number], [number, number], [number, number], [number, number]] = [
    [97, 25.2],
    [115, 25.2],
    [115, 7.2],
    [97, 7.2],
  ];

  type Frame = RadarFrame & { url: string };

  let frames = $state<Frame[]>([]);
  let frameIndex = $state(0);
  let radarUrl = $state('');
  let playing = $state(false);
  let status = $state<'loading' | 'ready' | 'empty'>('loading');

  let playTimer: ReturnType<typeof setInterval> | null = null;
  let refreshTimer: ReturnType<typeof setInterval> | null = null;
  let preloadTimers: ReturnType<typeof setTimeout>[] = [];
  let preloadedImages: HTMLImageElement[] = [];
  let destroyed = false;

  const center = $derived({ lng: Number(longitude), lat: Number(latitude) });

  const frameLabel = $derived(
    frames[frameIndex] ? format(new Date(frames[frameIndex].time), 'p') : '',
  );

  function stopPlayback() {
    if (playTimer) clearInterval(playTimer);
    playTimer = null;
  }

  function clearPreloads() {
    for (const timer of preloadTimers) clearTimeout(timer);
    preloadTimers = [];
    preloadedImages = [];
  }

  function showFrame() {
    radarUrl = frames[frameIndex]?.url ?? '';
  }

  /**
   * The newest frame can lag behind the clock, so the timeline starts at the
   * newest ten-minute slot that is at least six minutes old and the component
   * then checks it before showing it.
   */
  function buildCandidates(): Frame[] {
    const cursor = new SvelteDate();
    cursor.setUTCSeconds(0, 0);
    cursor.setUTCMinutes(Math.floor((cursor.getUTCMinutes() - 6) / 10) * 10);

    const next: Frame[] = [];
    for (let i = 0; i < FRAME_COUNT; i++) {
      const year = cursor.getUTCFullYear();
      const month = String(cursor.getUTCMonth() + 1).padStart(2, '0');
      const day = String(cursor.getUTCDate()).padStart(2, '0');
      const hours = String(cursor.getUTCHours()).padStart(2, '0');
      const minutes = String(cursor.getUTCMinutes()).padStart(2, '0');
      const stamp = `${year}${month}${day}${hours}${minutes}`;

      next.push({
        time: `${year}-${month}-${day}T${hours}:${minutes}:00Z`,
        path: `${year}${month}${day}/COM_${stamp}_CMAX00`,
        url: `/api/radar?t=${stamp}`,
      });

      cursor.setUTCMinutes(cursor.getUTCMinutes() - 10);
    }

    return next;
  }

  /**
   * Takes the newest frame that Hymetnet actually has. Usually the first
   * candidate answers; a delayed publication only costs one extra request.
   * Returns the index of the first available frame, or -1.
   */
  async function firstAvailable(candidates: Frame[]): Promise<number> {
    for (let index = 0; index < Math.min(3, candidates.length); index++) {
      try {
        const response = await fetch(candidates[index].url, {
          method: 'HEAD',
          signal: AbortSignal.timeout(4_000),
        });
        if (response.ok) return index;
      } catch {
        // Network hiccup: stop probing and let the first frame try to load.
        return 0;
      }
    }

    return -1;
  }

  /** Warms the browser cache so playback steps do not wait on the network. */
  function preload(list: Frame[]) {
    clearPreloads();

    list.slice(1).forEach((frame, index) => {
      preloadTimers.push(
        setTimeout(() => {
          const image = new Image();
          image.src = frame.url;
          // Keep a reference until the next refresh; an unrooted Image can be
          // collected while its request is still in flight.
          preloadedImages.push(image);
        }, (index + 1) * 140),
      );
    });
  }

  async function buildTimeline() {
    stopPlayback();
    playing = false;
    clearPreloads();
    status = 'loading';

    const candidates = buildCandidates();
    const index = await firstAvailable(candidates);

    if (destroyed) return;

    if (index < 0) {
      frames = [];
      frameIndex = 0;
      radarUrl = '';
      status = 'empty';
      return;
    }

    frames = candidates.slice(index);
    frameIndex = 0;
    status = 'ready';
    showFrame();
    preload(frames);
  }

  function togglePlayback() {
    if (playing) {
      stopPlayback();
      playing = false;
      return;
    }

    if (frames.length < 2) return;

    stopPlayback();
    // Play oldest → newest: start at the last frame and walk back to zero.
    frameIndex = frames.length - 1;
    showFrame();
    playing = true;

    playTimer = setInterval(() => {
      if (frameIndex <= 0) {
        stopPlayback();
        playing = false;
        frameIndex = 0;
        showFrame();
        return;
      }

      frameIndex -= 1;
      showFrame();
    }, FRAME_STEP);
  }

  onMount(() => {
    void buildTimeline();
    refreshTimer = setInterval(() => void buildTimeline(), REFRESH_MS);

    return () => {
      destroyed = true;
      stopPlayback();
      clearPreloads();
      if (refreshTimer) clearInterval(refreshTimer);
      refreshTimer = null;
    };
  });

</script>

<div
  class="relative w-full min-h-290 shrink-0 overflow-hidden rounded-2 border border-white/10 bg-slate-900"
>
  <MapLibre
    class="h-290 w-full"
    style={protomaps as StyleSpecification}
    zoom={8}
    center={center}
    maxZoom={12}
    attributionControl={false}
  >
    {#if radarUrl}
      <ImageSource id="radar-source" url={radarUrl} coordinates={RADAR_BOUNDS}>
        <RasterLayer
          id="radar-layer"
          paint={{
            'raster-opacity': 0.68,
            'raster-fade-duration': 0,
          }}
        />
      </ImageSource>
    {/if}

    <RasterDEMTileSource url="https://tiles.mapterhorn.com/tilejson.json">
      <HillshadeLayer paint={{ 'hillshade-exaggeration': 0.1 }} />
    </RasterDEMTileSource>

    <FullScreenControl position="top-right" />
    <Marker lnglat={center} scale={0.72} color="#34d399" />
    <NavigationControl showCompass={false} />
    <ScaleControl position="bottom-right" />
    <GlobeControl />
  </MapLibre>

  {#if frames.length}
    <button
      type="button"
      class="absolute top-12 left-12 z-10 flex items-center gap-6 rounded-full border border-white/20 bg-slate-950/80 px-12 py-6 text-11 font-medium text-white backdrop-blur-md transition-colors hover:bg-slate-900 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-300"
      onclick={togglePlayback}
      aria-label={playing ? 'Pause the radar loop' : 'Play the radar loop'}
    >
      {#if playing}
        <IconPause class="size-14" aria-hidden="true" />
      {:else}
        <IconPlay class="size-14" aria-hidden="true" />
      {/if}
      <span class="tabular-nums">{frameLabel}</span>
    </button>
  {:else if status === 'empty'}
    <span
      class="absolute top-12 left-12 z-10 rounded-full border border-white/15 bg-slate-950/75 px-12 py-6 text-10.5 font-medium text-white/70 backdrop-blur-md"
    >
      Radar unavailable
    </span>
  {:else}
    <span
      class="absolute top-12 left-12 z-10 flex items-center gap-6 rounded-full border border-white/15 bg-slate-950/75 px-12 py-6 text-10.5 font-medium text-white/70 backdrop-blur-md"
    >
      <span class="size-6 animate-pulse rounded-full bg-emerald-300"></span>
      Loading radar
    </span>
  {/if}

  <div class="absolute bottom-12 left-12 z-10 rounded-8 bg-white p-4">
    <img alt="Radar reflectivity scale" src="/weather/DBZ.jpg" width="18" />
  </div>
</div>

<style>
  :global(.maplibregl-ctrl) {
    margin: 4px !important;
  }

  :global(.maplibregl-ctrl button) {
    width: 24px !important;
    height: 24px !important;
  }
</style>
