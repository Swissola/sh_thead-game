---
phase: 02-real-cross-device-multiplayer
plan: 05
subsystem: backend
tags: [supabase, edge-functions, deno, rls, optimistic-concurrency, vitest, reconnect]

# Dependency graph
requires:
  - phase: 02-real-cross-device-multiplayer (plan 03)
    provides: RoomStore port + withVersionRetry (supabase/functions/_shared/db.ts), EdgeError/EDGE_ERROR_CODES/DISCONNECT_THRESHOLD_MS (src/supabase/roomTypes.ts), respond.ts's jsonResponse/edgeError
provides:
  - "supabase/functions/_shared/createRoom.ts - server-side room creation with crypto.getRandomValues code generation and bounded collision retry"
  - "supabase/functions/_shared/joinRoom.ts - joinRoom + resolveSeat covering new join, D-01 auto-rejoin, D-02/D-06 rejoin-by-name, D-04 never-free-a-seat"
  - "supabase/functions/_shared/supabaseStore.ts - concrete RoomStore backed by a service-role Supabase client, structurally-typed admin parameter"
  - "supabase/functions/create-room/index.ts and supabase/functions/join-room/index.ts - Deno wrappers deriving identity only from ctx.userClaims.sub"
  - "scripts/check-edge-wrappers.mjs - static invariant checker over every supabase/functions/*/index.ts, reusable unchanged by 02-06/02-07"
affects: [02-real-cross-device-multiplayer (Wave 4+ Edge Functions), MPLAY-01, MPLAY-03, MPLAY-04]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Structurally-typed service-role client parameter: supabaseStore.ts defines its own minimal from/select/eq/single/insert/update/eq/eq/select interface instead of importing @supabase/supabase-js's generic client type, so the file needs no npm-scheme specifier and stays type-checked by tsc"
    - "Pure seat-resolution helper (resolveSeat) separated from the store-mutating joinRoom, so the full D-06 stale/live/ambiguous matrix is unit-tested without touching withVersionRetry at all"

key-files:
  created:
    - supabase/functions/_shared/createRoom.ts
    - supabase/functions/_shared/joinRoom.ts
    - supabase/functions/_shared/supabaseStore.ts
    - supabase/functions/create-room/index.ts
    - supabase/functions/join-room/index.ts
    - scripts/check-edge-wrappers.mjs
    - src/__tests__/edge/createRoom.test.ts
    - src/__tests__/edge/joinRoom.test.ts
  modified:
    - .planning/phases/02-real-cross-device-multiplayer/deferred-items.md

key-decisions:
  - "resolveSeat checks a live name match before counting stale matches: any currently-connected seat with a matching name returns NAME_IN_USE regardless of how many stale seats also match, since the plan's behaviour list treats a live match as an unconditional rejection rather than something that competes with the stale-match count."
  - "A takeover rewrites only the seat's id, not its name - the caller's freshly-typed name is discarded in favour of the original seat's stored name, since the plan specifies id-rewrite plus exact preservation of hand/faceUp/faceDown/isReady and says nothing about renaming an existing seat."
  - "player_seen tracks by current player id: a takeover deletes the old (pre-takeover) id's player_seen entry and writes a fresh one under the new id, since continuing to track liveness under a stale id that no longer identifies anyone in state.players would be meaningless."

requirements-completed: [MPLAY-01, MPLAY-03, MPLAY-04]

# Metrics
duration: ~65min
completed: 2026-07-27
---

# Phase 2 Plan 5: Room Creation, Joining and Reconnect Edge Functions Summary

**Room creation and joining moved fully server-side - `create-room`/`join-room` Deno wrappers deriving identity only from the verified JWT, backed by testable `createRoom`/`joinRoom` logic modules that implement the complete D-01/D-02/D-04/D-06 reconnect story.**

## Performance

- **Duration:** ~65 min
- **Tasks:** 3 of 3 complete
- **Files created:** 8 (6 source, 2 test); 1 file modified (deferred-items.md)
- **Tests added:** 21 (6 createRoom + 15 joinRoom); full `src/__tests__/edge/` suite now 32; full repo suite 215/215

## Accomplishments

