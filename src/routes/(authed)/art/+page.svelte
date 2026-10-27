<script lang="ts">
  import { prefersReducedMotion } from "svelte/motion";
  import { fade } from "svelte/transition";
  import IconArrowLeft from "~icons/ph/arrow-left";
  import IconArrowRight from "~icons/ph/arrow-right";
  import IconSpinner from "~icons/svg-spinners/ring-resize";
  import Container from "#lib/components/Container.svelte";
  import Toaster from "#lib/components/Toaster.svelte";
  import { art, nextArt, prevArt, showArt } from "#lib/store/art.svelte.ts";

  const NAV =
    "flex size-44 cursor-pointer items-center justify-center rounded-full border border-white/10 bg-slate-950/55 text-white/75 backdrop-blur-md transition-colors hover:bg-slate-900/80 hover:text-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-300 disabled:cursor-not-allowed disabled:opacity-35";

  const KBD =
    "rounded-4 border border-white/15 bg-white/5 px-6 py-2 font-sans text-10 text-slate-300";

  /** A crossfade, unless the reader asked for less motion. */
  const fadeMs = $derived(prefersReducedMotion.current ? 0 : 420);

  // Before the first paint, so entering /art always opens on the same painting
  // instead of flashing the one left over from the previous visit.
  showArt();

  function onKeyDown(event: KeyboardEvent) {
    if (event.metaKey || event.ctrlKey || event.altKey) return;

    if (event.key === "ArrowRight") {
      event.preventDefault();
      nextArt();
    }

    if (event.key === "ArrowLeft") {
      event.preventDefault();
      prevArt();
    }
  }
</script>

<svelte:head>
  <title>{art.image.title} art</title>
  <meta
    name="description"
    content="A painting a day from DailyArt, with the magazine's notes on the artist and the work."
  />
</svelte:head>

<svelte:window onkeydown={onKeyDown} />

<Container fullscreen class="gap-0! lg:flex-row lg:items-stretch">
  <!-- The wall: the painting lit by a blurred copy of itself. -->
  <section
    class="relative isolate flex h-[54dvh] min-h-256 w-full shrink-0 items-center justify-center overflow-hidden bg-[#19191c] lg:h-full lg:flex-1"
  >
    {#key art.image.mainImage}
      <img
        src={art.image.mainImage}
        alt=""
        aria-hidden="true"
        class="pointer-events-none absolute inset-0 size-full scale-125 object-cover opacity-35 blur-3xl"
        transition:fade={{ duration: fadeMs }}
      />
    {/key}

    {#key art.image.mainImage}
      <div
        class="absolute inset-0 z-10 flex items-center justify-center px-16 pt-56 pb-32 sm:px-32 sm:pt-80 lg:px-64 lg:py-80"
        transition:fade={{ duration: fadeMs }}
      >
        <img
          src={art.image.mainImage}
          alt={art.image.title}
          fetchpriority="high"
          decoding="async"
          class="max-h-full max-w-full object-contain shadow-[0_35px_90px_-25px_rgba(0,0,0,0.95)] ring-1 ring-white/15"
        />
      </div>
    {/key}

    <div
      class="pointer-events-none absolute inset-x-0 top-0 z-20 flex items-start justify-end gap-12 p-16 sm:p-20"
    >
      <div class="pointer-events-auto flex gap-8">
        <button
          type="button"
          class={NAV}
          aria-label="Previous painting"
          disabled={!art.hasPrevious}
          onclick={prevArt}
        >
          <IconArrowLeft class="size-16" aria-hidden="true" />
        </button>

        <button
          type="button"
          class={NAV}
          aria-label="Next painting"
          aria-busy={art.loading}
          disabled={art.loading}
          onclick={nextArt}
        >
          {#if art.loading}
            <IconSpinner class="size-16 animate-spin" aria-hidden="true" />
          {:else}
            <IconArrowRight class="size-16" aria-hidden="true" />
          {/if}
        </button>
      </div>
    </div>
  </section>

  <!-- The wall label: date, title, attribution, then the magazine's note. -->
  <aside
    class="relative z-20 -mt-24 flex w-full shrink-0 flex-col rounded-t-28 border-t border-white/10 bg-[#19191c] lg:mt-0 lg:h-full lg:w-360 lg:rounded-none lg:border-t-0 lg:border-l"
  >
    <div
      class="mx-auto mt-10 h-4 w-40 shrink-0 rounded-full bg-white/15 lg:hidden"
    ></div>

    <div
      class="no-scrollbar flex flex-col gap-3 px-9 pt-9 pb-18 sm:px-32 lg:min-h-0 lg:flex-1 lg:gap-24 lg:overflow-y-auto lg:px-32 lg:pt-36 lg:pb-24"
    >
      <header>
        <p
          class="text-10 font-semibold tracking-[0.22em] text-emerald-300/80 uppercase"
        >
          {art.image.shareDate}
        </p>
        <h1
          class="mt-12 font-roslindale text-[clamp(1.75rem,5.5vw,2.4rem)] leading-[1.05] tracking-[-0.01em] text-white"
        >
          {art.image.title}
        </h1>
        <p class="mt-8 text-14 leading-24 text-slate-400">{art.image.attr}</p>
      </header>

      <div class="flex items-center gap-6">
        <img
          src={art.image.authorImage}
          alt=""
          class="size-48 shrink-0 rounded-full object-cover ring-1 ring-white/15"
        />
        <div class="min-w-0">
          <p class="truncate text-14 font-medium text-white">
            {art.image.author}
          </p>
          <p class="mt-2 text-12 text-slate-400">{art.image.authorYears}</p>
        </div>
      </div>

      <div class="space-y-4 text-15 leading-20 text-slate-300 *:indent-36">
        {#each art.image.content as paragraph, index (index)}
          <p>{paragraph}</p>
        {/each}
      </div>

      <p class="text-11 text-slate-500 lg:hidden">
        Painting and notes from DailyArt Magazine.
      </p>
    </div>

    <footer
      class="hidden shrink-0 items-center justify-between border-t border-white/10 px-32 py-16 text-11 text-slate-500 lg:flex"
    >
      <span>DailyArt Magazine</span>
      <span class="flex items-center gap-6">
        <kbd class={KBD}>←</kbd>
        <kbd class={KBD}>→</kbd>
        <span class="ml-4">browse</span>
      </span>
    </footer>
  </aside>
</Container>

<p class="sr-only" aria-live="polite">
  {art.loading ? "Fetching the next painting" : art.image.title}
</p>

<Toaster />
