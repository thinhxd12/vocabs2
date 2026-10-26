<script lang="ts">
  import { enhance } from "$app/forms";
  import { compareAsc, format, isValid, parseISO } from "date-fns";
  import IconChartLineUp from "~icons/ph/chart-line-up";
  import IconCheck from "~icons/ph/check";
  import IconCrosshair from "~icons/ph/crosshair";
  import IconMapPin from "~icons/ph/map-pin";
  import IconPlus from "~icons/ph/plus";
  import IconSpinner from "~icons/svg-spinners/ring-resize";
  import IconTrash from "~icons/ph/trash";
  import IconX from "~icons/ph/x";
  import type { PageProps } from "./$types";

  let { data, form }: PageProps = $props();

  const CHART_W = 300;
  const CHART_H = 120;
  const CHART_PAD_X = 16;
  // Top room is reserved for the value labels drawn above each point.
  const CHART_PAD_TOP = 26;
  const CHART_PAD_BOTTOM = 12;

  const CARD =
    "rounded-2 border border-white/10 bg-black/40 backdrop-blur-sm";

  // Selectable weather forecast models. `value` is what we persist to
  // `dashboard_table.currentForecastModel`.
  const modelList = [
    { name: "DWD Germany", value: "icon_seamless" },
    { name: "NOAA U.S", value: "gfs_seamless" },
    { name: "ECMWF", value: "ecmwf_ifs" },
    { name: "UK Met Office", value: "ukmo_seamless" },
    { name: "KMA Korea", value: "kma_seamless" },
    { name: "JMA Japan", value: "jma_seamless" },
    { name: "MET Norway", value: "metno_seamless" },
    { name: "GEM Canada", value: "gem_seamless" },
    { name: "CMA China", value: "cma_grapes_global" },
    { name: "KNMI Netherlands", value: "knmi_seamless" },
    { name: "DMI Denmark", value: "dmi_seamless" },
  ];

  // Form fields: one clean translucent surface, shared height/padding/ring so
  // the two inputs read as a matched pair instead of two different widgets.
  const FIELD_BASE =
    "h-32 min-w-0 w-full rounded-6 border bg-white/8 px-8 text-12 text-white backdrop-blur-sm transition-colors outline-hidden placeholder:text-slate-400 focus-visible:bg-white/12 focus-visible:ring-1";
  const FIELD_OK =
    `${FIELD_BASE} border-white/15 focus-visible:border-emerald-300/60 focus-visible:ring-emerald-400/40`;
  const FIELD_ERROR =
    `${FIELD_BASE} border-rose-400/60 focus-visible:border-rose-400/70 focus-visible:ring-rose-400/40`;

  function toNumber(value: unknown): number {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
  }

  function formatCount(value: number): string {
    if (value >= 10_000) return `${(value / 1000).toFixed(1)}k`;
    return value.toLocaleString("en-US");
  }

  /** The stored date as `yyyy-mm-dd`, whatever timestamp shape arrives. */
  function formatDate(value: string): string {
    const date = parseISO(value);
    return isValid(date) ? format(date, "yyyy-MM-dd") : value.slice(0, 10);
  }

  /** Today in the browser's timezone, shaped for `<input type="date">`. */
  function todayISO(): string {
    return format(new Date(), "yyyy-MM-dd");
  }

  /** Normalised SVG line + filled area for a series of counts. */
  function buildSeries(values: number[]) {
    const max = Math.max(...values, 1);
    const innerH = CHART_H - CHART_PAD_TOP - CHART_PAD_BOTTOM;
    const step =
      values.length > 1
        ? (CHART_W - CHART_PAD_X * 2) / (values.length - 1)
        : 0;

    const points = values.map((value, index) => ({
      x: CHART_PAD_X + index * step,
      y: CHART_PAD_TOP + (1 - value / max) * innerH,
      value,
    }));

    const line = points.length
      ? `M${points.map((point) => `${point.x.toFixed(1)},${point.y.toFixed(1)}`).join(" L")}`
      : "";
    const first = points.at(0);
    const last = points.at(-1);
    const area =
      first && last
        ? `${line} L${last.x.toFixed(1)},${CHART_H} L${first.x.toFixed(1)},${CHART_H} Z`
        : "";

    return { line, area, points };
  }

  const hasRecord = $derived(data.record !== null);
  const user = $derived(data.record?.user ?? "");
  const initial = $derived(user.trim().charAt(0).toUpperCase() || "?");
  const forecastModel = $derived(
    data.record?.currentForecastModel || "Default",
  );
  const currentLocationId = $derived(data.record?.currentLocationId ?? null);

  const locations = $derived(data.record?.locations ?? []);

  const progress = $derived(
    [...(data.record?.progress ?? [])].sort((a, b) =>
      compareAsc(parseISO(a.date), parseISO(b.date)),
    ),
  );
  const counts = $derived(progress.map((entry) => toNumber(entry.count)));

  const chart = $derived(buildSeries(counts));
  const chartSummary = $derived(
    progress
      .map((entry) => `${entry.date}: ${formatCount(toNumber(entry.count))}`)
      .join(", "),
  );

  // === New progress entry ===============================================
  const addError = $derived(form?.error ?? "");
  // Which input the error belongs to, so the message stays attached to it.
  const errorField = $derived(form?.field ?? "");

  // === Locations ========================================================
  // Location actions share one `scope`, so their messages are read from the
  // same place regardless of which of the three actions last ran.
  const locationError = $derived(
    form?.scope === "locations" ? (form.error ?? "") : "",
  );
  const locationField = $derived(
    form?.scope === "locations" ? (form.field ?? "") : "",
  );

  let showForm = $state(false);
  let saving = $state(false);
  let justAdded = $state(false);
  let entryDate = $state(todayISO());
  let entryCount = $state("");
  let savingModel = $state(false);

  let showLocationForm = $state(false);
  let savingLocation = $state(false);
  let locationName = $state("");
  let locationLat = $state("");
  let locationLng = $state("");
  // Id of the row currently being selected or deleted, for inline feedback.
  let busyLocationId = $state<string | null>(null);

  function openForm() {
    justAdded = false;
    showForm = true;
  }

  function closeForm() {
    showForm = false;
  }

  function openLocationForm() {
    showLocationForm = true;
  }

  function closeLocationForm() {
    showLocationForm = false;
  }
