---
phase: 02-real-cross-device-multiplayer
plan: 10
subsystem: client
tags: [react, supabase-auth, realtime, edge-functions, deep-link]

# Dependency graph
requires:
  - phase: 02-real-cross-device-multiplayer (plan 02-03)
    provides: "src/supabase/session.ts (ensurePlayerIdentity, readLastUsedName/writeLastUsedName), src/supabase/roomTypes.ts (EDGE_ERROR_CODES, EdgeResult)"
  - phase: 02-real-cross-device-multiplayer (plan 02-04/02-05)
    provides: "supabase/functions/create-room, supabase/functions/join-room Edge Functions"
  - phase: 02-real-cross-device-multiplayer (plan 02-08)
    provides: "src/hooks/useRoomSubscription.ts, src/hooks/usePresence.ts"
  - phase: 02-real-cross-device-multiplayer (plan 02-09)
    provides: "GameContext.applyServerRoom/notifyReconciled seam, GameContext.setGameState with no storage write"
provides:
  - "ShitheadGame's async ensurePlayerIdentity() bootstrap - the app's one persistent identity gate"
  - "Router wired to useRoomSubscription/usePresence - the poll is fully gone"
  - "/join/:code deep-link parsing (App.tsx) feeding MenuScreen's initialRoomCode prop"
  - "MenuScreen create-room/join-room Edge Function invocation with EdgeError-to-copy mapping"
  - "D-09 last-used-name pre-fill/write-back on MenuScreen"
affects: [02-11-lobby-screen-wiring, 02-12-turn-timeout-integration]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Async identity bootstrap gates GameProvider's children on a resolved player id, mirroring the existing 'if (!gameState) return null' wait-for-data convention, with a neutral placeholder instead of a blank screen"
    - "Pure parseJoinCode() run inside a useState lazy initialiser so a deep-link code is captured exactly once at mount, with the history.replaceState side effect kept in a separate mount-only useEffect"
    - "EdgeError-code-to-copy mapping function (mapEdgeErrorCode) keeps MenuScreen's pre-existing user-facing strings unchanged while moving the actual decision server-side"

key-files:
  created: []
  modified:
    - src/App.tsx
    - src/screens/MenuScreen.tsx
    - src/context/GameContext.tsx
    - src/__tests__/App.test.tsx
    - src/__tests__/screens/MenuScreen.test.tsx

key-decisions:
  - "MenuScreen gained its initialRoomCode prop support in Task 1 (App.tsx's own task), not deferred to Task 3, because passing an undeclared prop to a zero-props component fails tsc's strict JSX prop-checking immediately - Task 1's own 'npm run build exits 0' acceptance criterion requires it. Task 3 only added the D-09 name pre-fill/write-back on top."
  - "usePresence's isPlayerOffline is NOT wired into <LobbyScreen /> despite the plan's Task 1 action text - LobbyScreen.tsx belongs exclusively to the sibling plan 02-11, executing in a separate parallel worktree with no file overlap by design, and does not yet declare that prop in this worktree's copy of the file. Wiring it here would fail npm run build. usePresence is still called exactly once in Router (satisfying the 'never inside a screen, never twice' constraint); the JSX wiring is left for the 02-11 merge or a small follow-up once both land."
  - "applyServerRoom was not used for create-room/join-room's returned room - setGameState(room.state) is used instead, matching the existing MenuScreen write pattern. applyServerRoom's own version-tracking ref had an off-by-one for version 0 (see Deviations) that would have silently dropped a freshly created room; fixed at the source rather than routed around."

requirements-completed: [MPLAY-01, MPLAY-02, MPLAY-03]

# Metrics
duration: unknown (single session)
completed: 2026-07-28
---

# Phase 02 Plan 10: App.tsx + MenuScreen Identity/Realtime/Edge-Function Wiring Summary

**`App.tsx` now bootstraps a persistent Supabase anonymous-auth identity and streams room state over Realtime instead of polling `localStorage`; `MenuScreen` creates and joins rooms through the `create-room`/`join-room` Edge Functions, pre-fills the returning player's name, and seeds the room-code field from a `/join/:code` deep link.**

## Performance

- **Tasks:** 3/3
- **Files modified:** 5 (0 created, 5 modified)

## Accomplishments

