---
status: partial
phase: 02-real-cross-device-multiplayer
source: [02-05-SUMMARY.md, 02-07-SUMMARY.md, 02-08-SUMMARY.md, 02-09-SUMMARY.md, 02-10-SUMMARY.md, 02-11-SUMMARY.md, 02-12-SUMMARY.md]
started: 2026-07-28T18:00:00Z
updated: 2026-07-28T20:30:00Z
---

## Current Test

number: 6
name: Leave Game + rejoin (D-14, D-04)
expected: |
  Pressing Leave Game, confirming, lands on the menu. Rejoining with the same
  room code and name puts the player back in their same seat with hand intact.
awaiting: user response

## Tests

### 1. Create Room (Device 1, hosted project)
expected: Entering a name and clicking Create Room creates a room and enters the lobby
result: issue
reported: "Error, Failed to join room - please retry."
severity: blocker
note: |
  Root cause found by inspection, not user diagnosis: none of the 7 Edge
  Functions had ever been deployed to the hosted Supabase project (only
  validated locally via 02-13's smoke suite and Vitest). Fixed by deploying
  all 7 functions during this session. Confirmed working after the deploy -
  not carried forward as an open gap.

### 2. Join Room via copy-join-link (Device 2 / phone)
expected: Opening the join link pre-fills the room code; entering a name and
  pressing Join seats the second player, visible on both screens within a second
result: pass
note: |
  Two non-bugs hit along the way, not app defects: Brave's "upgrade to HTTPS"
  shield broke the plain-http LAN link (browser setting, not app), and the
  Join button stayed disabled until a name was typed even though the room
  code was pre-filled (matches the documented `disabled={!playerName.trim()
  || !roomCodeInput.trim()}` contract).

### 3. Ready up and play several turns
expected: Both players ready up, phase moves to playing, moves apply cleanly
  on both screens with no unexpected toasts
result: issue
reported: |
  "Ready to Play button press after initial card swap triggered the Invalid
  move check popup." / "Getting the Your move didn't stick error from
  'Player 2 Jim' when I played that last 7."
severity: major
root_cause: |
  Diagnosed by code trace, not reproduced in isolation: heartbeat() (every
  ~15s, from every connected player) and joinRoom()'s 'existing'-seat
  auto-rejoin branch both write via the same version-incrementing path as
  real moves, even though neither changes `state` outside the rare lobby
  host-transfer case. Each such write broadcasts a version-bumped,
  content-unchanged `state` to every subscriber. useRoomSubscription's
  reconciliation check compares the incoming state against the client's
  *current optimistic display* (which may reflect an in-flight, not-yet-
  server-confirmed move) - so a heartbeat landing mid-move looks exactly
  like "the server disagreed," even though it's unrelated ambient traffic.
  See 02-VERIFICATION.md Gap B for the full trace and fix design.
artifacts:
  - path: supabase/functions/_shared/heartbeat.ts
    issue: writes state unconditionally through the version-bumping path even when state is unchanged
  - path: supabase/functions/_shared/joinRoom.ts
    issue: "'existing' seat branch has the same pattern (D-01 auto-rejoin)"
  - path: src/hooks/useRoomSubscription.ts
    issue: reconciliation compares against optimistic local state with no way to distinguish a stale/no-op broadcast from a genuine authoritative correction
missing:
  - A version-exempt write path for player_seen-only updates (heartbeat, and join-room's 'existing' branch) so routine connectivity traffic stops bumping the game-state version
debug_session: ""

### 4. Disconnect badge + auto-pickup targeting (D-05, D-10)
expected: The player who actually disconnected shows offline and is the one
  auto-picked-up after the grace period; the other player is untouched
result: issue
reported: |
  "Inconsistant who is actually offline. Top room toast says Mal was
  disconnected on my PC, but the PC play IS Mal. It's Jim who was
  disconnected on the phone." / "Auto-pickup just fired, it looked like Mal
  picked up not Jim."
severity: blocker
root_cause: |
  Confirmed directly against the live room row: checkTurnTimeout never read
  `player_seen` at all - it fired purely on elapsed turn duration
  (`turn_started_at`), regardless of whether the current-turn player was
  actually connected. Mal's own turn simply ran long (the tester was busy
  debugging), so Mal - the fully-online player, with the freshest
  `player_seen` timestamp in the room - was punished, while Jim (genuinely
  stale) kept his seat untouched.
artifacts:
  - path: supabase/functions/_shared/turnTimeout.ts
    issue: checkTurnTimeout had no connectivity gate at all
status_note: |
  FIXED and deployed during this session (commit 583fab6): checkTurnTimeout
  now also requires the current-turn player to be stale by
  DISCONNECT_THRESHOLD_MS on player_seen before picking up. 5 new tests
  added. 02-CONTEXT.md and 02-RESEARCH.md updated to reflect the revised
  D-05 decision. Not carried forward as an open gap - retest still pending
  (see test 4b).

### 4b. Retest: auto-pickup targeting after the D-05 fix
expected: With the fix deployed, the auto-pickup should only ever target the
  player who is genuinely stale on player_seen, never a fully connected one
result: [pending]

### 5. Reconnect (D-01, D-10)
expected: Reopening the app at the same URL drops the player straight back
  into their seat with cards intact; the other screen shows a reconnect toast
  and the badge clears
result: pass
note: |
  User suggestion (not a defect): the last-used room code should persist in
  the join-form's room-code field so a reconnecting player doesn't have to
  retype it after a timeout. Logged as a UX enhancement, not a gap.

### 6. Leave Game + rejoin (D-14, D-04)
expected: Pressing Leave Game and confirming lands on the menu; rejoining
  with the same room code and name returns the player to their same seat
  with their hand intact
result: [pending]

## Summary

total: 6
passed: 2
issues: 3
pending: 2
skipped: 0
blocked: 0

## Gaps

<!-- YAML format for plan-phase --gaps consumption. Only currently-open items
     are listed here - the D-05 mistargeting gap (test 4) was fixed and
     deployed during this session and is not carried forward. -->

- truth: "A player's own optimistic move, once submitted, is not overridden by unrelated server traffic that doesn't reflect a real state change"
  status: failed
  reason: "Routine heartbeat/auto-rejoin writes bump the room's version and broadcast an unchanged state, which the client's reconciliation check compares against its own in-flight optimistic prediction - producing false 'your move didn't stick' toasts unrelated to any actual conflict. See 02-VERIFICATION.md Gap B for the full root-cause trace."
  severity: major
  test: 3
  root_cause: "heartbeat() and joinRoom()'s 'existing' branch write via the same version-incrementing path as real state-changing moves, even when state itself is unchanged"
  artifacts:
    - path: "supabase/functions/_shared/heartbeat.ts"
      issue: "Unconditional version-bumping write on every 15s heartbeat, regardless of whether state changed"
    - path: "supabase/functions/_shared/joinRoom.ts"
      issue: "'existing' seat resolution branch has the same pattern"
    - path: "supabase/functions/_shared/db.ts"
      issue: "withVersionRetry has no version-exempt write path for metadata-only updates"
  missing:
    - "A player_seen-only write path that does not bump version, so connectivity bookkeeping stops polluting the game-state reconciliation stream"
  debug_session: ""

- truth: "Leaving mid-turn resolves within the same ~60s grace period as an ordinary disconnect"
  status: failed
  reason: "Leave Game (D-14) is a purely local action with no server write - player_seen simply stops updating from whenever the player's last heartbeat fired, not from the moment they left. Leaving late in your own turn (e.g. at the 55s mark) can push the effective auto-pickup/host-transfer delay out to roughly 100s instead of the documented ~60s."
  severity: minor
  test: 6
  root_cause: "D-05's and D-08's staleness checks both key off player_seen, which only ages from the last heartbeat, not from an explicit 'left' signal - and D-14 deliberately sends no server signal on leave"
  artifacts:
    - path: "src/screens/GameScreen.tsx"
      issue: "confirmLeaveGame is purely local (setGameState(null)), by design - no Edge Function call"
    - path: "supabase/functions/_shared/turnTimeout.ts"
      issue: "no way to distinguish 'genuinely idle' staleness from 'deliberately left' staleness"
    - path: "supabase/functions/_shared/heartbeat.ts"
      issue: "transferHostIfStale has the identical staleness-clock-starts-late interaction for a host who leaves the lobby"
  missing:
    - "Decide whether this bounded, self-resolving delay is acceptable as-is, or whether Leave Game should send a lightweight signal to fast-track the staleness clock"
  debug_session: ""

- truth: "A turn that times out always resolves, regardless of table state"
  status: failed
  reason: "PICK_UP_PILE requires a non-empty discard pile (PILE_EMPTY otherwise). checkTurnTimeout forwards that error unwritten, and useTurnTimeoutSweep silently swallows every sweep error (.catch(() => {})) with no fallback. Since nothing about the room changes between sweeps, every retry produces the identical failure forever - the game stalls permanently and silently, with zero user-visible indication anything is wrong."
  severity: blocker
  test: 4b
  root_cause: "D-05's auto-pickup assumed PICK_UP_PILE is always legal when a turn can't otherwise be resolved; an empty discard pile breaks that assumption and D-05 has no fallback for it"
  artifacts:
    - path: "supabase/functions/_shared/turnTimeout.ts"
      issue: "No fallback when applyMove's PICK_UP_PILE attempt returns PILE_EMPTY"
    - path: "src/hooks/useTurnTimeoutSweep.ts"
      issue: "Every sweep error is silently swallowed with no distinction or surfacing"
  missing:
    - "Design decision made 2026-07-28: auto-play the player's lowest-ranked card (via gameLogic.ts's existing RANK_VALUES ordering) from their current getAvailableCardSource() when PICK_UP_PILE returns PILE_EMPTY. For a faceDown source, cards are blind by design, so there is no rank to compare - deterministically use index 0 instead."
  debug_session: ""
