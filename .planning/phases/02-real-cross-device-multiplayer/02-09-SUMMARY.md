---
phase: 02-real-cross-device-multiplayer
plan: 09
subsystem: client
tags: [react, context, optimistic-ui, reconciliation]

# Dependency graph
requires:
  - phase: 02-real-cross-device-multiplayer (plan 02-02)
    provides: "src/hooks/useToast.ts three-argument show() signature (message, code, variant)"
  - phase: 02-real-cross-device-multiplayer (plan 02-03)
    provides: "src/supabase/roomTypes.ts (ServerRoom, EdgeResult, EdgeError)"
provides:
  - "submitMove(move, optimisticState) - useGameStateUpdater's edge-function-backed move submission, replacing the storage write"
  - "GameContext.applyServerRoom(room) - D-11 always-snap-to-server-truth seam for useRoomSubscription to call into"
  - "GameContext.notifyReconciled() - D-12 distinct reconciliation toast"
  - "GameContext.roomVersion / turnStartedAt - exposed for GameScreen's timeout check"
affects: [02-10-app-menu-wiring, 02-11-lobby-screen-wiring, 02-12-turn-timeout-integration]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Optimistic apply then fire-and-forget submit: dispatchMove sets local state synchronously from the engine's own prediction, then calls submitMove without awaiting it - the Realtime broadcast (applyServerRoom), not the invoke response, is what's authoritative"
    - "Version tracked in a ref (roomVersionRef) alongside React state, so applyServerRoom's stale-version check reads synchronously rather than off a closure captured at render time"
    - "'RECONCILED' used as a client-side toast code sentinel rather than added to the engine's closed ERROR_CODES set (Phase 1 D-04) - reconciliation is a networking concept, not an illegal move"

key-files:
  created:
    - src/__tests__/hooks/useGameState.test.ts
    - src/__tests__/context/GameContext.test.tsx
  modified:
    - src/hooks/useGameState.ts
    - src/context/GameContext.tsx

key-decisions:
  - "submitMove never awaits the server before returning - the optimistic update is synchronous from dispatchMove's point of view, matching MPLAY-05's 'instant feedback' requirement"
  - "Two distinct failure paths in useGameStateUpdater: a transport failure (throw/invoke error) keeps the existing generic 'Failed to save your move' copy; a server-side EdgeResult.error uses the reconcile-variant toast, because only the latter means the server definitively disagreed"
  - "applyServerRoom does not attempt any local rollback on rejection - the Realtime broadcast is left to correct the board regardless of how apply-move responds, per RESEARCH.md Pattern 3 established in 02-08"

patterns-established:
  - "Client-side legal-move filtering (dispatchMove's early return on result.error) is deliberately kept even though the server re-validates every move - it makes D-11's races rare and gives instant feedback for the common case; T-02-33 accepts a bypassed client check as harmless since the server is the actual control"

requirements-completed: [MPLAY-04, MPLAY-05]

# Metrics
duration: unknown (spans a prior interrupted session plus this one)
completed: 2026-07-28
---

# Phase 02 Plan 09: Optimistic Dispatch and Server-Authoritative Persistence Summary

