---
phase: 02-real-cross-device-multiplayer
plan: 12
subsystem: ui

tags: [react, presence, realtime, edge-functions, gameplay-ui]

# Dependency graph
requires:
  - phase: 02-real-cross-device-multiplayer
    provides: "02-07's check-turn-timeout Edge Function, 02-08's usePresence/onlinePlayerIds hook, 02-09's optimistic dispatch/turnStartedAt in GameContext, 02-10's Router usePresence call site"
provides:
  - "D-10 two-state offline badge (WifiOff -> RotateCw 'auto-picking up') and reconnect toast on GameScreen's player tiles"
  - "useTurnTimeoutSweep - the client-side lazy trigger that makes check-turn-timeout reachable at all, closing the D-05 auto-pickup loop"
  - "D-14 Leave Game button and confirm dialog - a purely local exit, zero server writes"
affects: [02-13]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "React's 'adjusting state when a prop changes' render-body pattern (compare a derived key, call setState directly in the render body) used instead of an effect-body setState call or a ref, to satisfy this project's strict react-hooks/React Compiler lint rules (no refs during render, no impure calls during render, no synchronous setState in an effect body)"
    - "Hooks that poll a local clock treat it as a hint only - the request body carries nothing but an identifier (roomCode); the server always re-derives the authoritative answer and no-ops if the client was early"

key-files:
  created:
    - src/hooks/useTurnTimeoutSweep.ts
    - src/__tests__/hooks/useTurnTimeoutSweep.test.ts
  modified:
    - src/screens/GameScreen.tsx
    - src/App.tsx
    - src/__tests__/screens/GameScreen.test.tsx
    - src/__tests__/App.test.tsx

key-decisions:
  - "isOffline compares against context's playerId, never currentPlayerId, so the local player's own tile never greys out even in Test Mode where currentPlayerId follows the controlling-player click"
  - "The D-10 state 2 badge (RotateCw, amber, 'Offline - auto-picking up') replaces state 1's badge element in place - a single conditional span, never a second DOM node"
  - "useTurnTimeoutSweep's graceExpired is tracked in one useState object together with an 'arm key' string; the key comparison resets it via React's render-body state-adjustment pattern instead of an effect-body setState call or a ref, to satisfy this project's react-hooks/refs and react-hooks/purity rules"
  - "Leave Game's confirm handler only calls the context's local setGameState(null) - no Edge Function call, per D-04's guarantee the seat is never freed"

requirements-completed: [MPLAY-04, MPLAY-06]

# Metrics
duration: ~75min
completed: 2026-07-28
---

# Phase 02 Plan 12: Disconnect UI, turn-timeout trigger, and Leave Game Summary

**Wires 02-07's server-verified auto-pickup and 02-08's Presence signal into GameScreen: a two-state offline badge with reconnect toast, the client-side `useTurnTimeoutSweep` hook that makes `check-turn-timeout` reachable at all, and a D-14 Leave Game button/dialog that never touches the server.**

## Performance

- **Duration:** ~75 min
- **Tasks:** 3
- **Files modified/created:** 6 (2 created, 4 modified)

## Accomplishments

- `GameScreen`'s player tiles grey out (`opacity-60`/`border-slate-600`) with a `WifiOff` "Offline" badge when `usePresence` reports a player absent, upgrading in place to a `RotateCw` amber "Offline - auto-picking up" badge once that player's own turn has run past the grace period. A ref-tracked offline->online transition raises a "{name} reconnected" toast exactly once, silently seeded on mount so already-online players never trigger a spurious one.
- `useTurnTimeoutSweep` - a new hook every client runs while a room is in the `playing` phase, polling locally every 5s and invoking `check-turn-timeout` with a body containing only `roomCode` once the local clock says the grace period has elapsed and it isn't the local player's own turn. The server clock, not this hook, is authoritative; this closes the previously-dead-code loop D-05's auto-pickup depended on.
- A "Leave Game" button (neutral slate, not red - the seat persists per D-04) sits in `GameScreen`'s header next to Rules, opening a confirm dialog that duplicates the existing pick-up-pile portal exactly. Confirming clears `gameState` via the context's local setter only - zero Edge Function calls, verified by a spy assertion.

