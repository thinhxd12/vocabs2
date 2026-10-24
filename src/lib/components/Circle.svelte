<script lang="ts">
  import { type Snippet } from "svelte";
  interface Props {
    children?: Snippet;
  }
  let { children }: Props = $props();
</script>

<div class="circle-container">
  <div class="circle-content">
    <div class="square-container">
      <div class="square-content">
        {@render children?.()}
      </div>
    </div>
  </div>
</div>

<style lang="postcss">
  /* One size drives both axes, so the medallion can never become an ellipse:
     the old rule set width and height separately, and as a flex item it was
     allowed to shrink vertically when the page ran out of height — a 540px
     wide, 300px tall "circle". `flex: none` also keeps it out of that
     negotiation; `aspect-ratio` is the belt to that braces. */
  .circle-container {
    --circle-size: var(--width, var(--height, 540px));
    width: var(--circle-size);
    height: var(--circle-size);
    aspect-ratio: 1;
    flex: none;
    position: relative;
    display: flex;
    align-items: center;
    justify-content: center;
    border-radius: 50%;
    overflow: hidden;
    padding: 3px;
    box-shadow: 0 6px 15px rgba(0, 0, 0, 0.6);
    background: linear-gradient(90deg, #9a7a3b 0%, #e6d3a1 100%);
  }

  .circle-content {
    background: radial-gradient(circle, #060606 30%, #020406 100%);
    width: 100%;
    height: 100%;
    border-radius: 50%;
    display: flex;
    align-items: center;
    justify-content: center;
  }

  .square-container {
    width: 70.71%;
    height: 70.71%;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 2px;
    background: linear-gradient(90deg, #8f763b 0%, #d2c28e 100%);
  }

  .square-content {
    background: radial-gradient(circle, #060606 30%, #020406 100%);
    width: 100%;
    height: 100%;
  }
</style>
