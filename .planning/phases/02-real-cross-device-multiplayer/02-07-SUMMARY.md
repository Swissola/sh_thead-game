---
phase: 02-real-cross-device-multiplayer
plan: 07
subsystem: api
tags: [supabase, deno, edge-functions, presence, disconnect-handling, vitest]

# Dependency graph
requires:
  - phase: 02-real-cross-device-multiplayer (plan 02-03)
    provides: "_shared/engine.ts barrel, _shared/db.ts (RoomStore port, withVersionRetry), _shared/respond.ts"
  - phase: 02-real-cross-device-multiplayer (plan 02-05)
    provides: "_shared/supabaseStore.ts, scripts/check-edge-wrappers.mjs, create-room/join-room wrapper shape"
provides:
  - "checkTurnTimeout: server-clock-verified grace-period auto PICK_UP_PILE (D-05)"
  - "heartbeat + transferHostIfStale: server's own connectivity signal plus lazy lobby host transfer (D-08)"
  - "removePlayer: host-only, lobby-only removal of a non-host seat (D-07)"
  - "check-turn-timeout, heartbeat and remove-player Deno Edge Functions"
affects: [02-08, 02-09, 02-12]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Lazy client-triggered server sweep for grace-period expiry, verified against store.now() rather than a scheduled job (v1 per RESEARCH.md Assumption A2)"
    - "Server-only last-seen map (player_seen) as the trust anchor for connectivity, deliberately separate from Realtime Presence"

key-files:
  created:
    - supabase/functions/_shared/turnTimeout.ts
    - supabase/functions/_shared/heartbeat.ts
    - supabase/functions/_shared/removePlayer.ts
    - supabase/functions/check-turn-timeout/index.ts
    - supabase/functions/heartbeat/index.ts
    - supabase/functions/remove-player/index.ts
    - src/__tests__/edge/turnTimeout.test.ts
    - src/__tests__/edge/heartbeat.test.ts
    - src/__tests__/edge/removePlayer.test.ts
  modified:
    - .planning/phases/02-real-cross-device-multiplayer/deferred-items.md

key-decisions:
  - "checkTurnTimeout takes no playerId - any authenticated player may trigger the sweep, since the check that matters is temporal (server clock vs turn_started_at), not identity-based"
  - "heartbeat folds transferHostIfStale into the same write rather than a scheduled job, restricted to the lobby phase per D-08 (host has no mid-game powers)"
  - "removePlayer does not gate on the target's player_seen staleness - the host is the human judge of AFK, per D-07's wording"

patterns-established:
  - "Server-authoritative disconnect handling: correctness (this plan) is a strict trust boundary above and separate from Presence-based UI display (plan 02-08/02-12)"

requirements-completed: [MPLAY-04, MPLAY-06]

# Metrics
duration: 25min
completed: 2026-07-27
---

# Phase 2 Plan 07: Server-side disconnect handling (grace-period pickup, heartbeat, host transfer, player removal) Summary

**Three server-verified Edge Function operations - `check-turn-timeout`, `heartbeat`, `remove-player` - that keep a room playable when a player drops, all clock- and identity-verified server-side rather than trusting the client.**

## Performance

- **Duration:** ~25 min
- **Completed:** 2026-07-27T19:50:43Z
- **Tasks:** 3/3
- **Files modified:** 10 (9 created, 1 modified)

## Accomplishments

- D-05: `checkTurnTimeout` computes elapsed time from `store.now()` against the room's stored `turn_started_at` and auto-applies `PICK_UP_PILE` on behalf of the stalled current-turn player through the shared `applyMove` reducer - never hand-rolling the pickup, never revealing a face-down card, and never freeing the player's seat (D-04 preserved).
- D-08: `heartbeat` refreshes only the caller's own `player_seen` entry and folds `transferHostIfStale` into the same write, reassigning a stale lobby host to the earliest-seated currently-connected player - lobby-phase only, per D-08's "host has no mid-game powers".
- D-07: `removePlayer` lets the host remove a non-host seat from the lobby only (`NOT_HOST` / `GAME_ALREADY_STARTED` / `BAD_REQUEST` on self-target / `NOT_IN_ROOM` guards), deleting the target's `player_seen` entry and never touching other seats.
- All seven Edge Functions (`create-room`, `join-room`, `start-game`, `apply-move`, `check-turn-timeout`, `heartbeat`, `remove-player`) pass `scripts/check-edge-wrappers.mjs`.

## Task Commits

Each task was committed atomically, RED (verified failing without the implementation) then GREEN:

1. **Task 1: Grace-period auto-pickup, verified by the server clock (D-05)** - `c643a6c` (feat)
2. **Task 2: Heartbeat and lazy lobby host transfer (D-08)** - `f9d0225` (feat)
3. **Task 3: Host removes a lobby player (D-07) and the three Deno wrappers** - `38b0bec` (feat)

_Note: TDD RED state for each task was verified by temporarily moving the implementation file aside, confirming the test failed to resolve the import, then restoring it and confirming all tests passed - not captured as separate git commits, since the plan calls for one atomic commit per task rather than per RED/GREEN step._

## Files Created/Modified

