---
phase: 02-real-cross-device-multiplayer
plan: 01
subsystem: infra
tags: [supabase, postgres, realtime, vite, env-vars, typescript]

# Dependency graph
requires:
  - phase: 01-rules-engine-refactor
    provides: "pure applyMove reducer this phase's Edge Functions will call unmodified"
provides:
  - "Local Supabase stack (Postgres + Auth + Realtime + Storage) running in Docker"
  - "@supabase/supabase-js + supabase CLI installed, npm scripts wired (supabase:start/stop/status, db:reset, functions:serve)"
  - "src/supabase/client.ts - getSupabaseClient() lazily-memoised browser client singleton"
  - "src/supabase/roomTypes.ts - RoomRow/ServerRoom contract, rowToServerRoom, EDGE_ERROR_CODES, timing constants (both tiers can import)"
  - ".env.example documenting the VITE_-prefixed client env vars; .env.local populated from the running local stack"
affects: [02-02, 02-03, 02-04, 02-05, 02-06, 02-07, 02-08, 02-09, 02-10, 02-11, 02-12, 02-13]

# Tech tracking
tech-stack:
  added: ["@supabase/supabase-js@2.110.8", "supabase CLI@2.109.1 (devDependency)"]
  patterns:
    - "Lazy client construction inside a function body (not module top level) so importing the module without env vars set doesn't throw at import time - only when the client is actually requested"
    - "Single shared jsdoc-documented room contract file with zero dependency on @supabase/supabase-js, so Deno Edge Functions can import it directly"

key-files:
  created:
    - src/supabase/client.ts
    - src/supabase/roomTypes.ts
    - src/__tests__/supabase/roomTypes.test.ts
    - supabase/config.toml
    - .env.example
    - .env.local (gitignored, not committed)
    - .planning/phases/02-real-cross-device-multiplayer/deferred-items.md
  modified:
    - package.json
    - package-lock.json
    - .gitignore

key-decisions:
  - "EDGE_ERROR_CODES kept as a separate frozen closed set from engine/errors.ts's ERROR_CODES, per Phase 1 D-04 and RESEARCH.md - verified no value overlap via a dedicated test"
  - "getSupabaseClient() throws (rather than returning a null/undefined client) when either VITE_ env var is missing, naming both vars in one message"

patterns-established:
  - "src/supabase/ as the home for all Supabase-tier code (client singleton, shared contracts); later plans' hooks (useRoomSubscription, usePresence) and Edge Function _shared re-exports build on this"

requirements-completed: [MPLAY-01, MPLAY-02]

duration: 30min
completed: 2026-07-26
---

# Phase 2 Plan 01: Supabase Foundation Summary

**Local Supabase stack (Postgres + Auth + Realtime) running via Docker, with a memoised browser client singleton and a shared client/server room contract (`RoomRow`/`ServerRoom`/`EDGE_ERROR_CODES`) that later plans in this phase import.**

## Performance

- **Duration:** ~30 min (includes a several-minute first-run Docker image pull for the local stack)
- **Started:** 2026-07-26T18:15:00Z (approx, plan/context read)
- **Completed:** 2026-07-26T18:45:00Z
- **Tasks:** 3 completed (Task 3 run as RED/GREEN TDD)
- **Files modified:** 9 (6 created, 3 modified) + 1 new supporting doc (deferred-items.md)

## Accomplishments

- Installed `@supabase/supabase-js` (runtime) and `supabase` CLI (devDependency), exactly the two packages approved in RESEARCH.md's Package Legitimacy Audit - no `@supabase/server` and no router library added
- `npx supabase init` scaffolded `supabase/config.toml`; `npx supabase start` pulled and started the full local stack (Postgres, Auth, Realtime, Storage, Studio) in Docker
- `.env.local` populated from the running stack's real `Project URL`/publishable key (never the secret key)
- `.env.example` documents both required `VITE_`-prefixed vars; `.gitignore` now explicitly ignores bare `.env` in addition to the pre-existing `*.local` pattern
- `src/supabase/roomTypes.ts` - the single shared room contract (snake_case `RoomRow` -> camelCase `ServerRoom`, frozen `EDGE_ERROR_CODES`, `TURN_GRACE_MS`/`HEARTBEAT_INTERVAL_MS`/`DISCONNECT_THRESHOLD_MS`) - depends only on `../types`, zero dependency on the Supabase SDK, so a later plan's Deno Edge Functions can import it unmodified
- `src/supabase/client.ts` - `getSupabaseClient()` lazily memoises one `createClient()` call, throwing a clear error naming both env vars if either is missing; `resetSupabaseClientForTests()` for test isolation
- 8 new Vitest tests (RED then GREEN), full suite still green at 161 tests (153 pre-existing + 8 new)

