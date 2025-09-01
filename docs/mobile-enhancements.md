# Mobile Enhancements

Date: 2025-08-31

This document summarizes the mobile-focused improvements added to the web app and how to work with them.

## What’s Included

- Gesture Support
  - Image viewer supports swipe left/right to navigate, swipe down to close.
  - Pull-to-refresh in the Library panel on mobile, with progress/refresh indicator.
  - Haptic feedback is triggered for all buttons and menu selections on touch devices.

- Performance Optimizations
  - Motion-safe animations that respect `prefers-reduced-motion`.
  - Lighter effects on low-end devices (via media queries and feature checks).
  - GPU-accelerated transforms for the virtualized grid rows; momentum scroll containment to avoid accidental gesture conflicts.
  - Backdrop filter fallbacks for browsers/devices that don’t support blur.

- Touch Experience
  - Minimum 44px touch targets across buttons, inputs, selects and icon buttons.
  - Mobile-optimized viewport (`viewport-fit=cover`) and meta tags for PWA on iOS.
  - Swipe handling prevents scroll when appropriate to reduce accidental momentum scrolling.

- Visual Indicators
  - Swipe hint overlay in the image viewer on mobile.
  - Pull-to-refresh indicator with progress and ‘Refreshing…’ state.
  - Mobile UI hides desktop-only controls in the viewer; swipe is primary on mobile.

- Device Detection
  - Hook to detect iOS/Android, touch capability, PWA mode, screen size, and motion preference.

## Key Files

- Hooks
  - `web/src/hooks/useSwipeGesture.ts` — low-level swipe detection with scroll prevention.
  - `web/src/hooks/usePullToRefresh.ts` — pull distance, progress and refresh state.
  - `web/src/hooks/useMobileDetection.ts` — device, touch, PWA, reduced motion, screen size; `triggerHaptic()` utility.

- Components
  - `web/src/components/ImageViewerModal.tsx` — swipe navigation, swipe hint, mobile-aware controls.
  - `web/src/components/App.tsx` — integrates pull-to-refresh for Library via `usePullToRefresh` and `PullToRefreshIndicator`.
  - `web/src/components/VirtualizedLibraryGrid.tsx` — GPU transforms and overscroll containment for smoother mobile scrolling.
  - `web/src/components/PullToRefreshIndicator.tsx` — animated indicator with reduced‑motion safety.

- UI Primitives
  - `web/src/components/ui/button.tsx` — global haptics for taps; 44px min touch target.
  - `web/src/components/ui/dropdown-menu.tsx` and `.../context-menu.tsx` — haptics on menu item tap/select.

- Styles
  - `web/src/styles/motion.css` — motion-safe utilities, GPU hints, blur fallbacks, low-memory fallbacks.
  - `web/src/styles/animate-compat.css` — minimal equivalents for tailwindcss-animate patterns with reduced‑motion support.
  - `web/src/index.css` — `touch-target` utility and other UI helpers.
  - `web/index.html` — mobile viewport and PWA meta tags.

## Dev Notes

- Respect motion preferences: prefer using CSS transitions/animations guarded by media queries or use helpers in `lib/motion.ts`.
- For heavy scrolling or translated lists, add `transform-gpu` and `will-change: transform` (already applied to virtualized rows).
- Use `triggerHaptic('light'|'medium'|'heavy')` sparingly for non-critical interactions; it’s already wired into Buttons and menu items.
- To disable pull-to-refresh in a given context, pass `disabled: true` to `usePullToRefresh`.

## Quick QA Checklist

- iOS Safari and Android Chrome
  - Swipe left/right/down works in image viewer; nav arrows hidden on mobile.
  - Pull-to-refresh triggers when scrolled to top; indicator shows progress and ‘Refreshing…’ state.
  - Buttons and menu taps provide subtle haptic feedback.
  - With `prefers-reduced-motion: reduce`, animations are minimized and no spinners bounce.
  - On low-memory or data-saver devices, heavy blur falls back to opaque surfaces.
  - All tappable targets are ≥ 44×44 px.

If you spot regressions or rough edges, open an issue and tag it with `mobile-ux`.

