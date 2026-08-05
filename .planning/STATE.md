---
gsd_state_version: 1.0
milestone: v1.0
milestone_name: milestone
status: executing
last_updated: "2026-08-05T08:31:08.383Z"
last_activity: 2026-08-05
progress:
  total_phases: 7
  completed_phases: 3
  total_plans: 34
  completed_plans: 34
  percent: 43
---

# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-07-25)

**Core value:** A friend can join a room from any device (phone, desktop, either OS) and play a full game with you in real time.
**Current focus:** Phase 03 — responsive-ui

## Current Position

Phase: 03 (responsive-ui) — EXECUTING
Plan: 1 of 8
across this session's full gap-closure arc rather than as one isolated pass: `02-UAT.md`'s ten
logged tests, run live against the hosted Supabase project on real PC + phone hardware, cover
every scenario the checkpoint's `<how-to-verify>` steps ask for. `02-VALIDATION.md`'s two
Manual-Only Verification rows (MPLAY-01, MPLAY-06) are ticked with dates and evidence
references; `02-13-SUMMARY.md` written covering all three of the plan's tasks. One noted
variance, not a gap: disconnects were exercised via Leave Game, an Ethernet-adapter disable, and
Airplane Mode rather than literally closing a tab every time - functionally equivalent, since the
Presence channel can't distinguish cause of disconnect.
Status: Executing Phase 03
(MPLAY-01 through MPLAY-07) is ticked complete in `REQUIREMENTS.md`.
Last activity: 2026-08-05
02-VALIDATION.md updated, 02-13-SUMMARY.md written) after MPLAY-07 shipped end-to-end via
02-18/02-19. Next: Phase 03 (Responsive UI) has not been discussed or planned yet.

Previously (2026-08-01): Plan 02-19 executed (MPLAY-07's UI/wiring half, closing both gaps
02-18 deliberately left open: a host-editable, all-players-visible auto-pickup timeout
`<select>` in `LobbyScreen.tsx`, dispatching `SET_TURN_TIMEOUT` through the standard
`dispatchMove` pipeline and bounded by 02-18's own `MIN_TURN_TIMEOUT_MS`/`MAX_TURN_TIMEOUT_MS`;
`useTurnTimeoutSweep` now compares elapsed time against the room's actual configured
`turnTimeoutMs` instead of the previously hardcoded `TURN_GRACE_MS`). Worktree was 168
files/~31.8k lines stale off an old ancestor of `stage-1-refactor` that predated `.planning/`
itself; fast-forwarded via `git merge --ff-only` before starting. `npm run build`/
`npm test -- --run` (478 tests, up from 466)/scoped `npx eslint` all green. Full-suite
`npm run lint` still exits 1 on the same two pre-existing, unrelated issues carried since
02-01 (neither touched by this plan).

Previously (2026-07-28): Plan 02-13's executor hit the account's weekly usage limit mid-task
(twice — once on first dispatch before any commits, once again mid-debug of Task 2's audit-trail
read-back after being resumed). Both times resumed the same agent from its transcript once the
limit reset rather than losing progress. Running the smoke suite for real against `supabase
functions serve` surfaced four genuine pre-existing bugs no static check or Vitest could reach:
a missing `.ts` extension blocking every function from booting under Deno, anonymous sign-in
left disabled on the local stack (only the hosted dashboard toggle was ever flipped), all seven
wrappers reading the wrong JWT-claims field (`.sub` instead of `.id`) so `playerId` was silently
`undefined`, and missing local Postgres table-level grants beneath otherwise-correct RLS
policies. All four fixed and merged (migration `0002_local_dev_grants.sql`).

Progress: [██████████] 100%

**Resolved:** 02-03-SUMMARY.md now documents full completion (3/3 tasks). Migration confirmed
present on both Local and Remote via `supabase migration list`; anonymous sign-in confirmed
working via a live `/auth/v1/signup` call, not just a dashboard setting. Wave 3 may now start.

## Performance Metrics

**Velocity:**

- Total plans completed: 15
- Average duration: - min
- Total execution time: 0 hours

**By Phase:**