## Task Commits

Each task followed the plan's TDD RED/GREEN pairing:

1. **Task 1: Presence-driven offline badge and reconnect toast (D-10)**
   - `d08649e` - test: failing tests for offline badge and reconnect toast
   - `fb165fd` - feat: implementation + App.test.tsx pass-through test + a Test Mode query-collision fix
2. **Task 2: Client trigger for check-turn-timeout, and the auto-picking-up badge (D-05, D-10 state 2)**
   - `ca92de0` - test: failing tests for the sweep hook (13 cases) and the state-2 badge (3 cases)
   - `183c67c` - feat: `useTurnTimeoutSweep` + GameScreen wiring
3. **Task 3: Leave Game button and confirm dialog (D-14)**
   - `fc294c6` - test: failing tests for the button/dialog (6 cases)
   - `cd7cb09` - feat: implementation + a same-file lint fix to `useTurnTimeoutSweep.ts` (see Deviations)

**Plan metadata:** committed separately per `<final_commit>` (this commit)

## Files Created/Modified

- `src/hooks/useTurnTimeoutSweep.ts` - new hook; client-side lazy trigger for `check-turn-timeout`, exports `useTurnTimeoutSweep` and `TURN_SWEEP_INTERVAL_MS = 5000`
- `src/__tests__/hooks/useTurnTimeoutSweep.test.ts` - 13 tests covering all nine required behaviours
- `src/screens/GameScreen.tsx` - `isPlayerOffline` prop, offline badge + reconnect toast, `useTurnTimeoutSweep` wiring for the state-2 badge, Leave Game button and confirm dialog
- `src/App.tsx` - `Router` now passes `isPlayerOffline` into `GameScreen` (Router's single `usePresence` call was already in place from plan 02-10)
- `src/__tests__/screens/GameScreen.test.tsx` - 20 new assertions across three `describe` blocks for the three tasks (26 tests total in the file, up from 11)
- `src/__tests__/App.test.tsx` - one new test proving `isPlayerOffline` reaches `GameScreen` through Router's real `usePresence` subscribe/sync flow

## Decisions Made

- `isOffline` derivation compares against `playerId` (real identity), never `currentPlayerId` (which follows Test Mode's controlling-player click) - required so the local player's own tile never greys out.
- `useTurnTimeoutSweep`'s `graceExpired` is tracked in one `useState<{armKey, graceExpired}>` object rather than a plain boolean plus a `useRef` for "previous key" - this project's eslint config enforces the newer React Compiler rules (`react-hooks/refs`, `react-hooks/purity`, `react-hooks/set-state-in-effect`) strictly enough that the "classic" ref-based reset pattern and a pure `Date.now()`-in-render computation are both disallowed. See Deviations below.
- Leave Game's confirm dialog duplicates the pre-existing pick-up-pile portal structure exactly (same overlay/panel/button classes) per `02-PATTERNS.md`'s explicit instruction, including using the same `bg-red-600` "final destructive-style confirm" treatment for "Leave Game" even though the action is reversible (D-04).

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] `useTurnTimeoutSweep.ts` initially tripped three new react-hooks/React Compiler lint rules**
- **Found during:** Task 2, after `npm run lint`
- **Issue:** The first implementation called `setGraceExpired(false)` synchronously at the top of the effect body (`react-hooks/set-state-in-effect`). Fixing that with a `useRef`-tracked "previous arm key" comparison during render tripped `react-hooks/refs` (no ref reads/writes during render). Fixing *that* with a pure `Date.now()`-based render-time computation tripped `react-hooks/purity` (no impure calls during render).
- **Fix:** `graceExpired` is now tracked together with an "arm key" string in one `useState` object; the key comparison and reset use React's own documented "adjusting state when a prop changes" pattern (calling `setState` directly in the render body - not a ref, not an effect), and the value is otherwise only ever updated from inside the `setInterval` callback the effect registers (the officially-endorsed shape: "subscribe for updates from an external system, calling setState in a callback").
- **Files modified:** `src/hooks/useTurnTimeoutSweep.ts`
- **Verification:** `npx eslint src/hooks/useTurnTimeoutSweep.ts src/__tests__/hooks/useTurnTimeoutSweep.test.ts` is clean; all 13 hook tests and all 26 GameScreen tests still pass after each redesign iteration.
- **Committed in:** `cd7cb09` (folded into Task 3's commit, since Task 2's own commit `183c67c` predates discovering the issue via a later full `npm run lint` pass)

---

**Total deviations:** 1 auto-fixed (Rule 1 - bug/lint violation in this plan's own new file)
**Impact on plan:** No scope creep - the fix stayed entirely within the one file this plan created, and did not touch the two pre-existing lint errors in `GameContext.tsx`/`GameScreen.tsx`'s celebration effect (logged to `deferred-items.md`, out of scope).

## Issues Encountered

- **Worktree base drift at session start.** A prior session was terminated by an API error before this worktree's `HEAD` had been corrected via the mandatory `worktree_branch_check` reset; `HEAD` was still on `d606485` (a pre-Phase-2 ancestor with no `.planning/` directory and a materially different `App.tsx`/`GameScreen.tsx`). Resolved via `git reset --hard 2200042b6bec5da549dc7659191fff3487748da7` (the plan's documented base) at the very start of this session, per the `worktree_branch_check` step's own instructions - a safe correction since `HEAD` had no divergent commits of its own at that point (`git merge-base HEAD 2200042... == d606485`, confirming `d606485` was a strict ancestor, not a sibling with lost work).
- **Task 3's acceptance-criterion grep `>Cancel<` cannot match under this project's Prettier config** (100-char `printWidth`) - confirmed pre-existing via `git show 2200042:src/screens/GameScreen.tsx`, not introduced by this plan. Logged to `deferred-items.md`; the underlying intent (the pick-up dialog's "Cancel" label unchanged) is covered by a passing test instead.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- MPLAY-06 ("players can see when an opponent has disconnected mid-game") is now visible in the UI where it matters - both D-10 badge states and the reconnect toast render on the actual game board, not just the lobby.
- D-05's auto-pickup is reachable end-to-end for the first time in this phase: `check-turn-timeout` now has a live client trigger.
- D-14 closes the last decision (`02-CONTEXT.md`) without an implementing task before this plan.
- Plan 02-13 (wave 6, checkpoint, `autonomous: false`) is next and closes out the phase - it needs user input and was not started by this plan.
- Full suite (352 tests, up from 323 at wave 4) and `npm run build` are green. `npm run lint` still exits 1 on two pre-existing issues unrelated to this plan (see `deferred-items.md`).

---
*Phase: 02-real-cross-device-multiplayer*
*Completed: 2026-07-28*

## Self-Check: PASSED

- FOUND: `src/hooks/useTurnTimeoutSweep.ts`
- FOUND: `src/__tests__/hooks/useTurnTimeoutSweep.test.ts`
- FOUND: `.planning/phases/02-real-cross-device-multiplayer/02-12-SUMMARY.md`
- FOUND commit `d08649e` (test: offline badge/reconnect toast RED)
- FOUND commit `fb165fd` (feat: offline badge/reconnect toast GREEN)
- FOUND commit `ca92de0` (test: turn-timeout sweep + state-2 badge RED)
- FOUND commit `183c67c` (feat: turn-timeout sweep + state-2 badge GREEN)
- FOUND commit `fc294c6` (test: Leave Game RED)
- FOUND commit `cd7cb09` (feat: Leave Game GREEN + lint fix)
