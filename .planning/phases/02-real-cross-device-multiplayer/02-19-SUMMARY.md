---
phase: 02-real-cross-device-multiplayer
plan: 19
subsystem: ui
tags: [react, lobby, turn-timeout, dispatchMove, useTurnTimeoutSweep]

# Dependency graph
requires:
  - phase: 02-real-cross-device-multiplayer (plan 02-18)
    provides: "GameState.turnTimeoutMs, the SET_TURN_TIMEOUT move type, MIN_TURN_TIMEOUT_MS/MAX_TURN_TIMEOUT_MS constants, and server-side enforcement in applyMove/applySetTurnTimeout/checkTurnTimeout"
provides:
  - "Host-editable, all-players-visible auto-pickup timeout control in LobbyScreen.tsx, dispatching SET_TURN_TIMEOUT through the standard dispatchMove pipeline"
  - "useTurnTimeoutSweep reading the room's actual configured turnTimeoutMs instead of the hardcoded TURN_GRACE_MS ceiling"
  - "MPLAY-07 closed end-to-end: adjustable in the lobby, visible to all players, server-validated (02-18) and reachable (this plan)"
affects: []

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "UI-presentation-only preset arrays bounded at both ends by imported shared constants (TURN_TIMEOUT_OPTIONS_MS bounded by MIN_TURN_TIMEOUT_MS/MAX_TURN_TIMEOUT_MS) rather than duplicating literals, so they cannot silently drift from the authoritative bounds"
    - "Host-gated UI actions route through the existing dispatchMove seam (optimistic local applyMove + async submitMove), not a bespoke Edge Function invoke - matches every other in-game move, distinct from LobbyScreen's older direct-invoke pattern (Start Game, remove-player)"

key-files:
  created: []
  modified:
    - src/screens/LobbyScreen.tsx
    - src/__tests__/screens/LobbyScreen.test.tsx
    - src/hooks/useTurnTimeoutSweep.ts
    - src/__tests__/hooks/useTurnTimeoutSweep.test.ts
    - src/screens/GameScreen.tsx
    - src/__tests__/screens/GameScreen.test.tsx
    - .planning/phases/02-real-cross-device-multiplayer/deferred-items.md

key-decisions:
  - "Worktree branch (worktree-agent-afc445f2c568a8d32) was created from a stale merge-base commit that predated .planning/, 02-18, and this plan's own file - fast-forward merged stage-1-refactor into it before execution to bring in the dependency and the plan file itself"
  - "TURN_TIMEOUT_OPTIONS_MS preset list: [30000, 45000, 60000, 90000, 120000, 150000, 180000, 240000, 300000] - bounded at both ends by imported MIN_TURN_TIMEOUT_MS/MAX_TURN_TIMEOUT_MS"

patterns-established: []

requirements-completed: [MPLAY-07]

# Metrics
duration: 25min
completed: 2026-08-01
---

# Phase 02 Plan 19: Lobby auto-pickup timeout UI and client-side sweep wiring Summary

**Host-editable, all-players-visible turn-timeout `<select>` in LobbyScreen dispatching `SET_TURN_TIMEOUT` through the standard `dispatchMove` pipeline, plus `useTurnTimeoutSweep` reading the room's actual `turnTimeoutMs` instead of a hardcoded 60s ceiling - closes MPLAY-07 end-to-end.**

## Performance

- **Duration:** ~25 min
- **Completed:** 2026-08-01
- **Tasks:** 2/2
- **Files modified:** 6 source/test files + deferred-items.md

## Accomplishments
- Every player in the lobby sees the room's configured auto-pickup timeout, formatted in seconds; only the host sees the editable `<select>`, bounded to `[MIN_TURN_TIMEOUT_MS, MAX_TURN_TIMEOUT_MS]` (imported, never re-declared)
- Selecting a new value dispatches `SET_TURN_TIMEOUT` through the identical `dispatchMove -> submitMove -> apply-move` pipeline every other in-game move uses - no bespoke network call
- `useTurnTimeoutSweep` now takes a required `turnTimeoutMs` argument and compares elapsed time against it instead of the hardcoded `TURN_GRACE_MS`; `GameScreen.tsx` forwards `gameState?.turnTimeoutMs ?? TURN_GRACE_MS`
- A room configured shorter than 60s now self-heals (calls `check-turn-timeout`) before the old hardcoded 60s mark; one configured longer than 60s no longer treats 60s as a hidden ceiling

## Task Commits

1. **Task 1: Lobby UI - host-editable, all-players-visible turn-timeout control** - `457a4e8` (feat)
2. **Task 2: Thread the room's configured turnTimeoutMs into the client-side sweep trigger** - `ea8e196` (feat)