| Phase | Plans | Total | Avg/Plan |
|-------|-------|-------|----------|
| Phase 02 P07 | 1 | 25min | 3 tasks, 10 files |
| Phase 02 P08 | 1 | 35min | 2 tasks, 5 files |
| Phase 02 P09 | 1 | - | 2 tasks, 4 files |
| Phase 02 P10 | 1 | ~19min | 3 tasks, 4 files |
| Phase 02 P11 | 1 | ~10min | 3 tasks, 2 files |
| Phase 02 P12 | 1 | ~75min | 3 tasks, 4 files (session-limit interrupted, resumed) |
| Phase 02 P13 | 0.67 | - | 2/3 tasks, 17 files (weekly-limit interrupted twice, resumed both times) |

**Recent Trend:**

- Last 5 plans: -
- Trend: -

*Updated after each plan completion*
| Phase 02 P14 | 12min | 2 tasks | 4 files |
| Phase 02 P15 | 55min | 3 tasks | 13 files |
| Phase 02 P17 | 35min | 2 tasks | 3 files |
| Phase 02 P18 | 70min | 2 tasks | 18 files |
| Phase 02 P19 | 25min | 2 tasks | 6 files |

## Accumulated Context

### Decisions

Decisions are logged in PROJECT.md Key Decisions table.
Recent decisions affecting current work:

- Pre-roadmap: Supabase (Postgres + Realtime + anonymous auth) chosen for the multiplayer backend
- Pre-roadmap: Capacitor chosen to wrap the existing React app for Android/iOS, no separate native UI
- Pre-roadmap: Desktop ships as a responsive web app (PWA-installable), no Tauri/Electron
- Pre-roadmap: Refactor-first sequencing — Phase 1 (rules engine) is a hard dependency for Phase 2 (multiplayer)
- [Phase 02-07]: checkTurnTimeout takes no playerId - any authenticated player may trigger the lazy sweep, since authorisation is temporal (server clock) not identity-based
- [Phase 02-07]: heartbeat folds transferHostIfStale into the same write, restricted to the lobby phase, rather than a separate scheduled job
- [Phase 02-08]: useRoomSubscription signals reconciliation from the Realtime broadcast callback, not the functions.invoke() response, per RESEARCH.md Pattern 3
- [Phase 02-09]: submitMove never awaits the server before returning; the optimistic update is synchronous and the Realtime broadcast (applyServerRoom), not the invoke response, is the authoritative correction
- [Phase 02-09]: 'RECONCILED' is a client-side toast sentinel, not added to the engine's closed ERROR_CODES (Phase 1 D-04) — reconciliation is a networking concept, not an illegal move
- [Phase 02-10]: GameContext.roomVersionRef starts at -1, not 0 - a freshly created room's first row is version 0, and 0 <= 0 would wrongly treat that first application as stale and drop it
- [Phase 02-11]: LobbyScreen no longer computes or writes game state itself - it only invokes start-game/remove-player and applies whatever ServerRoom comes back via applyServerRoom
- [Wave 4 post-merge]: usePresence is called exactly once, in Router - screens receive isPlayerOffline as a prop rather than subscribing themselves, to avoid a second Presence channel/heartbeat per room
- [Phase 02-12]: useTurnTimeoutSweep tracks its grace-expired flag together with an "arm key" string in one useState object, reset via React's render-body "adjusting state when a prop changes" pattern rather than an effect-body setState or a Date.now()-during-render call, to satisfy this project's strict react-hooks/React Compiler lint rules
- [Phase 02-13]: chose scripted `supabase functions serve` + `fetch` over the Deno test runner for Edge Function integration testing - stubbing out `withSupabase({ auth: 'user' })`'s JWT validation to unit-test with `deno test` would test everything except the thing worth testing
- [Phase 02-13]: `npm:@supabase/server`'s `verifyAuth` short-circuits an unauthenticated request with its own `INVALID_CREDENTIALS` shape before `ctx.userClaims`'s missing-token branch is ever reached - that branch is dead code under single `auth: 'user'` mode; the smoke suite asserts the real observable contract (401, request never reaches game logic) instead of the plan's literal `UNAUTHENTICATED` code
- [Phase 02]: [Phase 02-14] Auto-play the lowest-RANK_VALUES card via getAvailableCardSource when PICK_UP_PILE returns PILE_EMPTY; faceDown source selects index 0 without reading rank
- [Phase 02]: [Phase 02-14] useTurnTimeoutSweep warns (console.warn) on any sweep EdgeResult error code outside TIMEOUT_NOT_ELAPSED/CONFLICT and on a resolved top-level transport error, never toasts
- [Phase 02-15]: touch_player_seen is a plain invoker-rights SQL function, not definer-rights - service_role already bypasses RLS, so elevated execution rights would buy nothing and would punch a hole through 0001's deny-all-writes-for-authenticated posture
- [Phase 02-15]: heartbeat and joinRoom's D-01 auto-rejoin branch to a state-unchanged condition (nextState.host !== row.state.host; resolution.type === 'existing'), not object identity, before routing through the version-exempt touchPlayerSeen path
- [Phase 02]: [Phase 02-17]: hadPendingMoveAtDrop is a snapshot taken at the instant of the first connection drop, never the live hasPendingMove() value at refetch time - the only way to tell apart a genuinely-pending move whose flag 02-16's safety net cleared mid-outage from a bystander who never had anything pending, once both look identical by refetch time
- [Phase 02]: [Phase 02-17]: room-data channel reconnect backoff resets only after a SUBSCRIPTION_RECONNECT_RESET_DWELL_MS (5s) dwell period of uninterrupted connectivity, scheduled not applied immediately on SUBSCRIBED, so a flapping connection keeps escalating instead of resetting on every brief reconnect; retries are capped only in delay (30s ceiling), never in count
- [Phase 02-18]: HOST_ONLY (engine tier) is deliberately not named NOT_HOST, since EDGE_ERROR_CODES.NOT_HOST already exists for the edge tier's own host-only Edge Functions - the two closed sets must never collide
- [Phase 02-18]: checkTurnTimeout's turnTimeoutMs ?? TURN_GRACE_MS fallback is the one place this plan intentionally distrusts GameState's required-field guarantee, since that read is against a raw Postgres JSONB column whose persisted shape predates this plan for any pre-existing room
- [Phase 02-19]: Worktree branch was 168 files/31.8k lines stale off an old ancestor of stage-1-refactor - fast-forwarded via git merge --ff-only before starting, to pick up its own 02-18 dependency and the 02-19 plan file itself

