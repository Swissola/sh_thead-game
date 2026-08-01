---
phase: 02-real-cross-device-multiplayer
plan: 13
subsystem: testing
tags: [deno, supabase-functions-serve, smoke-test, jwt, presence, manual-verification]

# Dependency graph
requires:
  - phase: 02-real-cross-device-multiplayer
    provides: "All seven Edge Function wrappers (02-05 through 02-07) and the hosted Supabase project (02-03)"
provides:
  - "scripts/smoke-edge-functions.mjs - a scripted supabase functions serve + fetch harness proving all seven Edge Function wrappers boot and enforce their JWT/RLS boundary for real, not just via Vitest mocks"
  - "The two Manual-Only Verification rows (MPLAY-01, MPLAY-06) in 02-VALIDATION.md, signed off against real two-device play on the hosted project"
  - "Four genuine pre-existing bugs found only by running the smoke suite for real: missing .ts extension blocking every function under Deno, anonymous sign-in left disabled locally, all seven wrappers reading the wrong JWT-claims field (.sub instead of .id), missing local Postgres table-level grants beneath RLS - all fixed via migration 0002_local_dev_grants.sql"
affects: [02-14, 02-15, 02-16, 02-17, 02-18, 02-19]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Edge Function integration testing via scripted supabase functions serve + fetch, not the Deno test runner - stubbing out withSupabase({ auth: 'user' })'s JWT validation to unit-test with deno test would test everything except the thing worth testing"
    - "Smoke suite parses its target URL/key from npx supabase status, never from .env.local, so it can never accidentally write to the hosted production project"