- `supabase/functions/_shared/turnTimeout.ts` - `checkTurnTimeout(store, { roomCode })`: server-clock-verified grace-period auto-pickup
- `supabase/functions/_shared/heartbeat.ts` - `heartbeat(store, { playerId, roomCode })` and pure `transferHostIfStale(state, playerSeen, nowMs)`
- `supabase/functions/_shared/removePlayer.ts` - `removePlayer(store, { playerId, roomCode, targetPlayerId })`: host-only, lobby-only removal
- `supabase/functions/check-turn-timeout/index.ts`, `supabase/functions/heartbeat/index.ts`, `supabase/functions/remove-player/index.ts` - thin Deno HTTP/auth/store bindings matching plan 02-05's wrapper shape
- `src/__tests__/edge/turnTimeout.test.ts` (8 tests), `src/__tests__/edge/heartbeat.test.ts` (9 tests), `src/__tests__/edge/removePlayer.test.ts` (6 tests)
- `.planning/phases/02-real-cross-device-multiplayer/deferred-items.md` - logged this plan's pre-existing-lint and stale-base-commit findings

## Decisions Made

- `checkTurnTimeout` intentionally omits a `playerId` from its input - the plan's own text frames this as "any authenticated player may call this", and the only authorisation that matters is the elapsed-time check, which is identity-agnostic. The Deno wrapper still requires a verified JWT (per `withSupabase({ auth: 'user' })`), so an anonymous caller still cannot trigger it.
- Neither `checkTurnTimeout` nor `heartbeat` logs an audit-log (`moves` table) entry via `withVersionRetry`'s optional `options` parameter - the plan's behaviour lists for both tasks make no mention of audit trail requirements for these two operations (unlike `applyRoomMove`, which explicitly does), so this was left out to stay within the specified scope.
- `removePlayer` checks caller-is-host before phase, before self-target, before target-exists, matching the order the behaviour list itself is written in.

## Deviations from Plan

None - plan executed exactly as written. Two pre-existing/environmental items were found and handled per the standard scope-boundary and Rule-3 processes (see below); neither required a plan or architectural change.

### Handled Automatically (not counted as "deviations" - environment setup, not code changes)

**1. Worktree branched from a stale ancestor commit**
- **Found during:** Pre-Task-1 setup, per the orchestrator's explicit instruction to check this before starting
- **Issue:** This worktree's HEAD (`d606485`) predated plan 02-03's merge of the shared modules (`engine.ts`, `db.ts`, `respond.ts`, `supabaseStore.ts`) this plan's tasks depend on; `node_modules` also did not exist
- **Fix:** Confirmed `git merge-base HEAD stage-1-refactor` equalled the pre-merge HEAD (a strict ancestor - safe fast-forward, no rewrite), ran `git merge --ff-only stage-1-refactor`, then `npm install`
- **Verification:** `git log --oneline -5` showed the expected ancestry chain post-merge; all subsequent shared-module imports resolved
- **Committed in:** not a task commit (environment setup only, no source changes)

### Out-of-scope items logged, not fixed

**1. Pre-existing `npm run lint` failures in `App.tsx`, `GameContext.tsx`, `GameScreen.tsx`**
- **Found during:** Task 3's full-suite lint check
- **Issue:** Three pre-existing lint errors/warnings (`react-hooks/exhaustive-deps`, `react-refresh/only-export-components`, `react-hooks/set-state-in-effect`), first logged by plan 02-01 and carried forward by every subsequent plan in this phase
- **Fix:** Not fixed - none of the three files are in this plan's file list, and `GameContext.tsx` is explicitly owned by sibling plan 02-09, executing in parallel in a separate worktree
- **Verification:** `npx eslint` scoped to this plan's own six new files returns zero errors and zero warnings
- **Logged in:** `.planning/phases/02-real-cross-device-multiplayer/deferred-items.md` under "Plan 02-07"

---

**Total deviations:** 0 (one environment-setup fix per explicit orchestrator instruction, one pre-existing issue logged and deferred)
**Impact on plan:** None - all three tasks implemented exactly as specified.

## Issues Encountered

None beyond the stale-worktree-base setup step called out above, which the orchestrator's prompt anticipated and gave an explicit recovery procedure for.

## User Setup Required

None - no external service configuration required. These are pure logic modules plus thin Deno wrappers; deployment/registration of the new Edge Functions with a live Supabase project is an operational step outside this plan's scope.

## Next Phase Readiness

- All three server-side disconnect-handling operations (D-05, D-07, D-08) are implemented, unit-tested, and pass the wrapper invariant checker - ready for plan 02-08 (Presence-based UI badges) and plan 02-12 (D-10 UI polish) to build on top of, provided they treat this plan's `player_seen`/grace-period signal and Presence as deliberately separate mechanisms (per RESEARCH.md Anti-Patterns).
- No blockers. `npm test -- --run` (full 255-test suite), `npm run build`, and `node scripts/check-edge-wrappers.mjs` all pass in this worktree; `npm run lint` fails only on the three pre-existing, out-of-scope issues logged above.

---
*Phase: 02-real-cross-device-multiplayer*
*Completed: 2026-07-27*

## Self-Check: PASSED

All nine created files confirmed present on disk (three `_shared/*.ts` modules, three Deno wrapper `index.ts` files, three `src/__tests__/edge/*.test.ts` files). All three task commit hashes (`c643a6c`, `f9d0225`, `38b0bec`) confirmed present in `git log --oneline --all`.
