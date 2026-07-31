---
phase: 02-real-cross-device-multiplayer
plan: 17
subsystem: multiplayer-sync
tags: [react, supabase-realtime, reconnect, backoff, reconciliation]

# Dependency graph
requires:
  - phase: 02-real-cross-device-multiplayer
    provides: "02-16's hasPendingMove()/hasPendingMoveRef and the pending-move-gated reconciliation check on useRoomSubscription"
provides:
  - "A subscribe-status callback that detects CHANNEL_ERROR/TIMED_OUT/CLOSED on the room-data channel and resubscribes with dwell-gated capped exponential backoff, instead of leaving the screen frozen forever"
  - "A one-off recovery refetch (supabase.from('rooms').select('*').eq('room_code', roomCode).single()) on genuine reconnect, closing postgres_changes's lack of replay/backfill"
  - "hadPendingMoveAtDrop - a drop-time snapshot that gates the refetch's reconciliation check, surviving 02-16's 8s pending-move safety net without reopening the bystander false-toast bug"
affects: [02-UAT]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Effect-scoped plain `let` reconnect/backoff state (cancelled/reconnectAttempt/reconnectTimeoutId/resetDwellTimeoutId/hadDisconnected/hadPendingMoveAtDrop/currentChannel), not useRef - reset per [roomCode, testMode] effect run, mirroring lastAppliedVersionRef's existing reset"
    - "Dwell-gated backoff reset: a SUBSCRIBED status schedules (not immediately applies) the counter reset via a second setTimeout, so a flapping connection's brief reconnect never resets retry cadence to base"
    - "Single shared applyRoomRow(row, forceReconciliationCheck) core consumed by both the live postgres_changes handler (always `false`) and the recovery refetch (the hadPendingMoveAtDrop snapshot) - one version-gate, one stableStringify comparison, no diverging copies"

key-files:
  created: []
  modified:
    - src/supabase/roomTypes.ts
    - src/hooks/useRoomSubscription.ts
    - src/__tests__/hooks/useRoomSubscription.test.ts

key-decisions:
  - "hadPendingMoveAtDrop is a snapshot taken at the instant of the first drop (`!hadDisconnected` guard on the error branch), never the live hasPendingMove() value at refetch time - the only way to tell apart 'genuinely pending, safety net cleared it mid-outage' from 'never pending, opponent moved during the outage' once both look identical (hasPendingMove() === false) by refetch time"
  - "Backoff counter reset is scheduled on SUBSCRIBED, not applied immediately - a SUBSCRIBED_RECONNECT_RESET_DWELL_MS (5s) dwell period must elapse uninterrupted before a later disconnect gets to start over from the 1s base, so a flapping connection keeps escalating instead of resetting on every brief reconnect"
  - "Retries are capped only in delay (30s ceiling), never in count - MPLAY-02's point is a dropped connection self-heals without a manual rejoin; giving up after N attempts would silently reintroduce the exact permanent-freeze failure this plan closes"

requirements-completed: [MPLAY-02]

# Metrics
duration: 35min
completed: 2026-07-31
---

# Phase 02 Plan 17: Self-heal a dropped Realtime channel and close the missed-broadcast gap Summary

**Closed 02-UAT.md test 8: a dropped `postgres_changes` subscription (tab backgrounding, network blip, idle period) now detects CHANNEL_ERROR/TIMED_OUT/CLOSED, resubscribes with dwell-gated capped exponential backoff, and performs a one-off recovery refetch whose reconciliation check is gated on a drop-time pending-move snapshot rather than the live flag.**

## Performance

- **Started:** 2026-07-31T19:52Z (worktree required a `git merge --ff-only stage-1-refactor` first - see Deviations)
- **Completed:** 2026-07-31T20:04Z
- **Tasks:** 2/2 completed
- **Files modified:** 3 (`src/supabase/roomTypes.ts`, `src/hooks/useRoomSubscription.ts`, `src/__tests__/hooks/useRoomSubscription.test.ts`)

## Accomplishments