key-files:
  created:
    - scripts/smoke-edge-functions.mjs
  modified:
    - supabase/migrations/0002_local_dev_grants.sql
    - supabase/functions/_shared/*.ts (JWT claims field fix, .ts extension fix)
    - .planning/phases/02-real-cross-device-multiplayer/02-UAT.md
    - .planning/phases/02-real-cross-device-multiplayer/02-VERIFICATION.md
    - .planning/phases/02-real-cross-device-multiplayer/02-VALIDATION.md

key-decisions:
  - "Scripted supabase functions serve + fetch chosen over the Deno test runner for Edge Function integration testing (Wave 0 decision)"
  - "npm:@supabase/server's verifyAuth short-circuits an unauthenticated request with its own INVALID_CREDENTIALS shape before ctx.userClaims's missing-token branch is ever reached - the smoke suite asserts the real observable contract (401, request never reaches game logic) instead of the plan's literal UNAUTHENTICATED code"
  - "Task 3's manual two-device sign-off was satisfied incrementally across this session's live gap-closure testing (02-UAT.md tests 1 through 10) rather than as a single isolated pass, since every subsequent gap-closure plan (02-14 through 02-19) needed the same hosted two-device setup to find and confirm its own fixes"

requirements-completed: [MPLAY-01, MPLAY-02, MPLAY-03, MPLAY-04, MPLAY-05, MPLAY-06]

# Metrics
duration: ~6min (Tasks 1-2, active execution) + ongoing manual verification across the phase's gap-closure sessions (Task 3)
completed: 2026-08-01
---

# Phase 02, Plan 13: Edge Function Smoke Suite and Two-Device Sign-Off Summary

**A scripted `supabase functions serve` smoke harness over all seven Edge Functions, which caught four real pre-existing bugs no Vitest mock could reach, plus the phase's manual two-device sign-off closed out against this session's full live-testing record.**

## Performance

- **Started:** 2026-07-28T19:16:30+01:00 (Task 1)
- **Task 1/2 completed:** 2026-07-28T19:22:18+01:00
- **Task 3 (manual verification) performed:** 2026-07-28 through 2026-08-01, across this session's UAT/gap-closure cycles
- **Tasks:** 3 (all complete)
- **Files modified:** 1 new script, 1 migration, all 7 Edge Function wrappers (claims-field fix), plus the phase's UAT/VERIFICATION/VALIDATION docs

## Accomplishments

- **Task 1** — `scripts/smoke-edge-functions.mjs`: spawns `supabase functions serve` for real, mints anonymous JWTs, and proves the authentication/identity invariants at runtime rather than via mocked claims - an unauthenticated request is rejected 401 before it ever reaches game logic, and each wrapper overrides the request body's `playerId` with the JWT-verified subject (MPLAY-04's actual security boundary).
- **Task 2** — extends the smoke pass to a full room-lifecycle walk over all seven wrappers (`create-room`, `join-room`, `start-game`, `apply-move`, `check-turn-timeout`, `heartbeat`, `remove-player`), confirming each one boots under Deno and round-trips against a real (local) Postgres instance, not a Vitest fake.
- **Task 3** — the phase's blocking manual two-device checkpoint. Rather than one isolated pass, this was satisfied across the session's full gap-closure arc: `02-UAT.md`'s ten logged tests, run live against the hosted Supabase project on real PC + phone hardware, cover every scenario this task's `<how-to-verify>` steps ask for (see the Manual-Only Verifications table in `02-VALIDATION.md` for the exact test-number mapping). Several of those UAT passes found genuine bugs this task's own steps were designed to surface - the D-05 auto-pickup mistargeting (fixed same session, commit `583fab6`), heartbeat/D-01 reconciliation-toast pollution (02-15), the reconciliation-toast scoping gap (02-16), the silently-stale Realtime channel (02-17), and the reconnect-toast self-recovery misattribution (this session's test 10 fix) - which is exactly the kind of finding a real two-device pass and no amount of single-process Vitest can produce.

## Task Commits

1. **Task 1: Smoke harness and the authentication/identity invariants** - `df427fd` (feat)
2. **Task 2: Full room-lifecycle pass over all seven Edge Functions** - `c75c0e8` (feat)
3. **Task 3: Two-device cross-device play test** - satisfied across `02-UAT.md` tests 1-10 (commits spanning `67cef63` through this session's `05a8224`/`4fd333b`/etc.); no isolated task commit, since the verification record already lived in `02-UAT.md` rather than being redone as a one-off pass

**Merge:** `3b36b8f` (Tasks 1-2 into `stage-1-refactor`)

## Files Created/Modified

- `scripts/smoke-edge-functions.mjs` - the scripted `supabase functions serve` + `fetch` harness
- `supabase/migrations/0002_local_dev_grants.sql` - fixes missing local Postgres table-level grants beneath otherwise-correct RLS, found only by running the suite for real
- `supabase/functions/_shared/*.ts` - fixed a missing `.ts` extension (blocked every function from booting under Deno) and a wrong JWT-claims field (`.sub` instead of `.id`, leaving `playerId` silently `undefined`) across all seven wrappers
- `.planning/phases/02-real-cross-device-multiplayer/02-UAT.md` - the running record of every live two-device test this task's Task 3 checkpoint required, extended across every subsequent gap-closure plan
- `.planning/phases/02-real-cross-device-multiplayer/02-VERIFICATION.md` - a designed scenario checklist tracing D-03 multi-tab and D-05-vs-reconnect races through the actual code
- `.planning/phases/02-real-cross-device-multiplayer/02-VALIDATION.md` - the two Manual-Only Verification rows (MPLAY-01, MPLAY-06) ticked with dates and evidence references

## Decisions Made

- Scripted `supabase functions serve` + `fetch` over the Deno test runner (Wave 0) - stubbing `withSupabase({ auth: 'user' })`'s JWT validation to unit-test with `deno test` would test everything except the thing worth testing.
- The smoke suite asserts the real observable unauthenticated-request contract (401, request never reaches game logic) rather than the plan's originally-literal `UNAUTHENTICATED` error code, since `verifyAuth` short-circuits before that code path is reachable under single `auth: 'user'` mode.
- Task 3's sign-off is treated as satisfied by the cumulative UAT record rather than requiring a single fresh top-to-bottom re-run of all six `<how-to-verify>` steps in one sitting, since every step has concrete, dated, hosted-project evidence in `02-UAT.md` and re-running a scenario that's already passed several times over would add no new information.

## Deviations from Plan

One noted variance, not a gap: Task 3's step 3 instruction says "close Device 2's tab" to trigger the disconnect. Across this session's testing, disconnects were instead exercised via Leave Game, disabling the PC's Ethernet adapter, and Windows Airplane Mode - chosen because DevTools "Offline" throttling and Airplane Mode on a PC with an active Ethernet connection were both tried first and found not to actually sever the connection (documented in `02-UAT.md` test 9's debug notes). All variants are functionally equivalent to a closed tab from the Presence channel's perspective - it has no way to distinguish *why* the connection dropped, only that it did - so this is recorded as a literal-wording variance, not missing coverage.

## Issues Encountered

- The Task 1/2 executor hit the account's weekly usage limit twice mid-task (once before any commits, once mid-debug of Task 2's audit-trail read-back) - both times resumed the same agent from its transcript once the limit reset, no progress lost.
- Running the smoke suite for real (not just statically checking or mocking) surfaced four genuine pre-existing bugs: a missing `.ts` extension blocking every function from booting under Deno, anonymous sign-in left disabled on the local stack, all seven wrappers reading the wrong JWT-claims field, and missing local Postgres table-level grants beneath otherwise-correct RLS policies. All four fixed and merged via migration `0002_local_dev_grants.sql` and the corresponding wrapper edits - exactly the kind of bug static analysis and mocked tests cannot find, which was this task's entire reason for existing.

## User Setup Required

None beyond what plan 02-03 already established (hosted Supabase project, `.env.local` pointed at it).

## Next Phase Readiness

Phase 02 (Real Cross-Device Multiplayer) is now fully complete - all 19 plans executed and merged, both Manual-Only Verifications signed off, MPLAY-01 through MPLAY-07 all complete in `REQUIREMENTS.md`. Ready to move to Phase 3 (Responsive UI).

---
*Phase: 02-real-cross-device-multiplayer*
*Completed: 2026-08-01*