- `ShitheadGame` calls `ensurePlayerIdentity()` once on mount, rendering a neutral placeholder (not a blank screen) until it resolves; a failed/unrecoverable session falls through to an empty-id menu (D-02) rather than hanging
- `Router`'s `setInterval`/`window.storage.get` poll is deleted outright; `useRoomSubscription` (wired to `applyServerRoom`/`notifyReconciled`) and `usePresence` are both called exactly once
- `/join/:code` is parsed once on mount via a pure function inside a `useState` lazy initialiser, uppercased, passed to `MenuScreen` as `initialRoomCode`, and the URL is replaced back to `/` so a reload doesn't re-seed a stale code
- `MenuScreen.createRoom`/`joinRoom` now call `getSupabaseClient().functions.invoke('create-room'/'join-room', ...)`; `generateRoomCode` and the WR-02 read-modify-write verification loop are both deleted, since the server now owns code generation/collision retry and the version-conditional write closes the original race
- `EdgeError` codes map onto the pre-existing user-facing copy (`ROOM_NOT_FOUND` → "Room not found", `GAME_ALREADY_STARTED` → "Game has already started", `NAME_IN_USE`/`NAME_AMBIGUOUS` → a different-name prompt), with a shared transport-failure fallback ("Failed to join room - please retry.")
- `playerName` is seeded from `readLastUsedName()` (D-09) and written back via `writeLastUsedName()` after a successful create/join only, never on failure
- Both Test Mode buttons remain fully local with zero `functions.invoke` calls, verified explicitly in tests

## Task Commits

1. **Task 1: App.tsx - identity gate, Realtime subscription, join-link parsing (MPLAY-02, MPLAY-03, D-15)** - `f113273`
2. **Task 2: MenuScreen - create and join through Edge Functions (MPLAY-01, D-02)** - `57f9518`
3. **Task 3: Name pre-fill and join-link code seeding on the Menu (D-09, D-15)** - `fe613ba`

_All three tasks were `tdd="true"`; tests were written/extended alongside each task's implementation and verified passing before each commit._

## Files Created/Modified

- `src/App.tsx` - async identity bootstrap replacing `crypto.randomUUID()`; poll deleted; `useRoomSubscription`/`usePresence` wired in; `/join/:code` parsing
- `src/screens/MenuScreen.tsx` - `createRoom`/`joinRoom` rewired onto Edge Functions with `mapEdgeErrorCode`; `initialRoomCode` prop; `playerName` pre-fill/write-back
- `src/context/GameContext.tsx` - `roomVersionRef` initial value fixed from `0` to `-1` (see Deviations)
- `src/__tests__/App.test.tsx` - 10 tests: 3 pre-existing Router routing tests (now supabase-mocked) + polling-removed assertion + subscription-wiring assertion + 5 new `ShitheadGame` identity/join-link tests
- `src/__tests__/screens/MenuScreen.test.tsx` - 21 tests covering Task 2's 8 behaviours and Task 3's 7 behaviours, plus the pre-existing Test Mode/disabled-button assertions

## Decisions Made

See `key-decisions` above.

## Deviations from Plan

**1. [Rule 3 - Blocking issue] `MenuScreen`'s `initialRoomCode` prop added in Task 1, not deferred to Task 3**
- **Found during:** Task 1, writing `App.tsx`'s `<MenuScreen initialRoomCode={initialRoomCode} />` call site
- **Issue:** Task 1's own behaviour list requires the parsed join code to be "passed to MenuScreen," but `MenuScreen.tsx` (pre-Task-3) had no such prop declared - `tsc`'s strict JSX prop-checking rejects an undeclared prop outright, which would fail Task 1's own `npm run build exits 0` acceptance criterion
- **Fix:** Added a minimal `MenuScreenProps { initialRoomCode?: string }` and seeded `roomCodeInput`'s initial state from it in Task 1's commit; Task 3 then added only the D-09 name pre-fill/write-back on top, per CLAUDE.md's own "order declarations to match actual use" guidance for this repo's `noUnusedParameters` strict setting
- **Files modified:** `src/screens/MenuScreen.tsx`
- **Commit:** `f113273`

**2. [Rule 1 - Bug] `GameContext.roomVersionRef` off-by-one dropped a freshly created room's first state**
- **Found during:** Task 2, wiring `create-room`'s response into context
- **Issue:** `roomVersionRef` was initialised to `0`; a freshly created room's row is always `version: 0` (see `create-room`'s Edge Function). `applyServerRoom`'s stale-version guard (`room.version <= roomVersionRef.current`) would therefore treat that very first application as a stale/duplicate delivery and silently drop it - the lobby would never render after creating a room. `useRoomSubscription`'s own equivalent ref already correctly used `-1` for the same reason.
- **Fix:** Changed `roomVersionRef`'s initial value from `0` to `-1`, matching `useRoomSubscription`'s existing convention
- **Files modified:** `src/context/GameContext.tsx`
- **Verification:** `GameContext.test.tsx`'s existing `applyServerRoom` tests (which use `version: 5` as their first value) are unaffected; full suite green
- **Commit:** `57f9518`
- **Note:** This bug was latent, not yet triggered - Plan 02-09 (which added `applyServerRoom`) never called it with a freshly created room's version 0, so it went unnoticed until this plan's `create-room`/`join-room` wiring exercised it for the first time. MenuScreen ultimately uses `setGameState(room.state)` rather than `applyServerRoom(room)` to apply the create/join response (matching the existing write pattern and avoiding any dependency on `roomVersionRef`'s state), but the fix was made at the source since a future caller (e.g. Task 1's own Router path, or a later plan) could hit the same bug via `applyServerRoom` directly.

