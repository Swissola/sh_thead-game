---
phase: 01-rules-engine-refactor
plan: 07
subsystem: ui
tags: [react, vitest, testing-library, react-context, tdd, game-board]

# Dependency graph
requires:
  - phase: 01-rules-engine-refactor (Plan 01-06)
    provides: Full GameScreen.tsx composing Table/Hand with swapCards/updateGameState adapter props marked TODO(01-07)
provides:
  - "Hand.tsx and Table.tsx read dispatchMove/currentPlayerId from useGameContext() directly - no more swapCards/updateGameState/currentPlayerId adapter props"
  - "Hand.tsx's inline hand-sort comparator replaced with GameLogic.sortHand; all four inline rank-share checks replaced with GameLogic.canAddToSelection"
  - "Hand<->hand, hand<->faceUp, and faceUp<->faceUp setup-phase swaps all dispatch SWAP_CARDS through applyMove - the fourth rule-duplication site RESEARCH.md identified is closed"
  - "GameScreen.test.tsx extended with three D-12 interaction tests covering all three setup-phase swap combinations"
affects: []

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Component-level useGameContext() consumption for dispatch/identity concerns (Hand.tsx, Table.tsx) rather than prop-drilling from GameScreen - mirrors GameScreen's own consumption pattern from Plan 01-06"
    - "DOM-order/textContent-based RTL assertions for swap interactions (no dedicated data-testid needed) - data-card-key/data-faceup-index wrapper attributes already present from Plan 01-06 were sufficient to observe post-swap card identity"

key-files:
  created: []
  modified:
    - src/components/Hand.tsx
    - src/components/Table.tsx
    - src/screens/GameScreen.tsx
    - src/__tests__/screens/GameScreen.test.tsx

key-decisions:
  - "Table.tsx now sources currentPlayerId from useGameContext() rather than keeping it as a prop, for consistency with Hand.tsx's identical choice (the plan explicitly left this open, 'pick one and apply it uniformly'). GameScreen.tsx no longer passes currentPlayerId to either component."
  - "resolvedHandSelection/resolvedFaceUpSelection (the arrays passed to GameLogic.canAddToSelection) are computed once per render pass - in Hand.tsx inside the sortedCards IIFE (mirroring the existing structure), in Table.tsx at the top of the component body - rather than recomputed per-card inside the .map, avoiding the plan's literal per-item recomputation without changing behavior."
  - "Declined to run `npx prettier --write` on Hand.tsx/Table.tsx after editing: the project's .prettierrc specifies tabWidth:2, but the pre-existing files (and the rest of the components directory) are consistently 4-space indented, meaning prettier has never actually been run against this codebase. Running it would have produced a ~900-line reformatting diff unrelated to this plan's actual change. Edits were made by hand, preserving the existing 4-space style; this is out of this plan's scope to fix project-wide."

requirements-completed: [ENGINE-01, ENGINE-02, ENGINE-04, ENGINE-07]

# Metrics
duration: ~30min
completed: 2026-07-25
---

# Phase 01 Plan 07: Hand/Table Rewire Summary

