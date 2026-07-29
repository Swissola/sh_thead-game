---
phase: 02-real-cross-device-multiplayer
plan: 14
subsystem: api
tags: [supabase-edge-functions, turn-timeout, react-hooks, vitest, tdd]

# Dependency graph
requires:
  - phase: 02-real-cross-device-multiplayer
    provides: "02-07's checkTurnTimeout (D-05 auto-pickup), 02-12's useTurnTimeoutSweep client trigger, 02-13's live two-device UAT that found this blocker"
provides:
  - "selectAutoPlayMove: a pure, unit-testable fallback-move selector exported from turnTimeout.ts"
  - "Empty-pile fallback wired into checkTurnTimeout's PICK_UP_PILE rejection branch, so a timed-out turn always resolves"
  - "useTurnTimeoutSweep now distinguishes an unexpected sweep failure (console.warn) from the two expected-quiet codes (TIMEOUT_NOT_ELAPSED, CONFLICT)"
affects: [02-15, 02-uat-retest]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Pure store-free decision helpers exported from a _shared Edge Function module for direct unit testing (heartbeat.ts's transferHostIfStale precedent, now also selectAutoPlayMove)"
    - "Three-way invoke-result branch (thrown rejection / resolved top-level error / EdgeResult in data) reused verbatim from useGameState.ts's established shape"

key-files:
  created: []
  modified:
    - supabase/functions/_shared/turnTimeout.ts
    - src/__tests__/edge/turnTimeout.test.ts
    - src/hooks/useTurnTimeoutSweep.ts
    - src/__tests__/hooks/useTurnTimeoutSweep.test.ts

key-decisions:
  - "Auto-play the lowest-RANK_VALUES card from getAvailableCardSource() when PICK_UP_PILE returns PILE_EMPTY (design decision recorded 2026-07-28 in 02-UAT.md, executed as specified)"
  - "faceDown source selects index 0 deterministically - never reads card.rank, preserving the blind-play rule"
  - "First-turn restricts candidates to getStartingCard's rank; when that's null, falls through to plain lowest-card selection and lets the engine's own FIRST_TURN_INVALID surface rather than inventing a new rule"
  - "Sweep hook warns (console.warn) on any EdgeResult error code outside {TIMEOUT_NOT_ELAPSED, CONFLICT}, and on a resolved top-level transport error - never toasts, since every connected client sweeps every 5s"

requirements-completed: [MPLAY-04, MPLAY-06]

# Metrics
duration: 12min
completed: 2026-07-29
---

# Phase 02 Plan 14: D-05 Empty-Pile Auto-Play Fallback + Sweep Warn Narrowing Summary

**Auto-plays the timed-out player's lowest-RANK_VALUES card through applyMove when the discard pile is empty, and narrows useTurnTimeoutSweep's blanket error swallow to warn on any unexpected sweep failure.**

## Performance

- **Duration:** 12 min (worktree catch-up and `npm install` excluded from task time)
- **Started:** 2026-07-29T19:18:48+01:00 (first RED commit)
- **Completed:** 2026-07-29T19:22:43+01:00 (last GREEN commit)
- **Tasks:** 2 completed
- **Files modified:** 4

## Accomplishments

- A turn timeout with an empty discard pile now always resolves: `checkTurnTimeout` falls through to a new `selectAutoPlayMove` helper and submits a single-card `PLAY_CARDS` move through the same `applyMove` boundary every other move uses, instead of forwarding `PILE_EMPTY` forever.
- The fallback selection matrix is fully covered: `RANK_VALUES` comparator (not face order), lower-index tie-break, source resolution via `GameLogic.getAvailableCardSource`, a blind index-0 pick for `faceDown` (never reads `card.rank`), and a first-turn restriction to `getStartingCard`'s rank with a documented fallthrough when no legal opening move exists.
- `useTurnTimeoutSweep`'s tick now inspects the resolved invoke result instead of discarding it: a resolved top-level transport error or any `EdgeResult` error code outside `{TIMEOUT_NOT_ELAPSED, CONFLICT}` gets exactly one `console.warn`; both expected-quiet codes and a thrown rejection stay silent, and `inFlightRef`/`.finally` are unchanged.
- The exact permanent-stall signature from `02-UAT.md` test 4b (identical `PILE_EMPTY` failure repeating every sweep, zero user-visible or console signal) is closed and regression-tested: two consecutive sweeps of a stale, empty-pile room now produce two different room versions.

## Task Commits

Both tasks followed RED -> GREEN TDD:

1. **Task 1: Auto-play the lowest card when the pile is empty (D-05 empty-pile fallback)**
   - `32a9ce5` (test) - failing tests for `selectAutoPlayMove`'s selection matrix and `checkTurnTimeout`'s empty-pile write behaviours
   - `59d7b62` (feat) - `selectAutoPlayMove` + the `checkTurnTimeout` fallback wiring; updates one pre-existing test whose asserted behaviour was the exact stall this plan closes
2. **Task 2: Stop the sweep swallowing unexpected failures without trace**
   - `5f329fa` (test) - failing tests for the seven sweep-warn behaviours
   - `6973000` (fix) - narrows the blanket `.catch(() => {})` to the three-way invoke-result branch

**Incidental (worktree setup, not plan tasks):**
- `7840fa2` (pre-existing, fast-forward target) - the worktree branch was 175 commits behind `stage-1-refactor` with zero unique commits of its own; fast-forwarded before any task work
- `645bf69` (chore) - reverted `package-lock.json` peer-flag churn from a local `npm install` (different npm version), not an intentional dependency change

**Plan metadata:** committed separately after this summary (see final commit below)

## Files Created/Modified

- `supabase/functions/_shared/turnTimeout.ts` - adds exported `selectAutoPlayMove(state, player)`; extends `checkTurnTimeout`'s `PICK_UP_PILE` error branch to fall through to the fallback on `PILE_EMPTY`
- `src/__tests__/edge/turnTimeout.test.ts` - 17 new tests (selection matrix + fallback write behaviours) plus one updated pre-existing test
- `src/hooks/useTurnTimeoutSweep.ts` - narrows `.catch(() => {})` to a three-way branch; adds `console.warn` on unexpected failures only
- `src/__tests__/hooks/useTurnTimeoutSweep.test.ts` - 2 new tests plus warn-spy assertions added to 2 existing tests

## Decisions Made

- Followed the plan's fully-specified selection rules verbatim (comparator, tie-break, faceDown index-0, first-turn restriction) - no deviation from the design decision already recorded in `02-UAT.md`.
- Updated one pre-existing test (`forwards the engine PILE_EMPTY error unchanged...`) whose asserted behaviour directly contradicted the plan's intended fix - the player in that fixture holds cards, so the correct new behaviour is to auto-play rather than forward `PILE_EMPTY`. This is not a weakening: it replaces an assertion of the pre-fix bug with an assertion of the post-fix behaviour, and the plan's "twelve behaviours" + acceptance criteria are still independently covered by the new `describe` blocks.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Fast-forwarded a stale worktree branch before any task work**
- **Found during:** Initial setup, before Task 1
- **Issue:** The worktree branch (`worktree-agent-a24186bc781420a82`) was checked out 175 commits behind `stage-1-refactor`, missing all of Phase 02's multiplayer work entirely (no `supabase/functions/`, no `src/hooks/useTurnTimeoutSweep.ts`, no `src/__tests__/edge/`). None of the plan's referenced files existed on disk in the worktree.
- **Fix:** Confirmed the worktree branch had zero unique commits ahead of `stage-1-refactor` (`git log worktree-agent-a24186bc781420a82..stage-1-refactor` showed 175 commits; the reverse showed none), then ran `git merge stage-1-refactor --ff-only` - a lossless fast-forward, not a destructive rewrite. Followed with `npm install` to populate `node_modules` (absent in the fresh worktree).
- **Files modified:** none (git ref update + dependency install only)
- **Verification:** `npm test -- --run src/__tests__/edge/turnTimeout.test.ts` passed (13/13) on the pre-existing suite before any plan changes were made, confirming the worktree was now a faithful copy of `stage-1-refactor`
- **Committed in:** fast-forward merge, no new commit object (HEAD moved to existing `7840fa2`)

**2. [Rule 1 - Bug] Reverted incidental `package-lock.json` churn from `npm install`**
- **Found during:** Immediately after the Task 1 RED commit
- **Issue:** `git status` showed `package-lock.json` modified after `npm install`, purely from local-npm-version differences in `"peer": true` metadata flags - not an intentional dependency change, and it had been swept into the RED commit alongside the test file.
- **Fix:** Restored `package-lock.json` to its pre-install committed state with `git show HEAD~1:package-lock.json > package-lock.json` and committed the restoration separately.
- **Files modified:** `package-lock.json`
- **Verification:** `git diff --stat package-lock.json` against the prior commit showed zero difference after the revert
- **Committed in:** `645bf69`

---

**Total deviations:** 2 auto-fixed (1 blocking - worktree setup, 1 bug - incidental lockfile churn). Neither touches the plan's actual task scope.
**Impact on plan:** Both were prerequisites for being able to execute the plan at all in this worktree, or cleanup of accidental noise. No scope creep into the plan's two tasks.

## Issues Encountered

None beyond the worktree staleness and lockfile churn documented above as deviations.

## Stubs

None.

## Threat Flags

None - the two mitigations this plan targets (T-02-35 faceDown index-only selection, T-02-37 the empty-pile stall itself) are implemented and test-locked exactly as specified in the plan's `<threat_model>`. No new trust-boundary surface was introduced beyond what the plan's threat register already covers.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- The blocker gap from `02-UAT.md` test 4b (D-05 empty-pile permanent stall) is closed and regression-tested; the "second gaps" second artifact (sweep errors silently swallowed) is also closed.
- `02-UAT.md` test 4b should be retested live (two-device) to confirm the fix behaves as expected outside the unit-test harness - this plan closes the code-level gap but does not itself constitute the UAT retest.
- Ready for `02-15` (heartbeat version-pollution gap closure), which was planned alongside this one and is independent of these changes.

---
*Phase: 02-real-cross-device-multiplayer*
*Completed: 2026-07-29*

## Self-Check: PASSED

All 5 commits (`32a9ce5`, `645bf69`, `59d7b62`, `5f329fa`, `6973000`) confirmed present in `git log`. All 5 claimed files confirmed present on disk: `supabase/functions/_shared/turnTimeout.ts`, `src/__tests__/edge/turnTimeout.test.ts`, `src/hooks/useTurnTimeoutSweep.ts`, `src/__tests__/hooks/useTurnTimeoutSweep.test.ts`, `.planning/phases/02-real-cross-device-multiplayer/02-14-SUMMARY.md`.
