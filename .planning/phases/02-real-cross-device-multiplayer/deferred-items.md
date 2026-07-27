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

## Plan 02-05 (Task 3)

- **`npm run lint` still exits 1** (Task 3 acceptance criterion expects exit 0) — the
  same three pre-existing issues logged under Plan 02-01 above, in the same three files
  (`App.tsx`, `GameContext.tsx`, `GameScreen.tsx`), none of which this plan touches or
  modifies. `npx eslint supabase/functions/_shared/supabaseStore.ts
  src/__tests__/edge/createRoom.test.ts src/__tests__/edge/joinRoom.test.ts
  scripts/check-edge-wrappers.mjs` (this plan's own new/changed lintable files;
  `supabase/functions/*/index.ts` is globally ignored by `eslint.config.js`) is clean
  with zero output. Not re-fixed here per scope boundary and per the orchestrator's
  explicit instruction not to touch `GameContext.tsx`; still carried forward for the
  same future lint-cleanup pass.
- **This worktree's branch (`worktree-agent-a99d9f6be0cc2d664`) was created from a stale
  base commit** (`d606485`, an ancestor of `stage-1-refactor`'s tip `bc1c915`) rather
  than from the tip that already includes plan 02-03's merged shared modules
  (`db.ts`, `engine.ts`, `respond.ts`, `roomTypes.ts`). Fixed at the start of this
  plan's execution via `git merge --ff-only stage-1-refactor` (a safe fast-forward,
  since the worktree's HEAD was a strict ancestor - no rewrite, no lost work). Flagging
  here in case the same stale-base issue affects sibling worktrees for 02-06/02-07/
  02-08/02-09, which were reportedly branched the same way.

## Plan 02-06

- **`npm run lint` still exits 1** (Task 3 acceptance criterion expects exit 0) — the
  same three pre-existing issues logged under Plan 02-01 above, in the same three files
  (`App.tsx`, `GameContext.tsx`, `GameScreen.tsx`), none of which this plan touches,
  modifies, or is permitted to touch (`GameContext.tsx` is explicitly out of scope for
  this wave - owned by a sibling plan). `npx eslint
  supabase/functions/_shared/startGame.ts supabase/functions/_shared/applyRoomMove.ts
  src/__tests__/edge/startGame.test.ts src/__tests__/edge/applyRoomMove.test.ts` (this
  plan's four new files; the two Deno wrapper `index.ts` files are globally ignored by
  `eslint.config.js`) is clean with zero output. Not re-fixed here per scope boundary;
  still carried forward for the same future lint-cleanup pass.
- **`node scripts/check-edge-wrappers.mjs` could not be run** (Task 3's `<verify>` and
  first acceptance criterion) — this script, along with
  `supabase/functions/_shared/supabaseStore.ts`, is created by sibling plan 02-05
  (`files_modified` in `02-05-PLAN.md`), which executes in parallel in a separate
  worktree and had not merged into this worktree's base branch at execution time.
  Neither file exists here. `supabase/functions/start-game/index.ts` and
  `supabase/functions/apply-move/index.ts` were written to satisfy every invariant
  `check-edge-wrappers.mjs` is specified to enforce (per `02-05-PLAN.md` Task 3's
  action: contains `withSupabase`, contains `userClaims`, contains
  `ctx.supabaseAdmin`, no `body.playerId`/`body.player_id` read, no inline
  `applyMove(` call, under 80 lines) and import `createSupabaseRoomStore` from
  `../_shared/supabaseStore.ts` exactly as 02-05 will provide it - neither file was
  duplicated here to avoid a guaranteed merge conflict on the same new path. Verified
  instead via the acceptance criteria that don't depend on the missing script
  (`grep -c 'userClaims'` = 2, `grep -c 'as Move'` = 0, `npm run build` exits 0) plus
  the lint check above. **Action required at Wave 3 integration:** once 02-05 merges,
  re-run `node scripts/check-edge-wrappers.mjs` against these two wrappers to confirm
  they pass the live checker unchanged.

## Plan 02-08

- **`npm run lint` still exits 1** - the same three pre-existing issues logged under
  Plan 02-01 above, in the same three files (`App.tsx`, `GameContext.tsx`,
  `GameScreen.tsx`), none of which this plan touches or is permitted to touch
  (`GameContext.tsx` is explicitly owned by sibling plan 02-09 this wave). This plan's
  own two new hooks (`src/hooks/useRoomSubscription.ts`, `src/hooks/usePresence.ts`)
  and their tests initially tripped two *new* `react-hooks` lint rules
  (`react-hooks/refs` - writing `ref.current` during render; `react-hooks/set-state-in-effect`
  - calling `setState` synchronously in an effect's bail-out branch) plus two
  `no-unused-vars` hits in the fake-Supabase-client test helpers. All four were within
  this plan's own touched files, so fixed directly (Rule 1) rather than deferred:
  `useRoomSubscription.ts`'s three ref writes moved into their own no-deps effect;
  `usePresence.ts`'s reset moved from the bail-out branch into the "connected" branch's
  cleanup, since the initial `useState([])` already covers the bail-out case. Confirmed
  clean via `npx eslint src/hooks/useRoomSubscription.ts src/hooks/usePresence.ts
  src/__tests__/hooks/useRoomSubscription.test.ts src/__tests__/hooks/usePresence.test.ts`
  (zero output). Not re-fixed here per scope boundary; the three pre-existing files
  still carried forward for the same future lint-cleanup pass.
- **`supabase/functions/_shared/heartbeat.ts` does not exist in this worktree** - it is
  created by sibling plan 02-07, executing in parallel in a separate worktree, and had
  not merged into this worktree's base branch at execution time. `usePresence.ts`
  invokes the `heartbeat` Edge Function by name (`supabase.functions.invoke('heartbeat',
  { body: { roomCode } })`) per the plan's own action text and per 02-07-PLAN.md's
  documented `heartbeat(store, input: { playerId; roomCode })` contract (identity comes
  from the verified JWT server-side, matching every other wrapper in this codebase -
  `playerId` is never read from the request body). Not directly verifiable against the
  live handler in this worktree; flagged for Wave 3/4 integration to confirm the
  invoked function name and body shape match once 02-07 merges.
