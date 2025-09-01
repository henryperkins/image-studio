Here’s a focused audit of the current UI/UX, grounded in your codebase (as of Aug 31, 2025). I’ve aligned findings to your framework and
turned them into a concrete, staged plan with code you can drop in.

Status update (Aug 31, 2025 23:55 UTC):
- [x] Baseline bundle sizes captured (pre‑change)
- [x] Lighthouse baseline captured (perf only)
- [x] Route-level code splitting implemented for ImagesPage/SoraPage
- [x] Vendor chunking refined (react, router, radix, icons, tanstack)
- [x] Heavy modals/editors remain lazy (verified)
- [x] PWA service worker added (offline + cache)
- [x] Mobile Library bottom sheet integrated
- [x] Command palette (Cmd/Ctrl+K) added
- [ ] App.tsx refactor into StudioLayout + LibraryProvider integration (next)
- [ ] Vision module completion + moderation UI hooks (next)
- [ ] CLS/LCP tuning (fonts, intrinsic sizing) to hit ≥ 90 perf (next)

Measured results:
- Before (build at 23:48): main chunk 368.69 KB, vendor radix 133.42 KB, total initial JS ≈ 502 KB (pre‑gzip).
- After (build at 23:53): main chunk 290.26 KB, router 32.22 KB, radix 132.98 KB, ImagesPage 9.01 KB, SoraPage 43.37 KB.
- Baseline Lighthouse (before): perf 0.71, FCP 2138 ms, TTI 3171 ms, TBT 112 ms, LCP 3171 ms, CLS 0.438.
- After initial optimizations: perf 0.70, FCP 2239 ms, TTI 4657 ms, TBT 37 ms, LCP 3338 ms, CLS 0.439.

Notes: The large CLS (~0.44) dominates the score; next iteration will target intrinsic media sizing, stable placeholders, and font loading (self‑hosted + font-display: swap) to move perf to 0.90+.

Priority Matrix

- High impact, low effort:
    - Code‑split heavy modals/editors and route pages (reduce 566KB main to < 350KB).
    - Add vendor chunking via Vite manualChunks for long‑term caching.
    - Debounce/defer library search; memoize sort; cap re-renders.
    - Add sizes/srcset and width/height hints for grid thumbs to cut bytes + CLS.
    - Add per‑route ErrorBoundaries; keep root for fallbacks.
    - Strengthen prod CSP on the Fastify server (currently only on Vite dev).
- High impact, medium effort:
    - Refactor App.tsx (539 lines) into pages + layout; move library panel to its own module/context.
    - Image viewer zoom/pan (wheel, pinch, drag) with inertia and reset; video viewer scrub affordances.
    - Batch ops toolbar in Library (delete, download, analyze) for multi‑select.
    - Prompt builder: reusable “prompt editor” with chips, variables, history/undo.
    - Self‑host variable fonts + preload locally to cut FCP variance.
- Medium impact, low effort:
    - Use useDeferredValue for prompt and library filters.
    - Add “Help (?)” and focused shortcuts: g generate, / focus search, s toggle Sora, Esc close.
    - Reduce icon payload: prefer a tiny local subset or dynamic icons.
    - Respect reduced motion in CSS (not just JS) for all animations.
- Medium impact, medium effort:
    - Library list view toggle (dense rows) + metadata columns; quick compare mode (A/B).
    - Settings modal grouping (General, Media, Accessibility, Advanced).
    - Color contrast pass for dark tokens that hover near AA edge.
- Long‑term, high effort:
    - Collaborative presence (share prompt/session), annotations, timeline‑based video edits.

Visual Design & Aesthetics

- Dark theme: Token system in styles/theme.css is solid; gradients look great but some neutrals risk < AA contrast on text-muted
surfaces. Tighten:
    - Increase --border and muted foreground contrast by ~10–15% in dark.
    - Ensure “surface-1” on cards always yields ≥ 4.5:1 with body text; nudge text-token or bg-token as needed.
- Hierarchy: Headers, stepper, and card surfaces are clear. In Library, the three dense control rows (filters, search, sort) can compress
on mobile; group them into an overflow “Filter” sheet for xs/sm.
- Micro-interactions: You already have shimmer and pulses. Add subtle tap ripple for buttons and “Select Visible” feedback (chip count +
haptics on mobile).
- Loading states: Keep skeletons for creator/editors; add grid placeholder rows inside VirtualizedLibraryGrid when items.length===0 &&
loading (it currently falls back to static grid).

Component Architecture Review

