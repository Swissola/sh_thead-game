---
phase: 02-real-cross-device-multiplayer
plan: 15
subsystem: api
tags: [supabase-edge-functions, postgres-rpc, realtime, react-hooks, vitest, tdd]

# Dependency graph
requires:
  - phase: 02-real-cross-device-multiplayer
    provides: "02-14's merged D-05/sweep-warn work; 02-13's live two-device UAT that found this gap (test 3: routine connectivity bookkeeping pollutes the game-state version stream)"
provides:
  - "touch_player_seen: a row-atomic, version-exempt single-key player_seen merge, granted only to service_role"
  - "RoomStore.touchPlayerSeen port member plus its PostgREST rpc-backed implementation"
  - "heartbeat's common (non-host-transferring) path routed through touchPlayerSeen instead of withVersionRetry"
  - "joinRoom's D-01 auto-rejoin branch routed through touchPlayerSeen instead of withVersionRetry"
  - "A live smoke-suite assertion proving a heartbeat's version is unchanged against a real Postgres row"
affects: [02-uat-retest]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Pre-read plus a state-unchanged-condition branch (nextState.host !== row.state.host; resolution.type === 'existing') to route the no-op common case through a version-exempt write, falling through to withVersionRetry's full CAS path for every case that genuinely mutates state"
    - "A single-statement Postgres UPDATE with a jsonb `||` merge evaluated under the row lock, for concurrency-safe additive writes that don't need optimistic-concurrency versioning"

key-files:
  created:
    - supabase/migrations/0003_touch_player_seen.sql
  modified:
    - supabase/functions/_shared/db.ts
    - supabase/functions/_shared/supabaseStore.ts
    - supabase/functions/_shared/heartbeat.ts
    - supabase/functions/_shared/joinRoom.ts
    - scripts/smoke-edge-functions.mjs
    - src/__tests__/edge/db.test.ts
    - src/__tests__/edge/heartbeat.test.ts
    - src/__tests__/edge/joinRoom.test.ts
    - src/__tests__/edge/applyRoomMove.test.ts
    - src/__tests__/edge/createRoom.test.ts
    - src/__tests__/edge/removePlayer.test.ts
    - src/__tests__/edge/startGame.test.ts
    - src/__tests__/edge/turnTimeout.test.ts

key-decisions:
  - "touch_player_seen is a plain (invoker-rights) SQL function, not definer-rights - service_role already bypasses RLS, so elevated execution rights would buy nothing and would punch a hole through 0001's deny-all-writes-for-authenticated posture. Execute is revoked from public/anon/authenticated and granted only to service_role"
  - "The branch decision compares on nextState.host !== row.state.host (heartbeat) / resolution.type === 'existing' (joinRoom) rather than object identity, since transferHostIfStale's early exits happen to return the same object today but that's an implementation detail, not a documented contract"
  - "No client-side file changed anywhere in this plan - useRoomSubscription's existing T-02-29 stale-delivery filter (version <= lastAppliedVersionRef.current) already discards a same-version broadcast before it reaches the reconciliation comparison that was producing the false toasts"

requirements-completed: [MPLAY-01, MPLAY-02, MPLAY-03, MPLAY-05, MPLAY-06]

# Metrics
duration: 55min
completed: 2026-07-30
---

# Phase 02 Plan 15: Version-Exempt Connectivity Bookkeeping Summary

**A row-atomic `touch_player_seen` Postgres function plus a `RoomStore.touchPlayerSeen` port member, so heartbeat's ~15s cadence and join-room's D-01 auto-rejoin stop bumping the room version and polluting the client's reconciliation stream.**

## Performance

- **Duration:** 55 min (includes worktree catch-up, a broken local Supabase stack requiring a stop/start cycle, and diagnosing a pre-existing smoke-suite process-exit hang)
- **Started:** 2026-07-30T08:21:43Z (first RED commit, this session)
- **Completed:** 2026-07-30T08:39:35Z (final full-suite green run)
- **Tasks:** 3 completed
- **Files modified:** 13 (1 created, 12 modified)

## Accomplishments

