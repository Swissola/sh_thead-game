---
phase: 02-real-cross-device-multiplayer
plan: 11
subsystem: ui
tags: [react, supabase-edge-functions, realtime-presence, lobby]

# Dependency graph
requires:
  - phase: 02-real-cross-device-multiplayer
    provides: "start-game/remove-player Edge Functions (02-06/02-07), applyServerRoom/showToast on GameContext (02-09), usePresence hook (02-08)"
provides:
  - "LobbyScreen wired to the start-game Edge Function - dealing is entirely server-side"
  - "Copy-join-link button (D-15) alongside the existing copy-room-code button"
  - "Offline badges, host-only remove-player control (D-07), and automatic host-transfer display (D-08) in the lobby"
affects: [02-10, 02-12, 02-13]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Edge Function invoke -> applyServerRoom(result.room) on success, showToast(result.error.message, result.error.code) on EdgeResult.error, generic retry toast on transport/exception failure - same three-branch shape reused for start-game and remove-player"
    - "Disabled-not-hidden UI affordance for a server-enforced control (T-02-38): remove button always renders for the host but is only enabled when isPlayerOffline is true, since removePlayer itself independently re-checks caller===host and phase==='lobby'"

key-files:
  created: []
  modified:
    - src/screens/LobbyScreen.tsx
    - src/__tests__/screens/LobbyScreen.test.tsx
    - src/__tests__/App.test.tsx

key-decisions:
  - "LobbyScreen calls usePresence directly (roomCode/playerId/testMode from context) rather than threading isPlayerOffline down as a prop, since no parent component wires presence yet at this point in the merge order"
  - "Remove button is present-but-disabled for connected players rather than hidden, matching the plan's explicit framing as a UI affordance, not a security control"

requirements-completed: [MPLAY-01, MPLAY-04, MPLAY-06]

# Metrics
duration: 10min
completed: 2026-07-28
---

# Phase 02 Plan 11: Server-backed Lobby (start, join-link, host controls, offline markers) Summary

**LobbyScreen rewired onto `start-game`/`remove-player` Edge Functions, with a copy-join-link button, host-only AFK-removal, and presence-driven offline badges.**

## Performance

- **Duration:** ~10 min
- **Started:** 2026-07-28T06:59:41+01:00
- **Completed:** 2026-07-28T07:09:14+01:00
- **Tasks:** 3
- **Files modified:** 3 (2 in scope + 1 deviation fix)

