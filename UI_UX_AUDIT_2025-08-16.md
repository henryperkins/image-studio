# AI Media Studio — Comprehensive UI/UX and Accessibility Audit (2025‑08‑16)

## Scope of review
- Application shell, tabs, library, and modals:
  - [`AppContent()`](web/src/ui/App.tsx:17)
- Image generation:
  - [`ImageCreator()`](web/src/ui/ImageCreator.tsx:29)
- Video creation and analysis:
  - [`SoraCreator()`](web/src/ui/SoraCreator.tsx:6)
  - [`EnhancedVisionAnalysis()`](web/src/ui/EnhancedVisionAnalysis.tsx:21)
- Editors:
  - [`ImageEditor()`](web/src/ui/ImageEditor.tsx:11)
  - [`VideoEditor()`](web/src/ui/VideoEditor.tsx:18)
- Prompt suggestions:
  - [`PromptSuggestions()`](web/src/ui/PromptSuggestions.tsx:12)
- Typography primitives:
  - [`Heading()`](web/src/ui/typography.tsx:38), [`Text()`](web/src/ui/typography.tsx:85), [`Label()`](web/src/ui/typography.tsx:133)
- Styling and theme:
  - [`web/src/index.css`](web/src/index.css), [`tailwind.config.js`](web/tailwind.config.js)
- Toast system:
  - [`Toast()`](web/src/ui/Toast.tsx:14), [`ToastProvider()`](web/src/contexts/ToastContext.tsx:41)

## Executive summary
- Accessibility: Strong baseline (tabs with keyboard model, ARIA live announcements, labelled inputs). Critical gaps remain: modals lack dialog semantics/focus trap; ARIA role misuse in suggestions list; invisible focus on hidden controls; no reduced-motion support; missing progress/loading semantics. These block WCAG 2.2 A/AA for keyboard, screen-reader, and motion-sensitive users.
- Usability: Primary flows are coherent. “Typography System” is not discoverable in the main tabs; tab indicator is hard-coded for 2 tabs; several contextual actions are hover-only, causing friction for keyboard users.
- Visual hierarchy: Typographic system is strong. Reinforce focus states on custom inputs, validate warning/error contrast, avoid truncating critical headings.
- Engagement: Good async feedback (toasts, spinners). Improve discoverability of enhanced analysis and keyboard shortcuts.

## Findings and recommendations (by severity)

### P0 — Critical

1) Modals lack dialog semantics, focus trap, and Escape handling  
- Evidence: Modal wrappers in [`ImageEditor()`](web/src/ui/ImageEditor.tsx:100) and [`VideoEditor()`](web/src/ui/VideoEditor.tsx:77).  
- Root cause: Overlays are styled divs; no role="dialog", aria-modal, labelled heading, focus trap, or global Escape.  
- Impacted users: Screen-reader and keyboard-only users; cognitive load for everyone.  
- WCAG: 2.1.2, 2.4.3, 2.4.7, 4.1.2.  
- Recommendation:  
  - Add role="dialog" aria-modal="true" aria-labelledby="dialog-title".  
  - On open: focus first focusable; trap focus within; restore focus to the trigger on close.  
  - Listen for Escape at the document level while modal is open.  
- Success criteria: Tabbing cycles within dialog; Escape closes from anywhere; focus returns to trigger; axe-core shows 0 dialog violations.

2) Misuse of ARIA listbox/option pattern in Prompt Suggestions  
- Evidence: Wrapper uses role="listbox" and items role="option" with nested buttons/checkboxes at [`PromptSuggestions()`](web/src/ui/PromptSuggestions.tsx:156–206).  
- Root cause: Composite role misuse—options should be the interactive target, not containers with nested controls.  
- Impacted users: Screen-reader and keyboard users.  
- WCAG: 4.1.2 (and ARIA APG compliance).  
- Recommendation: Replace with semantic ul/li (role="list"/"listitem") and keep explicit controls; or fully implement a grid combobox pattern (more complex).  
- Success criteria: No ARIA role violations; SR announces a “list of N items” and each control is labelled and operable.

