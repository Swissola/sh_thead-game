---
phase: 02-real-cross-device-multiplayer
plan: 18
subsystem: game-engine-and-edge-functions
tags: [applyMove, engine, edge-functions, turn-timeout, host-config]

# Dependency graph
requires:
  - phase: 02-real-cross-device-multiplayer
    provides: "02-17's self-healing room-data channel and the existing dispatchMove -> submitMove -> apply-move Edge Function -> withVersionRetry pipeline every move type already uses"
provides:
  - "GameState.turnTimeoutMs - a required, host-configurable auto-pickup grace period in ms, defaulting to TURN_GRACE_MS (60000)"
  - "SET_TURN_TIMEOUT - a fifth Move type, lobby-phase-only, host-only, bounds-validated ([30000, 300000]ms inclusive) inside applyMove"
  - "checkTurnTimeout honouring a room's own configured turnTimeoutMs, with a tested, documented TURN_GRACE_MS fallback for any room whose stored state predates this field"
affects: [02-19]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "New required GameState fields ripple through every raw GameState object literal in the repo (not just buildGameState()) - tsconfig.app.json's whole-project tsc -b build type-checks test files and Edge Function fixtures too, so npm run build is the only proof every site was found"
    - "applySetTurnTimeout follows applyReadyUp's precedent exactly: phase check first, then a simple field update, no card-array mutation"
    - "Runtime-distrust of a required type at exactly one call site (checkTurnTimeout's row.state.turnTimeoutMs ?? TURN_GRACE_MS) - documented inline as the deliberate exception to 'the type guarantees this field exists', because that specific read crosses a raw-JSONB legacy-row boundary no other call site in the codebase crosses"

key-files:
  created: []
  modified:
    - src/types.ts
    - src/engine/moves.ts
    - src/engine/errors.ts
    - src/engine/applyMove.ts
    - src/supabase/roomTypes.ts
    - src/screens/MenuScreen.tsx
    - src/__tests__/engine/applyMove.test.ts
    - src/__tests__/testUtils/buildGameState.ts
    - src/__tests__/testUtils/buildGameState.test.ts
    - src/__tests__/hooks/useRoomSubscription.test.ts
    - src/__tests__/edge/joinRoom.test.ts
    - src/__tests__/edge/db.test.ts
    - src/__tests__/edge/createRoom.test.ts
    - src/__tests__/supabase/roomTypes.test.ts
    - src/__tests__/edge/applyRoomMove.test.ts
    - src/__tests__/edge/turnTimeout.test.ts
    - supabase/functions/_shared/applyRoomMove.ts
    - supabase/functions/_shared/turnTimeout.ts
    - supabase/functions/_shared/createRoom.ts

key-decisions:
  - "HOST_ONLY (engine tier) is deliberately not named NOT_HOST, since EDGE_ERROR_CODES.NOT_HOST already exists for the edge tier's own host-only Edge Functions (start-game, remove-player) - the two closed sets must never collide, enforced by the pre-existing generic disjointness loop in roomTypes.test.ts"
  - "createRoom.ts's baseState fix was moved into Task 1's commit rather than left for Task 2, because the plan's own objective promises the repo compiles cleanly at every intermediate commit - Task 1's file list omitted this one production site, which would have broken that promise for one commit"
  - "checkTurnTimeout's turnTimeoutMs ?? TURN_GRACE_MS fallback is the one place this plan intentionally distrusts GameState's required-field guarantee, since that specific read is against a raw Postgres JSONB column whose persisted shape predates this plan for any pre-existing room"

requirements-completed: []

# Metrics
duration: 70min
completed: 2026-08-01
---

# Phase 02 Plan 18: MPLAY-07's server-authority half Summary

**Adds a host-configurable, server-validated `SET_TURN_TIMEOUT` move (bounded [30s, 300s], lobby-phase-only) through the existing `applyMove`/`apply-move` Edge Function pipeline, and makes the auto-pickup sweep honour it instead of the hardcoded 60s constant.**

## Performance

