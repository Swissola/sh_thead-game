---
phase: 01-rules-engine-refactor
plan: 06
subsystem: ui
tags: [react, vitest, testing-library, react-context, tdd, game-board]

# Dependency graph
requires:
  - phase: 01-rules-engine-refactor (Plan 01-04)
    provides: GameProvider/useGameContext (gameState, dispatchMove, currentPlayerId, testMode, controllingPlayer, setControllingPlayer, setGameState)
  - phase: 01-rules-engine-refactor (Plan 01-05)
    provides: Slim App.tsx orchestrator/Router, placeholder GameScreen.tsx satisfying the 'game' route
provides:
  - "Full GameScreen.tsx: header, rules panel, Table/Hand composition, piles, ready/play/pickup controls, pickup-confirmation and celebration modals, draw-animation ghost portal, test-mode console panel"
  - "src/main.tsx imports App.css, so the celebration modal's bounce/pulse/fade keyframes are live (ENGINE-06)"
  - "setReady/pickUpPile/playCards/swapCards all dispatch through GameContext's dispatchMove - zero direct state mutation, zero alert() calls"
  - "D-12 interaction test suite (GameScreen.test.tsx): board render, card selection, Play, Ready, and both Pick-Up-Pile branches, each proven via a real applyMove round-trip"
affects: [01-07]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "TDD RED/GREEN split for a whole extraction task: RED commit adds interaction tests against a component missing the feature under test (Table/Hand composition), GREEN commit implements it - tests for already-implemented behavior (Ready/Pick-Up-Pile from Task 1) are included as regression coverage in the same suite without being a RED violation"
    - "Client-side pre-checks (shouldConfirmPickUp, mixed hand+faceUp validation) stay advisory-only; applyMove is the sole authority and the UI's job is deciding whether to show a confirmation modal or predict a cosmetic draw-animation, not to gate correctness"
    - "Draw-animation ghost portal predicts cardsToDraw/drawnCards from pre-dispatch state purely for the ghost-card visual, then dispatches the real move immediately - no second delayed updateGameState commit (RESEARCH.md Pitfall 4, accepted minor visual regression)"

key-files:
  created:
    - src/__tests__/screens/GameScreen.test.tsx
  modified:
    - src/screens/GameScreen.tsx
    - src/main.tsx
    - src/__tests__/App.test.tsx

key-decisions:
  - "Deferred declaring handSortMode/setHandSortMode and drawingCards/setDrawingCards state from Task 1 to Task 2 (rather than declaring all local state up front as the plan's prose describes) - tsconfig.app.json has noUnusedLocals:true, and these two pieces of state have no reader until Hand/playCards exist in Task 2, so declaring them in Task 1 would fail tsc's own acceptance gate. Final file state after Task 2 matches the plan's full local-state list exactly."
  - "playCards's client-side mixed hand+faceUp pre-check now decides only whether to skip the cosmetic draw-animation prediction, not whether to dispatch - the move always dispatches, and applyMove's own INVALID_COMBINATION rejection (surfaced as a toast) is the actual gate, matching the plan's 'not airtight' guidance and this plan's own threat model (T-01-11)"

requirements-completed: [ENGINE-01, ENGINE-03, ENGINE-05, ENGINE-06, ENGINE-07]

# Metrics
duration: ~35min
completed: 2026-07-25
---

# Phase 01 Plan 06: GameScreen Extraction Summary

**Full game board (Table/Hand/piles/controls/modals) extracted from pre-refactor App.tsx into GameScreen.tsx, every gameplay action now dispatching through GameContext's applyMove, with the App.css import fix that finally activates the celebration modal's animations.**

## Performance

- **Duration:** ~35 min
- **Started:** 2026-07-25T17:15:00+01:00
- **Completed:** 2026-07-25T17:24:55+01:00
- **Tasks:** 2 completed (Task 2 followed TDD RED/GREEN)
- **Files modified:** 4 (1 created, 3 modified)