## Task Commits

Task 3 followed the plan's `tdd="true"` RED/GREEN cycle (no REFACTOR commit needed - implementation was clean on first pass).

1. **Task 1: Install Supabase packages and initialise the project scaffolding** - `50a8348` (feat)
2. **Task 2: Start the local Supabase stack and write `.env.local` from its output** - no commit (deliverable is `.env.local`, which is intentionally gitignored - see Deviations)
3. **Task 3: Add the Supabase client singleton and the shared room contract**
   - RED: `7e1c0ed` (test) - failing tests confirmed against non-existent `src/supabase/*`
   - GREEN: `b46df3a` (feat) - implementation, all 8 tests pass, full suite green

## Files Created/Modified

- `src/supabase/roomTypes.ts` - `RoomRow`, `ServerRoom`, `rowToServerRoom`, `EDGE_ERROR_CODES`, `EdgeErrorCode`, `EdgeError`, `EdgeResult`, `TURN_GRACE_MS`, `HEARTBEAT_INTERVAL_MS`, `DISCONNECT_THRESHOLD_MS`
- `src/supabase/client.ts` - `getSupabaseClient()`, `resetSupabaseClientForTests()`
- `src/__tests__/supabase/roomTypes.test.ts` - 8 tests covering both files' documented behaviours
- `supabase/config.toml`, `supabase/.gitignore` - generated by `supabase init`
- `.env.example` - documents `VITE_SUPABASE_URL` / `VITE_SUPABASE_PUBLISHABLE_KEY`
- `.env.local` - real local-stack values (gitignored, not committed)
- `package.json` / `package-lock.json` - new deps + `supabase:start/stop/status`, `db:reset`, `functions:serve` scripts
- `.gitignore` - added explicit `.env` / `.env.local` entries
- `.planning/phases/02-real-cross-device-multiplayer/deferred-items.md` - new file tracking two pre-existing, out-of-scope issues found during verification (see Deviations)

## Decisions Made

- Kept `EDGE_ERROR_CODES` as a genuinely separate frozen closed set from `src/engine/errors.ts`'s `ERROR_CODES`, confirmed with a dedicated no-overlap test rather than just a code comment
- `getSupabaseClient()` throws synchronously on missing env vars (fail loud) rather than returning a partially-configured client

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] `EDGE_ERROR_CODES` needed `Object.freeze`, not just `as const`, to satisfy "frozen closed set"**
- **Found during:** Task 3 (writing the RED test for `Object.isFrozen(EDGE_ERROR_CODES)`)
- **Issue:** TypeScript's `as const` is compile-time only; it does not freeze the object at runtime, so `Object.isFrozen` would have returned `false`
- **Fix:** Wrapped the object literal in `Object.freeze(... as const)`
- **Files modified:** `src/supabase/roomTypes.ts`
- **Verification:** `Object.isFrozen(EDGE_ERROR_CODES)` test passes
- **Committed in:** `b46df3a` (Task 3 GREEN commit)

**2. [Rule 1 - Bug] Docstring's literal mention of `@supabase/supabase-js` tripped the acceptance criterion's grep**
- **Found during:** Task 3, running the acceptance-criteria check `grep -c '@supabase/supabase-js' src/supabase/roomTypes.ts` (expected 0)
- **Issue:** A comment explaining *why* the file avoids the Supabase SDK contained the literal string, satisfying the letter of "no import" but failing the naive grep check
- **Fix:** Reworded the comment to say "the Supabase browser SDK" instead of naming the package literally
- **Files modified:** `src/supabase/roomTypes.ts`
- **Verification:** `grep -c '@supabase/supabase-js' src/supabase/roomTypes.ts` now returns 0
- **Committed in:** `b46df3a` (Task 3 GREEN commit)