</script>

<svelte:head>
  <title>dashboard</title>
</svelte:head>

<section class="mx-auto w-full max-w-378 space-y-2">
  <header class="space-y-4 flex justify-between items-center">
    <h1
      class="text-30 font-bold text-white [text-shadow:0_2px_24px_rgba(0,0,0,0.6)]"
    >
      Dashboard
    </h1>
    {#if hasRecord}
      <p class="flex items-center gap-8 text-14 text-slate-300">
        <span
          class="flex size-24 shrink-0 items-center justify-center rounded-full bg-linear-to-br from-emerald-400 to-teal-500 text-11 font-bold text-white"
          aria-hidden="true"
        >
          {initial}
        </span>
        <span
          >Signed in as <span class="font-medium text-white">{user}</span></span
        >
      </p>
    {/if}
  </header>

  {#if hasRecord}
    <div class="{CARD} p-16">
      <div class="flex items-start justify-between gap-12">
        <div>
          <p
            class="text-10 font-semibold tracking-[0.2em] text-slate-400 uppercase"
          >
            Progress
          </p>
        </div>

        <button
          type="button"
          onclick={() => (showForm ? closeForm() : openForm())}
          aria-expanded={showForm}
          aria-controls="add-progress-form"
          class="inline-flex shrink-0 cursor-pointer items-center gap-4 rounded-2 border px-10 py-4 text-11 font-medium transition-colors {showForm
            ? 'border-white/15 bg-white/10 text-white'
            : 'border-emerald-300/25 bg-emerald-400/15 text-emerald-100 hover:bg-emerald-400/25'}"
        >
          {#if showForm}
            <IconX class="size-14" aria-hidden="true" />
            Close
          {:else}
            <IconPlus class="size-14" aria-hidden="true" />
            Add entry
          {/if}
        </button>
      </div>

      {#if showForm}
        <form
          id="add-progress-form"
          method="POST"
          action="?/addProgress"
          aria-busy={saving}
          use:enhance={() => {
            saving = true;
            return async ({ result, update }) => {
              saving = false;
              if (result.type === "success") {
                entryCount = "";
                justAdded = true;
              }
              await update();
            };
          }}
          class="mt-12 space-y-10 rounded-2 border border-white/10 bg-black/20 p-10"
        >
          <div class="grid grid-cols-[1.4fr_1fr] gap-8">
            <label class="block min-w-0">
              <span
                class="mb-4 block text-10 font-semibold tracking-[0.15em] text-slate-400 uppercase"
                >Date</span
              >
              <input
                type="date"
                name="date"
                required
                bind:value={entryDate}
                oninput={() => (justAdded = false)}
                aria-invalid={errorField === "date" ? "true" : undefined}
                aria-describedby={errorField === "date"
                  ? "add-progress-error"
                  : undefined}
                class="{errorField === 'date'
                  ? FIELD_ERROR
                  : FIELD_OK} [&::-webkit-calendar-picker-indicator]:cursor-pointer [&::-webkit-calendar-picker-indicator]:opacity-60"
              />
            </label>

            <label class="block min-w-0">
              <span
                class="mb-4 block text-10 font-semibold tracking-[0.15em] text-slate-400 uppercase"
                >Count</span
              >
              <input
                type="number"
                name="count"
                min="0"
                step="1"
                inputmode="numeric"
                required
                placeholder="0"
                bind:value={entryCount}
                oninput={() => (justAdded = false)}
                aria-invalid={errorField === "count" ? "true" : undefined}
                aria-describedby={errorField === "count"
                  ? "add-progress-error"
                  : undefined}
                class="{errorField === 'count'
                  ? FIELD_ERROR
                  : FIELD_OK} [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none [appearance:textfield]"
              />
            </label>
          </div>

          {#if addError}
            <p
              id="add-progress-error"
              role="alert"
              class="text-12 font-medium text-rose-300"
            >
              {addError}
            </p>
          {/if}

          <div class="flex items-center gap-8">
            <button
              type="submit"
              disabled={saving}
              class="inline-flex h-28 cursor-pointer items-center gap-6 rounded-2 bg-emerald-500 px-18 text-12 font-semibold text-white transition-colors hover:bg-emerald-400 active:scale-97 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {#if saving}
                <IconSpinner class="size-14" aria-hidden="true" />
                Saving
              {:else}
                <IconPlus class="size-14" aria-hidden="true" />
                Add
              {/if}
            </button>

            <button
              type="button"
              onclick={closeForm}
              class="h-28 cursor-pointer rounded-2 px-14 text-12 font-medium text-slate-300 transition-colors hover:bg-white/5 hover:text-white"
            >
              Cancel
            </button>

            {#if justAdded && !addError}
              <span
                class="ml-auto inline-flex items-center gap-4 text-11 font-medium text-emerald-300"
              >
                <IconCheck class="size-14" aria-hidden="true" />
                Saved
              </span>
            {/if}
          </div>
        </form>
      {/if}

      {#if progress.length > 0}
        <div class="relative mt-16 h-128 w-full">
          <svg
            viewBox="0 0 {CHART_W} {CHART_H}"
            preserveAspectRatio="none"
            role="img"
            aria-label="Progress by year — {chartSummary}"
            class="h-full w-full"
          >
            <defs>
              <linearGradient
                id="dashboard-progress"
                x1="0"
                y1="0"
                x2="0"
                y2="1"
              >
                <stop
                  offset="0%"
                  stop-color="rgb(52 211 153)"
                  stop-opacity="0.45"
                />
                <stop
                  offset="100%"
                  stop-color="rgb(52 211 153)"
                  stop-opacity="0"
                />
              </linearGradient>
            </defs>

            <path d={chart.area} fill="url(#dashboard-progress)" />
            <path
              d={chart.line}
              fill="none"
              stroke="rgb(52 211 153)"
              stroke-width="2"
              stroke-linecap="round"
              stroke-linejoin="round"
              vector-effect="non-scaling-stroke"
            />

            {#each chart.points as point, index (progress[index]?.id ?? index)}
              <circle
                cx={point.x}
                cy={point.y}
                r="3"
                fill="rgb(110 231 183)"
                stroke="rgb(2 6 23)"
                stroke-width="2"
                vector-effect="non-scaling-stroke"
              >
                <title
                  >{formatDate(progress[index].date)}: {formatCount(
                    point.value,
                  )}</title
                >
              </circle>
            {/each}
          </svg>

          <!-- Value labels live outside the SVG so the stretched viewBox
               (preserveAspectRatio="none") can't distort the digits. -->
          <div class="pointer-events-none absolute inset-0" aria-hidden="true">
            {#each chart.points as point, index (progress[index]?.id ?? index)}
              <span
                class="absolute text-10 font-semibold text-emerald-100 tabular-nums drop-shadow-[0_1px_4px_rgba(2,6,23,0.9)]"
                style="left: {(point.x / CHART_W) *
                  100}%; top: {(point.y / CHART_H) *
                  100}%; transform: translate(-50%, calc(-100% - 5px))"
              >
                {formatCount(point.value)}
              </span>
            {/each}
          </div>
        </div>

        <div
          class="mt-8 flex flex-wrap justify-between gap-x-4 gap-y-2 text-10 font-medium text-slate-300 tabular-nums"
        >
          {#each progress as entry (entry.id)}
            <span class="whitespace-nowrap">{formatDate(entry.date)}</span>
          {/each}
        </div>
      {:else}
        <p class="mt-12 text-12 text-slate-400">No progress recorded yet.</p>
      {/if}
    </div>

    <div class="{CARD} p-16">
      <div class="flex items-start justify-between gap-12">
        <div>
          <p
            class="text-10 font-semibold tracking-[0.2em] text-slate-400 uppercase"
          >
            Locations
          </p>
          <p
            class="mt-2 text-10 font-medium text-slate-500 tabular-nums"
          >
            {locations.length} saved
          </p>
        </div>

        <button
          type="button"
          onclick={() =>
            showLocationForm ? closeLocationForm() : openLocationForm()}
          aria-expanded={showLocationForm}
          aria-controls="add-location-form"
          class="inline-flex shrink-0 cursor-pointer items-center gap-4 rounded-2 border px-10 py-4 text-11 font-medium transition-colors {showLocationForm
            ? 'border-white/15 bg-white/10 text-white'
            : 'border-emerald-300/25 bg-emerald-400/15 text-emerald-100 hover:bg-emerald-400/25'}"
        >
          {#if showLocationForm}
            <IconX class="size-14" aria-hidden="true" />
            Close
          {:else}
            <IconPlus class="size-14" aria-hidden="true" />
            Add location
          {/if}
        </button>
      </div>

      {#if showLocationForm}
        <form
          id="add-location-form"
          method="POST"
          action="?/addLocation"
          aria-busy={savingLocation}
          use:enhance={() => {
            savingLocation = true;
            return async ({ result, update }) => {
              savingLocation = false;
              if (result.type === "success") {
                locationName = "";
                locationLat = "";
                locationLng = "";
              }
              await update();
            };
          }}
          class="mt-12 space-y-10 rounded-2 border border-white/10 bg-black/20 p-10"
        >
          <label class="block min-w-0">
            <span
              class="mb-4 block text-10 font-semibold tracking-[0.15em] text-slate-400 uppercase"
              >Name</span
            >
            <input
              type="text"
              name="name"
              required
              maxlength="80"
              placeholder="e.g. Tokyo"
              bind:value={locationName}
              aria-invalid={locationField === "name" ? "true" : undefined}
              aria-describedby={locationField === "name"
                ? "location-error"
                : undefined}
              class={locationField === "name" ? FIELD_ERROR : FIELD_OK}
            />
          </label>

          <div class="grid grid-cols-2 gap-8">
            <label class="block min-w-0">
              <span
                class="mb-4 block text-10 font-semibold tracking-[0.15em] text-slate-400 uppercase"
                >Latitude</span
              >
              <input
                type="number"
                name="latitude"
                step="any"
                inputmode="decimal"
                required
                placeholder="0.000000"
                bind:value={locationLat}
                aria-invalid={locationField === "latitude" ? "true" : undefined}
                aria-describedby={locationField === "latitude"
                  ? "location-error"
                  : undefined}
                class="{locationField === 'latitude'
                  ? FIELD_ERROR
                  : FIELD_OK} [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none [appearance:textfield]"
              />
            </label>

            <label class="block min-w-0">
              <span
                class="mb-4 block text-10 font-semibold tracking-[0.15em] text-slate-400 uppercase"
                >Longitude</span
              >
              <input
                type="number"
                name="longitude"
                step="any"
                inputmode="decimal"
                required
                placeholder="0.000000"
                bind:value={locationLng}
                aria-invalid={locationField === "longitude"
                  ? "true"
                  : undefined}
                aria-describedby={locationField === "longitude"
                  ? "location-error"
                  : undefined}
                class="{locationField === 'longitude'
                  ? FIELD_ERROR
                  : FIELD_OK} [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none [appearance:textfield]"
              />
            </label>
          </div>

          <div class="flex items-center gap-8">
            <button
              type="submit"
              disabled={savingLocation}
              class="inline-flex h-28 cursor-pointer items-center gap-6 rounded-2 bg-emerald-500 px-18 text-12 font-semibold text-white transition-colors hover:bg-emerald-400 active:scale-97 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {#if savingLocation}
                <IconSpinner class="size-14" aria-hidden="true" />
                Saving
              {:else}
                <IconPlus class="size-14" aria-hidden="true" />
                Add
              {/if}
            </button>

            <button
              type="button"
              onclick={closeLocationForm}
              class="h-28 cursor-pointer rounded-2 px-14 text-12 font-medium text-slate-300 transition-colors hover:bg-white/5 hover:text-white"
            >
              Cancel
            </button>
          </div>
        </form>
      {/if}

      {#if locationError}
        <p
          id="location-error"
          role="alert"
          class="mt-8 text-12 font-medium text-rose-300"
        >
          {locationError}
        </p>
      {/if}

      {#if locations.length > 0}
        <ul class="mt-12 space-y-6">
          {#each locations as location (location.id)}
            {@const isCurrent = location.id === currentLocationId}
            {@const isBusy = busyLocationId === location.id}
            <li
              class="flex items-center gap-4 rounded-2 p-4 {isCurrent
                ? 'bg-emerald-400/15 ring-1 ring-emerald-400/40 ring-inset'
                : 'bg-white/5'}"
            >
              <form
                method="POST"
                action="?/selectLocation"
                use:enhance={() => {
                  busyLocationId = location.id;
                  return async ({ update }) => {
                    await update();
                    busyLocationId = null;
                  };
                }}
                class="min-w-0 flex-1"
              >
                <input type="hidden" name="id" value={location.id} />
                <button
                  type="submit"
                  aria-pressed={isCurrent}
                  aria-label="Set {location.name} as current location"
                  class="flex w-full items-center gap-12 rounded-2 px-8 py-6 text-left transition-colors {isCurrent
                    ? 'cursor-default'
                    : 'cursor-pointer hover:bg-white/5'}"
                >
                  <span
                    class="flex size-32 shrink-0 items-center justify-center rounded-8 {isCurrent
                      ? 'bg-emerald-400/20 text-emerald-200'
                      : 'bg-white/5 text-slate-400'}"
                  >
                    {#if isBusy}
                      <IconSpinner class="size-16" aria-hidden="true" />
                    {:else if isCurrent}
                      <IconCrosshair class="size-16" aria-hidden="true" />
                    {:else}
                      <IconMapPin class="size-16" aria-hidden="true" />
                    {/if}
                  </span>
                  <span class="min-w-0 flex-1">
                    <span class="block truncate text-14 font-medium text-white"
                      >{location.name}</span
                    >
                    <span
                      class="block truncate text-11 text-slate-400 tabular-nums"
                    >
                      {Number(location.latitude).toFixed(3)}, {Number(
                        location.longitude,
                      ).toFixed(3)}
                    </span>
                  </span>
                  {#if isCurrent}
                    <span
                      class="shrink-0 text-10 font-semibold tracking-wide text-emerald-200 uppercase"
                    >
                      Current
                    </span>
                  {/if}
                </button>
              </form>

              <form
                method="POST"
                action="?/deleteLocation"
                use:enhance={({ cancel }) => {
                  if (!confirm(`Delete ${location.name}?`)) {
                    cancel();
                    return;
                  }
                  busyLocationId = location.id;
                  return async ({ update }) => {
                    await update();
                    busyLocationId = null;
                  };
                }}
              >
                <input type="hidden" name="id" value={location.id} />
                <button
                  type="submit"
                  disabled={isBusy}
                  aria-label="Delete {location.name}"
                  class="flex size-32 shrink-0 cursor-pointer items-center justify-center rounded-2 text-slate-400 transition-colors hover:bg-rose-400/15 hover:text-rose-200 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <IconTrash class="size-16" aria-hidden="true" />
                </button>
              </form>
            </li>
          {/each}
        </ul>
      {:else}
        <p class="mt-12 text-12 text-slate-400">No locations saved.</p>
      {/if}
    </div>

    <div class="{CARD} p-16">
      <div class="flex items-center justify-between gap-12">
        <div class="min-w-0">
          <p
            class="text-10 font-semibold tracking-[0.2em] text-slate-400 uppercase"
          >
            Weather forecast model
          </p>
          <p class="mt-4 truncate text-14 font-semibold text-white">
            {modelList.find((m) => m.value === forecastModel)?.name ??
              "Not selected"}
          </p>
        </div>
        {#if savingModel}
          <IconSpinner
            class="size-16 shrink-0 text-emerald-300"
            aria-hidden="true"
          />
        {/if}
      </div>

      <form
        method="POST"
        action="?/setForecastModel"
        use:enhance={() => {
          savingModel = true;
          return async ({ update }) => {
            await update();
            savingModel = false;
          };
        }}
      >
        <div
          role="radiogroup"
          aria-label="Weather forecast model"
          class="mt-12 grid gap-6 sm:grid-cols-2"
        >
          {#each modelList as model (model.value)}
            {@const isActive = model.value === forecastModel}
            <label
              class="flex cursor-pointer items-center gap-8 rounded-2 px-10 py-6 text-12 font-medium transition-colors peer-focus-visible:ring-2 peer-focus-visible:ring-emerald-400/50 {isActive
                ? 'bg-emerald-400/15 text-white ring-1 ring-emerald-400/40 ring-inset'
                : 'bg-white/5 text-slate-300 hover:bg-white/10 hover:text-white'}"
            >
              <input
                type="radio"
                name="model"
                value={model.value}
                checked={isActive}
                onchange={(event) => event.currentTarget.form?.requestSubmit()}
                class="sr-only"
              />
              <span
                class="size-6 shrink-0 rounded-full {isActive
                  ? 'bg-emerald-300'
                  : 'bg-slate-500'}"
                aria-hidden="true"
              ></span>
              <span class="min-w-0 flex-1 truncate">{model.name}</span>
              {#if isActive}
                <IconCheck
                  class="size-14 shrink-0 text-emerald-300"
                  aria-hidden="true"
                />
              {/if}
            </label>
          {/each}
        </div>
      </form>
    </div>
  {:else}
    <div class="{CARD} flex flex-col items-center gap-12 p-32 text-center">
      <IconChartLineUp class="size-32 text-emerald-300" aria-hidden="true" />
      <p class="text-14 font-medium text-white">No dashboard record</p>
      <p class="max-w-[24ch] text-12 text-slate-300">
        Add a row to <span class="font-mono text-slate-200"
          >dashboard_table</span
        > to see it here.
      </p>
    </div>
  {/if}
</section>