## Accomplishments
- `GameScreen.tsx` fully extracted from pre-refactor `App.tsx:1065-1498` (recovered from git history at commit `02ae1ad`, since Plan 01-05 already slimmed the live `App.tsx`): header, rules panel, celebration derived-state effect, console.log interception, player summary grid, test-mode console panel, Table/Hand composition, piles, Ready/Play/Pick-Up-Pile controls, pickup-confirmation modal, celebration modal, and the draw-animation ghost portal
- `src/main.tsx` now imports `App.css` (ENGINE-06) - the celebration modal's `celebrationFadeIn`/`celebrationBounce`/`celebrationPulse` keyframes are live for the first time since they were written
- `setReady`, `pickUpPile`, `playCards`, and `swapCards` all dispatch through `dispatchMove` - zero direct `updateGameState`/state-mutation calls and zero `alert()` calls remain in `GameScreen.tsx`
- `shouldConfirmPickUp` stays a UI-side pre-check per RESEARCH.md Open Question 2: `applyMove`'s `PICK_UP_PILE` performs the pickup unconditionally once dispatched, whether reached directly or via the confirmation modal's "Pick Up Anyway"
- D-12 interaction test suite proves real behavior, not just render-without-crashing: card-selection DOM state change, Play dispatching `PLAY_CARDS` and updating the discard pile, Ready dispatching `READY_UP`, and both Pick-Up-Pile branches (direct-dispatch and confirmation-modal)

## Task Commits

1. **Task 1: GameScreen shell - header, rules panel, ready/pickup wiring, celebration, ENGINE-06 fix** - `4545ce5` (feat)
2. **Task 2: D-12 interaction tests (RED)** - `a5bdea9` (test)
3. **Task 2: Table/Hand composition, playCards wiring (GREEN)** - `2c7703a` (feat)

_No REFACTOR commit was needed - the GREEN implementation was clean on first pass._

## Files Created/Modified
- `src/screens/GameScreen.tsx` - Full game screen: header, rules panel, Table/Hand composition, piles, ready/play/pickup controls, pickup-confirmation and celebration modals, draw-animation ghost portal, test-mode console panel. Replaces Plan 01-05's placeholder.
- `src/main.tsx` - Added `import './App.css';` (ENGINE-06)
- `src/__tests__/screens/GameScreen.test.tsx` - D-12 interaction tests: board render, card selection, Play, Ready, both Pick-Up-Pile branches
- `src/__tests__/App.test.tsx` - Updated Router's game-phase routing test: the old `GameScreen` placeholder text is gone (replaced by this plan), so the test now seeds a player matching the test's `playerId` and asserts on "Pick Up Pile" text instead of the placeholder or the ambiguous "SH!THEAD" title (which MenuScreen also renders)

## Decisions Made
- Recovered the pre-refactor `App.tsx` source (the extraction basis named throughout this plan's `<read_first>` line-number references) from git history at commit `02ae1ad`, since Plan 01-05 already rewrote the live `App.tsx` into its slim D-09 orchestrator form. The line numbers cited in the plan (e.g. `App.tsx:1065-1498`) refer to that historical commit, not the current file.
- Deferred `handSortMode`/`drawingCards` local-state declarations from Task 1 to Task 2 (see key-decisions above) - a direct consequence of `tsconfig.app.json`'s `noUnusedLocals:true` gate, which Task 1's own acceptance criteria requires to pass.
- `playCards`'s mixed hand+faceUp pre-check now only decides whether to skip the cosmetic draw-animation prediction (not whether to dispatch), since `applyMove` is the sole correctness authority per this plan's threat model.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Fixed App.test.tsx's Router game-phase test after replacing GameScreen's placeholder**
- **Found during:** Task 1 (GameScreen shell)
- **Issue:** `App.test.tsx`'s existing Router test asserted on the literal text "Game screen placeholder", which Plan 01-05 had put in place pending this plan's extraction. Replacing `GameScreen.tsx`'s contents broke that assertion directly - not a pre-existing failure, but a direct consequence of this task's own file changes.
- **Fix:** Updated the test to seed a player whose `id` matches the test's `playerId` (so `GameScreen`'s board section actually renders `currentPlayer &&` content), then asserted on "Pick Up Pile" text - unique to `GameScreen`, unlike "SH!THEAD" which is also `MenuScreen`'s own title and caused a transient-node false failure when tried first.
- **Files modified:** src/__tests__/App.test.tsx
- **Verification:** `npx vitest run src/__tests__/App.test.tsx` passes (3/3)
- **Committed in:** 4545ce5 (Task 1 commit)