**`dispatchMove` now applies a legal move locally for instant feedback, then submits it to the `apply-move` Edge Function instead of writing to `localStorage`; `GameContext` gained `applyServerRoom` (always snap to the server's version) and `notifyReconciled` (the distinct D-12 toast), and every remaining client-side game-state write is gone.**

## Performance

- **Tasks:** 2/2
- **Files modified:** 4 (2 created, 2 modified)

## Accomplishments

- `useGameStateUpdater` (renamed export `submitMove`) invokes `apply-move` via `getSupabaseClient().functions.invoke(...)` instead of `window.storage.set(...)`; the `testMode` short-circuit and the CR-02 try/catch-to-`showToast` contract both carry over unchanged
- Transport failures keep the existing generic failure copy; server-side `EdgeResult.error` rejections use the UI-SPEC reconciliation copy with `variant: 'reconcile'`
- `GameContext.dispatchMove` keeps its local `applyMove` call and early return on an illegal move, then calls `submitMove(move, result.state)` without awaiting it
- `setGameState` no longer writes to `window.storage` in any mode - the only write path left in the client is the Edge Function
- `applyServerRoom(room)` ignores any payload at or below the last-applied version (T-02-32) and otherwise replaces `gameState` and records `roomVersion`/`turnStartedAt`
- `notifyReconciled()` raises the D-12 amber reconciliation toast using `'RECONCILED'` as a client-side sentinel, not an addition to the engine's closed `ERROR_CODES`

## Task Commits

1. **Task 1: Replace the storage write in `useGameStateUpdater` with an `apply-move` invocation** - `cdc7d93` (test), `06fb3ef` (feat)
2. **Task 2: Optimistic dispatch and server-room application in `GameContext` (MPLAY-05, D-11, D-12)** - `c82bdf3` (test), `106b570` (feat)

_Both tasks were `tdd="true"` - failing tests were committed first, then the implementation._

## Files Created/Modified

- `src/hooks/useGameState.ts` - `submitMove` replaces the storage write with an `apply-move` invocation, keeping the `testMode` short-circuit and CR-02 error contract
- `src/context/GameContext.tsx` - optimistic `dispatchMove`, `applyServerRoom`, `notifyReconciled`, `roomVersion`/`turnStartedAt` exposed on `GameContextValue`; `setGameState` no longer writes to storage
- `src/__tests__/hooks/useGameState.test.ts` - 6 tests covering all five specified `submitMove` behaviours plus the zero-network-calls Test Mode assertion
- `src/__tests__/context/GameContext.test.tsx` - 7 tests covering all seven specified `GameContext` behaviours

## Decisions Made

See `key-decisions` above. Nothing beyond the plan's own `<action>` text was needed - the existing "compute `applyMove` locally, toast on error, else write" structure in `GameContext` was already the right shape (per `02-PATTERNS.md`) and only needed extending, not reinventing.

## Deviations from Plan

**1. [Rule 1 - Bug] Stale comment referencing the removed `window.storage.set` path**
- **Found during:** final acceptance-criteria check (`grep -c 'window.storage' src/context/GameContext.tsx` returned 1, not the required 0)
- **Issue:** The comment above `setGameState` still described it as replacing "duplicating `window.storage.set` calls", left over from Phase 1 - misleading now that the function performs no storage write of any kind
- **Fix:** Reworded the comment to describe `setGameState` as the local-state setter, with no reference to the removed call
- **Files modified:** `src/context/GameContext.tsx`
- **Verification:** `grep -c 'window.storage' src/context/GameContext.tsx` now returns 0; both task test files still pass

**Total deviations:** 1 auto-fixed (Rule 1 - stale comment, no behavioural change)

## Issues Encountered

- **Two pre-existing worktree copies of this plan** - an earlier session's attempt (`useGameStateUpdater`-renamed test only, branched before plans 02-05 through 02-08 existed) was found alongside this one during resume. It was superseded and discarded; this worktree (branched from the post-02-08 tip) is the one carried to completion.
- **`npm test -- --run` (full suite) has 2 known failures, both in `src/__tests__/screens/MenuScreen.test.tsx`** ("Create Room generates a well-formed... room code (WR-03)" and "Join on a valid, waiting room... (WR-02)"). Both assert the legacy `window.storage`-based room-creation contract that `MenuScreen.tsx` still uses - that screen has not been rewired to the `create-room`/`join-room` Edge Functions yet. **This is expected fallout, not a regression introduced by this plan's own files**: plan `02-10` (`depends_on: ["02-04", "02-05", "02-08", "02-09"]`) explicitly rewires `MenuScreen.tsx` onto `functions.invoke('create-room'/'join-room')` and updates `MenuScreen.test.tsx` to match. `02-09`'s own `files_modified` scope (`useGameState.ts`, `GameContext.tsx` and their tests) does not include `MenuScreen.tsx`, so fixing it here would be scope creep ahead of its dependent plan. Flagged for 02-10 rather than fixed here.
- `npm run build` exits 0; `npm run lint` was not run as part of this plan's own verification (not listed in its `<verification>` block) and is tracked separately per `deferred-items.md`.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- `applyServerRoom` and `notifyReconciled` are ready for `02-10`/`02-11` to wire `useRoomSubscription`'s `onServerRoom`/`onReconciled` callbacks into
- `roomVersion`/`turnStartedAt` are exposed on `GameContextValue` for the turn-timeout check due in a later wave
- **Known gap for 02-10:** the 2 failing `MenuScreen.test.tsx` tests above must be resolved as part of that plan's own rewrite, not treated as a new regression to investigate

---
*Phase: 02-real-cross-device-multiplayer*
*Completed: 2026-07-28*
