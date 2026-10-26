# Project notes for agents

SvelteKit + Svelte 5 (runes) + TypeScript, Tailwind CSS v4, Supabase auth/DB. Dark theme only.

## Tailwind CSS v4 (important)

This project uses **Tailwind CSS v4** through `@tailwindcss/vite`. There is no `tailwind.config.js`:
theme tokens and custom utilities live in `src/routes/layout.css` using `@theme { }` and `@utility`.

Always write **v4 canonical utilities**. Tailwind v3 names still resolve, but they are deprecated
aliases — do not use them.

- Gradients: `bg-linear-to-br`, `bg-linear-to-t`, `bg-radial-*`, `bg-conic-*`
  (NOT `bg-gradient-to-*`).
- Size-named utilities shifted one step in v4: `shadow`, `rounded`, `blur`, `drop-shadow`,
  `backdrop-blur` → use the `-sm` name; the old `-sm` → use `-xs`
  (e.g. old `shadow` → `shadow-sm`, old `shadow-sm` → `shadow-xs`).
- Outline: `outline-hidden` gives the old v3 `outline-none` behaviour; v4 `outline-none` only
  sets `outline-style: none`.
- Flex: `shrink-0`, `grow` (NOT `flex-shrink-0`, `flex-grow`).
- Text truncation: `text-ellipsis` (NOT `overflow-ellipsis`).
- Opacity: slash syntax `bg-black/40` (NOT `bg-opacity-40`, `text-opacity-*`).
- `ring` defaults to 1px in v4 — be explicit, e.g. `ring-1`.

The v4 spacing scale is dynamic, so values such as `size-4.5` and `max-w-94.5` are valid.

## Type scale

Font sizes are px tokens declared in `layout.css` (`--text-7` … `--text-40`). Write
`text-12`, `text-14`, `text-16`; never Tailwind's named sizes (`text-xs`, `text-sm`,
`text-base`, `text-lg`). Applies to every class you add or edit, even in files that
still contain `text-xs`/`text-sm` — do not copy the old style.

If the editor reports a Tailwind `suggestCanonicalClasses` warning, apply the suggested class.

## Conventions

- Prefer editing existing files. Run `npm run check` (`svelte-kit sync && svelte-check`) after
  TypeScript or load-function changes — it is the only verification command (no lint/test script).
- Icons come from `unplugin-icons` (`~icons/ph/*`, Phosphor). Do not add icon or UI libraries.
- Supabase is wired in `src/hooks.server.ts` (server client + `safeGetClaims`) and exposed as
  `locals.supabase`. Never move auth checks into components.
