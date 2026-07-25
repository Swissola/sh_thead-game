---
phase: 01-rules-engine-refactor
plan: 03
subsystem: api
tags: [vitest, typescript, reducer, rules-engine, tdd]

# Dependency graph
requires:
  - phase: 01-rules-engine-refactor (Plan 01-02)
    provides: applyMove.ts skeleton with READY_UP/SWAP_CARDS/PICK_UP_PILE implemented, moves.ts Move union, errors.ts ERROR_CODES, buildGameState.ts test fixtures
provides:
  - Complete applyMove(state, move) reducer - all four Move types (READY_UP, SWAP_CARDS, PICK_UP_PILE, PLAY_CARDS) fully implemented
  - PLAY_CARDS case covering ordinary plays, multi-card same-rank plays, burning (10s and four-of-a-kind), draw-to-3 fill-then-extend, win/game-over detection, blind face-down plays (valid and invalid-picks-up-pile), mixed hand+faceUp plays, first-turn rank validation, and reorderedHand support
  - Exhaustive PLAY_CARDS test matrix (22 tests) proving zero input-state mutation at every one of the five original App.tsx direct-mutation sites
affects: [01-04 (GameProvider wiring), 01-06 (GameScreen dispatchMove integration)]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Fresh-array-before-index-assignment for every touched player array (hand/faceUp/faceDown), closing RESEARCH.md Pitfall 1 at all five original mutation sites"
    - "Fill-null-slots-then-extend loop (shared by draw-fill and blind-fail-refill) matching the pattern already used in applyPickUpPile"
    - "effectiveHand = move.reorderedHand ?? player.hand threaded through every hand-index resolution/mutation site in the function, never falling back to player.hand once supplied"

key-files:
  created: []
  modified:
    - src/engine/applyMove.ts
    - src/__tests__/engine/applyMove.test.ts

key-decisions:
  - "Simplified the blind-fail refill and draw-fill loops to a single 'fill next null slot, else push' pattern rather than porting App.tsx's more convoluted handIndex-tracking loop verbatim - traced both against several fixtures and confirmed identical output; the simpler form matches applyPickUpPile's existing pattern in this same file, reducing duplication without behavior change."
  - "First-turn rank validation applies unconditionally (including to blind plays) since the plan bullet specifies no exception and the codebase has no scenario where isFirstTurn and a blind play co-occur in practice."

patterns-established:
  - "PLAY_CARDS rejection order: WRONG_PHASE -> NOT_YOUR_TURN -> NO_SELECTION -> INVALID_COMBINATION (mixed-source gate) -> INVALID_SELECTION (bounds/null) -> FIRST_TURN_INVALID -> INVALID_PLAY (non-blind only) -> mutation. Blind plays skip the INVALID_PLAY pre-check and instead branch post-mutation into either the pickup-pile outcome or the normal burn/draw/win outcome."

requirements-completed: [ENGINE-01, ENGINE-02, ENGINE-07]

# Metrics
duration: 25min
completed: 2026-07-25
---

# Phase 1 Plan 3: Complete applyMove's PLAY_CARDS Case Summary

**Ported App.tsx's 370-line `playCards` handler into a pure `applyPlayCards` reducer case with zero input mutation at all five original bug sites, backed by a 22-test PLAY_CARDS matrix.**

## Performance

- **Duration:** ~25 min
- **Started:** 2026-07-25T15:14:00Z (approx, per session start)
- **Completed:** 2026-07-25T15:40:01Z
- **Tasks:** 2 (RED, GREEN)
- **Files modified:** 2

## Accomplishments
- `applyMove.ts` now implements all four `Move` types in full - `PLAY_CARDS` was the last stub, and the widest surface for the direct-mutation bug RESEARCH.md's Pitfall 1 identified
- 22 new `it(...)` blocks under `describe('applyMove - PLAY_CARDS')`, covering every bullet in the plan's `<behavior>` spec plus every distinct rejection reason in the closed `ERROR_CODES` set
- Full test suite (114 tests across 10 files) and `tsc --noEmit` both pass with zero regressions to the READY_UP/SWAP_CARDS/PICK_UP_PILE tests from Plan 01-02

## Task Commits

Each task was committed atomically (TDD RED/GREEN):

1. **Task 1 (RED): Write exhaustive failing tests for PLAY_CARDS** - `c9e286c` (test)
2. **Task 2 (GREEN): Implement applyMove's PLAY_CARDS case** - `c752d7d` (feat)

_No REFACTOR commit needed - the implementation was already clean on first pass (verified via `manual source check` in acceptance criteria)._

## Files Created/Modified
- `src/engine/applyMove.ts` - Replaced `applyPlayCardsStub` with the real `applyPlayCards(state, move, playerIndex)`, wired into the `PLAY_CARDS` switch case. Implements: turn/phase/selection guards, `effectiveHand` resolution (reorderedHand override), mixed hand+faceUp gating via `GameLogic.canPlayMixedSources`, bounds/null selection checks, first-turn rank validation via `GameLogic.getStartingCard`, non-blind validation via `GameLogic.canPlayMultipleCards`, fresh-array mutation of hand/faceUp/faceDown, the blind-play-fails pickup-pile branch, and the burn/draw/win sequencing (`GameLogic.shouldBurnPile`/`getPlayResult`/`getCardsToDrawCount`/`hasPlayerWon`/`isGameOver`/`getNextPlayer`).
- `src/__tests__/engine/applyMove.test.ts` - Added `describe('applyMove - PLAY_CARDS')` with 22 tests: valid single/multi-card plays, burn via 10, burn via four-of-a-kind, draw-to-3, win/game-over, blind valid/invalid plays, mixed hand+faceUp valid/rejected (deck>0, non-hand source), first-turn reject/accept, reorderedHand override, and all six rejection codes (NOT_YOUR_TURN, WRONG_PHASE, NO_SELECTION, INVALID_PLAY, INVALID_SELECTION x2, UNKNOWN_PLAYER), plus the empty-deck edge case.

## Decisions Made
- Simplified the blind-fail-refill and draw-fill array-filling loops to a single shared "fill next null slot, else push" pattern instead of porting `App.tsx`'s more convoluted `handIndex`-tracking loop verbatim. Traced both algorithms against several fixture shapes (including hands with pre-existing gaps) and confirmed identical output in every case; the simpler form also matches the pattern already used by `applyPickUpPile` in this same file (added in Plan 01-02), avoiding a second implementation of the same fill semantics.
- First-turn rank validation (`FIRST_TURN_INVALID`) applies unconditionally, including when `isBlindPlay` is true - the plan's action bullet specifies no exception for blind plays, and there's no realistic in-game scenario where a player has zero hand/faceUp cards (forcing a blind play) yet it's also the very first turn of the game.

## Deviations from Plan

None - plan executed exactly as written. No stubs remain in `src/engine/applyMove.ts` (confirmed via grep for `applyPlayCardsStub`/`TODO(01-03)` - zero matches).

## Issues Encountered

None.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- `applyMove.ts` is complete and ready for Plan 01-04 to wire into a `GameProvider` (Context-based state per D-08).
- All four `Move` types verified mutation-free per D-11's exhaustive per-move-type test matrix; this is the security boundary Phase 2's server-side authority will reuse unchanged.
- No blockers.

---
*Phase: 01-rules-engine-refactor*
*Completed: 2026-07-25*
