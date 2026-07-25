---
phase: 01-rules-engine-refactor
plan: 2
subsystem: engine
tags: [reducer, tdd, vitest, typescript, immutability]

# Dependency graph
requires:
  - phase: 01-rules-engine-refactor (Plan 01-01)
    provides: Move discriminated union, ErrorCode registry, buildGameState/buildPlayer/buildCard fixture builders
provides:
  - "applyMove(state, move) -> {state, error?} with READY_UP, SWAP_CARDS, PICK_UP_PILE fully implemented"
  - "Exhaustive D-11 test matrix (18 tests) proving no-mutation and correct-rejection guarantees for the three implemented move types"
  - "A PLAY_CARDS stub case so the switch compiles and Plan 01-03 has a clear extension point"
affects: [01-03, 01-06, 01-07]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Per-move-type applyXxx helper functions dispatched from a single applyMove switch, each returning {state} or {state, error}"
    - "D-11/ENGINE-02 test assertion pair on every test: reference-inequality (result.state).not.toBe(inputState) on success, reference-equality on rejection, plus structuredClone-based unchanged-input snapshot"

key-files:
  created:
    - src/engine/applyMove.ts
    - src/__tests__/engine/applyMove.test.ts
  modified: []

key-decisions:
  - "SWAP_CARDS resolves sourceA/sourceB to hand or faceUp only; faceDown returns INVALID_SELECTION since swapping isn't supported there, per the plan's explicit action text"
  - "Same-source swap (sourceA === sourceB) copies exactly one array and mutates both indices within it, rather than copying twice and losing one side of the swap - verified via grep in Task 2's acceptance criteria"
  - "PICK_UP_PILE's fill-nulls-then-extend/revealedFaceDownIndex unshift logic ported verbatim from App.tsx:871-924 (confirmPickUpPile), minus the animation/persistence tail which stays App.tsx's/GameScreen's concern"

patterns-established:
  - "Pattern: every applyXxx helper builds every touched array/object fresh ([...array] before any index-assignment) - never index-assigns into an array obtained via {...player} alone"

requirements-completed: [ENGINE-01, ENGINE-02, ENGINE-07]

# Metrics
duration: ~20min
completed: 2026-07-25
---

# Phase 1 Plan 2: applyMove READY_UP/SWAP_CARDS/PICK_UP_PILE Summary

**Built and TDD-verified three of applyMove's four move-type cases (READY_UP, SWAP_CARDS, PICK_UP_PILE) with an exhaustive 18-test D-11 matrix proving no state mutation at any level and correct rejection for every distinct error path**

## Performance

- **Duration:** ~20 min
- **Tasks:** 2
- **Files modified:** 2 (both created)

## Accomplishments
- `src/engine/applyMove.ts` implements `READY_UP`, `SWAP_CARDS` (hand<->faceUp, hand<->hand, faceUp<->faceUp), and `PICK_UP_PILE` as pure, non-mutating handlers dispatched from a single `applyMove(state, move)` switch
- `PLAY_CARDS` is a clearly-marked stub (`applyPlayCardsStub`, `// TODO(01-03)` comment) returning `INVALID_PLAY` so the switch compiles and Plan 01-03 has an obvious extension point
- 18 tests in `src/__tests__/engine/applyMove.test.ts` cover the valid case plus every distinct rejection reason for all three move types (4 READY_UP, 8 SWAP_CARDS, 6 PICK_UP_PILE), each asserting both the correct outcome and the D-11/ENGINE-02 unchanged-input-state guarantee
- Full suite (92 tests across 10 files) green with no regressions; `tsc --noEmit` clean

## Task Commits

Each task was committed atomically (TDD RED -> GREEN):

1. **Task 1 (RED): Write exhaustive failing tests for READY_UP, SWAP_CARDS, PICK_UP_PILE** - `bd04540` (test)
2. **Task 2 (GREEN): Implement applyMove's READY_UP, SWAP_CARDS, PICK_UP_PILE cases** - `cd75fa7` (feat)

**Plan metadata:** pending (this SUMMARY.md commit, made by the orchestrator after wave completion in worktree mode)

## Files Created/Modified
- `src/__tests__/engine/applyMove.test.ts` - 18 tests: `describe('applyMove - READY_UP')` (4), `describe('applyMove - SWAP_CARDS')` (8, including an unsupported-`faceDown`-source case beyond the plan's minimum), `describe('applyMove - PICK_UP_PILE')` (6)
- `src/engine/applyMove.ts` - `applyMove` dispatcher plus `applyReadyUp`, `applySwapCards`, `applyPickUpPile`, `applyPlayCardsStub` helpers

## Decisions Made
- Added a ninth SWAP_CARDS test (`sourceA: 'faceDown'` rejects `INVALID_SELECTION`) beyond the plan's `<behavior>` minimum, because Task 2's `<action>` explicitly calls for rejecting any `CardSource` other than `hand`/`faceUp` - locking this down in the RED-phase test suite rather than leaving it unasserted.
- Task 1's RED-phase stub (`applyMove` throwing `'applyMove not yet implemented'`) was kept fully typed against the real `Move`/`ApplyMoveResult`/`GameState` types rather than an untyped `function applyMove(){}`, since the codebase's strict TypeScript config would otherwise fail `tsc --noEmit` on the test file's typed call sites before Task 2 ever ran.
- `applyPickUpPile`'s `revealedFaceDownIndex` handling adds a `revealedCard` truthiness check (not present verbatim in `App.tsx:882-887`) before unshifting, since the ported logic must tolerate a caller-supplied index pointing at an already-null `faceDown` slot without corrupting `cardsToAdd` - a direct application of Rule 2 (input validation on untrusted move payload indices, per the plan's own threat model T-01-02).

## Deviations from Plan

None beyond the two decisions noted above, both within Rule 1/Rule 2 auto-fix scope (input validation on untrusted indices; locking down an already-specified-but-untested rejection path) and consistent with the plan's own `<action>` text and threat model.

## Issues Encountered

None. Worktree HEAD was found on an unrelated branch tip (`d606485`, several commits ahead on a different feature) rather than the expected phase-plan base commit at agent startup; the working tree was clean, so the sanctioned `git reset --hard d7538a65a61df76f6e0fdac04a6c785b229fd74e` recovery step corrected it before any plan work began. No work was lost.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness
- `applyMove.ts` is ready for Plan 01-03 to extend with the real `PLAY_CARDS` case, replacing `applyPlayCardsStub` entirely (its `// TODO(01-03)` comment marks the exact extension point).
- The `applyXxx` per-move-type helper pattern and the D-11 test-assertion pair (reference-(in)equality plus `structuredClone` snapshot) are established and ready to be reused for `PLAY_CARDS`'s more complex test matrix (burn/draw/win sequencing, blind plays, mixed-source plays).
- `Hand.tsx`/`Table.tsx`'s inline hand<->hand and faceUp<->faceUp swap logic (RESEARCH.md Pattern 3 site 4) can now be rewired to dispatch `SWAP_CARDS` moves through this reducer in Plan 01-07, since `applySwapCards` already covers both same-source cases.

---
*Phase: 01-rules-engine-refactor*
*Completed: 2026-07-25*

## Self-Check: PASSED

Both files created in this plan verified present on disk (`src/engine/applyMove.ts`, `src/__tests__/engine/applyMove.test.ts`), plus the SUMMARY.md itself. All 3 commit hashes (`bd04540`, `cd75fa7`, `879abcd`) verified present in `git log`.