## Accomplishments
- Dealing moved entirely server-side: `startGame` now calls `functions.invoke('start-game', ...)` and applies the returned `ServerRoom` via `applyServerRoom`, deleting the client-side `GameLogic.shuffleDeck(GameLogic.createDeck(...))` deal
- Added the D-15 copy-join-link button (`Link2` -> `Check`, 2s revert, independent state from the existing copy-room-code button), writing `<origin>/join/<ROOMCODE>` to the clipboard
- Lobby player rows now show an "Offline" badge (via `usePresence`'s `isPlayerOffline`) and the host gets a disabled-for-connected/enabled-for-offline remove-player control (D-07); host transfer (D-08) requires no extra client logic since `isHost` was already derived fresh every render

## Task Commits

Each task was committed with a RED/GREEN TDD pair:

1. **Task 1: Start the game through the server (MPLAY-04)**
   - `ca8b8fe` test(02-11): add failing tests for server-side start-game invocation
   - `3a0a59a` feat(02-11): deal through the start-game Edge Function (MPLAY-04)
2. **Task 2: Copy join link alongside copy room code (D-15)**
   - `674d2e4` test(02-11): add failing tests for the copy-join-link button (D-15)
   - `856a29d` feat(02-11): add copy-join-link button alongside copy-room-code (D-15) *(includes a test-file fix for a fake-timer/act ordering bug found while getting to GREEN)*
3. **Task 3: Lobby offline markers, host removal and host transfer display (D-07, D-08, D-10)**
   - `a90a1b4` test(02-11): add failing tests for offline markers, host removal and host transfer
   - `c267eaa` feat(02-11): offline markers, host removal and host-transfer display (D-07, D-08, D-10) *(also fixes an `App.test.tsx` regression caused by this task's new `usePresence` call)*

_Note: RED commits confirmed failing (task 1: 3 failed/3 passed; task 2: 5 failed/6 passed; task 3: 5 failed/12 passed) before their matching GREEN commits, per the plan's `tdd="true"` gate._

## Files Created/Modified
- `src/screens/LobbyScreen.tsx` - Server-backed start, join-link copy, host controls, offline markers; no longer imports `gameLogic`/`GameState`
- `src/__tests__/screens/LobbyScreen.test.tsx` - Full rewrite/extension covering all 17 behaviours across the three tasks, with a shared fake-Supabase-client/presence-channel harness
- `src/__tests__/App.test.tsx` - Added the same `supabase/client` mock pattern used elsewhere, fixing a regression this plan's `usePresence` call introduced

## Decisions Made
- `usePresence` is called directly inside `LobbyScreen` (not threaded as a prop) since no ancestor component wires presence at this point in the phase's merge order - this mirrors how `GameScreen.tsx` is expected to consume it per `02-PATTERNS.md`.
- Kept the remove button's disabled-not-hidden treatment exactly as specified (T-02-38): it is a "did you mean this" affordance, not a security boundary, since `remove-player`'s Edge Function independently enforces host-only + lobby-phase.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Fixed a fake-timer/act ordering bug in the D-15 copy-join-link test**
- **Found during:** Task 2, getting the "swaps the join-link icon to Check... reverts after 2000ms" test to GREEN
- **Issue:** `vi.useFakeTimers()` was activated before the async `findByLabelText` query; Testing Library's internal polling relies on real timers, so the query hung and the fake-timers state leaked into subsequent tests (two unrelated tests then timed out at 5000ms too)
- **Fix:** Resolve the async query on real timers first, only then switch to fake timers; wrapped `vi.advanceTimersByTime(2000)` in `act(...)` so the resulting React state update flushes before the assertion
- **Files modified:** `src/__tests__/screens/LobbyScreen.test.tsx`
- **Verification:** All 17 tests in the file pass; no cross-test timer leakage
- **Committed in:** `856a29d` (Task 2 commit)

**2. [Rule 1 - Bug] Fixed an `App.test.tsx` regression introduced by this plan's `usePresence` call**
- **Found during:** Task 3, running the full test suite (`npm test -- --run`) after implementing offline markers
- **Issue:** `LobbyScreen` now unconditionally calls `usePresence`, which lazily calls `getSupabaseClient()`. `App.test.tsx`'s "renders LobbyScreen content..." test doesn't mock `../supabase/client`, so the missing `VITE_SUPABASE_*` env vars threw inside a passive effect and crashed the render
- **Fix:** Added the same `vi.mock('../supabase/client', ...)` pattern already used in `LobbyScreen.test.tsx`/`useGameState.test.ts`, with a fake channel/functions.invoke
- **Files modified:** `src/__tests__/App.test.tsx`
- **Verification:** `npm test -- --run src/__tests__/App.test.tsx` - 3/3 pass; full suite dropped from 3 failures to the 2 pre-existing, out-of-scope ones (see Issues Encountered)
- **Committed in:** `c267eaa` (Task 3 commit)

---

**Total deviations:** 2 auto-fixed (both Rule 1 - bugs surfaced while reaching GREEN, both directly caused by this plan's own changes)
**Impact on plan:** Both fixes were necessary for the plan's own acceptance criteria (`npm test -- --run` passing, no cross-test flakiness) and stayed within `LobbyScreen.tsx`'s test blast radius. No scope creep.

## Issues Encountered
- The full suite (`npm test -- --run`) still shows 2 pre-existing failures in `src/__tests__/screens/MenuScreen.test.tsx` ("Create Room... room code (WR-03)" and "Join on a valid, waiting room... (WR-02)"). These are explicitly documented in `STATE.md` as caused by plan 02-09's merge (removed the `window.storage` write `MenuScreen.tsx` still depends on) and are plan 02-10's responsibility to resolve (`MenuScreen.tsx`/`App.tsx` are outside this plan's `files_modified` and were untouched here, and 02-10 is executing in parallel in a sibling worktree). Not fixed here - out of scope per the deviation rules' scope boundary.
- `npm run lint` reports 2 pre-existing errors + 1 warning in `App.tsx`, `GameContext.tsx`, and `GameScreen.tsx` - none of which this plan touched (confirmed via `git diff --stat` against this plan's base commit, which shows zero changes to those files). `src/screens/LobbyScreen.tsx`, `src/__tests__/screens/LobbyScreen.test.tsx`, and `src/__tests__/App.test.tsx` lint clean individually.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness
- The lobby is now fully server-authoritative for dealing, matching MPLAY-04's "the client no longer deals" requirement
- D-07 (host removes AFK player) and D-08 (host auto-transfer display) both have working, tested UI
- The `/join/<ROOMCODE>` link format is now fixed by this plan; 02-10 (in a parallel worktree) is responsible for `App.tsx` actually parsing that path and pre-filling `MenuScreen`'s room-code input
- The 2 known-failing `MenuScreen.test.tsx` tests remain for 02-10 to resolve, as already documented in `STATE.md`

---
*Phase: 02-real-cross-device-multiplayer*
*Completed: 2026-07-28*

## Self-Check: PASSED

All claimed files (`02-11-SUMMARY.md`, `src/screens/LobbyScreen.tsx`, `src/__tests__/screens/LobbyScreen.test.tsx`, `src/__tests__/App.test.tsx`) exist on disk. All 7 claimed commit hashes (`ca8b8fe`, `3a0a59a`, `674d2e4`, `856a29d`, `a90a1b4`, `c267eaa`, `13f4cfe`) are present in this worktree branch's history.
