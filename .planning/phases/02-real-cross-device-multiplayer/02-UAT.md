---
status: partial
phase: 02-real-cross-device-multiplayer
source: [02-05-SUMMARY.md, 02-07-SUMMARY.md, 02-08-SUMMARY.md, 02-09-SUMMARY.md, 02-10-SUMMARY.md, 02-11-SUMMARY.md, 02-12-SUMMARY.md, 02-14-SUMMARY.md, 02-15-SUMMARY.md]
started: 2026-07-28T18:00:00Z
updated: 2026-07-30T00:00:00Z
---

## Current Test

number: 7
name: Reconciliation toast fires for an idle player, not just the mover
expected: |
  A player who has not submitted a move should never see "Your move didn't
  stick" purely because another player's legitimate move just broadcast.
awaiting: gap logged - routing through the gap-closure planning cycle

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
status_note: |
  FIXED and deployed (plan 02-15, migration 0003 + all 7 Edge Functions
  redeployed to the hosted project): heartbeat and join-room's D-01 branch
  both route through a version-exempt touchPlayerSeen write on their common
  no-op path. Confirmed live against real Postgres via the smoke suite, not
  just Vitest fakes. Not carried forward as an open gap - but retesting this
  surfaced a second, distinct reconciliation bug (see the new Gap below,
  test 7): the toast was never actually scoped to "did *I* have a move that
  might not have stuck" in the first place.
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

### 7. Retest after 02-14/02-15 deploy: reconciliation toast on the idle player
expected: With both fixes deployed, playing several turns across two devices
  produces no unexpected "didn't stick" toasts on either screen, including
  during setup phase and including on the screen that did not just move
result: issue
reported: |
  "Still 'Your move didn't stick sync with the latest game state' popups on
  PC during setup phase." / "Getting that warning on PC even after Phone
  client turn made in real game."
severity: major
note: |
  The empty-pile stall and heartbeat/D-01 pollution gaps are confirmed fixed
  (see status_notes on tests 3 and 4b above) - this is a third, distinct
  gap, logged below. See root_cause in the new Gaps entry.

### 8. Realtime room-data channel goes silently stale, no reconnect
expected: If the browser's WebSocket connection drops or is throttled (tab
  backgrounded, brief network blip, machine idle for a few minutes), the
  room-data subscription should detect it and resubscribe, so the screen
  never permanently stops reflecting the opponent's moves
result: issue
reported: |
  "Phone hand just played last card from main hand. Move not seen on PC
  client screen." / "There now after signing in to the room again and
  playing the card again, but looked like the original move did not take."
severity: blocker
root_cause: |
  Confirmed by direct inspection of the hosted room's `moves` audit table
  (versions 58-72 for room ZABYDB): every play alternates PC/Phone correctly
  with zero gaps or duplicates - nothing was lost or corrupted server-side.
  The PC's screen simply stopped reflecting new broadcasts. `usePresence.ts`
  checks its own channel's subscribe status (`status === 'SUBSCRIBED'`) and
  reacts to it, but `useRoomSubscription.ts`'s room-data `postgres_changes`
  channel (the one that carries every game-state update) has no subscribe-
  status callback and no CHANNEL_ERROR/TIMED_OUT/CLOSED handling anywhere -
  confirmed via a codebase-wide grep for those terms plus 'reconnect'. If
  that channel silently drops (tab backgrounding, network blip, an idle
  period), nothing detects it or resubscribes; the only recovery path found
  was a full manual rejoin, which is exactly what "signing in to the room
  again" did. The user's own subsequent replay was then most likely
  rejected server-side (a stale-precondition CAS loss, invisible on a
  frozen screen) rather than the original move failing to land.
artifacts:
  - path: "src/hooks/useRoomSubscription.ts"
    issue: "channel.subscribe() has no status callback and no error/reconnect handling of any kind, unlike usePresence.ts's channel"
  - path: "src/hooks/usePresence.ts"
    issue: "the only precedent in the codebase for reacting to a channel's subscribe status - reference for how the fix should hook in"
missing:
  - "A subscribe-status callback on useRoomSubscription's channel that detects CHANNEL_ERROR/TIMED_OUT/CLOSED and resubscribes (or forces a full state refetch), so a dropped WebSocket self-heals instead of requiring a manual rejoin"
