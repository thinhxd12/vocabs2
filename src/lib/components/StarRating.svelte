<script lang="ts">
  interface Props {
    rating: number;
    starColor?: string;
    inactiveColor?: string;
    totalStars?: number;
    size?: number;
    gap?: number;
  }

  let {
    rating,
    starColor = '#e87400',
    inactiveColor = '#c2c7cc',
    totalStars = 5,
    size = 24,
    gap = 2,
  }: Props = $props();

  /** How much of the star at `index` is filled: 0, 1, or the fractional part. */
  function fillPercent(index: number) {
    const diff = rating - index;
    if (diff >= 1) return 1;
    if (diff > 0) return diff;
    return 0;
  }
</script>

<div
  class="flex items-center"
  style="gap: {gap}px;"
  role="img"
  aria-label="{rating.toFixed(1)} out of {totalStars} stars"
>
  {#each Array(totalStars) as _, index (index)}
    {@const fill = fillPercent(index)}
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      style="width: {size}px; height: {size}px;"
      aria-hidden="true"
    >
      {#if fill === 1}
        <path
          d="M12 .587l3.668 7.568L24 9.75l-6 5.85L19.336 24 12 19.897 4.664 24 6 15.6 0 9.75l8.332-1.595z"
          fill={starColor}
        />
      {:else if fill === 0}
        <path
          d="M12 .587l3.668 7.568L24 9.75l-6 5.85L19.336 24 12 19.897 4.664 24 6 15.6 0 9.75l8.332-1.595z"
          fill={inactiveColor}
        />
      {:else}
        <defs>
          <linearGradient id="star-{index}" x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stop-color={starColor} />
            <stop offset="{fill * 100}%" stop-color={starColor} />
            <stop offset="{fill * 100}%" stop-color={inactiveColor} />
          </linearGradient>
        </defs>
        <path
          d="M12 .587l3.668 7.568L24 9.75l-6 5.85L19.336 24 12 19.897 4.664 24 6 15.6 0 9.75l8.332-1.595z"
          fill="url(#star-{index})"
        />
      {/if}
    </svg>
  {/each}
</div>