3) Hover-only controls are invisible on keyboard focus  
- Evidence: “Remove reference image” button opacity gated by hover at [`SoraCreator()`](web/src/ui/SoraCreator.tsx:342–353); “Edit” buttons on library items at [`AppContent()`](web/src/ui/App.tsx:394–401).  
- Root cause: Visibility toggled only on :hover; controls remain in tab order but are visually hidden.  
- Impacted users: Keyboard-only and low-vision users.  
- WCAG: 2.4.7, 1.4.13.  
- Recommendation: Use group-focus-within:opacity-100 and focus-visible:ring on these buttons; alternatively keep them always visible.  
- Success criteria: Control becomes visible with a clear focus ring when tabbed.

### P1 — High

4) Custom checkboxes lack strong focus indication  
- Evidence: Library selection inputs at [`AppContent()`](web/src/ui/App.tsx:382–391).  
- Root cause: Custom styling without explicit focus-visible ring.  
- Impacted users: Keyboard and low-vision users.  
- WCAG: 2.4.7.  
- Recommendation: Add focus-visible:ring-2 focus-visible:ring-blue-500/50 and outline-none to the input.  
- Success criteria: Visible focus ring across browsers.

5) Progress bar has no programmatic semantics  
- Evidence: Visual progress without ARIA at [`SoraCreator()`](web/src/ui/SoraCreator.tsx:461–473).  
- Root cause: Purely visual progress element.  
- Impacted users: Screen-reader users.  
- WCAG: 4.1.2, 4.1.3.  
- Recommendation: role="progressbar" with aria-valuemin="0" aria-valuemax="100" aria-valuenow={progress} and aria-label.  
- Success criteria: SR announces progress updates and completion.

6) Loading states not surfaced via aria-busy/live  
- Evidence: Library skeleton at [`AppContent()`](web/src/ui/App.tsx:339–345); busy placeholders elsewhere (e.g., [`ImageCreator()`](web/src/ui/ImageCreator.tsx:200–205)).  
- Root cause: Visual-only loaders; missing ARIA status.  
- Impacted users: Screen-reader users.  
- WCAG: 4.1.2, 4.1.3.  
- Recommendation: Mark list container aria-busy during load and clear after; add sr-only live region announcing “Loading…”/“Loaded N items”.  
- Success criteria: SR announces load start/end; automated a11y checks pass.

7) Reduced-motion not respected (animations and hover autoplay)  
- Evidence: Animations in [`web/src/index.css`](web/src/index.css); hover autoplay for video thumbs at [`AppContent()`](web/src/ui/App.tsx:425–436).  
- Root cause: No @media (prefers-reduced-motion) guards; autoplay unconditional.  
- Impacted users: Motion-sensitive users.  
- WCAG: 2.3.3 (Animation from Interactions).  
- Recommendation: Disable non-essential animations under PRM; gate hover play() with matchMedia('(prefers-reduced-motion: reduce)') === false.  
- Success criteria: No shimmer/spin/fade-in; no hover autoplay when PRM is on.

8) Typography view not discoverable; tab indicator hard-coded to 50%  
- Evidence: View includes "typography" in state but tablist renders only two tabs in [`AppContent()`](web/src/ui/App.tsx:175–254); indicator width fixed at 50% at [`AppContent()`](web/src/ui/App.tsx:181–187).  
- Root cause: Third tab not rendered; indicator assumes two tabs.  
- Impacted users: All (navigation).  
- WCAG: N/A (IA/Usability).  
- Recommendation: Add a third “Typography” tab and compute indicator width/position based on tab count; or move to a clearly labelled secondary nav element.  
- Success criteria: Discoverable entry without URL param; indicator aligns for N tabs.

### P2 — Medium