debug_session: ""

## Summary

total: 8
passed: 2
issues: 5
pending: 2
skipped: 0
blocked: 0

## Gaps

<!-- YAML format for plan-phase --gaps consumption. Only currently-open items
     are listed here - the D-05 mistargeting gap (test 4), the heartbeat/D-01
     version-pollution gap (test 3, closed by plan 02-15), and the empty-pile
     stall gap (test 4b, closed by plan 02-14) were all fixed and deployed
     during this phase and are not carried forward; their fix record lives in
     the corresponding Tests section entries' status_note above. -->

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

- truth: "A player who has not submitted a move never sees a toast implying their own move failed"
  status: failed
  reason: |
    Live retest after the 02-15 deploy: the PC (idle, made no move) showed
    "Your move didn't stick" immediately after the phone made a legitimate,
    successful move - during both setup phase and normal play. Traced via
    code, not just observed: useRoomSubscription's handlePayload fires
    onReconciled() whenever the incoming broadcast's state differs from this
    client's current local state, with no check for whether this client has
    a move of its own actually in flight. For any client that did not just
    submit a move, the local state is - by definition - the pre-move
    snapshot right up until the broadcast delivers the post-move state, so
    the comparison is structurally guaranteed to mismatch on essentially
    every real move any other player makes, not only on genuine
    races/rejections. Distinct from the two 02-14/02-15 gaps: those were
    about *ambient, no-op* writes bumping the version; this fires on
    completely legitimate, content-changing writes too, and specifically for
    the client who did *not* make the move.
  severity: major
  test: 7
  root_cause: "onReconciled fires on any local/server state diff, with no gate on whether the comparing client itself has an unconfirmed move outstanding"
  artifacts:
    - path: "src/hooks/useRoomSubscription.ts"
      issue: "handlePayload's stableStringify comparison and onReconciled() call have no awareness of whether this client submitted the move that produced the incoming broadcast"
    - path: "src/context/GameContext.tsx"
      issue: "dispatchMove/submitMove do not record any 'I have a move outstanding' flag that useRoomSubscription could gate on"
    - path: "src/hooks/useGameState.ts"
      issue: "submitMove's own result?.error branch already raises the correct, correctly-scoped toast for a genuine server-side rejection of this client's own move - the useRoomSubscription path is the one that over-fires"
  missing:
    - "A per-client 'pending move' flag/ref, set when dispatchMove submits and cleared once the matching broadcast (or a timeout) resolves it, so onReconciled only fires for the client that actually has something outstanding to reconcile"
  debug_session: ""

- truth: "A dropped or throttled Realtime connection self-heals instead of permanently freezing the game-state view"
  status: failed
  reason: |
    Confirmed by direct inspection of the hosted room's moves audit table
    (room ZABYDB, versions 58-72): every play alternates PC/Phone correctly
    with zero gaps or duplicates, so nothing was lost or corrupted
    server-side. The PC's screen stopped reflecting new broadcasts entirely
    - the user's own move appeared not to register, and the opponent's move
    right before it was never seen either - until a full manual rejoin
    ("signing in to the room again") forced a resync. A subsequent replay
    from the stale screen was most likely rejected server-side (a
    stale-precondition CAS loss against the true current state) rather than
    the original move having failed to land.
  severity: blocker
  test: 8
  root_cause: "useRoomSubscription's postgres_changes channel has no subscribe-status callback and no CHANNEL_ERROR/TIMED_OUT/CLOSED handling, so a silently dropped WebSocket (tab backgrounding, network blip, an idle period) is never detected or recovered from"
  artifacts:
    - path: "src/hooks/useRoomSubscription.ts"
      issue: "channel.subscribe() has no status callback and no error/reconnect handling of any kind"
    - path: "src/hooks/usePresence.ts"
      issue: "the only precedent in the codebase for reacting to a channel's subscribe status (checks status === 'SUBSCRIBED') - reference for how the fix should hook in"
  missing:
    - "A subscribe-status callback on useRoomSubscription's channel that detects CHANNEL_ERROR/TIMED_OUT/CLOSED and resubscribes (or forces a full state refetch via a fresh join-room-style read), so a dropped connection self-heals instead of requiring a manual rejoin"
  debug_session: ""