- **Started:** 2026-08-01 (worktree branch was 216 commits stale - see Deviations)
- **Completed:** 2026-08-01
- **Tasks:** 2/2 completed
- **Files modified:** 18 (13 in Task 1, plus 1 blocking-fix production file also landed in Task 1's commit; 5 further files in Task 2 - `createRoom.ts` itself already fixed in Task 1)

## Accomplishments

- `GameState.turnTimeoutMs: number` is now a required field, defaulting to `TURN_GRACE_MS`
  (60000ms) everywhere the shared `buildGameState()` test fixture is used, and on every
  newly created room via `createRoom.ts`.
- `MIN_TURN_TIMEOUT_MS` (30000) / `MAX_TURN_TIMEOUT_MS` (300000) constants added to
  `src/supabase/roomTypes.ts` as the single source of truth for the locked inclusive bound.
- `SET_TURN_TIMEOUT` is a fifth `Move` union member. `applySetTurnTimeout` in
  `applyMove.ts` rejects non-lobby phase (`WRONG_PHASE`), non-host callers (`HOST_ONLY`),
  and out-of-range/non-finite `timeoutMs` (`INVALID_TIMEOUT_RANGE`) - in that order, matching
  every other handler's phase-then-permission-then-payload check ordering.
- `applyRoomMove.ts`'s `VALID_MOVE_TYPES` now includes `SET_TURN_TIMEOUT`, so a request
  routes through the identical server-validated pipeline (and identical `playerId`
  JWT-override boundary, MPLAY-04) every other move type already uses - no bespoke
  Edge Function or client-side-only enforcement.
- `checkTurnTimeout` reads `row.state.turnTimeoutMs ?? TURN_GRACE_MS` instead of the
  hardcoded `TURN_GRACE_MS` comparison. A room configured below 60s auto-picks-up earlier;
  a room configured above 60s does not auto-pick-up at 60s; a room whose stored state
  predates this plan (no `turnTimeoutMs` field at runtime, despite the static type) still
  behaves exactly as before at exactly 60s.
- No lobby UI exists yet for this setting (deliberately out of scope, per the plan's own
  objective) - a player can only reach `SET_TURN_TIMEOUT` today by dispatching it
  programmatically, proven by this plan's own tests.

## Task Commits

1. **Task 1: Define the SET_TURN_TIMEOUT contract, the engine rule, and repo-wide
   GameState fixture parity** - `2c1acaf` (feat, tests and implementation together per
   the orchestrator's explicit "TDD before/alongside implementation" allowance for this
   tightly-coupled required-field change)
2. **Task 2: Wire the server-authority boundary - accept the move at the edge, honour it
   in the auto-pickup sweep, seed it on room creation** - `9f96e70` (feat)

## TDD Gate Compliance

This plan's two tasks were executed as single commits each (tests and implementation
together), not separate RED/GREEN commits. The orchestrator's own execution instruction
for this session explicitly permitted "tests before/alongside implementation, not after" -
"alongside" was used deliberately here because Task 1's core change (`turnTimeoutMs` as a
*required* `GameState` field) makes isolated test-only commits impossible to reason about
in isolation: a test file referencing the new field would not usefully "fail for the
expected reason" before the type itself exists, since Vitest's esbuild transform does not
type-check test files - the meaningful gate for this plan is `npm run build`'s whole-repo
strict `tsc -b`, which was run and confirmed green after each task's full set of changes
before committing.

## Files Created/Modified

- `src/types.ts` - `GameState.turnTimeoutMs: number` (required), doc comment referencing
  the bound constants.
- `src/supabase/roomTypes.ts` - `MIN_TURN_TIMEOUT_MS` (30000), `MAX_TURN_TIMEOUT_MS`
  (300000), extended `TURN_GRACE_MS`'s doc comment.
