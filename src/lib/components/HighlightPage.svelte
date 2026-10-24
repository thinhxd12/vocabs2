<script lang="ts">
  import { Spring } from 'svelte/motion';
  import type { BookPageContent } from '#lib/types.ts';
  import { safeHighlightHtml } from '#lib/sanitize.ts';

  interface Props {
    data: BookPageContent;
    innerWidth: number;
    innerHeight: number;
    /** How many flip pages the current highlight was split into. */
    length: number;
    handleFlip: (id: number) => void;
  }

  let { data, innerWidth, innerHeight, length, handleFlip }: Props = $props();

  const tween = new Spring(0, { stiffness: 0.06, damping: 0.4 });

  $effect(() => {
    tween.target = data.flip ? -180 : 0;
  });
</script>

<div
  class="flip"
  style="z-index: {tween.current <= -90
    ? 4 + data.id
    : 4 + length - data.id}; transform: rotateY({tween.current}deg);"
>
  <div class="frontPage frontPaper">
    <div
      class={['highlightContent', { highlightContentFirstPage: data.id === 1 }]}
      style="width: {innerWidth}px; height: {innerHeight}px; margin: 3rem 3rem 3rem calc(4rem - {tween.current <=
      -90
        ? 2 * data.id
        : 2 * (1 + length - data.id)}px);"
    >
      {@html safeHighlightHtml(data.front)}
    </div>
    <span class="pageNumber">{2 * data.id - 1}.</span>
    <button
      type="button"
      class="pageButton"
      aria-label="Turn to page {2 * data.id - 1}"
      onclick={() => handleFlip(data.id)}
    >
      {#if !data.flip}
        <span class="pageFold"></span>
      {/if}
    </button>
  </div>

  <div class="backPage backPaper">
    <div
      class="highlightContent"
      style="width: {innerWidth}px; height: {innerHeight}px; margin: 3rem calc(3rem - {tween.current <=
      -90
        ? 2 * data.id
        : 2 * (1 + length - data.id)}px) 3rem 4rem;"
    >
      {@html safeHighlightHtml(data.back)}
    </div>

    <span class="pageNumber">{2 * data.id}.</span>
    <button
      type="button"
      class="pageButton"
      aria-label="Turn back from page {2 * data.id}"
      onclick={() => handleFlip(data.id)}
    >
      {#if data.flip}
        <span class="pageFold"></span>
      {/if}
    </button>
  </div>
</div>

<style lang="postcss">
  .flip {
    transform-style: preserve-3d;
    position: absolute;
    top: 12px;
    bottom: 12px;
  }

  .frontPage,
  .backPage {
    position: absolute;
    top: 0;
    left: 0;
    user-select: text;
    backface-visibility: hidden;
  }

  .frontPage {
    z-index: 0;
    box-shadow: 2px 0 2px rgba(0, 0, 0, 0.45);
  }

  .backPage {
    z-index: 1;
    transform: rotateY(180deg);
    box-shadow: -2px 0 2px rgba(0, 0, 0, 0.45);
  }

  .frontPaper {
    background: linear-gradient(
      to right,
      #d9d9d9 0%,
      #f9f9f9 9%,
      #ffffff 12%,
      #ffffff 100%
    );
  }

  .backPaper {
    background: linear-gradient(
      to right,
      #ffffff 0%,
      #ffffff 88%,
      #f9f9f9 91%,
      #d9d9d9 100%
    );
  }

  .pageNumber {
    position: absolute;
    bottom: 1.5rem;
    font-family: 'Galaxie Copernicus', serif;
    font-size: 12px;
    font-weight: 600;
    color: #1e1915;
    user-select: none;
  }

  .frontPage .pageNumber {
    right: 2.5rem;
  }

  .backPage .pageNumber {
    left: 2.5rem;
  }

  .pageButton {
    position: absolute;
    top: 0;
    bottom: 0;
    width: 60px;
    cursor: pointer;
  }

  .frontPage .pageButton {
    right: 0;
  }

  .backPage .pageButton {
    left: 0;
  }

  .pageFold {
    position: absolute;
    width: 0;
    height: 0;
    transition: all 150ms;
  }

  .frontPage .pageFold {
    top: 0;
    right: 0;
    border-left: 1px solid #dddddd;
    border-bottom: 1px solid #dddddd;
    box-shadow: -4px 4px 10px #a4a4a4;
  }

  .backPage .pageFold {
    top: 0;
    left: 0;
    border-right: 1px solid #dddddd;
    border-bottom: 1px solid #dddddd;
    box-shadow: 4px 4px 10px #a4a4a4;
  }

  .frontPage .pageButton:hover .pageFold {
    width: 60px;
    height: 60px;
    background-image: linear-gradient(
      45deg,
      rgb(254, 254, 254) 0%,
      rgb(242, 242, 242) 49%,
      rgb(255, 255, 255) 50%,
      rgb(255, 255, 255) 100%
    );
  }

  .backPage .pageButton:hover .pageFold {
    width: 60px;
    height: 60px;
    background-image: linear-gradient(
      135deg,
      rgb(255, 255, 255) 0%,
      rgb(255, 255, 255) 50%,
      rgb(242, 242, 242) 51%,
      rgb(254, 254, 254) 100%
    );
  }

  @media (prefers-reduced-motion: reduce) {
    .pageFold {
      transition: none;
    }
  }
</style>
