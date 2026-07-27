---
phase: 02-real-cross-device-multiplayer
plan: 06
subsystem: api
tags: [deno, supabase-edge-functions, engine, optimistic-concurrency, security]

# Dependency graph
requires:
  - phase: 02-real-cross-device-multiplayer (plan 02-03)
    provides: "_shared/engine.ts barrel, _shared/db.ts (RoomStore, withVersionRetry), _shared/respond.ts (jsonResponse, edgeError)"
provides:
  - "startGame(store, input) - server-side deal via GameLogic.shuffleDeck(createDeck(n)), host/player-count/phase authorisation"
  - "applyRoomMove(store, input) - server-authoritative move application with playerId override and audit logging"
  - "start-game and apply-move Deno Edge Function wrappers"
affects: [02-11-realtime-sync, 02-12-turn-timeout, 02-13-smoke-test]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "compute(row) closures passed to withVersionRetry, returning ComputeSuccess or an EdgeError-shaped object"
    - "Engine error codes (ERROR_CODES) forwarded verbatim through an `as unknown as EdgeError` cast at the tier boundary, since EDGE_ERROR_CODES and ERROR_CODES are a deliberately disjoint closed set"

key-files:
  created:
    - supabase/functions/_shared/startGame.ts
    - supabase/functions/_shared/applyRoomMove.ts
    - supabase/functions/start-game/index.ts
    - supabase/functions/apply-move/index.ts
    - src/__tests__/edge/startGame.test.ts
    - src/__tests__/edge/applyRoomMove.test.ts
  modified:
    - .planning/phases/02-real-cross-device-multiplayer/deferred-items.md

key-decisions:
  - "turn_started_at resets unconditionally on every successful move (Pitfall 4 / Open Question 1, formally resolved by this plan) - simpler and cannot strand a player mid-burn-sequence with an expired clock"
  - "Engine errors are returned through applyRoomMove verbatim (same code/message) via a deliberate type-boundary cast, rather than re-mapping them into EDGE_ERROR_CODES, so client toast copy stays consistent regardless of which tier rejected the move"
  - "check-edge-wrappers.mjs and _shared/supabaseStore.ts (both owned by sibling plan 02-05) were not duplicated here to avoid a guaranteed merge conflict on the same new paths - the two wrappers were written to satisfy every invariant that script is specified to enforce, and import supabaseStore.ts exactly as 02-05 will provide it"

patterns-established:
  - "Deno wrapper shape: withSupabase({auth:'user'}) -> reject missing userClaims with UNAUTHENTICATED -> parse body in try/catch rejecting malformed JSON with BAD_REQUEST -> derive playerId only from ctx.userClaims.sub -> build store from ctx.supabaseAdmin -> jsonResponse(result)"

requirements-completed: [MPLAY-04]

# Metrics
duration: 20min
completed: 2026-07-27
---

# Phase 02 Plan 06: Server-Authoritative Dealing and Move Application Summary

**`start-game` and `apply-move` Edge Functions that deal and validate every move through the exact `applyMove`/`GameLogic` modules the browser calls, with server-verified identity, optimistic-concurrency retries, and an audit log — making a modified client unable to rig its hand or submit an illegal move.**

## Performance

- **Duration:** ~20 min
- **Started:** 2026-07-27T19:53:00+01:00
- **Completed:** 2026-07-27T20:00:30+01:00
- **Tasks:** 3/3
- **Files modified:** 7 (6 created, 1 log updated)

## Accomplishments

- Server-side deal (`startGame`) reproduces `LobbyScreen.tsx`'s deal exactly via `GameLogic.shuffleDeck(GameLogic.createDeck(n))`, gated on host identity, player count, and lobby phase — a modified client can no longer deal itself a winning hand
- Server-authoritative move application (`applyRoomMove`) overwrites `move.playerId` with the verified caller identity before calling `applyMove`, so a spoofed payload is rejected by the engine's own turn-ownership check
- `turn_started_at` reset unconditionally on every successful move, formally resolving RESEARCH.md's Open Question 1 (burn-and-go-again case)
- Every applied move is audited via `store.appendMove`
- Thin Deno wrappers for both functions bind identity from the verified JWT only, never the request body

## Task Commits

Each task was committed atomically:

1. **Task 1: Server-side deal (start-game logic)** - `3bd5531` (feat)
2. **Task 2: Server-authoritative move application with identity override and audit log** - `5499c52` (feat)
3. **Task 3: Deno wrappers for start-game and apply-move** - `045f936` (feat)

_All three tasks were `tdd="true"`/test-first except Task 3, which is a thin binding layer with no independent logic to test-first._

## Files Created/Modified