9) Disabled-button guidance is hover-only  
- Evidence: Tooltips on disabled “Clear/Use in Sora” appear on hover at [`AppContent()`](web/src/ui/App.tsx:452–483).  
- Root cause: Disabled elements are unfocusable; hover-only hint unreachable by keyboard and touch.  
- Impacted users: Keyboard, screen-reader, mobile.  
- WCAG: 1.4.13, 3.3.1.  
- Recommendation: Provide inline helper text or aria-describedby to a static helper; consider aria-disabled instead of disabled if keeping focusability.  
- Success criteria: Guidance available without hover and to SR users.

10) Warning/error contrast on dark backgrounds may be insufficient  
- Evidence: Warning and error containers at [`EnhancedVisionAnalysis()`](web/src/ui/EnhancedVisionAnalysis.tsx:475–508).  
- Root cause: Amber/red tints on translucent dark may fall below AA for small text.  
- Impacted users: Low-vision users.  
- WCAG: 1.4.3.  
- Recommendation: Validate with tooling; adjust text color and/or background opacity to meet ≥4.5:1 for body text.  
- Success criteria: AA contrast for all text and icons.

11) Use of color as sole indicator in tables  
- Evidence: Green/red deltas at [`TypographySpecimen()`](web/src/ui/TypographySpecimen.tsx:50–63).  
- Root cause: Status conveyed mainly with color tone.  
- Impacted users: Color-vision deficiencies; SR users.  
- WCAG: 1.4.1 Use of Color.  
- Recommendation: Keep +/- signs and add textual labels (“Increase/Decrease”) and/or icons with aria-labels.  
- Success criteria: Meaning retained without color.

12) Missing main landmark for primary content  
- Evidence: Primary container is a div at [`AppContent()`](web/src/ui/App.tsx:169).  
- Root cause: No <main> or role="main".  
- Impacted users: Screen-reader users (landmark navigation).  
- WCAG: 1.3.1.  
- Recommendation: Wrap main content with <main role="main" aria-label="AI Media Studio">.  
- Success criteria: SR lists “Main” landmark.

13) Canvas editor lacks explicit instructions binding  
- Evidence: Mask canvas at [`ImageEditor()`](web/src/ui/ImageEditor.tsx:111–119).  
- Root cause: No aria-label/aria-describedby indicating how to paint mask.  
- Impacted users: Screen-reader users.  
- WCAG: 3.3.2.  
- Recommendation: Add aria-describedby linking to concise instructions; consider role="img" with aria-label for context.  
- Success criteria: SR announces control and usage.

14) Risk of truncating critical headings through clamp  
- Evidence: [`Heading()`](web/src/ui/typography.tsx:38) applies 'truncate-2' if clamp prop is set.  
- Root cause: Truncation could hide essential titles if used improperly.  
- Impacted users: All.  
- WCAG: N/A (content strategy).  
- Recommendation: Restrict truncation to non-critical text; document usage guidelines.  
- Success criteria: No critical headings truncated in QA.

### P3 — Low

15) Use focus-visible instead of focus to avoid rings on mouse click  
- Evidence: Button focus styles at [`web/src/index.css`](web/src/index.css:113–118).  
- Root cause: focus may show on mouse; better to prefer focus-visible.  
- Impacted users: All (visual noise) vs. keyboard (need ring).  
- WCAG: 2.4.7 (best-practice refinement).  
- Recommendation: Swap to focus-visible utilities for interactive elements; keep strong ring for keyboard.  
- Success criteria: Rings on keyboard navigation only.

16) Toast Escape-to-dismiss only when toast has focus (optional)  
- Evidence: Escape handler on toast node at [`Toast()`](web/src/ui/Toast.tsx:62–66).  
- Root cause: No global Escape listener.  
- Impacted users: Keyboard users expecting Escape to dismiss.  
- WCAG: N/A (usability).  
- Recommendation: Optionally add a scoped global Escape listener in [`ToastProvider()`](web/src/contexts/ToastContext.tsx:41) to dismiss latest toast.  
- Success criteria: Escape dismisses toast even if focus is elsewhere (if enabled).