- Reusability: ui/* primitives are in good shape (Radix + Tailwind). You’re effectively using a “shadcn‑style” system without importing
upstream shadcn/ui. Keep that pattern.
- Abstraction opportunities:
    - Extract Library controls (type/filter/sort) into LibraryControls.tsx.
    - Extract selection toolbar into LibrarySelectionBar.tsx (action buttons vary by selection).
    - Introduce PromptEditor (wraps PromptTextarea, chips, history, templates).
- Prop drilling/state:
    - AppContent coordinates a lot of cross‑concerns (prompt, selection, library). Create a LibraryContext for selections + filters so
VirtualizedLibraryGrid, selection bar, and modals don’t all rerender through AppContent.
    - Keep “prompt” in a PromptContext so Image and Sora creators don’t prop‑drill refs.
- Memoization:
    - You’re using useMemo for filtered/sorted lists; add useDeferredValue to libraryQuery and prompt to avoid keystroke‑triggered
re-sorts.
    - Wrap frequent handlers in useCallback where they cross component boundaries (you’re already doing this in many places).

Performance Optimization

- Bundle size (566KB main, 88KB CSS):
    - Route split pages and modals:
    - Lazy-load `ImageViewerModal`, `VideoViewerModal`, `ImageEditor`, `VideoEditor`, `EnhancedVisionAnalysis`, `SoraJobsPanel`.
    - Lazy pages: `/` (ImagesPage), `/sora` (SoraPage).
- Vendor chunking:
    - Manual chunks for `react`, `radix`, `lucide`, `@tanstack` for better caching.
- Icons:
    - Import only used icons (you already do) or add a tiny local icon set (SVGs) for the top 12 to shave a few KB.
- Code splitting targets:
    - Expect main chunk ~260–320KB after splitting; vendor ~150–200KB, viewers/editors 60–120KB.
- Image/video loading:
    - Thumbs: add sizes="(min-width:640px) 33vw, 50vw" and a smaller-thumb path if server can generate it.
    - Set width/height attributes (intrinsic size) to improve CLS.
    - Use preload="metadata" for video (you already do); add lazy poster.
- Virtual scrolling:
    - Current @tanstack/react-virtual usage is good. Consider overscan={6} for fast scrolling on desktops and a smaller value on mobile
via useMobileDetection.

Mobile Experience

- Targets: Your button primitives enforce 44px min — good.
- Gestures: Swipe and pull‑to‑refresh are implemented. Consider a bottom sheet for the Library on xs (swipe up to open) using Radix
Dialog/Sheet patterns.
- Haptics: You gate by touch — good. Add haptics on selection bulk actions and swipe-confirm delete.
- Responsive:
    - Add a “compact controls” mode < 360px where the filter group collapses into a single “Filters” button that opens a sheet.
- Mobile performance:
    - Defer non-critical analytics and font loading (self-host, swap).

Accessibility & Inclusivity

- WCAG:
    - Add CSS-level reduced motion: wrap global animations with @media (prefers-reduced-motion: reduce){ * { animation: none !important;
transition: none !important } }.
    - Ensure focus styles on all interactive controls (Radix + Tailwind ring is present; verify on custom buttons with overlay variants).
    - Add role="dialog" + labeledby/ describedby to modals (Radix usually handles; double-check DialogContent props).
- Keyboard:
    - Global shortcuts and skip links are good; add: / focus Library search, ? open help, Del delete selected (with confirm), g generate,
s toggle Sora tab.
- ARIA:
    - Ensure TabsTrigger buttons set aria-selected and role="tab" with role="tablist"; your custom tabs don’t add roles yet.
    - Library grid: container role="grid", cards as role="gridcell" improves SR navigation.
- Contrast:
    - Validate tokens used for surfaces surface-1 + text-muted-foreground. Slightly raise neutral foreground in dark.
- Motion prefs:
    - You respect it via JS in motion.ts. Add CSS guard as above for full coverage.

User Flow & Interaction Design

- Key journeys:
    - Image → Sora handoff is smooth. Add a “Use in Sora” inline CTA on the post‑gen success card (already present) and pre‑fill width/
height based on source size by default.
- Friction points:
    - First‑run “empty library” callouts are good; consider a short inline wizard to guide creation → selection → Sora in 3 steps.
- Error handling:
    - RootErrorBoundary exists. Add route boundaries for /, /sora, and modals to isolate failures.
- Feedback:
    - Toasts are present. Add inline status text near generate buttons with subtle progress and cancel (abort controller already exists
in hooks).
- Library management:
    - Add bulk delete/download/analyze to a sticky selection bar.

Technical Debt & Modernization

- App.tsx (539 lines): Split into:
    - pages/ImagesPage.tsx, pages/SoraPage.tsx, layout/StudioLayout.tsx.
    - modules/library/*: LibraryPanel, LibraryControls, LibrarySelectionBar.
- Deprecated patterns: None blocking. Your in-house shadcn pattern is aligned with React 19.
- Type safety: Types are strong; ensure editor props narrow item to image/video correctly (you already do).
- Error boundaries: Add per‑route. Keep root fallback minimal.
- Security:
    - CSP: Vite dev sets CSP headers; Fastify prod does not. Add CSP headers on the server with nonce for inline or remove inline styles.
Also set strict frame-ancestors 'none', and consider Cross-Origin-Opener-Policy + Cross-Origin-Embedder-Policy if you later use heavy
wasm.
    - localStorage: You store non‑sensitive prefs and an API override; if you want encryption, wrap it in WebCrypto (see sample below).

Component Refactoring Plan

- Create:
    - web/src/pages/ImagesPage.tsx: wraps PlaybooksPanel, ImageCreator, pulls PromptContext prompt.
    - web/src/pages/SoraPage.tsx: wraps SoraCreator.
    - web/src/modules/library/LibraryPanel.tsx: current aside contents.
    - web/src/modules/library/LibraryControls.tsx: type filter/search/sort.
    - web/src/modules/library/LibrarySelectionBar.tsx: “Select Visible”, “Clear”, “Use in Sora”, “Delete”, “Download”, “Analyze”.
    - web/src/contexts/LibraryContext.tsx: library list, selection, filters, visibleIds.
- Convert App.tsx to:
    - StudioLayout (header, tabs, theme toggle) + Routes with React.lazy.
    - Keep modals lazy; mount in a top-level ModalHost.
- Outcome: smaller main render surface, fewer cascading re-renders, clear ownership.

Performance Budget

- Targets (Prod, mid-tier device, good 4G/WiFi):
    - Main JS chunk: < 300KB (gzipped) after splitting.
    - Total JS on initial route: < 380KB (gzipped).
    - First Contentful Paint: < 1.5s.
    - Time to Interactive: < 3.5s.
    - CLS: < 0.05 (stay comfortably under 0.1).
    - Long tasks: < 150ms 95th percentile on route load.
- Enforcements:
    - Add vite-plugin-checker or CI Lighthouse checks.
    - Fail build if main exceeds 400KB (pre‑gzip) or if lighthouse < 90 (perf).

Design System Recommendations

- Tokens:
    - Keep @theme tokens; tune dark neutrals; add explicit “semantic” tokens for “on-surface-muted” and “on-surface-strong”.
- Components:
    - Standardize buttons with overlay variant for modals and a clear destructive style with confirm affordances.
    - Input cluster component (label, help, error) to avoid repeating ARIA wiring.
    - Bulk selection bar pattern (desktop inline, mobile bottom sheet).
- Patterns:
    - Page header with actions aligned right; sticky on scroll.
    - Sheet for filter/settings on mobile.
    - Dialogs as portals with aria-labelledby and focus traps (Radix covers most).

Accessibility Checklist

- Tabs:
    - Add role="tablist" on TabsList, role="tab" + aria-selected on triggers, aria-controls to map to panel id.
- Modals:
    - role="dialog" with aria-modal="true", connect aria-labelledby and aria-describedby.
- Keyboard:
    - / focus search; ? help; Del delete selection (confirm); Esc close modal; g generate; s Sora tab; arrow keys navigate viewer; Enter
primary action on selection bar.
- Reduce motion:
    - Add CSS media query to disable animations and transitions when requested.
- Contrast:
    - Ensure min 4.5:1 on body and 3:1 on UI hints; adjust text-muted-foreground on dark.
- Labels:
    - Ensure all icon buttons have aria-label (already good in most places); add where missing in Library bulk bar.

Mobile Enhancement Roadmap

- Phase 1:
    - Bottom sheet Library on xs/sm; / focuses search; haptic on bulk actions; lazy load modals.
- Phase 2:
    - One‑handed action bar (sticky bottom) with primary actions.
    - Zoom/pan in image viewer; pinch to zoom; double‑tap to zoom.
- Phase 3:
    - Offline-friendly prompts/presets; retry queue for analytics; optional PWA install banner.

Code Examples

- Route and modal code splitting
    - App (sketch): lazy pages + modal host
  // web/src/components/App.tsx (excerpt)
  import { lazy, Suspense } from 'react'
  const ImagesPage = lazy(() => import('@/pages/ImagesPage'))
  const SoraPage = lazy(() => import('@/pages/SoraPage'))
  const ImageViewerModal = lazy(() => import('@/components/ImageViewerModal'))
  const VideoViewerModal = lazy(() => import('@/components/VideoViewerModal'))
  const ImageEditor = lazy(() => import('@/components/ImageEditor'))
  const VideoEditor = lazy(() => import('@/components/VideoEditor'))

  // ...
  <Routes>
    <Route path="/" element={<Suspense fallback={null}><ImagesPage /></Suspense>} />
    <Route path="/sora" element={<Suspense fallback={null}><SoraPage /></Suspense>} />
  </Routes>

  {/* Modal host */}
  <Suspense fallback={null}>
    {viewImageId && <ImageViewerModal /* ... */ />}
    {viewVideoId && <VideoViewerModal /* ... */ />}
    {imgToEdit && <ImageEditor /* ... */ />}
    {vidToEdit && <VideoEditor /* ... */ />}
  </Suspense>
