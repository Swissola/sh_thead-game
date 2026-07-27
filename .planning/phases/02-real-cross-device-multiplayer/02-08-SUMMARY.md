---
phase: 02-real-cross-device-multiplayer
plan: 08
subsystem: api
tags: [react, supabase-realtime, postgres-changes, presence, hooks]

# Dependency graph
requires:
  - phase: 02-real-cross-device-multiplayer (plan 02-01)
    provides: "src/supabase/client.ts (getSupabaseClient), src/supabase/roomTypes.ts (RoomRow, ServerRoom, rowToServerRoom, HEARTBEAT_INTERVAL_MS)"
  - phase: 02-real-cross-device-multiplayer (plan 02-02)
    provides: "src/hooks/useToast.ts hook-shape precedent (internal state + ref + cleanup)"
provides:
  - "useRoomSubscription({ roomCode, testMode, localState, onServerRoom, onReconciled }) - Realtime postgres_changes stream replacing the App.tsx localStorage poll, with stale/duplicate-version filtering and reconciliation signalling"
  - "usePresence({ roomCode, playerId, testMode }) - per-room Presence channel plus HEARTBEAT_INTERVAL_MS heartbeat cadence, returning { onlinePlayerIds, isPlayerOffline }"
affects: [02-09-app-wiring, 02-10-lobby-presence-ui, 02-11-realtime-sync-integration, 02-12-turn-timeout]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Effect deps kept minimal (roomCode/testMode, or roomCode/playerId/testMode) with a separate no-deps ref-sync effect holding latest callbacks/state - avoids resubscribing the Realtime channel on every parent re-render while still avoiding stale closures"
    - "Stable key-sorted JSON serialisation for state-equality comparison, since Postgres jsonb round-trips do not preserve key insertion order and a plain JSON.stringify diff would false-positive on semantically-identical states"
    - "Last-applied-version ref dropping any payload at or below it, so out-of-order/duplicate Realtime deliveries cannot rewind the board (T-02-29)"

key-files:
  created:
    - src/hooks/useRoomSubscription.ts
    - src/hooks/usePresence.ts
    - src/__tests__/hooks/useRoomSubscription.test.ts
    - src/__tests__/hooks/usePresence.test.ts
  modified:
    - .planning/phases/02-real-cross-device-multiplayer/deferred-items.md

key-decisions:
  - "Reconciliation toast decision (onReconciled) lives in useRoomSubscription's postgres_changes callback, not in the functions.invoke() response path, per RESEARCH.md Pattern 3 - either can arrive first, only the broadcast is authoritative"
  - "Ref writes for callbacks/local state moved into their own no-deps useEffect rather than the render body, to satisfy this project's react-hooks/refs lint rule without changing the hook's external dependency-array shape"
  - "usePresence's online-set reset on losing a valid room/player lives in the 'connected' branch's effect cleanup, not the bail-out branch's render body - satisfies react-hooks/set-state-in-effect while the initial useState([]) already covers first-mount bail-out"

patterns-established:
  - "Realtime-channel hook cleanup contract: subscribe inside a useEffect keyed on the minimal identity (room code/player id/test mode), tear down with supabase.removeChannel in the same effect's cleanup, holding all other reactive values in refs updated by a separate no-deps effect"

requirements-completed: [MPLAY-02, MPLAY-05, MPLAY-06]

# Metrics
duration: 35min
completed: 2026-07-27
---

# Phase 02 Plan 08: Realtime Room Subscription and Presence Summary

**`useRoomSubscription` replaces `App.tsx`'s 2-second localStorage poll with a Supabase Realtime `postgres_changes` stream that drops stale/duplicate deliveries and signals reconciliation, and `usePresence` adds a per-room Presence channel with a `heartbeat` cadence for the D-10 offline badges - wiring both into `App.tsx` and the screens is Wave 4's job.**

## Performance

- **Duration:** ~35 min (includes worktree fast-forward and `npm install`)
- **Started:** 2026-07-27T19:52:00Z
- **Completed:** 2026-07-27T20:51:43+01:00
- **Tasks:** 2/2
- **Files modified:** 5 (4 created, 1 log updated)

## Accomplishments