- `src/engine/moves.ts` - fifth `Move` union member `SET_TURN_TIMEOUT`.
- `src/engine/errors.ts` - `HOST_ONLY`, `INVALID_TIMEOUT_RANGE` appended to `ERROR_CODES`;
  header doc comment updated to note per-plan growth is allowed (mirroring
  `EDGE_ERROR_CODES`'s own precedent), not a permanent Phase 1 freeze.
- `src/engine/applyMove.ts` - `applySetTurnTimeout` handler, new switch case, import of
  the two bound constants from `roomTypes.ts`.
- `src/screens/MenuScreen.tsx` - `turnTimeoutMs: TURN_GRACE_MS` added to both test-mode
  `GameState` literals (mechanical fixture parity, no behaviour change).
- `src/__tests__/testUtils/buildGameState.ts` / `buildGameState.test.ts` - default
  `turnTimeoutMs: TURN_GRACE_MS`, asserted.
- `src/__tests__/engine/applyMove.test.ts` - new `describe('applyMove - SET_TURN_TIMEOUT', ...)`
  block: 11 tests covering both inclusive boundaries, both one-past-boundary rejections,
  non-finite (`NaN`/`Infinity`) rejection, `HOST_ONLY`, `UNKNOWN_PLAYER`, and both non-lobby
  phase rejections (`setup`, `playing`).
- `src/__tests__/supabase/roomTypes.test.ts` - `turnTimeoutMs: 60000` added to `baseState`;
  new `describe('turn timeout bounds (MPLAY-07)', ...)` block asserting both constants.
- `src/__tests__/hooks/useRoomSubscription.test.ts`, `src/__tests__/edge/joinRoom.test.ts`,
  `src/__tests__/edge/db.test.ts`, `src/__tests__/edge/createRoom.test.ts` - mechanical
  `turnTimeoutMs` field addition to each file's local `GameState`-literal helper/fixtures,
  keeping the whole-repo strict build green.
- `supabase/functions/_shared/applyRoomMove.ts` - `'SET_TURN_TIMEOUT'` added to
  `VALID_MOVE_TYPES`.
- `supabase/functions/_shared/turnTimeout.ts` - `checkTurnTimeout` now computes
  `const turnTimeoutMs = row.state.turnTimeoutMs ?? TURN_GRACE_MS;` and compares
  `elapsedMs < turnTimeoutMs`, with an inline comment documenting why this one call site
  deliberately distrusts the type's "required field" guarantee.
- `supabase/functions/_shared/createRoom.ts` - `turnTimeoutMs: TURN_GRACE_MS` added to
  `baseState` (landed in Task 1's commit as a blocking build fix - see Deviations).
- `src/__tests__/edge/applyRoomMove.test.ts` - stale "four-member union" wording updated to
  "five-member union"; two new tests (host write increments version by 1 and persists
  `turnTimeoutMs`; non-host rejection with `HOST_ONLY`, zero writes).
- `src/__tests__/edge/turnTimeout.test.ts` - three new tests: configured value below
  `TURN_GRACE_MS` auto-picks-up early; configured value above `TURN_GRACE_MS` does not
  auto-pick-up at 60s; no-`turnTimeoutMs`-field legacy row still behaves exactly as before
  at exactly 60s (both under and over).

## Decisions Made

- `HOST_ONLY` (engine tier) kept deliberately distinct from `EDGE_ERROR_CODES.NOT_HOST`
  (edge tier) - no new disjointness test was added since the existing generic
  `Object.values(ERROR_CODES)` loop in `roomTypes.test.ts` already covers both new codes
  with zero edits.
- `applySetTurnTimeout` checks phase, then host, then bounds - matching every other
  handler's ordering in this file, so a non-host caller in the wrong phase always sees
  `WRONG_PHASE` first (consistent, predictable rejection precedence).
- Chose not to add a lobby UI in this plan (explicitly deferred to `02-19`, not yet
  written) - `SET_TURN_TIMEOUT` is reachable only by dispatching it programmatically today,
  exactly as the plan's objective specifies.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Worktree branch was 216 commits stale**
- **Found during:** Setup, before Task 1.
- **Issue:** This worktree's branch (`worktree-agent-a073d5cb1627b26b2`) was created from
  an old ancestor commit (`d606485`), predating `.planning/` and the entire Phase 1/Phase 2
  codebase - no `src/engine/`, `src/supabase/`, or `supabase/functions/` existed on this
  branch at all.
- **Fix:** Confirmed the branch was a strict ancestor of `stage-1-refactor` with zero
  unique commits of its own (`git rev-list --count stage-1-refactor..HEAD` = `0`) and the
  working tree was clean, then fast-forwarded via `git merge --ff-only stage-1-refactor` -
  safe and non-destructive, no history rewritten or discarded. Ran `npm install` since
  `node_modules` did not yet exist.
- **Files modified:** none (git history operation only).
- **Verification:** `git log --oneline -5` and `ls src/engine src/supabase` showed the
  expected commit history and source tree present afterward; baseline
  `npm test -- --run` passed at 32 files / 448 tests before any plan work began.
- **Committed in:** not a task commit - a pre-execution setup step.

**2. [Rule 3 - Blocking] `supabase/functions/_shared/createRoom.ts`'s baseState literal
was missing from Task 1's file list, breaking the objective's "compiles cleanly at every
intermediate commit" promise**
- **Found during:** Task 1's `npm run build` verification, after all 13 listed files were
  updated.
- **Issue:** `tsc -b`'s whole-repo strict build failed with `TS2741: Property
  'turnTimeoutMs' is missing` on `createRoom.ts`'s `baseState` literal. The plan's Task 1
  file list (13 files) did not include this production file - it was assigned to Task 2 -
  but the plan's own objective explicitly states "Task 1 below fixes every such site in
  the same task that introduces the field, so the repo compiles cleanly at every
  intermediate commit, not just at the end of the plan." This was a genuine gap between
  the plan's file-list scoping and its own stated acceptance criterion for Task 1
  (`npm run build` exits 0).
- **Fix:** Added `TURN_GRACE_MS` to `createRoom.ts`'s existing `roomTypes.ts` import and
  `turnTimeoutMs: TURN_GRACE_MS,` to `baseState` - a one-line mechanical fixture-parity
  edit identical in kind to the five other sites already in Task 1's list. This is the
  exact edit Task 2's own action text later describes for this file; Task 2's commit found
  it already in place and only added `createRoom.test.ts`'s dedicated behaviour assertion.
- **Files modified:** `supabase/functions/_shared/createRoom.ts` (Task 1's commit).
- **Verification:** `npm run build` exits 0 after the fix; full test suite (32 files, 461
  tests) passed; re-confirmed unchanged when Task 2 added the dedicated `createRoom.test.ts`
  assertion for this same field.
- **Committed in:** `2c1acaf` (Task 1's commit).

### Issues Encountered

- `npm run lint` (repo-wide) exits 1, due to two pre-existing errors unrelated to this
  plan's scope (`GameContext.tsx:221` `react-refresh/only-export-components`,
  `GameScreen.tsx:111` `react-hooks/set-state-in-effect`) - the same two issues logged
  under every plan since 02-01, in files this plan does not touch at all. `npx eslint`
  scoped to exactly this plan's touched files (14 files for Task 1, 6 files for Task 2)
  reports zero output for both tasks. Logged to `deferred-items.md` under a new
  "Plan 02-18 (Task 1)" entry rather than fixed, per the executor's scope-boundary rule.

## User Setup Required

None - no external service configuration required. `SET_TURN_TIMEOUT` flows through the
existing `apply-move` Edge Function and Realtime broadcast; no new grant, Edge Function,
or schema change (`git diff --stat supabase/migrations/` is empty).

## Next Phase Readiness

- `MPLAY-07` is not fully closed by this plan alone. The server-authority half is
  complete and tested: only the host, only in the lobby phase, can change
  `turnTimeoutMs`, bounded to `[30000, 300000]`ms inclusive, enforced server-side
  regardless of what any client sends. The UI-facing halves - "adjustable in the lobby"
  and "visible to all players" - remain open for `02-19` (already planned:
  `.planning/phases/02-real-cross-device-multiplayer/02-19-PLAN.md`), which must wire
  `LobbyScreen.tsx` to dispatch this move and make `useTurnTimeoutSweep.ts`/
  `GameScreen.tsx` read the configured value instead of the still-hardcoded
  `TURN_GRACE_MS` they use today.
- `npm run lint`'s pre-existing repo-wide failures remain carried forward in
  `deferred-items.md` for a future dedicated lint-cleanup pass, unrelated to this plan.

---
*Phase: 02-real-cross-device-multiplayer*
*Completed: 2026-08-01*

## Self-Check: PASSED

All eighteen modified files confirmed present on disk via the git commits below. Both task
commit hashes (`2c1acaf`, `9f96e70`) confirmed present in `git log --oneline -5`. Full test
suite: 32 files / 466 tests passed. `npm run build` exits 0. `git diff --stat
supabase/migrations/` is empty (no schema change).
