---
phase: 01-rules-engine-refactor
plan: 05
subsystem: ui
tags: [react, vitest, testing-library, react-context, routing]

# Dependency graph
requires:
  - phase: 01-rules-engine-refactor (Plan 01-04)
    provides: GameProvider/useGameContext (gameState, setGameState, testMode, setTestMode, controllingPlayer, setControllingPlayer, showToast, toast, dismissToast, playerId)
provides:
  - "Slim App.tsx orchestrator (D-09): playerId generation via crypto.randomUUID(), GameProvider wiring, phase-based Router routing, shared background chrome, single Toast container"
  - "MenuScreen.tsx: room creation/joining/test-mode entry, all alert() calls converted to toasts (ENGINE-05)"
  - "LobbyScreen.tsx: room code display, player list, host-only Start Game gating, sourcing roomCode exclusively from GameState"
  - "Placeholder GameScreen.tsx satisfying the 'game' route pending Plan 01-06's full extraction"
  - "Automated routing test proving Router's phase-based branching (no test relying on downstream screens to imply it)"
affects: [01-06]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Phase-based routing via GameState.phase instead of a separate screen state variable (D-09)"
    - "Screen components read all game state/actions from useGameContext() rather than props"
    - "RTL SeedGameState harness pattern: a sibling component calling setGameState in a mount effect to seed context state ahead of assertions"

key-files:
  created:
    - src/screens/MenuScreen.tsx
    - src/screens/LobbyScreen.tsx
    - src/screens/GameScreen.tsx
    - src/__tests__/App.test.tsx
    - src/__tests__/screens/MenuScreen.test.tsx
    - src/__tests__/screens/LobbyScreen.test.tsx
  modified:
    - src/App.tsx

key-decisions:
  - "Task 1's Router test requires MenuScreen/LobbyScreen to render identifiable content, but those screens are Task 2/3's deliverables - resolved by creating minimal text-only stubs during Task 1's GREEN phase, then fully replacing them in Task 2/3's own RED/GREEN cycles"
  - "React's synthetic event system suppresses onClick dispatch for natively-disabled buttons based on its own tracked fiber props, not the live DOM disabled attribute - confirmed empirically, so MenuScreen's empty-playerName guard test asserts the button's disabled state directly rather than attempting to force-click past it"

patterns-established:
  - "Router is a named export separate from the default ShitheadGame export, so tests can render it directly inside a test-controlled GameProvider without going through playerId generation"

requirements-completed: [ENGINE-03, ENGINE-05, ENGINE-07]

# Metrics
duration: 10min
completed: 2026-07-25
---

# Phase 01 Plan 05: App.tsx Orchestrator + Menu/Lobby Screen Extraction Summary

**Slimmed App.tsx into a D-09 phase-based Router orchestrator and extracted MenuScreen/LobbyScreen from its JSX, converting all six menu/lobby alert() calls to toasts.**

## Performance

- **Duration:** ~10 min
- **Started:** 2026-07-25T16:52:56+01:00
- **Completed:** 2026-07-25T17:03:00+01:00
- **Tasks:** 3 completed
- **Files modified:** 7 (1 rewritten, 6 created)

## Accomplishments
- `App.tsx` is now a ~48-line orchestrator: generates `playerId` via `crypto.randomUUID()` (fixing the never-set `playerId` bug, removing the `@ts-expect-error` guard), wraps `GameProvider`, and exports a named `Router` that routes purely on `GameState.phase`
- `MenuScreen.tsx` and `LobbyScreen.tsx` fully extracted with their original behavior preserved exactly (test-mode dealing, room creation/joining, host-only Start Game gating), all `alert()` calls converted to `showToast()`
- A placeholder `GameScreen.tsx` keeps the app runnable end-to-end pending Plan 01-06's full extraction
- Router's three routing branches (menu / lobby / game) are proven by an automated test, not left implicit in downstream screen tests

## Task Commits

Each task followed RED (failing test) then GREEN (implementation):

1. **Task 1: App.tsx orchestrator — Router routing test** - `aaf0159` (test, RED)
2. **Task 1: App.tsx orchestrator — Router implementation** - `288b634` (feat, GREEN)
3. **Task 2: MenuScreen — behavior test** - `7e44ff6` (test, RED)
4. **Task 2: MenuScreen — implementation** - `fb49818` (feat, GREEN)
5. **Task 3: LobbyScreen — behavior test** - `c4ad11b` (test, RED)
6. **Task 3: LobbyScreen — implementation** - `c8bd3e5` (feat, GREEN)

_No REFACTOR commits were needed - each GREEN implementation was clean on first pass._

## Files Created/Modified
- `src/App.tsx` - Rewritten as the slim D-09 orchestrator: `ShitheadGame` (default export, playerId generation + GameProvider wrap) and `Router` (named export, phase-based routing + shared chrome + poll effect + Toast container)
- `src/screens/MenuScreen.tsx` - Room creation/joining/test-mode entry, ported from `App.tsx:151-291,929-997` (pre-refactor line numbers)
- `src/screens/LobbyScreen.tsx` - Room code display, player list, host-only Start Game, ported from `App.tsx:293-329,999-1063`
- `src/screens/GameScreen.tsx` - Minimal placeholder reading `gameState.phase`; Plan 01-06 replaces its contents
- `src/__tests__/App.test.tsx` - Router's three phase-based routing branches
- `src/__tests__/screens/MenuScreen.test.tsx` - Test-mode dealing, empty-name guard, join-room-not-found toast
- `src/__tests__/screens/LobbyScreen.test.tsx` - Room code/player list rendering, host-only Start Game gating, start-game dealing