- `supabase/functions/_shared/startGame.ts` - Server-side deal: host/player-count/phase authorisation, deals via the shared engine barrel, sets `turn_started_at` from `store.now()`
- `supabase/functions/_shared/applyRoomMove.ts` - Validates move shape, overrides `playerId` with the verified caller identity, applies via `applyMove` under `withVersionRetry`, resets `turn_started_at` unconditionally, audits every success
- `supabase/functions/start-game/index.ts` - Deno wrapper binding HTTP/auth/store to `startGame`
- `supabase/functions/apply-move/index.ts` - Deno wrapper binding HTTP/auth/store to `applyRoomMove`, passing `move` through as `unknown`
- `src/__tests__/edge/startGame.test.ts` - 7 tests: all authorisation rejections, full deal shape, deck-count/card-conservation, no-duplicate-id, `turn_started_at`
- `src/__tests__/edge/applyRoomMove.test.ts` - 10 tests: identity override, malformed type rejection, engine-error passthrough, version increment, unconditional `turn_started_at` reset (burn-and-go-again), audit log, CONFLICT retry exhaustion, plus the 3-case cheating-client group
- `.planning/phases/02-real-cross-device-multiplayer/deferred-items.md` - Logged the two out-of-scope findings below

## Decisions Made

- **`turn_started_at` resets unconditionally on every successful move** (not only when the acting player changes) — resolves Open Question 1 exactly as the plan's frontmatter had already decided; documented in a code comment citing Pitfall 4.
- **Engine error codes are forwarded verbatim, not remapped** — `applyRoomMove` returns the exact `{code, message}` `applyMove` produced via a deliberate `as unknown as EdgeError` cast at the tier boundary (`ERROR_CODES` and `EDGE_ERROR_CODES` are a documented, deliberately disjoint closed set — see `roomTypes.ts`'s docstring — so this is a controlled bridge, not a merge of the two sets).
- **Did not duplicate sibling-owned infrastructure** — `scripts/check-edge-wrappers.mjs` and `supabase/functions/_shared/supabaseStore.ts` are both in plan 02-05's `files_modified` list; 02-05 executes in parallel in a separate worktree and hadn't merged into this worktree's base at execution time. Rather than write competing copies (guaranteed merge conflict on the same new paths), the two wrappers here were written to satisfy every invariant the checker script is specified to enforce, and import `supabaseStore.ts` exactly as 02-05 will provide it.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Worktree branch was missing plan 02-03's merged shared modules**
- **Found during:** Pre-Task 1 setup
- **Issue:** This worktree's branch (`worktree-agent-ad2fd81286abb82bf`) was created before the `stage-1-refactor` branch received the 02-03 merge (`_shared/engine.ts`, `db.ts`, `respond.ts`, `roomTypes.ts`, etc.) — none of those files existed here, which this plan's own `depends_on: ["02-03"]` requires.
- **Fix:** Fast-forwarded (`git merge --ff-only stage-1-refactor`) since this worktree's HEAD was a clean ancestor of `stage-1-refactor` with no unique commits of its own — no conflict, no rebase, no destructive operation.
- **Files modified:** none directly; brought in 111 files from the already-merged base.
- **Verification:** `git log --oneline -5` confirmed the fast-forward; baseline `npm test -- --run` (194 tests) passed immediately after.
- **Committed in:** n/a (fast-forward merge, not a new commit)

---

**Total deviations:** 1 auto-fixed (1 blocking); 2 findings logged out-of-scope (see below)
**Impact on plan:** The fast-forward was necessary infrastructure, not a scope change — no plan logic was altered. The two logged findings do not affect the correctness or security of this plan's own deliverables; both are cross-plan integration items for Wave 3's merge step.

## Issues Encountered

- **`npm run lint` exits 1** (pre-existing, out of scope) — same three issues already logged under Plans 02-01/02-03/02-04 in `App.tsx`, `GameContext.tsx`, `GameScreen.tsx` (the latter explicitly off-limits this wave). `npx eslint` on this plan's four new files is clean. Logged in `deferred-items.md` under "Plan 02-06".
- **`node scripts/check-edge-wrappers.mjs` could not be run** — the script (and `_shared/supabaseStore.ts`) is created by sibling plan 02-05, executing in parallel, and wasn't present in this worktree. Verified the wrapper invariants it's specified to enforce via direct grep checks and `npm run build` instead; flagged for a mandatory re-run once 02-05 merges. Full detail in `deferred-items.md` under "Plan 02-06".

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- `startGame` and `applyRoomMove` are ready to be wired into the realtime-sync and turn-timeout plans (02-11/02-12), which will call these same Edge Functions rather than any client-side mutation path.
- **Blocker for full Task 3 sign-off:** once plan 02-05 merges (bringing `scripts/check-edge-wrappers.mjs` and `_shared/supabaseStore.ts`), re-run `node scripts/check-edge-wrappers.mjs` against `start-game/index.ts` and `apply-move/index.ts` to confirm they pass the live checker unchanged, and confirm `createSupabaseRoomStore` resolves as imported.

---
*Phase: 02-real-cross-device-multiplayer*
*Completed: 2026-07-27*
