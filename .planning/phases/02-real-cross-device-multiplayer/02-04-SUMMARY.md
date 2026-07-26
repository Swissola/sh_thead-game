---
phase: 02-real-cross-device-multiplayer
plan: 04
subsystem: auth
tags: [supabase, anonymous-auth, localStorage, session, tdd]

# Dependency graph
requires:
  - phase: 02-real-cross-device-multiplayer
    provides: "plan 02-01's `getSupabaseClient()` singleton (persistSession/autoRefreshToken already configured)"
provides:
  - "`ensurePlayerIdentity()` - stable, session-reused, memoised anonymous-auth identity resolution"
  - "`readLastUsedName()`/`writeLastUsedName()` - trimmed, storage-failure-safe display-name persistence"
affects: ["02-10 (App.tsx/MenuScreen wiring consumes this module)", "any future D-01/D-02/D-06 rejoin work"]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Module-level in-flight-promise memoisation to dedupe concurrent async bootstrap calls (React 19 strict-mode double-invocation safe)"
    - "Result-object error return (`{ playerId: null, error }`) instead of throwing, for expected-fallback paths distinct from real crashes"

key-files:
  created: ["src/supabase/session.ts", "src/__tests__/supabase/session.test.ts"]
  modified: []

key-decisions:
  - "No UI/App.tsx wiring in this plan - session.ts is a standalone module consumed later by plan 02-10, per the plan's explicit scope boundary"
  - "Last-used name persisted directly via localStorage, not routed through src/storage.ts's window.storage poll shim, since it's a device preference rather than game state"

patterns-established:
  - "In-flight promise memoisation for any future Supabase auth-adjacent bootstrap call that must not double-fire"

requirements-completed: [MPLAY-03]

# Metrics
duration: 25min
completed: 2026-07-26
---

# Phase 02 Plan 04: Anonymous Identity Bootstrap and Last-Used-Name Persistence Summary

**`ensurePlayerIdentity()` reuses an existing Supabase anonymous session before ever calling `signInAnonymously()`, memoising the in-flight call so concurrent/strict-mode invocations can't double-sign-in; `readLastUsedName`/`writeLastUsedName` persist a trimmed display name directly via localStorage, degrading safely when storage throws.**

## Performance

- **Duration:** 25 min
- **Started:** 2026-07-26T17:31:00Z
- **Completed:** 2026-07-26T17:56:25Z
- **Tasks:** 2 completed
- **Files modified:** 2 (1 created: `src/supabase/session.ts`; 1 created: `src/__tests__/supabase/session.test.ts`)

## Accomplishments

- `ensurePlayerIdentity()`: checks `auth.getSession()` first, only calls `signInAnonymously()` when no session exists, memoises the in-flight promise, and resolves `{ playerId: null, error }` rather than throwing on sign-in failure - the D-02 manual-rejoin fallback path
- `readLastUsedName()`/`writeLastUsedName()`: round-trip a trimmed display name via `localStorage`, clear on empty-string write, and degrade to `''`/no-op when storage access throws (private-mode/storage-disabled)
- 10 tests covering all 10 behaviours specified across both tasks, all passing; full 183-test suite and build stay green

## Task Commits

Each task was committed atomically (TDD RED -> GREEN):

1. **Task 1 + Task 2 (combined, shared file): RED** - `ae71a85` (test) - failing tests for both `ensurePlayerIdentity` and `readLastUsedName`/`writeLastUsedName`, confirmed failing (module not found) before implementation existed
2. **Task 1 + Task 2 (combined, shared file): GREEN** - `9139a3a` (feat) - `src/supabase/session.ts` implementing both behaviour sets; all 10 tests pass

**Deferred-items documentation:** `05997c1` (docs) - logs the pre-existing repo-wide lint failure against Task 2's `npm run lint` exits 0 criterion

_Note: both plan tasks touch the same single file (`src/supabase/session.ts`) and were implemented together in one RED/GREEN pair rather than as two separate TDD cycles, since splitting them would have required a throwaway intermediate implementation. All behaviours from both tasks are covered by the test file and pass._

## Files Created/Modified

- `src/supabase/session.ts` - `ensurePlayerIdentity()`, `resetIdentityMemoForTests()`, `LAST_NAME_STORAGE_KEY`, `readLastUsedName()`, `writeLastUsedName()`
- `src/__tests__/supabase/session.test.ts` - 10 tests covering session-reuse, single/memoised/concurrent-deduped sign-in, error surfacing, name round-trip/trim/clear, and storage-throw resilience

## Decisions Made

- Combined Task 1 and Task 2 into a single RED/GREEN pair rather than two sequential TDD cycles, since both tasks add to the same file and the plan itself describes Task 2 as "Extend `src/__tests__/supabase/session.test.ts`" against Task 1's file - splitting would have meant committing a temporary half-finished module
- No `src/App.tsx`/`MenuScreen.tsx` wiring - explicitly out of scope per the plan's objective ("No UI or App wiring here; plan 02-10 consumes it")

## Deviations from Plan

None affecting behaviour or scope. One acceptance-criterion note:

### Pre-existing Issue Documented (not auto-fixed - out of scope)

**1. `npm run lint` exits 1, not 0 (Task 2 acceptance criterion)**
- **Found during:** Task 2 verification
- **Issue:** Task 2's acceptance criteria list `npm run lint` exits 0. The full-repo lint run exits 1 due to three pre-existing issues in `src/App.tsx`, `src/context/GameContext.tsx`, and `src/screens/GameScreen.tsx` - none of which this plan touches. These same three issues were already logged as deferred in plan 02-01's `deferred-items.md`.
- **Verification:** `npx eslint src/supabase/session.ts src/__tests__/supabase/session.test.ts` (this plan's only two files) produces zero output - both files are lint-clean.
- **Action:** Not fixed (out of scope per executor scope-boundary rules - fixing unrelated files' lint issues is not this task's job). Documented in `.planning/phases/02-real-cross-device-multiplayer/deferred-items.md` under a new "Plan 02-04" section referencing the existing entry.
- **Committed in:** `05997c1` (docs)

---

**Total deviations:** 0 auto-fixed; 1 pre-existing issue documented and carried forward (not a code change).
**Impact on plan:** None - this plan's own files are fully lint-clean, tested, and build-passing.

## Issues Encountered

None.

## User Setup Required

None - no external service configuration required. `src/supabase/client.ts` (from plan 02-01) already handles Supabase env vars; this plan adds no new configuration surface.

## Next Phase Readiness

- `src/supabase/session.ts` is ready for plan 02-10 to wire into `App.tsx` (replacing the per-mount `crypto.randomUUID()`) and `MenuScreen.tsx` (pre-filling the display-name field via `readLastUsedName()`)
- No blockers. The pre-existing lint failures in `App.tsx`/`GameContext.tsx`/`GameScreen.tsx` remain a carried-forward cleanup item, unrelated to this plan or its dependents

---
*Phase: 02-real-cross-device-multiplayer*
*Completed: 2026-07-26*
