Title: Frontend: Route Splitting, PWA, and Mobile Library Bottom Sheet
Date: 2025-08-31

Summary
- Route pages (`ImagesPage`, `SoraPage`) are now lazy‑loaded to reduce the main bundle.
- Added `vite-plugin-pwa` with offline caching for scripts, styles, images, and videos.
- Introduced `CommandPalette` (Cmd/Ctrl+K) for quick navigation and actions.
- Added `LibraryBottomSheet` on mobile; the Library panel remains on desktop.

Impact
- No breaking public API changes.
- Internal import paths that assumed eager page loading still work; code now uses `React.lazy` under the hood.
- Service worker is auto‑registered on load; if debugging, you can disable via DevTools Application > Service Workers.

Developer Notes
- When adding new pages or heavy dialogs, prefer `lazy(() => import('...'))` and wrap with `<Suspense fallback={null}>`.
- For images in grid/list views, pass `sizes`/`srcSet` to `ResilientImage` where possible.
- Add new quick actions by extending the `actions` array passed to `CommandPalette` in `App.tsx`.
- PWA caching rules live in `vite.config.ts` (Workbox runtimeCaching). Adjust as needed.

Testing
- Dev: `pnpm dev` (service worker is not active in Vite dev).
- Prod preview: `pnpm build && pnpm preview` (service worker active).
- Clear caches when testing PWA: DevTools > Application > Clear storage.

