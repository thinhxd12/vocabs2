<script lang="ts">
  import { tick } from "svelte";
  import IconCaretLeft from "~icons/ph/caret-left";
  import IconCaretRight from "~icons/ph/caret-right";

  /** `start-gap` / `end-gap` are distinct so the keyed `{#each}` never collides. */
  type Item = number | "start-gap" | "end-gap";

  type Props = {
    /** Current page, 1-based. Two-way bindable. */
    page?: number;
    /** How many pages exist. */
    pageCount: number;
    /** Pages kept either side of the current one. */
    siblings?: number;
    /** Called with the new page after every change. */
    onchange?: (page: number) => void;
    /** Morph the active fill with the View Transitions API. */
    morph?: boolean;
    /** Step past either end and loop: last → first page, first → last page. */
    wrap?: boolean;
    disabled?: boolean;
    /** Accessible name for the landmark. */
    label?: string;
    /** Match the surrounding surface: dark app chrome or a white modal. */
    tone?: "dark" | "light";
    class?: string;
  };

  let {
    page = $bindable(1),
    pageCount,
    siblings = 1,
    onchange,
    morph = true,
    wrap = false,
    disabled = false,
    label = "Pagination",
    tone = "dark",
    class: className = "",
  }: Props = $props();

  const lastPage = $derived(Math.max(1, Math.trunc(pageCount)));
  // The control never trusts `page`: it clamps, so a stale or hostile value
  // can't produce a button that goes nowhere.
  const current = $derived(Math.min(Math.max(1, Math.trunc(page)), lastPage));

  /** Where each step button lands, honouring `wrap` at either end. */
  const prevTarget = $derived(
    current > 1 ? current - 1 : wrap ? lastPage : current,
  );
  const nextTarget = $derived(
    current < lastPage ? current + 1 : wrap ? 1 : current,
  );

  /**
   * Constant-size window. The work is bounded by `siblings`, not by
   * `pageCount`, so a 5-page list and a 500 000-page list cost the same — and
   * because it's `$derived` it's memoised, recomputed only when `page`,
   * `pageCount` or `siblings` actually change.
   */
  const items = $derived.by<Item[]>(() => {
    const span = siblings * 2 + 5;
    if (lastPage <= span) {
      return Array.from({ length: lastPage }, (_, index) => index + 1);
    }

    const left = Math.max(2, current - siblings);
    const right = Math.min(lastPage - 1, current + siblings);
    const list: Item[] = [1];

    if (left > 2) list.push("start-gap");
    for (let p = left; p <= right; p += 1) list.push(p);
    if (right < lastPage - 1) list.push("end-gap");
    list.push(lastPage);

    return list;
  });

  /** Whatever the reader has typed into the "go to page" box. */
  let jump = $state("");

  const prefersReducedMotion = () =>
    typeof matchMedia === "function" &&
    matchMedia("(prefers-reduced-motion: reduce)").matches;

  /** Shared shell: a squared-off, focus-ringed, tap-friendly control. */
  const BASE = $derived(
    `inline-flex shrink-0 touch-manipulation items-center justify-center rounded-2 font-sfpro text-xs tabular-nums select-none transition-colors duration-200 outline-offset-2 focus-visible:outline-2 ${
      tone === "light"
        ? "focus-visible:outline-emerald-600"
        : "focus-visible:outline-emerald-300"
    } disabled:cursor-not-allowed disabled:opacity-40 motion-reduce:transition-none`,
  );

  const toneStyles = $derived(
    tone === "light"
      ? {
          step: "border border-slate-200 bg-white text-slate-600 hover:border-slate-300 hover:bg-slate-100 hover:text-slate-900 active:bg-slate-200",
          track: "border border-slate-200 bg-slate-100",
          ghost:
            "font-normal text-slate-600 hover:bg-slate-200/70 hover:text-slate-900 active:bg-slate-200",
          gap: "text-slate-400",
          input:
            "border-slate-200 bg-white text-slate-700 placeholder:text-slate-400 focus-visible:border-emerald-500",
        }
      : {
          step: "border border-white/10 bg-slate-800/70 backdrop-blur-lg hover:border-white/25 hover:bg-slate-800/80 hover:text-white active:bg-white/15",
          track: "border border-white/10 bg-slate-800/70 backdrop-blur-lg",
          ghost:
            "font-normal text-slate-300 hover:bg-white/10 hover:text-white active:bg-white/15",
          gap: "text-slate-500",
          input:
            "border-white/10 bg-slate-800/60 text-slate-400 placeholder:text-slate-400",
        },
  );

  const STEP = $derived(`${BASE} ${toneStyles.step} h-22 gap-3 px-6`);

  /** Page numbers live in a shared track, so they stay borderless. */
  const NUM = $derived(`${BASE} relative size-22`);

  function go(next: number) {
    const target = Math.min(Math.max(1, next), lastPage);
    if (disabled || target === current) return;
    const apply = () => {
      page = target;
      onchange?.(target);
    };

    const doc = document as Document & {
      startViewTransition?: (callback: () => Promise<void>) => unknown;
    };

    // The fill is the only named group, so the browser slides it while the
    // rest of the page repaints live — no root snapshot, which is what made
    // the backdrop-blurred cards flicker.
    if (
      morph &&
      !prefersReducedMotion() &&
      typeof doc.startViewTransition === "function"
    ) {
      doc.startViewTransition(async () => {
        apply();
        // Runes flush on a microtask; without this the browser would capture
        // the "new" state before the DOM actually changed.
        await tick();
      });
      return;
    }

    apply();
  }

  /** Typing a page and pressing Enter (or Go) lands on it; junk is ignored. */
  function submitJump(event: SubmitEvent) {
    event.preventDefault();
    const next = Number(jump.trim());
    if (!Number.isFinite(next) || next < 1) return;
    go(next); // `go` clamps to the last page
    jump = "";
  }