- `createRoom.ts`: server-generated 6-character uppercase room code from `crypto.getRandomValues` (WR-03 behaviour ported verbatim), bounded 5-attempt collision retry against `insertRoom`'s unique-violation report, and a fully-formed lobby `GameState` with `version` 0 and `turnStartedAt`/`playerSeen[playerId]` sourced only from `store.now()`.
- `joinRoom.ts` + exported `resolveSeat`: the complete reconnect matrix - D-01 auto-rejoin by id in any phase, D-02/D-06 rejoin-by-name requiring exactly one stale (missing-or-expired `player_seen`) name match, `NAME_IN_USE`/`NAME_AMBIGUOUS` for live/multiple-stale matches, `GAME_ALREADY_STARTED` for a fresh name with no match once the game has left the lobby, and D-04's guarantee that no path ever shrinks `state.players`. All mutation runs through `withVersionRetry` from plan 02-03, closing the WR-02 read-modify-write race.
- `supabaseStore.ts`: concrete `RoomStore` backed by a service-role client, taking the admin client as a locally-defined structural type (no `@supabase/supabase-js` import, no Deno npm-scheme specifier) so it stays type-checked by `tsc -b`. Maps Postgres unique-violation (`23505`) to `insertRoom`'s `false` return and PostgREST's no-row-found (`PGRST116`) to `readRoom`'s `null`.
- `create-room`/`join-room` Deno wrappers: `withSupabase({ auth: 'user' })`, reject missing `ctx.userClaims` or malformed JSON before any logic runs, and derive `playerId` exclusively from `ctx.userClaims.sub` - the request body's `playerName`/`roomCode` fields are read, but any body-supplied id is ignored (T-02-13).
- `scripts/check-edge-wrappers.mjs`: discovers every `supabase/functions/<name>/index.ts` (no hard-coded function names, so 02-06/02-07 reuse it unchanged) and fails non-zero if a wrapper drops `withSupabase`/`userClaims`/`ctx.supabaseAdmin`, reads `body.playerId`, calls `applyMove(` directly, or exceeds 80 lines. Verified the body-id regression detection by temporarily editing `create-room/index.ts` to read `body.playerId`, confirming a `FAIL` + exit 1, then reverting.

## Task Commits

1. **Task 1: createRoom logic with server-side code generation and collision retry** - `d5be6d4` (feat)
2. **Task 2: joinRoom logic covering new join, auto-rejoin and rejoin-by-name (D-01, D-02, D-04, D-06)** - `b00434b` (feat)
3. **Task 3: Deno wrappers for create-room and join-room, plus a wrapper invariant checker** - `ad677af` (feat)

## Files Created/Modified

- `supabase/functions/_shared/createRoom.ts` - `createRoom(store, input)`, `generateRoomCode()` (unexported)
- `supabase/functions/_shared/joinRoom.ts` - `joinRoom(store, input)`, exported `resolveSeat(state, playerSeen, playerId, playerName, nowMs)`
- `supabase/functions/_shared/supabaseStore.ts` - `createSupabaseRoomStore(admin)`, `SupabaseAdminClient` structural type
- `supabase/functions/create-room/index.ts` - Deno wrapper (39 lines)
- `supabase/functions/join-room/index.ts` - Deno wrapper (32 lines)
- `scripts/check-edge-wrappers.mjs` - static invariant checker, directory-driven discovery
- `src/__tests__/edge/createRoom.test.ts` - 6 tests: lobby shape, code format, collision retry, collision exhaustion, empty-name rejection, server-sourced timestamps
- `src/__tests__/edge/joinRoom.test.ts` - 15 tests: the `resolveSeat` D-06 matrix (7 cases) plus `joinRoom` integration tests (room-not-found, D-01 mid-game rejoin, new join, GAME_ALREADY_STARTED, NAME_IN_USE, NAME_AMBIGUOUS, takeover preservation, D-04 player-count invariant)
- `.planning/phases/02-real-cross-device-multiplayer/deferred-items.md` - logged the recurring pre-existing lint failures (same three files as plans 02-01/02-03/02-04) and the stale-worktree-base issue found and fixed at session start

## Decisions Made