17) Shortcut discoverability for Alt+L (focus Suggestions)  
- Evidence: Global handler at [`PromptSuggestions()`](web/src/ui/PromptSuggestions.tsx:27–37).  
- Root cause: Shortcut not announced or hinted.  
- Impacted users: Keyboard/power users.  
- WCAG: N/A (discoverability).  
- Recommendation: Add aria-keyshortcuts="Alt+L" to the region and a small helper text near the heading.  
- Success criteria: SR announces shortcut; hint visible.

18) Small touch targets on “remove reference” control  
- Evidence: ~20px control at [`SoraCreator()`](web/src/ui/SoraCreator.tsx:342–353).  
- Root cause: Visual compactness over ergonomics.  
- Impacted users: Touch/mobile users.  
- WCAG: 2.5.8 Target Size (where applicable).  
- Recommendation: Increase to ≥32×32 px target with spacing; preserve clear focus/hover state.  
- Success criteria: Improved tap accuracy; meets minimum target size.

## Prioritized remediation plan
- Tier 0 (Blockers):
  1. Accessible modals (role/aria, focus trap, Escape, focus restore) — [`ImageEditor()`](web/src/ui/ImageEditor.tsx:100), [`VideoEditor()`](web/src/ui/VideoEditor.tsx:77)
  2. Fix ARIA roles in Prompt Suggestions — [`PromptSuggestions()`](web/src/ui/PromptSuggestions.tsx:156–206)
  3. Keyboard-visible controls (hover-hidden and custom checkboxes) — [`SoraCreator()`](web/src/ui/SoraCreator.tsx:342–353), [`AppContent()`](web/src/ui/App.tsx:382–401)
- Tier 1:
  4. Progressbar semantics — [`SoraCreator()`](web/src/ui/SoraCreator.tsx:461–473)
  5. aria-busy + live announcements — [`AppContent()`](web/src/ui/App.tsx:339–345)
  6. Reduced-motion support — [`web/src/index.css`](web/src/index.css), [`AppContent()`](web/src/ui/App.tsx:425–436)
  7. Add “Typography” tab or relocate to visible secondary nav — [`AppContent()`](web/src/ui/App.tsx:175–254)
- Tier 2:
  8. Replace hover-only disabled hints — [`AppContent()`](web/src/ui/App.tsx:452–483)
  9. Contrast validation and adjustments — [`EnhancedVisionAnalysis()`](web/src/ui/EnhancedVisionAnalysis.tsx:475–508)
  10. Landmarks and focus-visible hygiene — [`AppContent()`](web/src/ui/App.tsx:169), [`web/src/index.css`](web/src/index.css:113–118)

## WCAG 2.2 A/AA mapping (summary)
- 1.1.1 Non-text Content — canvas instructions/name ([`ImageEditor()`](web/src/ui/ImageEditor.tsx:111–119))
- 1.3.1 Info and Relationships — main landmark; list semantics ([`AppContent()`](web/src/ui/App.tsx:169); [`PromptSuggestions()`](web/src/ui/PromptSuggestions.tsx:156–206))
- 1.4.1 Use of Color — table deltas ([`TypographySpecimen()`](web/src/ui/TypographySpecimen.tsx:50–63))
- 1.4.3 Contrast (Minimum) — warning/error blocks ([`EnhancedVisionAnalysis()`](web/src/ui/EnhancedVisionAnalysis.tsx:475–508))
- 1.4.13 Content on Hover/Focus — hover-only controls/tooltips ([`AppContent()`](web/src/ui/App.tsx:452–483); [`SoraCreator()`](web/src/ui/SoraCreator.tsx:342–353))
- 2.1.2 No Keyboard Trap — modal focus traps ([`ImageEditor()`](web/src/ui/ImageEditor.tsx:100); [`VideoEditor()`](web/src/ui/VideoEditor.tsx:77))
- 2.3.3 Animation from Interactions — reduced motion ([`web/src/index.css`](web/src/index.css); [`AppContent()`](web/src/ui/App.tsx:425–436))
- 2.4.3 Focus Order — modal entry/exit focus ordering
- 2.4.7 Focus Visible — custom inputs and hover-hidden controls
- 4.1.2 Name, Role, Value — dialogs, progressbar semantics, ARIA roles
- 4.1.3 Status Messages — aria-busy + live loading announcements

