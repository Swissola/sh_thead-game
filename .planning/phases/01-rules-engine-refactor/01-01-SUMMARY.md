---
phase: 01-rules-engine-refactor
plan: 1
subsystem: testing
tags: [vitest, testing-library, jest-dom, typescript, refactor]

# Dependency graph
requires: []
provides:
  - RTL test infrastructure (setupFiles wired, jest-dom global matchers)
  - buildCard/buildPlayer/buildGameState fixture builders for future test suites
  - gameLogic.ts as the single implementation of hand-sort, rank-share, deck-creation logic
  - Move discriminated union and MoveError/ErrorCode/ApplyMoveResult contract types
affects: [01-02, 01-03, 01-06]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Fixture builder functions (buildX) with Partial<T> overrides merged via spread, matching src/types.ts interfaces exactly"
    - "Closed, exhaustive error-code registry (ERROR_CODES const + derived ErrorCode union) rather than ad hoc string literals"

key-files:
  created:
    - src/test-setup.ts
    - src/__tests__/testUtils/buildGameState.ts
    - src/__tests__/testUtils/buildGameState.test.ts
    - src/__tests__/gameLogic/dedup.test.ts
    - src/engine/moves.ts
    - src/engine/errors.ts
  modified:
    - vitest.config.ts
    - src/gameLogic.ts
    - src/__tests__/utils/deck.test.ts

key-decisions:
  - "sortHand/canAddToSelection implementations copied verbatim from Hand.tsx's existing comparator body (byte-for-byte duplicate of App.tsx's), not rewritten, per plan instruction to avoid subtle divergence"
  - "App.tsx/Hand.tsx/Table.tsx keep their old inline copies for now - removal deferred to Plan 01-06 once callers are rewired to the new gameLogic.ts exports"

patterns-established:
  - "Pattern 1: Test fixture builders live in src/__tests__/testUtils/ and export buildX(overrides) functions merging Partial<T> onto defaults"
  - "Pattern 2: engine/ contract files (moves.ts, errors.ts) define types only - no implementation - ahead of the reducer that will consume them"

requirements-completed: [ENGINE-01, ENGINE-04, ENGINE-07]

# Metrics
duration: 15min
completed: 2026-07-25
---

# Phase 1 Plan 1: Test Infrastructure, gameLogic Dedup, applyMove Contract Summary

**RTL test harness wired, gameLogic.ts gains createDeck/shuffleDeck/sortHand/canAddToSelection as the single implementation, and src/engine/{moves,errors}.ts define the Move/ErrorCode contract for applyMove**

## Performance

- **Duration:** ~15 min
- **Started:** 2026-07-25T15:05:00Z (approx)
- **Completed:** 2026-07-25T15:20:05Z
- **Tasks:** 3
- **Files modified:** 9

## Accomplishments
- `setupFiles` wired to `src/test-setup.ts`, giving every test file `@testing-library/jest-dom` matchers without a per-file import
- `buildCard`/`buildPlayer`/`buildGameState` fixture builders created and tested, ready for later plans' engine/screen tests
- `gameLogic.ts` extended with `createDeck`, `shuffleDeck`, `sortHand`, `canAddToSelection` — the four dedup targets research identified — with `deck.test.ts` rewritten to import the real functions instead of a private copy
- `src/engine/moves.ts` and `src/engine/errors.ts` define the closed `Move` union, `ErrorCode`/`MoveError`/`ApplyMoveResult` contract Plan 01-02/01-03 will implement `applyMove` against

## Task Commits

Each task was committed atomically:

1. **Task 1: Wire RTL test infrastructure and a shared GameState fixture builder** - `9504359` (feat)
2. **Task 2: Dedupe hand-sort, rank-share, and deck-creation logic into gameLogic.ts** - `83b85a1` (refactor)
3. **Task 3: Define the applyMove contract — Move union and error codes** - `cf0828a` (feat)

**Plan metadata:** pending (this SUMMARY.md commit, made by the orchestrator after wave completion in worktree mode)

## Files Created/Modified
- `vitest.config.ts` - `setupFiles: ['./src/test-setup.ts']`
- `src/test-setup.ts` - global `@testing-library/jest-dom` import
- `src/__tests__/testUtils/buildGameState.ts` - `buildCard`/`buildPlayer`/`buildGameState` fixture builders
- `src/__tests__/testUtils/buildGameState.test.ts` - tests for the fixture builders
- `src/gameLogic.ts` - added `createDeck`, `shuffleDeck`, `sortHand`, `canAddToSelection`
- `src/__tests__/gameLogic/dedup.test.ts` - tests for `sortHand` (original/rank/suit modes, null-slot handling) and `canAddToSelection`
- `src/__tests__/utils/deck.test.ts` - rewritten to import real `createDeck`/`shuffleDeck` from `gameLogic.ts`
- `src/engine/moves.ts` - `Move` discriminated union, `MoveError`, `ApplyMoveResult`
- `src/engine/errors.ts` - `ERROR_CODES` closed set (9 codes) + `ErrorCode` type

## Decisions Made
- Copied `sortHand`'s rank/suit comparator logic verbatim from `Hand.tsx:91-108` (identical to `App.tsx:562-579`) rather than writing new comparator logic, per the plan's explicit "copy one of those two comparator bodies, do not write a new one" instruction — guarantees byte-identical sort behaviour to what's live today.
- `canAddToSelection`'s semantics (`selected.every(c => c.rank === candidate.rank)`) match the four inline "shares a rank" checks in `Hand.tsx`/`Table.tsx`, which compare against the whole current selection's resolved rank rather than just the first element.
- Left `App.tsx`/`Hand.tsx`/`Table.tsx`'s inline duplicate implementations untouched — the plan's `<done>` criterion for Task 2 explicitly says this is expected, not a regression, with removal deferred to Plan 01-06 once callers are rewired to call the new `gameLogic.ts` exports.

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None. The worktree branch (`worktree-agent-a09710a46b6f3aa5d`) started well behind the expected phase-plan base commit (`6dadb3b`, at an ancestor several commits back); corrected via the sanctioned `git reset --hard` recovery step defined in the branch check before any plan work began. Working tree was clean at that point, so no work was lost.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness
- `deck.test.ts` and the new `dedup.test.ts` exercise the real `gameLogic.ts` implementations; `App.tsx`/`Hand.tsx`/`Table.tsx` still hold inline duplicates awaiting Plan 01-06's rewiring — expected, not a blocker.
- `src/engine/moves.ts`/`errors.ts` typecheck cleanly with zero consumers; Plan 01-02/01-03 can implement `applyMove.ts` against this contract without further negotiation.
- `buildGameState`/`buildPlayer`/`buildCard` fixture builders are available for all downstream engine and screen test suites in this phase.

---
*Phase: 01-rules-engine-refactor*
*Completed: 2026-07-25*

## Self-Check: PASSED

All 9 files created/modified in this plan verified present on disk. All 4 commit hashes (9504359, 83b85a1, cf0828a, a593f9f) verified present in `git log`.