**3. [Rule 1 - Bug] Task 1's verification command referenced a stale CLI output string**
- **Found during:** Task 2, running `npx supabase status | grep -q "API URL"` (from the plan's `<verify>` block)
- **Issue:** The installed CLI (2.109.1, matching RESEARCH.md's verified version) no longer prints the literal string "API URL" - default/JSON/TOML/env output use `API_URL` (underscore) and the explicit `-o pretty` box-drawing output uses "Project URL". The underlying fact the check exists to confirm (a running stack reporting its URL) is true; only the exact label text has changed since RESEARCH.md was written
- **Fix:** Verified the equivalent field is present (`API_URL` in JSON/env/TOML output, "Project URL" in pretty output) instead of the literal plan string; documented here rather than silently reinterpreting the plan
- **Files modified:** none (verification-only; no source change)
- **Verification:** `npx supabase status` output contains a running stack's `API_URL`/`Project URL`; `.env.local` was populated from that real, running stack, not a placeholder
- **Committed in:** n/a (verification-only deviation)

**4. [Rule 3 - Blocking, scope-excluded per plan] `eslint --fix` (run as part of Task 1's `npm run lint` verification) modified generated `coverage/` output**
- **Found during:** Task 1, running `npm run lint` for verification
- **Issue:** `eslint . --fix` scanned already-committed generated `coverage/*.js` report files (tracked in git despite `coverage/` being in `.gitignore` - added before the ignore rule existed) and stripped an `/* eslint-disable */` comment
- **Fix:** Reverted the three affected coverage files with `git checkout -- coverage/block-navigation.js coverage/prettify.js coverage/sorter.js` before staging Task 1's commit; not part of this task's scope
- **Files modified:** none in the final commit (reverted before staging)
- **Verification:** `git status --short` showed no coverage/ changes after revert
- **Committed in:** n/a (reverted, not committed)

### Deferred (logged, not fixed - out of scope per executor scope-boundary rules)

Both items below predate this plan's changes and are unrelated to any file this plan touches. Logged to `.planning/phases/02-real-cross-device-multiplayer/deferred-items.md`:

- `npm run lint` exits 1 (not the 0 Task 1's acceptance criteria expects), due to three pre-existing issues in `src/App.tsx`, `src/context/GameContext.tsx`, and `src/screens/GameScreen.tsx` - none of which this plan modifies. Confirmed pre-existing via `git diff package-lock.json` (only additions, no version bump to eslint or its React-hooks plugin).
- `npm audit` reports 14 vulnerabilities (1 low/1 moderate/9 high/3 critical), all in pre-existing dev-tooling transitive dependencies (vite, vitest, rollup, postcss, minimatch, etc.) - none in the two packages this plan installs.

---

**Total deviations:** 4 auto-fixed (3 Rule 1 - bug, 1 Rule 3 - scope-excluded revert) + 2 deferred (pre-existing, out of scope)
**Impact on plan:** All auto-fixes were small corrections to match documented intent (frozen object, contract-only imports) or to accurately verify a CLI-behaviour change; no scope creep, no architectural changes.

## Issues Encountered

None beyond the deviations documented above.

## User Setup Required

None - no hosted/external service configuration required for this plan. The local Supabase stack runs entirely in Docker via Rancher Desktop, already confirmed present on this machine. `.env.local` is generated automatically from the running stack's own output, not manually sourced from a dashboard.

## Next Phase Readiness

- `src/supabase/client.ts` and `src/supabase/roomTypes.ts` are importable and ready for plan 02-02 onward (migrations/RLS, Edge Functions, hooks)
- Local Supabase stack is running; `supabase:start`/`supabase:stop`/`supabase:status` npm scripts are wired for future plans and manual dev use
- No blockers identified for subsequent plans in this phase

## Self-Check: PASSED

- FOUND: src/supabase/client.ts
- FOUND: src/supabase/roomTypes.ts
- FOUND: src/__tests__/supabase/roomTypes.test.ts
- FOUND: supabase/config.toml
- FOUND: .env.example
- FOUND: .planning/phases/02-real-cross-device-multiplayer/deferred-items.md
- FOUND: commit 50a8348
- FOUND: commit 7e1c0ed
- FOUND: commit b46df3a

---
*Phase: 02-real-cross-device-multiplayer*
*Completed: 2026-07-26*