## Measurable success criteria
- Accessibility:
  - 0 critical/high violations in axe-core + manual WCAG checks for main flows.
  - Full keyboard walkthrough (“Generate image → Select → Enhanced analysis → Generate video → Edit media”) with no focus loss or traps.
  - Reduced-motion disables animations and hover autoplay.
- Usability/engagement:
  - “Use an image in Sora” task completion < 30s for 95% of new users in unmoderated tests.
  - Enhanced analysis usage increases by ≥30% after adding discoverable entry in the library panel.
  - Error/help copy comprehension ≥ 4/5 in quick survey.

## Implementation notes (targeted)
- Dialogs: Add role/aria to wrappers; trap focus via onKeyDown Tab cycle; remember/restore trigger focus; document-level Escape during open.
- Suggestions: Replace listbox/option with ul/li; preserve button and checkbox semantics; keep aria-labels on actions.
- Focus-visible: Add strong focus-visible utilities to checkboxes and hover-hidden buttons; ensure contrast of rings on dark backgrounds.
- Progress/loading: role="progressbar" + aria-values + aria-live; aria-busy on containers; sr-only announcements of loading and results.
- Reduced motion: @media (prefers-reduced-motion: reduce) { animation: none } for shimmer/spin/fade; conditionally skip hover play().
- Landmarks: Wrap main content with <main role="main">; keep header/footer as landmarks.
- Contrast: Validate and adjust amber/red alert schemes to meet AA for small text; ensure icon strokes meet contrast too.

## Strengths to retain
- Robust tab keyboard model with live announcements in [`AppContent()`](web/src/ui/App.tsx:257–260).
- Well-structured typography tokens and utilities in [`web/src/index.css`](web/src/index.css) and [`tailwind.config.js`](web/tailwind.config.js); reusable primitives via [`Heading()`](web/src/ui/typography.tsx:38) and [`Text()`](web/src/ui/typography.tsx:85).
- Clear async feedback patterns: spinners with role="status", “Generating…” copy, accessible toasts through [`ToastProvider()`](web/src/contexts/ToastContext.tsx:41) and [`Toast()`](web/src/ui/Toast.tsx:14).

## Appendix — File inventory (for traceability)
- [`web/src/ui/App.tsx`](web/src/ui/App.tsx)
- [`web/src/ui/ImageCreator.tsx`](web/src/ui/ImageCreator.tsx)
- [`web/src/ui/SoraCreator.tsx`](web/src/ui/SoraCreator.tsx)
- [`web/src/ui/EnhancedVisionAnalysis.tsx`](web/src/ui/EnhancedVisionAnalysis.tsx)
- [`web/src/ui/ImageEditor.tsx`](web/src/ui/ImageEditor.tsx)
- [`web/src/ui/VideoEditor.tsx`](web/src/ui/VideoEditor.tsx)
- [`web/src/ui/PromptSuggestions.tsx`](web/src/ui/PromptSuggestions.tsx)
- [`web/src/ui/Toast.tsx`](web/src/ui/Toast.tsx)
- [`web/src/ui/typography.tsx`](web/src/ui/typography.tsx)
- [`web/src/index.css`](web/src/index.css)
- [`web/tailwind.config.js`](web/tailwind.config.js)