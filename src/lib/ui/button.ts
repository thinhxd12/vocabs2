/**
 * The app's one button, copied from the old dock (`old/components/Nav.svelte`):
 * a translucent white chip with a muted dark glyph, a hairline black ring and a
 * soft drop shadow. Selected chips are `.btn-nav.active` (white); green is the
 * `.btn-menu.active` variant, added by the caller that needs it.
 *
 * Class strings rather than a component, because the same control is an `<a>`,
 * a `<button>` and a form submit, and the size differs by place — the caller
 * appends its own `h-*`/`w-*`/`size-*`.
 *
 * No backdrop-filter — the dock already blurs what is behind these tiles, so a
 * second blur per tile would cost frames and change nothing.
 */

const BASE =
	'inline-flex shrink-0 cursor-pointer touch-manipulation items-center justify-center rounded-2 transition-[color,background-color,box-shadow] duration-100 focus-visible:outline-2 focus-visible:outline-emerald-300 active:scale-95 disabled:opacity-60 motion-reduce:transition-none motion-reduce:active:scale-100';

/** Resting chip: `.btn-nav`. */
export const BTN = `${BASE} bg-white/20 text-black/60 ring-1 ring-black/5 shadow-sm shadow-black/30 hover:bg-white/40 hover:text-black`;

/** Selected chip: `.btn-nav.active`. */
export const BTN_ON = `${BASE} bg-white/60 text-black ring-1 ring-black/5 shadow-sm shadow-black/30`;