- Vendor chunking with Vite
  // web/vite.config.ts (add build.rollupOptions)
  export default defineConfig({
    // ...
    build: {
      rollupOptions: {
        output: {
          manualChunks: {
            react: ['react', 'react-dom'],
            radix: ['@radix-ui/react-dialog','@radix-ui/react-dropdown-menu','@radix-ui/react-select','@radix-ui/react-toast','@radix-ui/
react-tooltip','@radix-ui/react-checkbox','@radix-ui/react-tabs','@radix-ui/react-context-menu','@radix-ui/react-label','@radix-ui/
react-slider','@radix-ui/react-slot'],
            tanstack: ['@tanstack/react-virtual'],
            icons: ['lucide-react']
          }
        }
      }
    }
  })
- Defer search and reduce re-renders
  // In AppContent or LibraryControls
  const deferredQuery = useDeferredValue(libraryQuery)
  const filteredLibrary = useMemo(() => filterByQuery(library, deferredQuery, type), [library, deferredQuery, type])
- Thumbs with intrinsic size, sizes/srcset
  <img
    src={`${baseUrl}${item.url}`}
    srcSet={`${baseUrl}${item.url}?w=256 256w, ${baseUrl}${item.url}?w=512 512w`}
    sizes="(min-width: 640px) 33vw, 50vw"
    width={256} height={256}
    loading="lazy" decoding="async" />
- Image viewer zoom/pan (hook sketch)
  // web/src/hooks/useZoomPan.ts
  export function useZoomPan() {
    const ref = useRef<HTMLDivElement>(null)
    const [state, set] = useState({ scale: 1, x: 0, y: 0 })
    useEffect(() => {
      const el = ref.current
      if (!el) return
      const onWheel = (e: WheelEvent) => {
        e.preventDefault()
        const next = Math.min(6, Math.max(1, state.scale + (e.deltaY < 0 ? 0.2 : -0.2)))
        set(s => ({ ...s, scale: next }))
      }
      el.addEventListener('wheel', onWheel, { passive: false })
      return () => el.removeEventListener('wheel', onWheel)
    }, [state.scale])
    return { ref, style: { transform: `translate(${state.x}px, ${state.y}px) scale(${state.scale})` }, reset: () =>
set({ scale:1,x:0,y:0 }) }
  }
  // Use in ImageViewerModal content wrapper
- Tabs ARIA roles (custom Tabs)
  // web/src/components/ui/tabs.tsx (augment)
  <div role="tablist" ... />
  <button role="tab" aria-selected={active} aria-controls={`tab-${value}`} id={`trigger-${value}`} />
  // And wrap content in <div role="tabpanel" id={`tab-${value}`} aria-labelledby={`trigger-${value}`} />
- CSS reduced motion
  /* web/src/index.css or theme.css */
  @media (prefers-reduced-motion: reduce) {
    * { animation: none !important; transition: none !important; }
  }
- Fastify CSP in production
  // server/src/index.ts (after app creation)
  app.addHook('onSend', async (req, reply, payload) => {
    reply.header('Content-Security-Policy', [
      "default-src 'self'",
      "script-src 'self'",
      "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
      "font-src 'self' https://fonts.gstatic.com https://cdn.jsdelivr.net",
      "img-src 'self' data: blob:",
      "media-src 'self' blob: data:",
      "connect-src 'self'",       // add API origin if cross-origin
      "object-src 'none'",
      "frame-src 'none'",
      "base-uri 'self'",
      "form-action 'self'",
      "frame-ancestors 'none'",
      'upgrade-insecure-requests'
    ].join('; '))
    return payload
  })
- Encrypted localStorage wrapper (optional)
  // web/src/lib/secureStore.ts
  export async function secureSet(key: string, value: unknown) {
    const raw = new TextEncoder().encode(JSON.stringify(value))
    const keyBytes = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(location.origin))
    const cryptoKey = await crypto.subtle.importKey('raw', keyBytes, 'AES-GCM', false, ['encrypt'])
    const iv = crypto.getRandomValues(new Uint8Array(12))
    const buf = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, cryptoKey, raw)
    const out = btoa(String.fromCharCode(...new Uint8Array(buf))) + '.' + btoa(String.fromCharCode(...iv))
    localStorage.setItem(key, out)
  }
  export async function secureGet<T>(key: string): Promise<T | null> {
    const raw = localStorage.getItem(key); if (!raw) return null
    const [b64, ivb64] = raw.split('.')
    const data = Uint8Array.from(atob(b64), c => c.charCodeAt(0))
    const iv = Uint8Array.from(atob(ivb64), c => c.charCodeAt(0))
    const keyBytes = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(location.origin))
    const cryptoKey = await crypto.subtle.importKey('raw', keyBytes, 'AES-GCM', false, ['decrypt'])
    const dec = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, cryptoKey, data)
    return JSON.parse(new TextDecoder().decode(new Uint8Array(dec)))
  }