- `useRoomSubscription`'s room-data channel now passes a status callback to `.subscribe(...)`
  instead of calling it bare. `CHANNEL_ERROR`/`TIMED_OUT`/`CLOSED` all trigger identical
  remove-and-reconnect handling: `supabase.removeChannel(...)` followed by a fresh
  `subscribeChannel()` call after a capped exponential backoff delay
  (`SUBSCRIPTION_RECONNECT_BASE_MS` 1000ms doubling to `SUBSCRIPTION_RECONNECT_MAX_MS` 30000ms).
- A `SUBSCRIBED` status only resets the backoff counter to base after staying connected for
  `SUBSCRIPTION_RECONNECT_RESET_DWELL_MS` (5000ms) without a further drop - a flapping
  connection (brief reconnect immediately followed by another drop) keeps its retry cadence
  escalating instead of resetting to the 1s base on every blip.
- An overlapping-timer guard (`scheduleReconnect` no-ops while a reconnect is already
  scheduled) and full cleanup on unmount/room-code change (both timers cleared, no
  `supabase.channel`/`removeChannel` call after cancellation) prevent leaked timers or
  duplicate reconnect chains.
- `handlePayload` is refactored into a one-line wrapper around a new shared
  `applyRoomRow(row, forceReconciliationCheck)`, so the live-broadcast path and the new
  recovery refetch share exactly one version-gate and one `stableStringify` comparison.
- On `SUBSCRIBED` following a genuine drop (not a routine initial mount), the hook performs
  exactly one `supabase.from('rooms').select('*').eq('room_code', roomCode).single()` to
  catch up on any move `postgres_changes` could not replay during the outage.
- The refetch's reconciliation check is gated on `hadPendingMoveAtDrop` - snapshotted at the
  instant the connection first drops (`if (!hadDisconnected) { hadPendingMoveAtDrop =
  hasPendingMoveRef.current(); }`), not the live `hasPendingMove()` value at refetch time.
  This is what lets a client that lost a real race still get the toast even after 02-16's 8s
  `PENDING_MOVE_TIMEOUT_MS` safety net has cleared the live flag, while an idle bystander
  whose channel merely dropped during an opponent's legitimate move never does - both cases
  look identical (`hasPendingMove() === false`) by refetch time, and only the snapshot tells
  them apart.
- Both delivery-path race orderings (a live broadcast landing before the refetch resolves,
  and the refetch resolving before a live broadcast for the same version) resolve correctly
  through the shared `lastAppliedVersionRef` gate - `onServerRoom` fires exactly once per
  version in either ordering, never twice.

## Task Commits

1. **Task 1: Detect a dropped room-data channel and self-heal it with dwell-gated capped
   exponential backoff** - RED `58f1cf3` (test), GREEN `21ded97` (feat)
2. **Task 2: Close the missed-broadcast gap with a one-off state refetch, gating its
   reconciliation check on pending-state-at-drop rather than the live flag** - RED `a16ffab`
   (test), GREEN `bc14e50` (feat)

## TDD Gate Compliance