**Closed the last rule-duplication site (Hand.tsx/Table.tsx's hand<->hand and faceUp<->faceUp swap logic) by routing every card swap through dispatchMove's SWAP_CARDS case, and replaced the remaining inline sort/rank-share duplication with gameLogic.ts calls.**

## Performance

- **Duration:** ~30 min
- **Started:** 2026-07-25T19:36:00Z (worktree base reset to wave-6 tip)
- **Completed:** 2026-07-25T20:05:54Z
- **Tasks:** 2 completed
- **Files modified:** 4 (0 created, 4 modified)

## Accomplishments

- `Hand.tsx` and `Table.tsx` no longer accept `swapCards`/`updateGameState` props at all, and `currentPlayerId` is now sourced from `useGameContext()` in both (rather than being a prop) - both components read `dispatchMove`/`currentPlayerId` directly
- `Hand.tsx`'s inline `cardsWithIndices`/sort-comparator block (the hand-sort duplication RESEARCH.md flagged) is now a single `GameLogic.sortHand(player.hand, handSortMode)` call
- All four inline "shares a rank" checks (two in `Hand.tsx` - tooltip and selectable; two in `Table.tsx` - isPlayable and tooltip) now call `GameLogic.canAddToSelection`
- Every setup-phase swap path - hand<->hand, hand<->faceUp (from either component), and faceUp<->faceUp - dispatches a `SWAP_CARDS` move through `applyMove` instead of building a new `gameState` and calling `updateGameState` directly. This was the fourth and final rule-duplication site RESEARCH.md identified for the phase.
- `GameScreen.tsx`'s `swapCards` adapter function and the `updateGameState={(newState) => setGameState(newState)}` props (both marked `TODO(01-07)` since Plan 01-06) are removed; `setGameState` is no longer destructured from context since nothing in `GameScreen.tsx` calls it any more
- `GameScreen.test.tsx` gained three new interaction tests (hand-hand, hand-faceUp, faceUp-faceUp swap), each seeding known card identities and asserting the post-swap arrangement via DOM order (`data-card-key` sequence) or rendered rank/suit text (`data-faceup-index` content) - a real `applyMove` round-trip per D-12, not a mocked dispatch
- Full phase test suite: 139/139 tests passing across 16 files; `npx tsc --noEmit` exits 0; zero remaining `TODO(01-07)` markers in `src/`

## Task Commits

1. **Task 1: Rewire Hand.tsx/Table.tsx - dedup + SWAP_CARDS dispatch** - `56d4b04` (feat)
2. **Task 2: Update GameScreen's prop-passing, extend swap interaction coverage** - `2f76cbc` (test)

## Files Created/Modified

- `src/components/Hand.tsx` - Removed `swapCards`/`updateGameState`/`currentPlayerId` props; added `useGameContext()` consumption; replaced inline sort with `GameLogic.sortHand`; replaced two inline rank-share checks with `GameLogic.canAddToSelection`; replaced the inline hand<->hand `updateGameState` block with a `dispatchMove({type:'SWAP_CARDS', ...})` call, and the existing hand<->faceUp `swapCards(...)` prop call with the equivalent inline `dispatchMove` call
- `src/components/Table.tsx` - Removed `swapCards`/`updateGameState`/`currentPlayerId` props (added `useGameContext()` for `dispatchMove`/`currentPlayerId` instead); replaced two inline rank-share checks with `GameLogic.canAddToSelection`; replaced the inline faceUp<->faceUp `updateGameState` block and the hand<->faceUp `swapCards(...)` call with `dispatchMove({type:'SWAP_CARDS', ...})` calls
- `src/screens/GameScreen.tsx` - Removed the local `swapCards` adapter function and the `swapCards`/`updateGameState` props passed to `<Table>`/`<Hand>` (including the `currentPlayerId` prop, now sourced internally by both components); removed the now-unused `setGameState` destructure; updated the stale top-of-file JSDoc comment that referenced the removed `TODO(01-07)` placeholders
- `src/__tests__/screens/GameScreen.test.tsx` - Added three `it(...)` blocks: hand-hand swap, hand-faceUp swap, faceUp-faceUp swap, extending (not replacing) Plan 01-06's existing test suite

## Decisions Made

- Sourced `Table.tsx`'s `currentPlayerId` from `useGameContext()` rather than keeping it as a prop, matching `Hand.tsx`'s approach for consistency, as the plan explicitly permitted either choice with a note to apply it uniformly.
- Computed `resolvedHandSelection`/`resolvedFaceUpSelection` once per render (not recomputed inside each `.map` iteration) - functionally identical to the plan's literal per-item description, but avoids redundant array construction on every card.
- Made all edits by hand rather than running `prettier --write` on the touched files, since the project's prettier config (`tabWidth: 2`) doesn't match the codebase's actual 4-space indentation convention - running it would have reformatted ~900 unrelated lines. See key-decisions above.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Corrected stale worktree branch base before starting work**
- **Found during:** Pre-execution worktree branch check
- **Issue:** The worktree's `worktree-agent-ae86d8c15da1de028` branch was sitting at an old ancestor commit (`d606485`, "feat: Add player finish celebration modals") rather than the wave-7 starting point (`1ed2e087`, the `stage-1-refactor` tip after wave 6 completed). `git merge-base HEAD 1ed2e087` confirmed `d606485` is an ancestor of `1ed2e087`, so no work existed on the worktree branch beyond that ancestor commit.
- **Fix:** `git reset --hard 1ed2e0875e0547609768f697f25111faa294b7c3` per the mandatory branch-check step - a safe fast-forward since the prior HEAD was already an ancestor of the target, not a divergent branch.
- **Files modified:** none (branch pointer only)
- **Verification:** `git rev-parse HEAD` confirmed the branch now points at `1ed2e087`

**2. [Rule 3 - Blocking] Removed unused `setGameState` destructure from GameScreen.tsx**
- **Found during:** Task 2
- **Issue:** After removing the `updateGameState={(newState) => setGameState(newState)}` props, `setGameState` (destructured from `useGameContext()`) had no remaining reader in the file. `tsconfig.app.json`'s `noUnusedLocals:true` would fail `tsc --noEmit`, one of this task's own acceptance criteria.
- **Fix:** Removed `setGameState` from the destructuring assignment at the top of `GameScreen()`.
- **Files modified:** src/screens/GameScreen.tsx
- **Verification:** `npx tsc --noEmit` exits 0
- **Committed in:** `2f76cbc` (Task 2 commit)

---

**Total deviations:** 2 auto-fixed (1 Rule 1 - pre-execution branch-state bug, 1 Rule 3 - blocking issue directly caused by this task's own changes)
**Impact on plan:** Neither affected scope or behavior - the branch-state fix was mandatory pre-execution housekeeping, and the unused-import removal was a direct, mechanical consequence of the plan's own prop-removal instruction.

## Issues Encountered

- The plan's acceptance-criteria grep pattern `dispatchMove({type:'SWAP_CARDS'` (no space after the colon) doesn't literally match the committed code, which uses `dispatchMove({ type: 'SWAP_CARDS', ... })` with a space after the colon and multi-line object formatting - matching the existing style already used for `SWAP_CARDS` dispatches in `GameScreen.tsx`/`applyMove.ts`/`moves.ts`. Verified the acceptance criterion's actual intent (2 `SWAP_CARDS` dispatch call sites per file) via `grep -c "type: 'SWAP_CARDS'"` instead, which returns 2 for both `Hand.tsx` and `Table.tsx` as required.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

This is the last plan in Phase 1 (wave 7 of 7). All four rule-duplication sites RESEARCH.md identified (hand-sort, rank-share x4, deck-creation, and this plan's hand<->hand/faceUp<->faceUp swap bypass) are now closed. `Hand.tsx` and `Table.tsx` contain zero inline rule duplication and zero direct state writes - every swap and every rank-share check routes through `gameLogic.ts`/`applyMove`. The full phase test suite (139 tests) is green, satisfying ENGINE-07's "automated test coverage for the engine and split screens" requirement for the whole phase. No blockers identified for Phase 1 close-out / `/gsd-verify-work`.

---
*Phase: 01-rules-engine-refactor*
*Completed: 2026-07-25*

## Self-Check: PASSED

- All 4 modified files confirmed present via direct file check (src/components/Hand.tsx, src/components/Table.tsx, src/screens/GameScreen.tsx, src/__tests__/screens/GameScreen.test.tsx)
- Both claimed commit hashes confirmed present via `git log --oneline --all` (56d4b04, 2f76cbc)
