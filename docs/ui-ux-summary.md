# AI Media Studio — UI/UX and Codebase Mapping Summary

Date: August 27, 2025

This document maps the observed UI (from the provided long page screenshot) to concrete files, styles, and data flow in the repository. It highlights where issues originate and identifies the safest places to implement fixes. No code changes were made; this is a research summary.

## Repo Overview
- Tech: React 19 + Vite 7, Tailwind 4 (CSS tokens), Radix UI + shadcn, TypeScript 5.9.
- Workspaces: `web/` (UI), `server/` (Fastify API), `shared/` (Zod types).
- Aliases: `@` → `web/src`.
- Common scripts: `pnpm dev` (web 5174 + API 8787), `pnpm build`.

## UI Structure (matches screenshot)
- Header + tabs: `web/src/ui/App.tsx` (`Tabs` with “Images” and “Sora”).
- Image creation panel: `web/src/ui/ImageCreator.tsx`
  - Fields: prompt `Textarea`, `Size`, `Quality`, `Format`, `Background`.
  - Actions: “Generate & Save” (triggers save + `onSaved` navigation) and secondary “Download” (enabled only after result).
- Media Library (right column): implemented in `App.tsx`
  - Filter chips (All/Images/Videos), search, grid, pagination (“Page ... of ...”, “Next/Previous”).
  - Cards: `web/src/components/LibraryItemCard.tsx` (hover/touch actions, context menus, selection).
- Prompt Suggestions: `web/src/ui/PromptSuggestions.tsx` (search, multi-select, insert/replace, simple prefs).
- Sora flow (video): `web/src/ui/SoraCreator.tsx` (analyze images, generate prompt, generate video with staged progress, quality toggle).
- Styling tokens and utilities: `web/src/styles/theme.css`, `web/src/styles/typography.css`, `web/src/index.css`.

## Styling & Theming
- Semantic tokens defined in `theme.css` for light/dark, with gradients (`--gradient-brand`) and surface variables.
- Global background glows: `body::before` (top radial glow) and `body::after` (bottom accent) in `typography.css`.
- Focus rings unified via `*:focus-visible` in `index.css`.
- Tailwind v4 custom utilities (e.g., `btn-primary-enhanced`, `image-hover`) in `index.css`.

## State, Data, and Routing
- Router 7: routes `/` (Images) and `/sora` (Sora). `Tabs` in `App.tsx` call `navigate()`.
- Library: `listLibrary()` → `GET /api/library/media` then local filter/search/paginate in `App.tsx`.
- “Use in Sora”: image-only selection; `onUseInSora` navigates to `/sora` with selected IDs.
- Contexts: toasts, prompt suggestions, and preferences in `web/src/contexts`.

## Where the Screenshot Issues Originate (by file)
- Low-contrast purple-on-purple: container background in `App.tsx` uses a purple-tinted gradient plus translucent surfaces (`bg-neutral-800/60`). Muted text and chip borders can slip under AA in dark mode.
- Primary/secondary action parity: `ImageCreator.tsx` buttons (around lines 228–244). “Download” is correctly disabled without a result.
- Library tip assumes keyboard: helper copy in `App.tsx` mentions Shift/Ctrl multi-select (mobile-hostile).
- Dense corner action buttons: `LibraryItemCard.tsx` quick actions are 28–32px on md+; some cases fall below 44×44 on small screens.
- Pagination: implemented in `App.tsx` with `itemsPerPage=12` and page controls (“Page x of y”, “Next →”).
- Decorative teal “blob” visual overlap: likely `body::after` in `typography.css` (fixed at bottom with `z-index: 0`), which can visually obscure low-z content near the footer.

## Accessibility Reality Check
- Focus states: good global ring + shadcn focus styles.
- Contrast: some helper text, chip states, and borders may not meet WCAG AA against translucent surfaces.
- Touch targets: check top-right quick-action buttons on cards; ensure ≥44×44 on all breakpoints.
- Keyboard: card/view actions available via menus; prompt suggestions list uses listbox semantics with keyboard ops.

## Performance Notes
- Remote variable fonts with `font-display: swap`; consider self-hosting later.
- Images use `loading="lazy"` and `ResilientImage` retry/backoff with skeletons.
- Decorative fixed glows add paint cost but are simple; keep layers lightweight.

## Implementation Hooks (safe places to fix)
- Sticky header: add `sticky top-0 z-40` to `<header>` in `web/src/ui/App.tsx`; add top padding if overlap occurs.
- CTA hierarchy: rename “Generate & Save” → “Generate” in `web/src/ui/ImageCreator.tsx`; keep navigation on save; “Download” remains secondary.
- Library mobile UX: change helper copy to include touch; keep per-card checkboxes; increase selected-state contrast on filter chips in `App.tsx`.
- Pagination → “Load more”: replace page index with incremental slice or infinite scroll in `App.tsx`.
- Card touch targets: bump min size of quick-action buttons in `web/src/components/LibraryItemCard.tsx` to ≥44×44 across breakpoints.
- Decorative overlay: either set `body::after { z-index: -1; }` in `typography.css`, or give the main container `relative z-10` in `App.tsx` to ensure content layers above.
- Contrast pass via tokens: adjust `--muted-foreground`, border tokens, and chip styles in `theme.css` to lift AA across surfaces.

## Risks and Constraints
- Tailwind v4 tokens: prefer edits in `theme.css`/`typography.css` to preserve utility-driven styling.
- Radix/shadcn: keep using existing `variant` patterns; avoid introducing a new component system.
- Routing: header becomes sticky—ensure content offset (padding-top) prevents overlap.

---

When you’re ready, I can propose a minimal PR plan that implements:
1) sticky header, 2) decorative overlay fix, 3) card touch-target sizing, 4) contrast tweaks to tokens, 5) library helper copy update, and 6) optional “Load more” pagination.