See `key-decisions` in frontmatter: live-match priority in `resolveSeat`, takeover preserving the seat's original stored name (not the caller's freshly-typed name), and rebuilding `player_seen` under the new id on takeover rather than leaving a stale key behind.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking issue, environment] Worktree branch was stuck on a stale base commit predating plan 02-03's merged shared modules**
- **Found during:** Setup, before Task 1 - every read of `supabase/functions/_shared/db.ts`, `engine.ts`, `respond.ts`, `src/supabase/roomTypes.ts` and the current `MenuScreen.tsx`/`types.ts` initially succeeded (the `Read` tool resolves paths outside worktree restrictions), but `git status`/`ls` inside the actual worktree showed none of those files existed there - `git log` showed HEAD at `d606485`, an old pre-Phase-2 commit, while `stage-1-refactor` (the intended base, per the orchestrator's own framing that "02-03 is already merged into the base branch this worktree starts from") was at `bc1c915`.
- **Fix:** Confirmed `git merge-base HEAD stage-1-refactor` equalled `HEAD` exactly (i.e. HEAD is a strict ancestor of `stage-1-refactor` - the fast-forward is safe and loses no work), then ran `git merge --ff-only stage-1-refactor`. This is a non-destructive, purely-additive operation, not a `reset --hard`/`clean`/force-push. Also ran `npm install` since `node_modules` didn't exist yet.
- **Files modified:** none directly; branch pointer moved forward via fast-forward merge, bringing in 111 files from the correct base
- **Verification:** `git status --short` afterwards showed only my own two untracked Task-1 files; re-read `db.ts`/`roomTypes.ts`/`types.ts` from the worktree path and confirmed they matched what I'd already built Task 1 against
- **Committed in:** no separate commit (the merge itself is a fast-forward, not a new commit); documented in `ad677af`'s message and in `deferred-items.md`

**2. [Rule 1 - Bug] Comment containing a literal `*/` prematurely closed a JSDoc block in the new checker script**
- **Found during:** Task 3, first `node scripts/check-edge-wrappers.mjs` run
- **Issue:** The doc comment described `supabase/functions/*/index.ts` inline; that string contains the literal characters `*/`, closing the `/**` block comment mid-sentence and corrupting the rest of the file into a syntax error. (Plan 02-03's summary records the identical mistake in `respond.ts` - not re-learned from that record, independently rediscovered here.)
- **Fix:** Reworded to `supabase/functions/<name>/index.ts` (no `*/` substring).
- **Files modified:** `scripts/check-edge-wrappers.mjs`
- **Verification:** `node scripts/check-edge-wrappers.mjs` runs and prints `PASS create-room` / `PASS join-room`
- **Committed in:** `ad677af` (Task 3 commit)

**3. [Rule 1 - Bug] Same `npm:` literal-substring issue in a doc comment, this time against an acceptance-criteria grep**
- **Found during:** Task 3, running the acceptance criterion `grep -c "npm:" supabase/functions/_shared/supabaseStore.ts` (expected 0)
- **Issue:** A doc comment explaining *why* the file avoids an npm-scheme specifier used the literal substring `` `npm:` `` , which the grep (correctly) matched, giving a false-positive failure of a criterion the file's actual code satisfies.
- **Fix:** Reworded the comment to "Deno npm-scheme import specifier" (no bare `npm:` substring).
- **Files modified:** `supabase/functions/_shared/supabaseStore.ts`
- **Verification:** `grep -c "npm:" supabase/functions/_shared/supabaseStore.ts` returns 0; `npm run build` still exits 0
- **Committed in:** `ad677af` (Task 3 commit)

### Out of Scope (logged, not fixed)

**4. `npm run lint` still exits 1** - the same three pre-existing issues logged under plans 02-01/02-03/02-04 in `deferred-items.md` (`src/App.tsx:32`, `src/context/GameContext.tsx:98`, `src/screens/GameScreen.tsx:85`), none of which this plan touches (and `GameContext.tsx` is explicitly out of bounds per this session's own instructions, being owned by a parallel wave). Confirmed this plan's own lintable files (`supabaseStore.ts`, both test files, `check-edge-wrappers.mjs`; `index.ts` wrappers are globally ignored by `eslint.config.js`) are clean in isolation via `npx eslint <those four files>` (zero output). Logged as a new dated entry in `deferred-items.md` under "Plan 02-05 (Task 3)".

---

**Total deviations:** 4 (1 environment/blocking-issue fix, 2 Rule-1 bug fixes in this plan's own new files, 1 logged-not-fixed pre-existing issue)
**Impact on plan:** No scope creep. The worktree-base fix was required before any task could run at all (none of the imported modules existed on disk without it) and was strictly additive. Both Rule-1 fixes were in files this task creates. The lint carry-forward is the same known issue four plans running, unrelated to this task's files, and explicitly out of bounds for `GameContext.tsx` per the parallel-wave file-ownership boundary.

## Issues Encountered

- See Deviation 1 above - resolved before Task 1 began.
- Sibling worktrees for plans 02-06/02-07/02-08/02-09 may have the same stale-base issue if they were branched the same way; flagged in `deferred-items.md` for visibility, not something this plan's execution can check or fix from inside its own worktree.

## Next Phase Readiness

- `create-room`/`join-room` are ready for live end-to-end smoke testing (plan 02-13, per the plan's own note that live serving verification happens there, not here).
- `scripts/check-edge-wrappers.mjs` is ready to be reused unchanged by plans 02-06 (`start-game`) and 02-07 (`apply-move`) for their own wrapper invariant checks.
- `resolveSeat` and `withVersionRetry` are both independently unit-tested and composed only inside `joinRoom` - future Edge Functions needing similar seat/version logic can reuse either piece directly.
- Requirements `MPLAY-01`, `MPLAY-03`, `MPLAY-04` can now be marked complete for this plan's scope (server-side room lifecycle; move validation itself is plan 02-07's scope).

## Self-Check: PASSED

- All 8 claimed files verified present on disk (`createRoom.ts`, `joinRoom.ts`, `supabaseStore.ts`, `create-room/index.ts`, `join-room/index.ts`, `check-edge-wrappers.mjs`, `createRoom.test.ts`, `joinRoom.test.ts`).
- All 3 referenced commit hashes (`d5be6d4`, `b00434b`, `ad677af`) verified present in `git log --oneline --all`.