## Decisions Made
- Task 1's Router test needs MenuScreen/LobbyScreen to render real content before those screens exist as this plan's own Task 2/3 deliverables. Resolved with minimal text-only stubs (`<div>Create Room</div>` / `<div>Game Lobby</div>`) committed as part of Task 1's GREEN, then fully replaced in Task 2/3's own RED/GREEN cycles - each screen still gets its own dedicated behavior test against its full implementation.
- MenuScreen's `createRoom`/`joinRoom` guards keep their `!playerName.trim()` early-return exactly as specified (defense-in-depth, matching the same pattern documented in this plan's own threat model for `LobbyScreen`'s Start Game), even though empirical testing confirmed the guard is currently unreachable via simulated clicks (see Deviations).

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Created minimal MenuScreen/LobbyScreen stubs ahead of Task 2/3**
- **Found during:** Task 1 (App.tsx orchestrator)
- **Issue:** Task 1's own `<behavior>` spec requires `Router`'s test to assert on `MenuScreen`'s "Create Room" content and `LobbyScreen`'s "Game Lobby"/Start Game content, but those screens are Task 2/3's declared deliverables and didn't exist yet - Task 1 couldn't reach GREEN without them.
- **Fix:** Created minimal text-only stub components (`src/screens/MenuScreen.tsx`, `src/screens/LobbyScreen.tsx`) alongside Task 1's real deliverables (`App.tsx`, `GameScreen.tsx`), sufficient only to satisfy Task 1's routing assertions. Task 2 and Task 3 then fully replaced each stub with the real ported extraction in their own dedicated RED/GREEN commits.
- **Files modified:** src/screens/MenuScreen.tsx, src/screens/LobbyScreen.tsx (both superseded by Task 2/3 commits)
- **Verification:** `npx vitest run src/__tests__/App.test.tsx` passed at Task 1's completion; both stub files were fully overwritten (not merely extended) by Task 2's and Task 3's commits.
- **Committed in:** 288b634 (Task 1 commit); superseded by fb49818 (Task 2) and c8bd3e5 (Task 3)

**2. [Rule 1 - Test design] Adjusted MenuScreen's empty-name test from a forced click to a disabled-state assertion**
- **Found during:** Task 2 (MenuScreen extraction)
- **Issue:** The plan's `<behavior>` spec calls for testing that clicking "Create Room" with an empty `playerName` shows a toast without calling `setGameState`. The rendered button is natively `disabled` when `playerName` is empty (ported exactly from `App.tsx`). Testing-library's `fireEvent.click` on a disabled button does not invoke the React `onClick` handler in this React version - confirmed empirically that even directly mutating the DOM node's `disabled` property/attribute before dispatch doesn't help, because React's synthetic event system checks its own tracked fiber props, not the live DOM. This makes `createRoom`'s internal empty-name guard genuinely unreachable via any simulated click.
- **Fix:** Kept `createRoom`'s internal guard exactly as specified (defense-in-depth, matching the codebase's own pattern for `LobbyScreen`'s host-only gating). Rewrote the test to assert the actual behavioral guarantee instead - the button is disabled when `playerName` is empty and becomes enabled once a name is entered, so `setGameState` can never be reached with an empty name through the UI.
- **Files modified:** src/__tests__/screens/MenuScreen.test.tsx
- **Verification:** `npx vitest run src/__tests__/screens/MenuScreen.test.tsx` passes (3/3); the "Join with room not found" test in the same file still exercises the toast path directly, since Join's disabled condition isn't in play there (both inputs are non-empty).
- **Committed in:** fb49818 (Task 2 commit)

---

**Total deviations:** 2 auto-fixed (1 blocking-dependency ordering, 1 test-design adjustment)
**Impact on plan:** Both were necessary to make the plan's own task sequencing and test spec executable as written; no scope creep, no behavior changes beyond what the plan specified. `MenuScreen`'s guard code is unchanged from the plan's action spec - only the test's interaction technique changed.

## Issues Encountered
- `GameContext.tsx`'s `setGameState` closes over `testMode` from the render that created the callback. `MenuScreen`'s `createTestGame`/`createTestGameStarted` call `setTestMode(true)` immediately followed by `setGameState(...)` in the same synchronous handler (as the plan specifies), so `setGameState` sees a stale `testMode:false` and takes the `await window.storage.set(...)` branch before settling - the resulting state update lands a microtask later than the synchronous handler. This doesn't break the required behavior (the state does settle correctly, verified with `waitFor` in `MenuScreen.test.tsx`), but it does mean test-mode games briefly get written to real `localStorage` under the `game:TEST`/`game:TEST-STARTED` keys, which is unintended. `GameContext.tsx` is Plan 01-04's file and outside this plan's `files_modified`; flagging here rather than fixing, per scope-boundary guidance, since it doesn't block this plan's acceptance criteria.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

Plan 01-06 can now replace `src/screens/GameScreen.tsx`'s placeholder with the full board/hand extraction from pre-refactor `App.tsx` (playCards, pickUpPile, swapCards, setReady, celebration modal, drawing animations, rules panel) using `dispatchMove`/`useGameContext()` per `GameContextValue`'s existing surface. No blockers identified for that plan.

The stale-`testMode`-closure issue noted above (see Issues Encountered) is a candidate for Plan 01-06 or a later cleanup pass if it becomes user-visible, but does not block Phase 1 completion as specified.

---
*Phase: 01-rules-engine-refactor*
*Completed: 2026-07-25*