Both tasks followed RED/GREEN as separate commits (not combined into a single commit per
task, unlike 02-16's precedent): each task's RED commit added failing tests only, verified
to fail for the expected reason before any implementation existed; the GREEN commit then
made them pass with no test edits. `git log --oneline` confirms the `test(...)` commit
precedes its matching `feat(...)` commit for both tasks.

## Files Created/Modified

- `src/supabase/roomTypes.ts` - added `SUBSCRIPTION_RECONNECT_BASE_MS` (1000),
  `SUBSCRIPTION_RECONNECT_MAX_MS` (30000), `SUBSCRIPTION_RECONNECT_RESET_DWELL_MS` (5000),
  each documented with the trade-off it encodes.
- `src/hooks/useRoomSubscription.ts` - the room-code effect is restructured around a
  `subscribeChannel()` function callable more than once per effect run, with
  `scheduleReconnect()` (capped exponential backoff, overlapping-timer guard),
  `applyRoomRow(row, forceReconciliationCheck)` (the shared version-gate/reconciliation
  core), and `refetchRoomState(forceReconciliationCheck)` (the one-off recovery read,
  try/catch around both the resolved-`error` and rejected-promise failure shapes).
- `src/__tests__/hooks/useRoomSubscription.test.ts` - `makeFakeChannel` extended with
  `_fireStatus`; `makeFakeSupabase` extended with `channelNames` and a
  `from('rooms').select('*').eq().single()` mock chain. 25 new tests (11 for Task 1's
  reconnect/backoff machinery, 13 for Task 2's refetch/snapshot gating, plus one baseline
  "subscribes with a function argument" check), all wrapped in per-test
  `vi.useFakeTimers()`/`vi.useRealTimers()` rather than file-wide, per the plan's explicit
  instruction (the file's other tests rely on synchronous `_fire` delivery). All 12
  pre-existing tests pass unedited.

## Decisions Made

- Backoff/reconnect state lives as effect-scoped plain `let` variables, not `useRef` -
  matches the plan's own reasoning (mirrors `lastAppliedVersionRef.current = -1`'s existing
  per-effect-run reset) and needs no cross-render persistence, only cross-callback closure
  within a single effect invocation.
- `hadPendingMoveAtDrop` is snapshotted only on the *first* transition into an outage
  (`if (!hadDisconnected)` guard), not on every subsequent error during an already-ongoing
  outage - a failed reconnect attempt partway through must not overwrite what was genuinely
  true when the outage began.
- Kept `(status: string)` as the subscribe-callback parameter type (matching
  `usePresence.ts`'s existing precedent for this exact pattern) rather than importing
  `REALTIME_SUBSCRIBE_STATES` from `@supabase/realtime-js` - consistent with the one other
  place this codebase already handles a subscribe status, and TypeScript's method-parameter
  bivariance allows the narrower enum-typed real signature to accept it.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Worktree branch was 197 commits stale**
- **Found during:** Setup, before Task 1
- **Issue:** This worktree's branch (`worktree-agent-a38ac4a407fb319b0`) was created from an
  old ancestor commit (`d606485`), predating `.planning/` and the entire Phase 1/2 codebase
  entirely - `02-17-PLAN.md` and `src/hooks/useRoomSubscription.ts` (post-02-16) did not
  exist on this branch.
- **Fix:** Confirmed the branch was a strict ancestor of `stage-1-refactor` with zero unique
  commits of its own (`git rev-list --left-right --count HEAD...stage-1-refactor` = `0 197`)
  and the working tree was clean, then fast-forwarded via
  `git merge --ff-only stage-1-refactor` - safe and non-destructive since no history was
  rewritten or discarded. Ran `npm install` since `node_modules` did not yet exist.
- **Files modified:** none (git history operation only).
- **Verification:** `git log --oneline -5` and `ls .planning/phases/...` showed the expected
  commit history and plan file present afterward.
- **Committed in:** not a task commit - a pre-execution setup step.

**2. [Rule 3 - Blocking] `hadDisconnected` declared but never read at the end of Task 1**
- **Found during:** Task 1's build verification (`npm run build`), after the GREEN
  implementation.
- **Issue:** `tsconfig.app.json`'s `noUnusedLocals` flags a `let` variable that is only ever
  *written* (`hadDisconnected = true`/`= false`) and never *read* - Task 1's own action text
  writes `hadDisconnected = true` in the error branch but defers reading it to Task 2 (per
  the plan's own division: "Task 2 is the one that extends `handlePayload`'s internals").
  This meant Task 1 alone could not satisfy its own `npm run build exits 0` acceptance
  criterion as literally sequenced.
- **Fix:** Added a minimal, behaviourally-neutral read in Task 1's `SUBSCRIBED` branch
  (`if (hadDisconnected) { hadDisconnected = false; }`) - a genuine, correct reset of the
  flag on any post-drop resubscribe, fully consistent with (and later superseded by) Task
  2's fuller `wasDisconnected`/`forceReconciliationCheck` capture-then-reset in the same
  branch.
- **Files modified:** `src/hooks/useRoomSubscription.ts` (Task 1's own commit).
- **Verification:** `npm run build` exits 0; Task 2's later diff replaces this block with
  its full snapshot-and-refetch-trigger version, with no leftover from the interim fix.
- **Committed in:** `21ded97` (Task 1's GREEN commit).

**3. [Rule 3 - Blocking] TypeScript tuple-type error on `supabase.channel.mock.calls[0]`**
- **Found during:** Task 1's build verification.
- **Issue:** `makeFakeSupabase`'s `channel: vi.fn(() => {...})` mock implementation declared
  zero parameters, so TypeScript inferred the mock's call-args type as the empty tuple `[]`;
  a new test's `.filter((args) => args[0] === 'room-ABC123')` on `.mock.calls` then failed to
  compile ("Tuple type `[]` of length `0` has no element at index `0`").
  Adding an explicit `(name: string)` parameter to the mock function to fix the tuple type
  triggered a *second* error (`@typescript-eslint/no-unused-vars` on the now-unused
  parameter, since the implementation didn't consume it).
- **Fix:** Added a `channelNames: string[]` array to `makeFakeSupabase`, pushed to inside
  the `channel` mock's implementation (now genuinely using its parameter), and rewrote the
  affected test to filter `channelNames` directly instead of indexing into
  `mock.calls[i][0]`.
- **Files modified:** `src/__tests__/hooks/useRoomSubscription.test.ts` (Task 1's own
  commit).
- **Verification:** `npm run build` exits 0; `npx eslint` on the file reports zero output.
- **Committed in:** `21ded97` (Task 1's GREEN commit).

### Issues Encountered

- `npm run lint` (repo-wide) exits 1, due to two pre-existing errors unrelated to this
  plan's scope (`GameContext.tsx:221` `react-refresh/only-export-components`,
  `GameScreen.tsx:107` `react-hooks/set-state-in-effect`) - the same two issues logged under
  every plan since 02-01, in files this plan does not touch at all (confirmed via
  `git status --short`). `npx eslint` scoped to this plan's three touched files reports zero
  output. Logged to `deferred-items.md` under a new "Plan 02-17" entry rather than fixed,
  per the executor's scope-boundary rule.
- The `subscribe((status: string) => {` call site does not literally contain the substring
  `subscribe(status` (the plan's own suggested grep pattern) due to the arrow function's
  wrapping parenthesis - the plan's acceptance criterion itself anticipates this
  ("or an equivalently named status-callback parameter"). Verified by inspection instead:
  `.subscribe((status: string) => { ... })` at `src/hooks/useRoomSubscription.ts:206`,
  matching `usePresence.ts`'s existing precedent for this exact pattern.

## User Setup Required

None - no external service configuration required. The recovery refetch uses the existing
`"authenticated can read rooms" ... using (true)` RLS policy (migration `0001`) already
exercised by the Realtime broadcast; no new grant, Edge Function, or schema change.

## Next Phase Readiness

- 02-UAT.md test 8 is fully closed: a dropped room-data channel now self-heals (detected,
  backed off, resubscribed) and catches up on any state missed during the outage, with the
  catch-up's reconciliation toast correctly scoped to only the client that genuinely had
  something outstanding.
- The two narrow, documented warnings from the plan-checker's clean re-check remain
  accepted, out-of-scope residuals (not fixed here, per the plan's own instruction):
  a theoretical overlapping-refetch staleness race under a flapping connection, and 02-16's
  T-02-59 cross-player setup-phase race residual inherited without a fresh cross-reference.
  Neither is demonstrated by a failing test in this plan's suite.
- `npm run lint`'s pre-existing repo-wide failures remain carried forward in
  `deferred-items.md` for a future dedicated lint-cleanup pass, unrelated to this plan.

---
*Phase: 02-real-cross-device-multiplayer*
*Completed: 2026-07-31*

## Self-Check: PASSED

All three modified files (`src/supabase/roomTypes.ts`, `src/hooks/useRoomSubscription.ts`,
`src/__tests__/hooks/useRoomSubscription.test.ts`) confirmed present on disk. All four task
commit hashes (`58f1cf3`, `21ded97`, `a16ffab`, `bc14e50`) confirmed present in `git log`.