**3. [Cross-plan integration gap - documented, not fixed here] `usePresence`'s `isPlayerOffline` not wired to `<LobbyScreen />`**
- **Found during:** Task 1, following the plan's literal instruction to "pass its `isPlayerOffline` down as a prop to `LobbyScreen`, which plan 02-11 gives the matching prop in this same wave"
- **Issue:** This worktree is isolated from the sibling worktree executing plan 02-11 (`LobbyScreen.tsx`, `LobbyScreen.test.tsx`) - per this session's explicit parallel-execution instructions, "no coordination needed" since the two plans' file sets don't overlap. But `LobbyScreen.tsx` in this worktree's copy has no `isPlayerOffline` prop declared yet, so passing it would fail `npm run build`'s strict JSX prop-checking, breaking Task 1's own acceptance criterion.
- **Resolution:** `usePresence({ roomCode, playerId, testMode })` is still called exactly once in `Router` (satisfying "never inside a screen, never twice" and keeping the single Presence channel/heartbeat per room), but its `isPlayerOffline` return value is not yet passed to `<LobbyScreen />`. This is a genuine cross-plan wiring gap that only closes once 02-11's `LobbyScreen.tsx` (which will declare the prop) merges alongside this plan's `App.tsx` (which needs to pass it) - not something either worktree can resolve alone without touching the other's exclusively-owned files.
- **Follow-up needed:** After both 02-10 and 02-11 land, add `isPlayerOffline={isPlayerOffline}` to `Router`'s `<LobbyScreen />` call site in `App.tsx`, and remove this note.
- **Files affected:** `src/App.tsx` (not modified further for this)
- **Commit:** `f113273`

**Total deviations:** 2 auto-fixed (Rule 3 - prop timing, Rule 1 - version-ref bug), 1 documented cross-plan integration gap deferred to post-merge

## Issues Encountered

- **Two previously known-failing tests now pass**: `src/__tests__/screens/MenuScreen.test.tsx`'s "Create Room generates a well-formed... room code (WR-03)" and "Join on a valid, waiting room... (WR-02)" tests were failing on the base commit (per `STATE.md`'s documented context from the 02-09 merge) because `MenuScreen.tsx` still used the legacy `window.storage` flow that 02-09 had removed support for. Both were rewritten in Task 2 to assert the new Edge-Function-backed contract and now pass; the full suite (309 tests) is green.
- **Pre-existing, unrelated `npm run lint` failures** (not introduced by this plan, not fixed - out of scope per the Scope Boundary rule): `src/context/GameContext.tsx:142` (`react-refresh/only-export-components` - the file exports both the `GameProvider` component and the `useGameContext` hook) and `src/screens/GameScreen.tsx:85` (`react-hooks/set-state-in-effect` in the celebration-modal effect). Both were present before this plan's changes (confirmed via a baseline `npm run lint` run before editing).
- **`coverage/` directory shows as modified in `git status`** throughout this session (`coverage/block-navigation.js`, `coverage/prettify.js`, `coverage/sorter.js`) - these are generated coverage-report artefacts, gitignored going forward but still tracked from before the ignore rule was added. Left untouched/unstaged, consistent with the task-commit protocol's "stage task-related files individually" rule.

## User Setup Required

None - no external service configuration required. `VITE_SUPABASE_URL`/`VITE_SUPABASE_PUBLISHABLE_KEY` (needed for the app to run against a real Supabase project) were already required by earlier plans in this phase.

## Next Phase Readiness

- `App.tsx`/`MenuScreen.tsx` are fully rewired onto the identity/Realtime/Edge-Function stack; the `window.storage`-based multiplayer illusion is gone from both files
- **Follow-up for 02-11 (or a small integration step after both merge):** wire `usePresence`'s `isPlayerOffline` from `Router` into `<LobbyScreen />` once `LobbyScreen.tsx` declares the matching prop (see Deviation 3)
- **Follow-up for 02-12:** `GameScreen` remains prop-less at this wave by design; its own prop signature and `Router` call site are that plan's responsibility

## Self-Check: PASSED

All modified files confirmed present (`src/App.tsx`, `src/screens/MenuScreen.tsx`,
`src/context/GameContext.tsx`, `src/__tests__/App.test.tsx`,
`src/__tests__/screens/MenuScreen.test.tsx`), and all three task commit hashes
(`f113273`, `57f9518`, `fe613ba`) confirmed present in `git log --oneline --all`.

---
*Phase: 02-real-cross-device-multiplayer*
*Completed: 2026-07-28*