_Both tasks were TDD (tests written/extended alongside implementation in the same commit, per this project's established single-commit-per-task convention - not separate RED/GREEN commits)._

## Files Created/Modified
- `src/screens/LobbyScreen.tsx` - `TURN_TIMEOUT_OPTIONS_MS` preset list, `setTurnTimeout` host-gated dispatcher, the timeout row (host `<select>` / non-host read-only text)
- `src/__tests__/screens/LobbyScreen.test.tsx` - 7 new tests covering all seven plan behaviours
- `src/hooks/useTurnTimeoutSweep.ts` - `turnTimeoutMs` added to `UseTurnTimeoutSweepArgs`, `armKey`, `tick()`'s expiry comparison, and the effect's dependency array; `TURN_GRACE_MS` import and all references removed
- `src/__tests__/hooks/useTurnTimeoutSweep.test.ts` - mechanical `turnTimeoutMs: TURN_GRACE_MS` addition to all 16 existing call sites, plus 5 new tests (shorter/longer-than-default, invocation timing, armKey reset)
- `src/screens/GameScreen.tsx` - `TURN_GRACE_MS` import, `turnTimeoutMs: gameState?.turnTimeoutMs ?? TURN_GRACE_MS` threaded into the `useTurnTimeoutSweep` call
- `src/__tests__/screens/GameScreen.test.tsx` - 2 new tests proving the forwarded value (a configured override, and the default fallback)
- `.planning/phases/02-real-cross-device-multiplayer/deferred-items.md` - logged the two pre-existing, out-of-scope `npm run lint` failures for both tasks

## Decisions Made
- The worktree this plan executed in had been branched from a stale commit that predated `.planning/`, 02-18's work, and 02-19-PLAN.md itself (confirmed via `git merge-base`: the worktree's HEAD was a strict ancestor of `stage-1-refactor`, 168 files / ~31.8k lines behind). Fast-forward merged `stage-1-refactor` into the worktree branch before starting - safe because it was a pure ancestor relationship on a clean working tree, not a rewrite.
- Everything else followed the plan exactly as written - no architectural deviations (Rule 4), no bugs found (Rule 1), no missing critical functionality beyond what the plan specified (Rule 2).

## Deviations from Plan

None in the implementation itself - both tasks were executed exactly as specified. One necessary pre-execution fix (not a Rule 1-4 deviation from the plan's own logic, but a precondition fix):

**1. [Blocking - worktree state] Fast-forwarded a stale worktree branch to pick up its own dependency**
- **Found during:** Initial plan/context load, before Task 1
- **Issue:** The worktree branch had no `.planning/` directory at all and none of 02-18's `SET_TURN_TIMEOUT`/`turnTimeoutMs` engine work - it was branched from a commit before either existed
- **Fix:** `git merge --ff-only stage-1-refactor` (verified as a pure fast-forward via `git merge-base`, no conflicts, no rewritten history)
- **Verification:** `git log --oneline` after the merge showed 02-18's three commits and the 02-19 plan-authoring commit present; `applyMove.ts`'s `SET_TURN_TIMEOUT` case and `roomTypes.ts`'s `MIN_TURN_TIMEOUT_MS`/`MAX_TURN_TIMEOUT_MS` confirmed present before writing any code
- **Committed in:** N/A (merge commit is a fast-forward, no new commit object; visible as the jump from `d606485` to `49b26cd` in the branch's reflog)

## Issues Encountered
- `npm run lint` reports 1-2 pre-existing errors (`GameContext.tsx:221` fast-refresh, `GameScreen.tsx:111-112` `set-state-in-effect` in the celebration-modal effect) in both tasks. Both predate this plan (confirmed via `git status --short` after each task - neither task modifies the flagged lines) and have been logged as out-of-scope in every plan in this phase since 02-01. `npx eslint` scoped to exactly this plan's touched files is clean in both tasks.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

MPLAY-07 is fully closed end-to-end: server-validated (02-18) and now reachable through the UI (this plan). `REQUIREMENTS.md`'s MPLAY-07 checkbox should be ticked - both the server-authority half (02-18) and this plan's UI/wiring half are complete, and the plan's own `<success_criteria>` explicitly states this plan closes MPLAY-07 end-to-end.

Full test suite: 478/478 passing. `npm run build` exits 0. No blockers for subsequent phase work.

---
*Phase: 02-real-cross-device-multiplayer*
*Completed: 2026-08-01*

## Self-Check: PASSED

All 7 files confirmed present (`src/screens/LobbyScreen.tsx`, `src/__tests__/screens/LobbyScreen.test.tsx`, `src/hooks/useTurnTimeoutSweep.ts`, `src/__tests__/hooks/useTurnTimeoutSweep.test.ts`, `src/screens/GameScreen.tsx`, `src/__tests__/screens/GameScreen.test.tsx`, this SUMMARY.md). Both task commits (`457a4e8`, `ea8e196`) confirmed present in `git log`.
