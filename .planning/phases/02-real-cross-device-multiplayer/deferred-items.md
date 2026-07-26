# Deferred Items — Phase 02

Items discovered during execution that are out of scope for the task that found them
(pre-existing, in files the task did not touch). Logged, not fixed, per executor scope
boundary rules.

## Plan 02-01

- **`npm run lint` exits 1, not 0** (Task 1 acceptance criterion expects exit 0). Three
  pre-existing issues, none in files touched by this plan (`package.json`, `.gitignore`,
  `.env.example`, `supabase/config.toml`):
  - `src/App.tsx:32` — `react-hooks/exhaustive-deps` warning (missing `gameState` dep)
  - `src/context/GameContext.tsx:98` — `react-refresh/only-export-components` error
  - `src/screens/GameScreen.tsx:85` — `react-hooks/set-state-in-effect` error
  - Confirmed pre-existing via `git diff package-lock.json` (only additions from the new
    Supabase installs, no version bump to `eslint-plugin-react-hooks` or eslint itself)
    and via `git diff --stat` on this plan's commits (none of the three flagged files are
    modified anywhere in this plan). Out of scope for Task 1; carried forward for a future
    lint-cleanup pass.
- **`npm audit` reports 14 vulnerabilities (1 low, 1 moderate, 9 high, 3 critical)** after
  `npm install`. All are in pre-existing dev-tooling transitive deps (`vite`, `vitest`,
  `rollup`, `postcss`, `minimatch`, `picomatch`, `js-yaml`, `brace-expansion`, `flatted`,
  `ws`, `ajv`, `@babel/core`) — none in `@supabase/supabase-js` or `supabase` themselves.
  Out of scope for this plan (build-tooling supply chain, unrelated to the Supabase
  scaffolding this plan adds); flagged for a future dependency-audit pass.

## Plan 02-04

- **`npm run lint` still exits 1** (Task 2 acceptance criterion expects exit 0) — the
  same three pre-existing issues logged under Plan 02-01 above, in the same three files
  (`App.tsx`, `GameContext.tsx`, `GameScreen.tsx`), none of which this plan touches or
  modifies. `npx eslint src/supabase/session.ts src/__tests__/supabase/session.test.ts`
  (this plan's only two files) is clean with zero output. Not re-fixed here per scope
  boundary; still carried forward for the same future lint-cleanup pass.

## Plan 02-03 (Task 2)

- **`npm run lint` still exits 1** (Task 2 acceptance criterion expects exit 0) — the
  same three pre-existing issues logged under Plan 02-01 above, in the same three files
  (`App.tsx`, `GameContext.tsx`, `GameScreen.tsx`), none of which this plan touches or
  modifies. `npx eslint supabase/functions/_shared/engine.ts
  supabase/functions/_shared/db.ts supabase/functions/_shared/respond.ts
  src/__tests__/edge/db.test.ts` (this task's four new/changed source files) is clean
  with zero output. Not re-fixed here per scope boundary; still carried forward for the
  same future lint-cleanup pass.
