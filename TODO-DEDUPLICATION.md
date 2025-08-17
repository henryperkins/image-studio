# Duplication/Redundancy Reduction Plan

## Todo List

- [x] Analyze requirements and identify duplication/redundancy between web/src/lib and server/src/lib
- [ ] Extract shared types (vision result, health, library items) to a shared module
- [ ] Refactor moderation pipeline: consolidate into vision-moderation.ts, migrate moderationToSafetyFlags, remove content-moderation.ts
- [ ] Rename timeout helpers for clarity (web: withAbortSignal, server: withTimeoutOrError)
- [ ] Rename client analyzeImages to analyzeImagesRemote (or similar) for clarity
- [ ] Centralize schema instruction text in one place (preferably SYSTEM_PROMPT)
- [ ] Update imports/usages across codebase to use new shared types and canonical moderation
- [ ] Test the implementation (type checks, runtime, and integration)
- [ ] Verify results and update documentation if needed

---

This checklist will be updated as each step is completed.
