<script lang="ts">
  import treePlate from "#lib/assets/images/grunge-image-tree.webp";
  import grainTile from "#lib/assets/images/noise-64x64.png";

  type Props = {
    /** The quotation itself, without surrounding quote marks. */
    quote: string;
    /** Who said it. Rendered under the words. */
    author?: string;
    /** Optional work / edition line under the author. */
    source?: string;
    /** Background plate. Defaults to the lone tree. */
    image?: string;
    /** Describe the plate only when it carries meaning of its own. */
    imageAlt?: string;
  };

  let {
    quote,
    author = "",
    source = "",
    image = treePlate,
    imageAlt = "",
  }: Props = $props();

  // Tiled, so one 4 kB request covers the whole card at any size.
  const grain = `background-image: url('${grainTile}'); background-repeat: repeat;`;
</script>

<!-- The plate is the card, so the height follows the words rather than a frame.
     `@container` keeps the padding in step with the card's own width. -->
<figure
  class="@container relative isolate overflow-hidden rounded-2 border border-white/10 bg-slate-950 shadow-[0_10px_40px_rgba(0,0,0,0.5)]"
>
  <img
    src={image}
    alt={imageAlt}
    aria-hidden={imageAlt ? undefined : "true"}
    decoding="async"
    class="pointer-events-none absolute inset-0 -z-10 h-full w-full object-cover object-center select-none"
  />

  <!-- Scrim: measured against the plate's brightest weather so small type still
       clears 4.5:1 on top of it. -->
  <div
    class="absolute inset-0 -z-10 bg-linear-to-b from-slate-950/60 via-slate-950/68 to-slate-950/78"
    aria-hidden="true"
  ></div>

  <!-- Film grain, echoing the plate's printed texture. -->
  <div
    class="pointer-events-none absolute inset-0 -z-10 opacity-10 mix-blend-soft-light"
    style={grain}
    aria-hidden="true"
  ></div>

  <blockquote class="relative p-6 @md:px-24 @md:py-24">
    <p
      class="font-garamond text-10 leading-12 text-pretty text-slate-100 @md:text-sm"
    >
      <span
        class="mr-px align-[-0.12em] font-serif text-[1.6em] leading-none text-emerald-300/70 select-none"
        aria-hidden="true"
      >
        “
      </span>
      {quote}
    </p>

    <!-- Attribution rides with the words it belongs to. -->
    <footer class="mt-3 flex items-center gap-10">
      <span class="h-px w-24 shrink-0 bg-emerald-400/70" aria-hidden="true"
      ></span>
      <span class="min-w-0">
        {#if author}
          <span
            class="block text-10 font-semibold tracking-[0.2em] text-slate-300 uppercase"
          >
            {author}
          </span>
        {/if}
        {#if source}
          <span class="mt-2 block text-11 leading-snug text-slate-400">
            {source}
          </span>
        {/if}
      </span>
    </footer>
  </blockquote>
</figure>
