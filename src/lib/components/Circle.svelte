<script module lang="ts">
  // The needles are precomputed once from a fixed integer hash instead of
  // Math.random, so the server and the browser emit identical markup and
  // hydration never disagrees about a spike. Math.imul keeps the hash in exact
  // 32-bit integer math on both sides. The four cardinals (12, 3, 6, 9 o'clock)
  // are deterministic and drawn separately as the long rays.
  const noise = (seed: number) => {
    let h = Math.imul(seed ^ 0x9e3779b9, 0x85ebca6b);
    h ^= h >>> 13;
    h = Math.imul(h, 0xc2b2ae35);
    h ^= h >>> 16;
    return (h >>> 0) / 4294967296;
  };

  const SPIKES = 180;
  // The svg box is 120% of the circle, so the ring's outer edge sits at
  // 50 / 1.2 in viewBox units; spikes start there and grow outward.
  const EDGE = 50 / 1.2;

  // Point at an angle/radius, offset sideways by `tangent` so the thorn base
  // and its curved sides can be drawn symmetrically around the needle axis.
  const pt = (angle: number, radius: number, tangent = 0) =>
    `${(50 + Math.cos(angle) * radius - Math.sin(angle) * tangent).toFixed(2)} ${(50 + Math.sin(angle) * radius + Math.cos(angle) * tangent).toFixed(2)}`;

  const thorn = (
    angle: number,
    base: number,
    length: number,
    halfWidth: number,
  ) => {
    const waist = base + length * 0.32;
    return `M${pt(angle, base, halfWidth)}Q${pt(angle, waist, halfWidth * 0.55)} ${pt(angle, base + length)}Q${pt(angle, waist, -halfWidth * 0.55)} ${pt(angle, base, -halfWidth)}Z`;
  };

  const buildSpikes = () => {
    const small: string[] = [];
    const medium: string[] = [];
    const cardinals: string[] = [];
    // The rim repeats medium, then one or two short thorns, then medium, so it
    // reads as a rhythm instead of random noise. The four cardinals are drawn
    // separately and stay the longest.
    let shortRun = 0;
    for (let i = 0; i < SPIKES; i++) {
      if (i % 45 === 0) continue; // the % 45 hits land on the four cardinals
      const angle = (i / SPIKES) * Math.PI * 2 + (noise(i + 1) - 0.5) * 0.014;
      const base = EDGE - 0.5 + noise(i + 1001) * 0.25;
      if (shortRun === 0) {
        medium.push(thorn(angle, base, 4.5 + noise(i + 2001) * 0.9, 0.15));
        shortRun = noise(i + 3001) < 0.5 ? 1 : 2;
      } else {
        small.push(thorn(angle, base, 3.0 + noise(i + 4001) * 0.7, 0.1));
        shortRun--;
      }
    }
    for (const angle of [0, Math.PI / 2, Math.PI, (Math.PI * 3) / 2]) {
      const base = EDGE - 0.35;
      cardinals.push(thorn(angle, base, 8.1, 0.24));
    }
    return {
      small: small.join(""),
      medium: medium.join(""),
      cardinals: cardinals.join(""),
    };
  };

  const needles = buildSpikes();
</script>

<script lang="ts">
  import { type Snippet } from "svelte";
  interface Props {
    children?: Snippet;
  }
  let { children }: Props = $props();
</script>

<div class="circle-container">
  <svg
    class="circle-spikes"
    viewBox="0 0 100 100"
    aria-hidden="true"
    focusable="false"
  >
    <path d={needles.small} fill="#c08a35" opacity="0.65" />
    <path d={needles.medium} fill="#d8a648" opacity="0.85" />
    <path d={needles.cardinals} fill="#efd18a" opacity="0.95" />
  </svg>

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
    /* Aged charcoal plate plus the same turbulence grain the printed surfaces use. */
    --plate: url("data:image/svg+xml,%3Csvg viewBox='0 0 250 250' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noiseFilter'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='1.2' numOctaves='1' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noiseFilter)' opacity='0.15'/%3E%3C/svg%3E"),
      radial-gradient(circle at 50% 45%, #171310 0%, #0c0a08 55%, #060504 100%);
    width: var(--circle-size);
    height: var(--circle-size);
    aspect-ratio: 1;
    flex: none;
    position: relative;
    display: flex;
    align-items: center;
    justify-content: center;
    border-radius: 50%;
    /* The needles have to escape the medallion, so the clip that crops the
       square artwork to the inner edge of the ring now lives on
       .circle-content instead of here. */
    overflow: visible;
    padding: 4px;
    box-shadow:
      0 2px 6px rgba(0, 0, 0, 0.9),
      0 10px 24px rgba(0, 0, 0, 0.8);
    background: linear-gradient(90deg, #9a7a3b 0%, #e6d3a1 100%);
  }

  /* The rim is repainted above the spikes so the thorns emerge from under the
     medallion instead of crossing its face. `background: inherit` picks up the
     gold gradient from .circle-container without duplicating it. */
  .circle-container::before {
    content: "";
    position: absolute;
    inset: 0;
    border-radius: 50%;
    background: inherit;
    z-index: 1;
    pointer-events: none;
  }

  /* 120% box centred on the circle, so the viewBox radius 41.666… is the ring
     edge and even the cardinal tips stay just inside the 50-unit box. */
  .circle-spikes {
    position: absolute;
    inset: -10%;
    width: 120%;
    height: 120%;
    z-index: 0;
    pointer-events: none;
    overflow: visible;
  }

  .circle-content {
    position: relative;
    z-index: 2;
    overflow: hidden;
    background: var(--plate);
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
    padding: 1px;
    background: linear-gradient(90deg, #8f763b 0%, #d2c28e 100%);
  }

  .square-content {
    background: var(--plate);
    width: 100%;
    height: 100%;
  }
</style>
