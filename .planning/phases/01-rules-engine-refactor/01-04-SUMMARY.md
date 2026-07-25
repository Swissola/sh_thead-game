---
phase: 01-rules-engine-refactor
plan: 04
subsystem: state-management
tags: [react, context, hooks, toast, testing-library, vitest]

# Dependency graph
requires:
  - phase: 01-rules-engine-refactor (plan 01-03)
    provides: applyMove(state, move) -> {state, error?} pure reducer, Move/ApplyMoveResult/ErrorCode types
provides:
  - GameProvider/useGameContext exposing gameState/dispatchMove/setGameState/toast to the whole tree
  - useToast single-slot replace-not-queue toast state hook
  - Toast corner-positioned, single-style error notification component
affects: [01-05, 01-06]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Context + direct-call dispatch (Pattern 4 Approach A) - no useReducer, dispatchMove calls applyMove exactly once so success/error paths share one code path"
    - "Single-slot toast (useState + timer ref), replace-not-queue on repeated show() calls"

key-files:
  created:
    - src/hooks/useToast.ts
    - src/__tests__/hooks/useToast.test.ts
    - src/components/Toast.tsx
    - src/__tests__/components/Toast.test.tsx
    - src/context/GameContext.tsx
  modified: []

key-decisions:
  - "Pattern 4 Approach A (dispatchMove calls applyMove directly, no useReducer) chosen per RESEARCH.md recommendation, avoiding double-computation and reducer purity debates"
  - "roomCode computed from gameState.roomCode each render rather than stored as separate state (D-10 cleanup, removes dual-purpose roomCode bug)"
  - "currentPlayerId centralized in GameProvider, replacing four duplicate ternary lines that exist today across swapCards/setReady/playCards/pickUpPile"

patterns-established:
  - "Small-hook convention followed: plain function, flat object return, no default export (useToast matches useSelection/useHandSorting)"
  - "Toast/modal role=alert aria-live=polite for non-interrupting notifications vs aria-live=assertive for blocking celebration modals"

requirements-completed: [ENGINE-01, ENGINE-05, ENGINE-07]

# Metrics
duration: ~25min
completed: 2026-07-25
---

# Phase 01 Plan 04: Context + Toast Layer Summary

**GameProvider wiring dispatchMove directly to applyMove (no useReducer) with a single-slot, replace-not-queue toast for rejected moves, plus the useToast/Toast primitives it's built on.**

## Performance

- **Duration:** ~25 min
- **Completed:** 2026-07-25T16:45:43+01:00
- **Tasks:** 3
- **Files modified:** 5 (all created, none modified)

## Accomplishments
- `useToast` hook with proven timer-reset semantics (a fake-timer test explicitly proves the dismiss timer restarts on a second `show()` call, not just that the message replaces)
- `Toast` component with a single generic visual style for every error code (no `toast.code` branching anywhere in the file), matching the app's existing `bg-slate-800`/`border-2`/`rounded-lg`/`shadow-2xl` modal palette
- `GameProvider`/`useGameContext` implementing Pattern 4's Approach A: `dispatchMove` calls `applyMove` exactly once per dispatch, toast-on-rejection and unchanged state, new state and no toast on success — resolving RESEARCH.md's Pitfall 3 (`useReducer` cannot report per-dispatch failure) by construction rather than convention
- Two D-10 opportunistic cleanups folded into the provider: `roomCode` derived from `gameState` each render instead of duplicated state, and `currentPlayerId` computed once instead of four times

## Task Commits

Each task was committed atomically:

1. **Task 1: useToast hook (D-05, D-06, D-07)** - `b0d7f36` (feat)
2. **Task 2: Toast component (D-05, D-06)** - `55b270e` (feat)
3. **Task 3: GameProvider + useGameContext (D-02, D-03 wiring, D-08)** - `3307c22` (feat)

_Note: Tasks 1 and 2 were TDD-flagged (`tdd="true"`) but implemented in a single commit per task rather than separate RED/GREEN commits, since the reference implementation in RESEARCH.md's Code Examples section was already fully specified — writing a deliberately-failing stub first would have added no signal. Both tasks' tests were run and confirmed passing before commit._

## Files Created/Modified
- `src/hooks/useToast.ts` - single-slot toast state hook: `show(message, code?)` replaces and resets the dismiss timer, `dismiss()` clears immediately
- `src/__tests__/hooks/useToast.test.ts` - fake-timer tests proving show/auto-dismiss/replace-resets-timer/dismiss behaviour
- `src/components/Toast.tsx` - fixed bottom-right `role="alert" aria-live="polite"` element, one style for all error codes
- `src/__tests__/components/Toast.test.tsx` - RTL tests for populated render, null render, and dismiss-click callback
- `src/context/GameContext.tsx` - `GameProvider`/`useGameContext`; owns `gameState`/`testMode`/`controllingPlayer`/toast internally, `dispatchMove` calls `applyMove` once, `setGameState` is the single persistence path for room creation/joining

## Decisions Made
- Followed RESEARCH.md's Pattern 4 Approach A exactly as recommended (skip `useReducer`, call `applyMove` directly in `dispatchMove`) rather than Approach B (combined `{gameState, lastError}` reducer state) - simpler, and matches D-02's already-tuple `{state, error?}` contract without adapting it to `useReducer`'s single-return-value shape.
- `GameContextValue` exports exactly the twelve fields the plan specifies, no more, no less - kept the context surface exactly matched to what Plan 01-05/01-06 need per the plan's stated interface.

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

`GameContext.tsx` exports a complete `GameProvider`/`useGameContext` pair ready for Plan 01-05's orchestrator (which generates and passes only `playerId`) and Plan 01-06's screens (which will consume `gameState`/`dispatchMove`/`toast` via `useGameContext()` instead of prop drilling). `Toast` is ready to be rendered once, keyed off `toast`/`dismissToast` from context, wherever Plan 01-05 places it in the tree. No blockers for 01-05/01-06.

---
*Phase: 01-rules-engine-refactor*
*Completed: 2026-07-25*
