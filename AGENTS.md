# Repository Guidelines

Welcome, contributor! This short guide explains how this mono-repo is laid out, how to run it, and the conventions that keep the codebase tidy.  Skim it before opening a pull-request – it should answer 90 % of day-to-day questions.

## Project Structure & Module Organization

- `web/` &nbsp;– React + Vite front-end (TypeScript, Tailwind). Tests live in `web/src/__tests__/`.
- `server/` &nbsp;– Fastify API server (TypeScript) plus Azure helper scripts. Built output goes to `server/dist/`.
- `shared/` &nbsp;– Light “library” of type-safe Zod schemas shared by both tiers.
- `docs/` &nbsp;– Developer notes and HOW-TOs.
- `data/`, `logs/` &nbsp;– Runtime artefacts, ignored by Git.

Each package is an isolated workspace in `pnpm`; cross-package imports use the local alias `@image-studio/...`.

## Build, Test, and Development Commands

Top-level:

```bash
# Start web + API concurrently (hot-reload)
pnpm dev

# Production build of each package
pnpm build

# Run only the API in production mode
pnpm start
```

Package-specific (run inside folder):

- `pnpm dev` – hot-reload development server.
- `pnpm build` – compile with `tsup`/`vite`.
- `pnpm test` or `pnpm vitest run` – execute unit tests (web only).

## Coding Style & Naming Conventions

- **Language**: TypeScript `5.x`; ES modules.
- **Indentation**: 2 spaces, no semi-colons preferred.
- **Linting**: `eslint` (+ `@typescript-eslint`) runs on commit; errors must be fixed or ignored with justification.
- **File names**: `PascalCase.tsx` for React components, `camelCase.ts` for utils, `kebab-case` for CLI/scripts.
- **Git**: keep diffs focused; avoid re-formatting unrelated lines.

## Testing Guidelines

- **Frameworks**: `vitest`, `@testing-library/react`.
- **Placement**: co-locate tests under `__tests__/` or use `*.test.ts(x)`.
- **Coverage**: aim for ≥ 80 % on new code; run `vitest --coverage` to check.

## Commit & Pull Request Guidelines

- Use **Conventional Commits** (`feat:`, `fix:`, `chore:` …) in present tense: *"feat: add vision moderation endpoint"*.
- Reference an issue in the body (`Closes #123`).
- Before opening a PR:
  1. Rebase onto `main` and resolve conflicts.
  2. Run `pnpm build && pnpm test` and ensure they pass.
  3. Add a short, descriptive title and a checklist of changes; include screenshots or cURL examples for UI/API work.

## Security & Configuration Tips

- Secrets are pulled from environment variables – never commit `.env` files or keys.
- Azure credentials required by the API: `AZURE_OPENAI_ENDPOINT`, `AZURE_OPENAI_API_KEY` **or** `AZURE_OPENAI_AUTH_TOKEN`.
- The server validates config at start-up and disables endpoints that lack credentials.

Happy building! 🚀

