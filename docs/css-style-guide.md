# CSS and Tailwind Style Guide

This repo uses Tailwind CSS v4 with the `@tailwindcss/vite` plugin and a CSS‑first theme. This guide explains where styles live, how to add new ones, and best practices for working in this codebase.

## File Layout

- `web/src/index.css` – Single entrypoint imported by `src/main.tsx`.
  - Imports Tailwind, theme tokens, typography, and animation utilities.
- `web/src/styles/theme.css` – App design tokens and Tailwind v4 `@theme` mappings.
  - Defines CSS variables (colors, spacing, radii, keyframes) and maps them to Tailwind semantic tokens (e.g., `--color-background`).
- `web/src/styles/typography.css` – Base and component typography using `@layer base` & `@layer components`.
  - Sets `body { background: var(--background); color: var(--foreground) }` and shared text utilities like `.text-caption`.
- `web/src/styles/animate-compat.css` – Minimal utilities for Radix/“tailwindcss-animate” classnames on Tailwind v4.
  - Provides `data-[state=open]:animate-in`, `fade-in-0`, `zoom-in-95`, slides, etc.
- `web/tailwind.config.ts` – Lightweight config (v4). `darkMode: 'class'`. No content globs needed with the Vite plugin.
- `web/src/lib/utils.ts` – `cn()` helper combining `clsx` and `tailwind-merge` to safely merge class names.

## How Styles Are Composed

1) Use Tailwind utilities directly in components via `className` and `cn()`.
2) For global tokens, colors, and animations, edit `theme.css`.
3) For shared type and text rules, edit `typography.css`.
4) For missing Radix animation utilities, extend `animate-compat.css`.

Most component‑specific appearance should be expressed with utilities in TSX; global CSS files only define theme and broadly reusable patterns.

## Theme Tokens and Semantic Colors

`web/src/styles/theme.css` is the single source of truth for the design system:

- App variables: `--background`, `--foreground`, `--primary`, `--border`, `--ring`, etc.
- Tailwind v4 semantic mappings via `@theme`:
  - `--color-background: var(--background)` → enables `bg-background`.
  - `--color-foreground: var(--foreground)` → enables `text-foreground`.
  - Also mapped: `card`, `popover`, `muted`, `accent`, `destructive`, `border`, `input`, `ring`, etc.

Use semantic utilities wherever possible:

- Backgrounds: `bg-background`, `bg-card`, `bg-popover`, `bg-muted`, `bg-accent`.
- Text: `text-foreground`, `text-muted-foreground`, `text-accent-foreground`.
- Borders & rings: `border-input`, `border`, `ring-ring`.

These align with shadcn/Radix UI component expectations already present in the repo.

## Dark Mode

- Tailwind is configured with `darkMode: 'class'`.
- `theme.css` defines both a `.dark { ... }` theme and an automatic dark fallback:
  - When the OS prefers dark and no `.light` class is set, `:root:not(.light)` uses dark tokens.
- To force dark in the app, add `class="dark"` on the root element (or toggle via a preference state).

## Animations (Tailwind v4)

Radix components reference utility classes popularized by `tailwindcss-animate` (e.g., `data-[state=open]:animate-in`, `fade-in-0`). Instead of adding the plugin, `web/src/styles/animate-compat.css` provides minimal equivalents and keyframes, including reduced‑motion fallbacks.

If you need a new animation:

- Add a keyframe in `@theme` inside `theme.css` (so tokens like `--animate-*` can also reference it), or define it locally in `animate-compat.css` if it’s only used by those utilities.
- Add the matching utility selector to `animate-compat.css` using the same `data-*` convention.

## Typography and Base

`web/src/styles/typography.css` uses `@layer base` to set sensible defaults and body colors from our tokens. It also defines common text utilities (`.text-caption`, `.text-body`, `.numeric`, clamp helpers) under `@layer components`.

Fonts are loaded in `index.css` with `@font-face`. For production, consider self‑hosting:

1) Place font files under `web/public/fonts/`.
2) Update `@font-face src:` URLs to point to `/fonts/...`.
3) Keep `font-display: swap` to avoid layout shifts.

## Adding Component Styles

- Prefer utilities in TSX: `className={cn('rounded-xl border bg-card p-6', className)}`.
- If multiple components need the same pattern, add a tiny class to `@layer utilities` in `index.css` or a new CSS file under `web/src/styles/` and import it from `index.css`.
- Avoid deep global selectors that couple styling to component structure.

Example (utility class in `@layer utilities`):

```css
/* web/src/index.css */
@layer utilities {
  .fade-in { animation: var(--animate-fade-in); }
}
```

Usage:

```tsx
<div className={cn('fade-in bg-card p-6 rounded-xl')}>Hello</div>
```

## Working With Tailwind v4

- No content globs needed with `@tailwindcss/vite`; the plugin handles it.
- Keep class names mostly static or enumerable. If you build class names dynamically, ensure all possible classes appear in source (so the dev/build pipeline can see them).
- Use `cn()` to merge conditional classes without duplicates (`tailwind-merge` handles precedence).

## Dev and Build

- Dev: `pnpm dev` (root) starts Vite + Fastify. The CSS is hot‑reloaded.
- Prod build: `pnpm --dir web build` emits `web/dist/assets/index-*.css`.
- The API can serve the built web app; static assets are mounted under `/assets/`.

## Quick Recipes

- Add a new semantic color:
  1) In `theme.css` `:root`, define `--my-accent` and `--my-accent-foreground`.
  2) In `@theme`, map `--color-my-accent: var(--my-accent)` and `--color-my-accent-foreground: var(--my-accent-foreground)`.
  3) Use: `bg-my-accent text-my-accent-foreground`.

- Add a brand‑only button style:
  1) If it’s one‑off, compose utilities in TSX.
  2) If reused, add a class in `@layer components`:

```css
@layer components {
  .btn-brand { @apply inline-flex items-center rounded-md bg-primary text-primary-foreground px-3 py-2 text-sm font-medium shadow hover:opacity-90 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring; }
}
```

- Add a new Radix open/close motion:
  1) Add keyframes to `theme.css` (e.g., `@keyframes scaleUp`).
  2) Add an utility in `animate-compat.css` (e.g., `.data-[state=open]:scale-up[data-state="open"] { animation-name: scaleUp; }`).

## Troubleshooting

- “Animations don’t play”: ensure `@import './styles/animate-compat.css'` is present (it is by default in `index.css`).
- “Background/text look off”: confirm your container inherits tokens (no hardcoded colors overshadowing `--background`/`--foreground`).
- “Dark mode doesn’t apply”: verify a `.dark` class on a root element or remove `.light` so the OS preference media query can apply.
- “Styles not applied in prod”: ensure your CSS file is imported by `index.css`, or the classes are present in TSX. Avoid generating novel class strings purely at runtime.

---

If you’re unsure where a style should live, default to utilities in the component. Promote to global CSS only when a pattern is reused across multiple places or when you’re defining tokens.