### Pending Todos

[From .planning/todos/pending/ — ideas captured during sessions]

None yet.

### Blockers/Concerns

[Issues that affect future work]

Note for Phase 1 planning: codebase audit found `App.tsx` mutates
state in place (`playCards`, `App.tsx:461-834`), `playerId` is never actually
set (`App.tsx:62`), and rules logic is duplicated across `App.tsx`/`Hand.tsx`/
`Table.tsx` — all in scope for Phase 1, not new discoveries to re-investigate.

None currently — full suite (385 tests), build, and `check-edge-wrappers.mjs` all green as of
the 02-14/02-15 gap-closure merge. `npm run lint` still exits 1 on two pre-existing, unrelated issues
(`GameContext.tsx:142` react-refresh/only-export-components, `GameScreen.tsx:107`
react-hooks/set-state-in-effect in the pre-existing celebration-modal effect) — confirmed
present before 02-12 touched either file; logged in `deferred-items.md`, not yet cleaned up.

- **Three orphaned worktree directories** under `.claude/worktrees/` —
  `agent-aea2c752cd368982d`, `agent-a24186bc781420a82` (02-14), and
  `agent-ab626206d94067ea1` (02-15). `git worktree remove --force` unregistered all three from
  git but the OS refused to delete the directories themselves ("permission denied", likely a
  lingering node process or antivirus lock). The 02-14/02-15 pair briefly double-counted vitest's
  test totals (754 instead of 385) until excluded with `--exclude "**/.claude/**"` — confirmed
  harmless once excluded, doesn't affect builds. Safe to delete by hand once whatever holds the
  lock releases it; `npm test`/`npm run build` should keep excluding `.claude/` if any of these
  are still present.

## Deferred Items

Items acknowledged and carried forward from previous milestone close:

| Category | Item | Status | Deferred At |
|----------|------|--------|-------------|
| *(none)* | | | |

## Session Continuity

Last session: 2026-08-01T20:51:02.016Z
Stopped at: Phase 3 planned — 8 plans across 5 waves, verification passed
this session's full 02-UAT.md testing record (tests 1-10, all pass or fixed-and-verified) rather
than a fresh isolated pass. 02-VALIDATION.md's two Manual-Only Verifications rows ticked with
dates/evidence, 02-13-SUMMARY.md written covering all three of that plan's tasks, ROADMAP.md's
Phase 2 checkbox and plan table updated to 19/19. Every requirement MPLAY-01 through MPLAY-07 is
complete. Phase 03 (Responsive UI) has not been discussed, spec'd, or planned yet - that is the
next open work whenever a session picks this back up.
Resume file: .planning/phases/03-responsive-ui/03-01-PLAN.md
