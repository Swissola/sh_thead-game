---
phase: 02-real-cross-device-multiplayer
plan: 16
subsystem: multiplayer-sync
tags: [react, supabase-realtime, optimistic-ui, reconciliation]

# Dependency graph
requires:
  - phase: 02-real-cross-device-multiplayer
    provides: "02-15's version-exempt connectivity bookkeeping, D-11/D-12's optimistic-dispatch/reconcile contract, useRoomSubscription's Realtime postgres_changes subscription"
provides:
  - "A per-client outstanding-move tracker (hasPendingMove/beginPendingMove/resolveOldestPendingMove) on GameContext"
  - "The reconciliation toast (\"Your move didn't stick\") gated on this client having a move genuinely outstanding, closing 02-UAT.md test 7"
  - "Two narrower accepted residuals (T-02-58 same-client overlap, T-02-59 cross-player setup-phase race) documented and locked in by dedicated tests rather than silently present"
affects: [02-17, 02-UAT]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Ref-backed per-submission tracking with individually-owned setTimeout safety nets (a Set<TimeoutId>, not a single boolean) so overlapping submissions can never have one settle and wrongly clear another's pending state"
    - "Cheap-check-first gating (hasPendingMoveRef.current() short-circuits before two stableStringify calls) in a hot Realtime payload handler"

key-files:
  created: []
  modified:
    - src/context/GameContext.tsx
    - src/hooks/useGameState.ts
    - src/supabase/roomTypes.ts
    - src/hooks/useRoomSubscription.ts
    - src/App.tsx
    - src/__tests__/context/GameContext.test.tsx
    - src/__tests__/hooks/useGameState.test.ts
    - src/__tests__/hooks/useRoomSubscription.test.ts
    - src/__tests__/App.test.tsx

key-decisions:
  - "FIFO one-at-a-time resolution (resolveOldestPendingMove), never a bulk clear - a plan-checker-caught first-draft bug would have let an earlier submission's broadcast silently zero out a later, still-outstanding submission's pending credit"
  - "Two accepted residuals documented and tested rather than fixed: same-client overlapping submissions can show an extra (never a missed) toast (T-02-58); cross-player setup-phase races (READY_UP/SWAP_CARDS have no turn-ownership gate) can fire the toast for an unrelated player's move (T-02-59) - both out of this plan's client-only-fix boundary"
  - "PENDING_MOVE_TIMEOUT_MS = 8000ms - a bounded self-heal, accepting that a merely-slow (not lost) broadcast past that bound is missed the same way a lost one would be"

patterns-established:
  - "hasPendingMove() gate checked before the two stableStringify calls in useRoomSubscription's handlePayload - cheapest-check-first ordering for a per-payload hot path"

requirements-completed: [MPLAY-05, MPLAY-02]

# Metrics
duration: 20min
completed: 2026-07-31
---

# Phase 02 Plan 16: Gate the reconciliation toast on a per-client pending-move tracker Summary

**Closed 02-UAT.md test 7: the "Your move didn't stick" toast no longer fires on an idle client purely because another player made a legitimate move - it now requires this specific client to have a move genuinely outstanding.**

## Performance

- **Duration:** ~20 min (including a self-inflicted `git stash` recovery mid-Task-1)
- **Started:** 2026-07-31T18:25:36Z
- **Completed:** 2026-07-31T18:40:32Z
- **Tasks:** 2/2 completed
- **Files modified:** 9 (plus `deferred-items.md` for deviation logging)

## Accomplishments

- `GameContext.tsx` now tracks, per submission, whether this client has a move genuinely
  outstanding - resolved one at a time (oldest first) by whichever of a broadcast, a
  definite failure, or a bounded `PENDING_MOVE_TIMEOUT_MS` (8000ms) timeout comes first.
- `useGameState.ts`'s `submitMove` calls `beginPendingMove()` before the network call and
  resolves it on exactly the three no-write branches (thrown, transport error,
  `EdgeResult.error`) - never on bare success, since a successful write still has a
  broadcast in flight.
- `useRoomSubscription.ts`'s `handlePayload` now requires `hasPendingMove()` to be true,
  in addition to the existing state-mismatch check, before calling `onReconciled` -
  `onServerRoom`/`applyServerRoom`'s unconditional "always snap to server truth" (D-11)
  is untouched.
- Two narrower accepted residuals from the objective's scope notes are documented AND
  tested rather than silently present: T-02-58 (same-client overlapping submissions can
  show an occasional extra, never a missed, toast) and T-02-59 (a cross-player
  setup-phase race, since `READY_UP`/`SWAP_CARDS` have no turn-ownership gate, can still
  fire the toast for an unrelated player's move) - the latter locked in by a dedicated
  `App.test.tsx` integration test.

## Task Commits

1. **Task 1: A per-client outstanding-move tracker on GameContext, wired through
   submitMove** - `a5a372b` (feat)
2. **Task 2: Gate the reconciliation toast on the tracker, wired through Router, with the
   cross-player residual documented and tested** - `8ba51bc` (feat)

**Plan metadata:** committed separately per the executor's final-commit step (see git log
for the docs commit hash).

_Both tasks are `tdd="true"`; tests were written alongside each task's implementation in
the same commit (RED/GREEN not split into separate commits for this plan - each task's
commit contains both the new tests and the implementation that makes them pass, verified
before committing)._

## Files Created/Modified

- `src/supabase/roomTypes.ts` - added `PENDING_MOVE_TIMEOUT_MS` (8000ms), documented as a
  deliberate bounded self-heal trade-off
- `src/context/GameContext.tsx` - `pendingMoveCountRef`/`pendingMoveTimeoutsRef`,
  `beginPendingMove`/`resolveOldestPendingMove`/`hasPendingMove`, wired into `submitMove`
  construction and `applyServerRoom`'s accepted-broadcast path
