/**
 * The app's one button: a translucent white tile with a dark glyph, brighter
 * when it is the current page, an open panel, or the mode in play.
 *
 * Class strings rather than a component, because the same control is an `<a>`,
 * a `<button>` and a form submit, and the size differs by place — the caller
 * appends its own `h-*`/`w-*`/`size-*`.
 *
 * No border, no outline, no highlight line, no gradient, no glow: the fill and a
 * small drop shadow are all there is. No `backdrop-filter` either — the dock
 * already blurs what is behind these tiles, so a second blur per tile would cost
 * frames and change nothing.
 */

const BASE =
	'inline-flex shrink-0 cursor-pointer touch-manipulation items-center justify-center rounded-2 transition-[color,background-color,box-shadow] duration-150 focus-visible:outline-2 focus-visible:outline-emerald-300 active:scale-95 disabled:opacity-60 motion-reduce:transition-none motion-reduce:active:scale-100';

/** Resting tile. */
export const BTN = `${BASE} bg-white/25 text-black shadow-[0_1px_2px_rgba(2,6,23,0.3)] hover:bg-white/45 hover:shadow-[0_2px_6px_rgba(2,6,23,0.35)]`;

/** The lit tile: current page, open panel, or the mode in play. */
export const BTN_ON = `${BASE} bg-white/70 text-black shadow-[0_2px_3px_rgba(2,6,23,0.35)]`;