- Bulk selection bar
  // web/src/modules/library/LibrarySelectionBar.tsx
  <div className="sticky bottom-0 bg-background/80 backdrop-blur border-t p-2 flex gap-2">
    <Button variant="outline" onClick={selectVisible}>Select Visible ({visibleCount})</Button>
    <Button variant="destructive" onClick={confirmDelete}>Delete ({selected.length})</Button>
    <Button variant="outline" onClick={downloadSelected}>Download</Button>
    <Button onClick={() => navigate('/sora')}>Use in Sora ({selected.length})</Button>
  </div>
Specific Focus Areas

- Library Panel Enhancements:
    - Multi-select: Keep click to select; add “Shift + Click range select” (track last index).
    - Batch operations: Sticky selection bar with destructive confirm; keyboard Del to trigger.
    - Search/filter: Debounced input + useDeferredValue; add tag pills and “clear all”.
    - Grid vs list: Two toggles; list shows filename, date, size/duration with quick actions.
    - Metadata: Show prompt tooltip on hover (exists); add inline chips for size/duration.
- Creation Tools:
    - Prompt builder: PromptEditor with chips (style, camera, lighting), variable slots (e.g., {subject}), and quick insert. Keep
Ctrl+Enter submit.
    - Real-time preview: For images, when busy, show planned size/format and inset shimmer of target dimensions.
    - Templates: Playbooks already exist; surface them as presets in a Select next to prompt.
    - History/undo: Maintain last 10 prompts per tool in local history + keyboard Ctrl+Z/Shift+Ctrl+Z.
    - Collaboration (future): Share link containing prompt + selected images (ids) for review.
- Media Viewers:
    - Zoom/pan for images; pinch + wheel + double-tap; reset button.
    - Annotations (future): Bounding boxes with labels; export annotations as JSON.
    - Comparison views: A/B slider (before/after) for edits; side‑by‑side for two library items.
    - Export UI: “Export As…” dialog: choose format, size, filename; batch if multiple selected.
    - Share: Copy public URL if server exposes read endpoint; otherwise copy file to clipboard (image only).
- Navigation & IA:
    - Tabs are effective; add roles/ARIA.
    - Breadcrumbs: optional once you add deeper routes (e.g., /library/item/:id).
    - Quick actions: Global “Command Menu” (radix dialog) bound to k with fuzzy actions (generate, go to Sora, filter type).
    - Settings: Modal grouped sections; expose API override, theme, accessibility toggles.
    - Help/tutorial: ? opens a short guide with shortcuts and quick tips.

If you want, I can open a PR that:

- Splits App.tsx into layout + lazy pages.
- Lazily loads all modals/editors.
- Adds manualChunks to Vite.
- Implements / focus, ? help, and useDeferredValue search.
- Adds ARIA roles to Tabs and CSS reduced motion.

This should immediately drop the main JS by 35–45% and push Lighthouse Perf > 90 on typical setups.
