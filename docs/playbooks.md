Session Playbooks

Pre-authored workflows that guide novices without hiding expert controls.

- Location: Shared definitions in `shared/src/playbooks.ts` (exported as `PLAYBOOKS`).
- API: `GET /api/playbooks` returns `{ playbooks: Playbook[] }`.
- UI: `web/src/components/PlaybooksPanel.tsx` renders quick selectors above the Images creator.

Included playbooks

- Logo Cleanup (image-edit): transparent PNG export, high quality; preset brush and prompt.
- Product Glamor Shot (image-edit): remove background, studio light gradient; transparent PNG.
- Storyboard Animatic (video-sora): guide to select frames and jump to Sora with a preset prompt.

Behavior

- Image Generate: Prefills prompt and generation settings; all controls remain visible.
- Image Edit: Stores an editor preset (`localStorage: IMAGE_EDITOR_PRESET`) and opens the editor for the selected image; ImageEditor applies it on open.
- Video (Sora): Prefills prompt and switches to the Sora tab; user selects frames and runs as usual.