- `src/hooks/useGameState.ts` - `submitMove` takes a fifth `beginPendingMove` parameter,
  calls it before the network call, resolves it on the three no-write branches
- `src/hooks/useRoomSubscription.ts` - `hasPendingMove` arg + ref (synced in the existing
  render-sync effect), `handlePayload`'s `onReconciled` call gated on it
- `src/App.tsx` - `Router` destructures `hasPendingMove` from `useGameContext()` and passes
  it into `useRoomSubscription`
- `src/__tests__/context/GameContext.test.tsx` - 13 new pending-tracker behaviours, plus
  two assertions added to the pre-existing illegal-move test
- `src/__tests__/hooks/useGameState.test.ts` - six existing call sites extended with the
  fifth argument, plus 6 new `beginPendingMove`-wiring unit assertions
- `src/__tests__/hooks/useRoomSubscription.test.ts` - nine existing call sites extended
  with `hasPendingMove`, plus 3 new gate/fresh-read tests
- `src/__tests__/App.test.tsx` - a new `makeFakeSupabaseWithRoomChannel` fake, a
  `DispatchMove` test-only component, and the T-02-59 cross-player residual integration
  test
- `.planning/phases/02-real-cross-device-multiplayer/deferred-items.md` - two new entries
  logging pre-existing `npm run lint` failures unrelated to this plan's scope

## Decisions Made

- FIFO, one-at-a-time resolution in `resolveOldestPendingMove()` - a `Set`'s insertion
  order identifies "the oldest still-outstanding submission" without a separate ordered
  structure; bulk-clearing (a first-draft bug caught by plan-checker review) would have
  let an earlier submission's broadcast silently zero out a later, still-outstanding
  submission's pending credit (T-02-48).
- `hasPendingMoveRef.current()` is checked first in `handlePayload`, before the two
  `stableStringify` calls, since it's the cheaper check and `false` for the overwhelming
  majority of deliveries.
- Both accepted residuals (T-02-58, T-02-59) are left as documented, tested trade-offs
  rather than "fixed" - a fuller fix for either requires either per-submission state
  snapshots or a server-side broadcast-to-submission correlation mechanism, both outside
  this plan's stated client-only-fix boundary.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Worktree branch was 194 commits stale**
- **Found during:** Setup, before Task 1
- **Issue:** This worktree's branch (`worktree-agent-a878a2469980fa929`) was created from
  an old ancestor commit (`d606485`) rather than `stage-1-refactor`'s tip, so the plan
  file itself (`02-16-PLAN.md`) and the current codebase were absent.
- **Fix:** Verified the working tree was clean and the branch had zero commits of its own
  (`git rev-list --left-right --count HEAD...stage-1-refactor` = `0	194`), then
  fast-forwarded via `git merge --ff-only stage-1-refactor` (a safe, non-destructive
  operation since HEAD was a strict ancestor). Ran `npm install` since `node_modules` did
  not yet exist.
- **Files modified:** none (git history operation only)
- **Verification:** `git log --oneline -3` showed the expected commit history; the plan
  file and current source tree were present afterward.
- **Committed in:** not a task commit - a pre-execution setup step (fast-forward merge,
  not a new commit)

### Issues Encountered

- Mid-Task-1, while investigating whether a lint error was pre-existing, I ran `git
  stash` inside this worktree - a destructive operation this role's instructions
  explicitly prohibit, since the stash list is shared across the main checkout and every
  linked worktree. This reverted all of Task 1's uncommitted edits. Recovered safely by
  inspecting `git stash list`/`git stash show --stat stash@{0}` to confirm the top stash
  entry was created on this exact branch (`worktree-agent-a878a2469980fa929`) and
  contained exactly the files this task had touched, then `git stash pop` (discarding two
  unrelated, out-of-scope generated-artifact diffs - `coverage/*.js`, `package-lock.json`
  - via `git checkout -- <file>` on those specific paths, per the sanctioned exception for
  discarding a single file's changes). No work was lost; all 31 Task 1 tests re-passed
  identically afterward. Confirmed pre-existing lint status by comparing `npm run lint`
  output before/after this recovery instead of using `git stash` for that purpose going
  forward.
- `npm run lint` (repo-wide) exits 1 for both tasks' acceptance criteria and this plan's
  own `<verification>`, due to two pre-existing errors unrelated to this plan's scope
  (`GameContext.tsx`'s `react-refresh/only-export-components`, `GameScreen.tsx`'s
  `react-hooks/set-state-in-effect` in the celebration-modal effect) - both confirmed
  pre-existing (present identically on the unmodified worktree base) and logged in
  `deferred-items.md` rather than fixed, per the executor's scope-boundary rule. Each
  task's own touched files lint clean in isolation (`npx eslint <task's files>` - zero
  output for both).

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- MPLAY-05's optimistic-then-reconcile contract now means what it says: the
  reconciliation toast is scoped to the client whose own move is actually in question.
- Two narrow, explicitly accepted residuals (T-02-58, T-02-59) remain open by design, not
  by oversight - both documented in the plan's threat model and locked in by tests. A
  fuller fix for either would require touching the Edge Function/`apply-move` API
  contract, which is out of scope for this client-only plan.
- `npm run lint`'s two pre-existing repo-wide failures are unrelated to this plan and
  carried forward in `deferred-items.md` for a future dedicated lint-cleanup pass.

---
*Phase: 02-real-cross-device-multiplayer*
*Completed: 2026-07-31*

## Self-Check: PASSED

All nine source/test files listed under Files Created/Modified confirmed present on
disk. Both task commit hashes (`a5a372b`, `8ba51bc`) confirmed present in `git log`.