- `supabase/migrations/0003_touch_player_seen.sql` adds `public.touch_player_seen(room_code, player_id, seen_at)`: a single `UPDATE ... SET player_seen = player_seen || jsonb_build_object(...)` with `version` deliberately absent from the SET list, so the write never enters the client's game-state reconciliation stream. The `||` merge is evaluated under Postgres's row lock, so two heartbeats landing at the same instant (same-identity multi-tab, or two different players) both survive rather than one silently clobbering the other.
- `RoomStore` gains a required `touchPlayerSeen` member, implemented against a real `service_role` PostgREST `rpc()` call in `supabaseStore.ts` and stubbed (with a `touchCount` counter kept strictly separate from `writeCount`) across all eight `FakeRoomStore` test fixtures, so every existing "writes nothing" assertion keeps its exact prior meaning.
- `heartbeat()` is restructured into a pre-read plus a two-way branch: the common ~15s case (host unchanged) now writes via `touchPlayerSeen`, leaving version untouched; a genuine lobby host transfer still falls through to `withVersionRetry`'s full CAS path, recomputed against a freshly re-read row.
- `joinRoom()`'s D-01 auto-rejoin branch gets the identical treatment: only `resolution.type === 'existing'` takes the version-exempt path; takeover, new-join and every `EdgeError` resolution still bump the version through the unchanged `withVersionRetry` block.
- The live smoke suite (`scripts/smoke-edge-functions.mjs`) now captures the room's version immediately before a heartbeat and asserts the response carries the identical value - the one assertion that can only be proven against a real Postgres row, since the Vitest fakes can't disprove that the SQL function silently bumps version too. Run against the local Docker stack: **PASS**.
- No client-side file changed anywhere in this plan (`git diff` against `src/hooks/useRoomSubscription.ts`, `src/context/GameContext.tsx`, `src/hooks/usePresence.ts` is empty) - the existing T-02-29 stale-delivery filter already discards a same-version broadcast for free.

## Task Commits

All three tasks followed RED -> GREEN TDD:

1. **Task 1: A row-atomic, version-exempt `player_seen` write path**
   - `c8dee3c` (feat) - migration, `RoomStore.touchPlayerSeen`, `supabaseStore.ts` rpc implementation, and the eight `FakeRoomStore` stubs plus a new `db.test.ts` port-contract test, all landed in one commit since the eight-file stub edit is purely mechanical scaffolding rather than behaviour under test (see `<action>`'s own note in the plan)
2. **Task 2: Route the heartbeat through the version-exempt path**
   - `61829fd` (test) - failing test proving an ordinary heartbeat currently bumps version (fails against the pre-existing unconditional `withVersionRetry` body)
   - `a2f106c` (feat) - the pre-read/branch rewrite
3. **Task 3: The same treatment for join-room's D-01 branch, proven end to end**
   - `8c48d42` (test) - failing test proving a D-01 auto-rejoin currently bumps version
   - `3f059a4` (feat) - the pre-read/branch rewrite plus the smoke-suite's new unchanged-version assertion
   - `62d73b3` (docs) - deferred-items log entry for the pre-existing smoke-suite exit hang and the stale worktree/Docker findings from setup (see Deviations below)

**Plan metadata:** committed separately after this summary (see final commit below)

## Files Created/Modified

- `supabase/migrations/0003_touch_player_seen.sql` - the version-exempt, row-atomic `player_seen` merge function, execute revoked from `public`/`anon`/`authenticated`, granted only to `service_role`
- `supabase/functions/_shared/db.ts` - adds `RoomStore.touchPlayerSeen`; `withVersionRetry` untouched
- `supabase/functions/_shared/supabaseStore.ts` - adds the `rpc` structural member and the `touchPlayerSeen` implementation
- `supabase/functions/_shared/heartbeat.ts` - pre-read plus branch: `touchPlayerSeen` on the common path, `withVersionRetry` only on a genuine host transfer
- `supabase/functions/_shared/joinRoom.ts` - pre-read plus branch: `touchPlayerSeen` only when `resolveSeat` resolves `'existing'`
- `scripts/smoke-edge-functions.mjs` - the heartbeat check now also asserts the response's version equals the pre-call version
- `src/__tests__/edge/db.test.ts` - new `touchPlayerSeen` port-contract tests
- `src/__tests__/edge/heartbeat.test.ts` - 6 new tests (version-unchanged, write/touch counts, ROOM_NOT_FOUND, host-transfer-still-CAS, turn-timer-untouched-on-both-paths)
- `src/__tests__/edge/joinRoom.test.ts` - 6 new tests (BAD_REQUEST x2, D-01 write/touch counts, takeover/new-join version-bump assertions, rejection write/touch counts)
- `src/__tests__/edge/applyRoomMove.test.ts`, `createRoom.test.ts`, `removePlayer.test.ts`, `startGame.test.ts`, `turnTimeout.test.ts` - `touchPlayerSeen` stub added to each `FakeRoomStore` (Task 1 mechanical scaffolding, required for `implements RoomStore`)

## Decisions Made

- Followed the plan's fully-specified branch shape verbatim in both `heartbeat.ts` and `joinRoom.ts`: pre-read, resolve, branch on a state-unchanged condition (not object identity), fall through to the unchanged `withVersionRetry` for every case that mutates state.
- `touch_player_seen` deliberately omits `SECURITY DEFINER` - documented as a correctness/security decision in the migration's own header comment rather than left implicit, per the plan's explicit instruction and its acceptance criterion forbidding the phrase anywhere in the file.
- Left the accepted-and-documented race window in `joinRoom.ts` (a concurrent remove-player/takeover between the pre-read and the `touchPlayerSeen` write could leave an orphan `player_seen` key) exactly as the plan specifies - no defensive re-check added, since one would reintroduce the version bump this task removes.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Fast-forwarded a stale worktree branch before any task work**
- **Found during:** Initial setup, before Task 1
- **Issue:** The worktree branch (`worktree-agent-ab626206d94067ea1`) was checked out at `d606485`, an ancestor of `stage-1-refactor` missing all of Phase 02's multiplayer work and the `.planning/` scaffolding entirely - none of the plan's referenced files existed on disk.
- **Fix:** Confirmed zero unique commits on the worktree branch (`git log stage-1-refactor..HEAD` was empty; `HEAD..stage-1-refactor` showed 182 commits), then ran `git merge --ff-only stage-1-refactor` - a lossless fast-forward.
- **Files modified:** none (git ref update only)
- **Verification:** `npm test -- --run` passed 377/377 on the pre-existing suite before any plan changes were made
- **Committed in:** fast-forward merge, no new commit object (HEAD moved to existing `5827db3`)

**2. [Rule 3 - Blocking] Recreated a broken local Supabase Docker stack**
- **Found during:** Task 3, before running the live smoke suite
- **Issue:** `edge_runtime` and `studio` containers were `Exited`, with bind mounts pointing at a different, no-longer-matching worktree path (visible only via a `docker start` OCI mount error). `supabase status -o json` was missing `FUNCTIONS_URL` as a result, which the smoke suite's preflight requires.
- **Fix:** `npx supabase stop` followed by `npx supabase start` recreated both containers correctly bound to the current worktree.
- **Files modified:** none (Docker container recreation only, no code or migration change)
- **Verification:** `supabase status -o json` gained `FUNCTIONS_URL`; the local stack answered the smoke suite's readiness probe

---

**Total deviations:** 2 auto-fixed (both Rule 3 - blocking, both environment/worktree setup, neither touching plan task scope). Full detail and a third non-blocking finding (a pre-existing smoke-suite process-exit hang, unrelated to this plan's edits) logged in `deferred-items.md` per scope-boundary rules rather than fixed inline.
**Impact on plan:** Both fixes were prerequisites for executing the plan or verifying it live; no scope creep into the plan's three tasks.

## Issues Encountered

- **`npm run test:edge:smoke` hangs after printing all results.** `main()` in `scripts/smoke-edge-functions.mjs` never calls `process.exit()`, and the spawned `supabase functions serve` child's piped stdio keeps Node's event loop alive indefinitely. Confirmed via Kong/GoTrue container logs that the entire 18-check, 7-function run completed correctly in under a minute; the process needed a manual kill roughly 8 minutes later, at which point the harness delivered the buffered stdout showing every check as `PASS`, including both new heartbeat-version assertions. This is pre-existing script behaviour outside this task's touched files (the spawn/exit lifecycle code, not the `check()` calls), so it was logged to `deferred-items.md` rather than fixed. **All local/Docker-level - nothing here required touching the hosted Supabase project.**

## Stubs

None.

## Threat Flags

None - all five threats this plan's `<threat_model>` registers (T-02-40 through T-02-45) are mitigated exactly as specified: `touch_player_seen`'s execute grant is `service_role`-only with no elevated rights (T-02-40); both callers pass only the server-verified caller identity, never a body-supplied id (T-02-41); the row-lock-evaluated `||` merge prevents a lost update under concurrent writers (T-02-42); only the two documented, state-unchanged-gated call sites use the exempt path, with every other outcome still bumping version (T-02-43); the accepted no-audit-trail gap for connectivity bookkeeping is unchanged from the plan's own accepted disposition (T-02-44); the common path is now strictly cheaper (a single UPDATE, no read-compute-write retry loop) than the CAS path it replaces (T-02-45). No new trust-boundary surface introduced beyond what the plan's threat register already covers.

## User Setup Required

None - no external service configuration required. The migration applies cleanly to the local Docker stack (`npx supabase db reset` shows `0003_touch_player_seen.sql` applying without error); it has **not** been deployed to the hosted "Sh!thead" Supabase project, since the plan's own verification section only requires local Docker and deploying to the shared hosted environment was out of scope for this executor to do unprompted. Flagging back per the orchestrating instructions: **if the hosted project needs this migration too, that's a separate, explicit deploy step for the user to authorise.**

## Next Phase Readiness

- The major gap from `02-UAT.md` test 3 (routine connectivity bookkeeping producing false "your move didn't stick" reconciliation toasts) is closed and both unit-tested and live-smoke-tested against real Postgres.
- `02-UAT.md` test 3 should be retested live (two-device) to confirm the fix behaves as expected outside the automated harness - this plan closes the code-level gap but does not itself constitute the UAT retest.
- The hosted Supabase project has not received migration `0003`; deploying it there (if/when the hosted project needs the fix) is a separate, explicit step for the user.

---
*Phase: 02-real-cross-device-multiplayer*
*Completed: 2026-07-30*

## Self-Check: PASSED

All 6 commits (`c8dee3c`, `61829fd`, `a2f106c`, `8c48d42`, `3f059a4`, `62d73b3`) confirmed present in `git log`. All 11 claimed files confirmed present: the 10 tracked source/test/migration/script files (`git ls-files`) plus this summary file itself (untracked pending the final metadata commit).