**2. [Rule 3 - Blocking] Deferred handSortMode/drawingCards state declarations to Task 2**
- **Found during:** Task 1 (GameScreen shell)
- **Issue:** The plan's prose lists `useHandSorting('original')` and a `drawingCards` state array among Task 1's local state, but neither has any reader until `Hand`/`playCards` exist (Task 2's deliverables). `tsconfig.app.json` has `noUnusedLocals:true`, and Task 1's own acceptance criteria requires `npx tsc --noEmit` to exit 0 - declaring unused state would fail that gate.
- **Fix:** Declared `handSortMode`/`setHandSortMode` and `drawingCards`/`setDrawingCards` in Task 2 instead, where they're immediately consumed by `Hand`'s props and `playCards`'s draw-animation logic. The final file state after Task 2 matches the plan's full local-state list exactly - only the task boundary for the declaration moved, not the end result.
- **Files modified:** src/screens/GameScreen.tsx
- **Verification:** `npx tsc --noEmit` exits 0 at both Task 1 and Task 2 completion
- **Committed in:** 4545ce5 (Task 1, deferred fields absent), 2c7703a (Task 2, deferred fields added)

---

**Total deviations:** 2 auto-fixed (both Rule 3 - blocking issues directly caused by this task's own changes)
**Impact on plan:** Both were necessary to keep the plan's own acceptance criteria (tsc exit 0, existing test suite green) satisfiable as written. No scope creep, no behavior changes beyond what the plan specified.

## Issues Encountered
- `screen.findByText(/SH!THEAD/)` in the Router game-phase test resolved to a stale, since-unmounted DOM node (MenuScreen's own "SH!THEAD" title, present on the very first synchronous render before `SeedGameState`'s effect transitions to GameScreen), producing a confusing "element could not be found in the document" failure from `toBeInTheDocument()` rather than an "ambiguous match" error. Resolved by querying unique-to-GameScreen text instead (see Deviation 1).

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

Plan 01-07 can now remove the `updateGameState`/`swapCards` adapter props this plan kept on `Table`/`Hand` (both marked `// TODO(01-07): remove once Hand/Table dispatch SWAP_CARDS directly`) and route their remaining internal hand<->hand/faceUp<->faceUp swap-bypass logic (RESEARCH.md Pattern 3 site 4) through `dispatchMove`'s `SWAP_CARDS` case directly, eliminating the last non-`dispatchMove` state-mutation path in the client.

**Manual QA still pending (per `01-VALIDATION.md`'s Manual-Only Verifications table, not blocking this plan's completion):**
- Confirm the celebration modal's bounce/pulse/fade animations actually render in a browser on a real finish/game-over (ENGINE-06's fix is verified in code - `App.css` is imported and the classes are present - but the visual animation itself needs a human's eyes)
- Confirm the draw-card ghost animation still plays without crashing; positioning may differ slightly from pre-refactor per the accepted Pitfall 4 tradeoff (real hand shows newly-drawn cards immediately rather than being hidden until the ghost animation lands)

No blockers identified for Plan 01-07.

---
*Phase: 01-rules-engine-refactor*
*Completed: 2026-07-25*

## Self-Check: PASSED

- All 5 created/modified files confirmed present via direct file check (src/screens/GameScreen.tsx, src/main.tsx, src/__tests__/screens/GameScreen.test.tsx, src/__tests__/App.test.tsx, plus this SUMMARY.md)
- All 4 claimed commit hashes confirmed present via `git log --oneline --all` (4545ce5, a5bdea9, 2c7703a, c82da87)