</script>

<nav
  aria-label={label}
  class="@container flex flex-wrap items-center justify-center gap-3 {className}"
>
  <button
    type="button"
    onclick={() => go(prevTarget)}
    disabled={disabled || (!wrap && current === 1)}
    class={STEP}
    aria-label="Previous page"
  >
    <IconCaretLeft class="size-12 shrink-0" aria-hidden="true" />
    <!-- Labels only earn their space once the container can afford them. -->
    <span class="@max-sm:hidden">Previous</span>
  </button>

  <!-- Segmented track: one rail, the active number as a filled square. -->
  <div class="flex h-22 items-center gap-3 rounded-2 {toneStyles.track}">
    {#each items as item (item)}
      {#if typeof item === "number"}
        <button
          type="button"
          onclick={() => go(item)}
          {disabled}
          aria-current={item === current ? "page" : undefined}
          aria-label="Page {item}"
          class="{NUM} {item === current
            ? 'font-semibold text-slate-950'
            : toneStyles.ghost}"
        >
          {#if item === current}
            <!-- Holds the number so it travels with the fill; the View
                 Transition fills in this named element's old/new snapshots. -->
            <span
              class="pointer-events-none absolute inset-0 flex items-center justify-center text-emerald-500 [view-transition-name:pagination-pill]"
            >
              {item}
            </span>
          {:else}
            <span class="relative">{item}</span>
          {/if}
        </button>
      {:else}
        <span
          class="inline-flex size-32 items-center justify-center font-sfpro text-sm select-none {toneStyles.gap}"
          aria-hidden="true"
        >
          …
        </span>
      {/if}
    {/each}
  </div>

  <button
    type="button"
    onclick={() => go(nextTarget)}
    disabled={disabled || (!wrap && current === lastPage)}
    class={STEP}
    aria-label="Next page"
  >
    <span class="@max-sm:hidden">Next</span>
    <IconCaretRight class="size-14 shrink-0" aria-hidden="true" />
  </button>

  <form class="flex items-center gap-4" onsubmit={submitJump}>
    <input
      type="text"
      inputmode="numeric"
      autocomplete="off"
      spellcheck="false"
      {disabled}
      bind:value={jump}
      placeholder={String(current)}
      aria-label="Page number to go to"
      class="h-22 w-42 text-12 font-400 rounded-2 border font-sfpro tabular-nums text-center outline-0 outline-offset-2 disabled:cursor-not-allowed disabled:opacity-40 {toneStyles.input}"
    />
    <button type="submit" {disabled} class="{BASE} {toneStyles.step} h-22 px-7">
      Go
    </button>
  </form>
</nav>

<style>
  /* The root snapshot can't reproduce `backdrop-filter`, so blurred cards
     flash while a transition runs. Taking the root out of the transition
     leaves only the named fill to animate; everything else repaints live. */
  :global(:root) {
    view-transition-name: none;
  }

  /* View Transition pseudo-elements hang off the document, so they can't be
     scoped — `:global` emits them verbatim. */

  /* The overlay would otherwise swallow clicks for the transition's duration. */
  :global(::view-transition) {
    pointer-events: none;
  }

  :global(::view-transition-group(pagination-pill)) {
    animation-duration: 220ms;
    animation-timing-function: cubic-bezier(0.22, 1, 0.36, 1);
  }
</style>