- `useRoomSubscription` fully replaces the interval/localStorage poll's shape (same guard, same dependency-key convention, same cleanup contract) with a `room-${roomCode}` channel subscribed to `UPDATE`/`INSERT` on `public.rooms`, filtered by room code
- Out-of-order and duplicate Realtime deliveries are dropped via a last-applied-version ref (T-02-29), never rewinding the board
- Reconciliation (`onReconciled`) fires from the broadcast callback itself, not the `functions.invoke()` response, per RESEARCH.md Pattern 3 - the client always snaps to server truth (D-11) regardless
- `usePresence` opens a distinctly-named `-presence` channel keyed on `playerId` (so multiple tabs of the same identity collapse to one entry, per D-03), tracks on `SUBSCRIBED`, and derives the online set from `sync`/`leave` events
- The heartbeat cadence (immediate + every `HEARTBEAT_INTERVAL_MS`) is driven from the same effect as Presence but is a deliberately separate signal - Presence never touches `TURN_GRACE_MS` and never drives a rules decision (T-02-30)

## Task Commits

Each task was committed atomically:

1. **Task 1: `useRoomSubscription` - Realtime state stream replacing the poll (MPLAY-02)** - `450e98c` (feat)
2. **Task 2: `usePresence` - connected-player set plus heartbeat cadence (MPLAY-06, D-10)** - `7e5f854` (feat)

