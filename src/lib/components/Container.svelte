<script lang="ts">
  import type { Snippet } from 'svelte';

  interface Props {
    children?: Snippet;
    /** Lets the page scroll; otherwise the screen owns the viewport. */
    scrollable?: boolean;
    /** Uses the full width instead of the app's reading column. */
    fullscreen?: boolean;
    class?: string;
  }

  let {
    children,
    scrollable = false,
    fullscreen = false,
    class: className = '',
  }: Props = $props();
</script>

<div
  class="relative flex h-full w-full flex-col items-center gap-2 {fullscreen
    ? ''
    : 'mx-auto max-w-382'} {scrollable
    ? 'min-h-full shrink-0 overscroll-contain'
    : 'h-full'} {className}"
>
  {@render children?.()}
</div>