**Lint fix (Task 1 files, found during Task 2's lint pass):** `4086056` (fix)
**Deferred-items log:** `09465a7` (docs)

_Both tasks were `tdd="true"` - tests were written and run alongside each hook's implementation, covering all seven specified behaviours per task before the task was considered done._

## Files Created/Modified

- `src/hooks/useRoomSubscription.ts` - Realtime `postgres_changes` subscription, stale-version filtering, reconciliation signalling
- `src/hooks/usePresence.ts` - Presence channel plus heartbeat cadence, returning `{ onlinePlayerIds, isPlayerOffline }`
- `src/__tests__/hooks/useRoomSubscription.test.ts` - 9 tests: no-op modes, channel/filter shape, version accept/drop, reconciliation differ/match, unmount teardown, room-code-change teardown
- `src/__tests__/hooks/usePresence.test.ts` - 9 tests: no-op modes (testMode/empty room/empty player), track-once-on-subscribe, sync replaces set, leave removes a player, heartbeat immediate+interval, unmount teardown, `isPlayerOffline`
- `.planning/phases/02-real-cross-device-multiplayer/deferred-items.md` - Logged the pre-existing lint issues and the `heartbeat.ts` cross-worktree dependency (see below)

## Decisions Made

- **Reconciliation trigger lives in the Realtime callback, not the invoke response** - matches RESEARCH.md Pattern 3 exactly; `onReconciled` fires only when the incoming server state differs from local state (stable key-sorted comparison), and `onServerRoom` fires unconditionally on every newer-version payload.
- **Ref-sync moved into its own no-deps effect** in `useRoomSubscription` - the project's `react-hooks/refs` lint rule forbids writing `ref.current` during render; consolidating all three ref writes into one effect keeps the fix minimal and keeps the subscribe effect's dependency array unchanged.
- **`usePresence`'s reset-on-disconnect lives in the "connected" branch's cleanup**, not the bail-out branch - avoids the `react-hooks/set-state-in-effect` lint rule (no synchronous `setState` call in the effect's main body) while still correctly clearing the online set if `roomCode`/`playerId` becomes invalid without a full unmount.
- **Heartbeat invoked as `supabase.functions.invoke('heartbeat', { body: { roomCode } })`** - no `playerId` in the body, matching every other Edge Function wrapper in this codebase (`join-room` etc.), where identity always comes from the verified JWT subject server-side, never the request payload.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] `react-hooks/refs` violation in `useRoomSubscription.ts`**
- **Found during:** Task 2's `npm run lint` pass (after both hooks were written)
- **Issue:** Three ref writes (`localStateRef.current = localState`, etc.) happened directly in the hook's render body, which the project's `eslint-plugin-react-hooks` config flags as "Cannot access refs during render"
- **Fix:** Moved all three writes into their own `useEffect(() => { ... })` with no dependency array, so they run after every render (post-commit) instead of during render
- **Files modified:** `src/hooks/useRoomSubscription.ts`
- **Verification:** `npx eslint src/hooks/useRoomSubscription.ts` clean; `npm test -- --run src/__tests__/hooks/useRoomSubscription.test.ts` still 9/9 passing
- **Committed in:** `4086056`

**2. [Rule 1 - Bug] `react-hooks/set-state-in-effect` violation in `usePresence.ts`**
- **Found during:** Task 2's `npm run lint` pass
- **Issue:** The bail-out branch (`testMode || !roomCode || !playerId`) called `setOnlinePlayerIds([])` synchronously as the first statement in the effect body, flagged as a cascading-render risk
- **Fix:** Removed the bail-out branch's `setState` call (the initial `useState([])` already covers first-mount); moved the reset into the "connected" branch's own cleanup function instead, so it only fires on an actual transition away from a live subscription
- **Files modified:** `src/hooks/usePresence.ts`
- **Verification:** `npx eslint src/hooks/usePresence.ts` clean; `npm test -- --run src/__tests__/hooks/usePresence.test.ts` still 9/9 passing
- **Committed in:** `7e5f854` (fixed before the task's own commit, not a separate follow-up)

**3. [Rule 1 - Bug] `no-unused-vars` in both test files' fake-client helpers**
- **Found during:** Task 2's `npm run lint` pass
- **Issue:** `makeFakeSupabase`'s `channel: vi.fn((_name, _opts) => ...)` mock declared parameters it never used
- **Fix:** Dropped the unused parameters entirely; assertions on the call args use `toHaveBeenCalledWith` on the mock itself, not the closure's own parameters
- **Files modified:** `src/__tests__/hooks/useRoomSubscription.test.ts`, `src/__tests__/hooks/usePresence.test.ts`
- **Verification:** `npx eslint` clean on both files; both test files still pass in full
- **Committed in:** `4086056` (useRoomSubscription test file), `7e5f854` (usePresence test file)

---

**Total deviations:** 3 auto-fixed (all Rule 1 - lint correctness on this plan's own new files); 2 findings logged out-of-scope (see below)
**Impact on plan:** All three fixes were required for `npm run lint` cleanliness on files this plan itself created - no scope creep, no behavioural change to either hook's contract or tests.

## Issues Encountered

- **Worktree started from a stale base commit** - this worktree's `HEAD` predated `stage-1-refactor`'s tip (which already includes plans 02-01 through 02-06 merged). Fixed before Task 1 via `git merge --ff-only stage-1-refactor` (a clean fast-forward, since this worktree's `HEAD` was a strict ancestor with no unique commits) plus `npm install` since `node_modules` didn't exist yet. Not itself a plan deviation - infrastructure setup per the orchestrator's explicit pre-flight instructions.
- **`npm run lint` still exits 1** (pre-existing, out of scope) - the same three issues already logged under Plans 02-01/02-03/02-04/02-05/02-06 in `App.tsx`, `GameContext.tsx` (explicitly owned by sibling plan 02-09 this wave), and `GameScreen.tsx`. This plan's own four new/changed files are lint-clean. Logged in `deferred-items.md` under "Plan 02-08".
- **`supabase/functions/_shared/heartbeat.ts` does not exist in this worktree** - created by sibling plan 02-07 in a parallel worktree, not yet merged. `usePresence.ts` invokes it by name/body-shape per the plan's own action text and 02-07-PLAN.md's documented contract, but this couldn't be verified against the live handler. Flagged for Wave 3/4 integration. Full detail in `deferred-items.md` under "Plan 02-08".

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- `useRoomSubscription` and `usePresence` are both ready to be wired into `App.tsx`'s `Router` and the game screens in Wave 4 (per this plan's own `<objective>` - wiring is explicitly out of scope here)
- **Integration check for Wave 3/4:** once sibling plan 02-07 merges, confirm the `heartbeat` Edge Function's request-body shape (`{ roomCode }`, identity from JWT) matches what `usePresence.ts` sends, and re-run `npm test -- --run` against the merged tree
- Full test suite (250 tests across 26 files) and `npm run build` both pass in this worktree as of the final commit

---
*Phase: 02-real-cross-device-multiplayer*
*Completed: 2026-07-27*

## Self-Check: PASSED

All four created files confirmed present on disk; all four commits (`450e98c`, `4086056`,
`7e5f854`, `09465a7`) confirmed present in `git log --oneline --all`.
