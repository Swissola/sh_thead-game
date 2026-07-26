# Phase 2: Real Cross-Device Multiplayer - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md - this log preserves the alternatives considered.

**Date:** 2026-07-26
**Phase:** 2-real-cross-device-multiplayer
**Areas discussed:** Reconnect & session recovery, Disconnect/presence display, Move rejection / reconciliation UX, Closing the CR-01 play-order gap, Abandoning a dead game, Display name persistence, Room code sharing UX

---

## Reconnect & session recovery

| Option | Description | Selected |
|--------|-------------|----------|
| Auto-rejoin | Supabase anon session persists; reopening the app rejoins the same seat with no prompt | ✓ (conditional on disconnect-handling being solved) |
| Always re-enter | Every reopen requires room code + name again | |
| You decide | | |

**User's choice:** Auto-rejoin, but flagged a real concern first: a player leaving mid-game breaks play order and participant count, so this needed more thought before locking in.
**Notes:** This concern became its own sub-discussion (see the disconnected-turn-handling question below), after which auto-rejoin was confirmed as fine.

| Option | Description | Selected |
|--------|-------------|----------|
| Manual rejoin by room code | Re-enter room code + name at the menu, matched back to old seat if possible | ✓ |
| Seat is lost for good | Once session is gone, seat can't be reclaimed | |
| You decide | | |

**User's choice:** Manual rejoin by room code.

| Option | Description | Selected |
|--------|-------------|----------|
| Allow multi-tab/device | Both share live state via the same anon identity | ✓ |
| Block a second tab | "Already playing elsewhere" message | |
| You decide | | |

**User's choice:** Allow it.

| Option | Description | Selected |
|--------|-------------|----------|
| Free up after a timeout | Seat becomes available for host to remove/replace | |
| Reserved indefinitely | Seat is always theirs to reclaim | ✓ (resolved via disconnect-handling decision, not chosen directly) |
| You decide | | |

**User's choice:** "We probably need to think about this a bit" - resolved once auto-pick-up-pile (below) was agreed, since it removes the need to ever free a seat.

**Follow-up: disconnected-turn handling.** Claude explained the engine has no "pass" move - `PICK_UP_PILE` is the only always-legal action when a turn can't otherwise resolve - and proposed three options:

| Option | Description | Selected |
|--------|-------------|----------|
| Auto pick-up-pile | Server executes PICK_UP_PILE on their behalf after a grace period | ✓ |
| Game pauses and waits | No timeout, game waits indefinitely | |
| Something else | | |

**User's choice:** Auto pick-up-pile.

| Option | Description | Selected |
|--------|-------------|----------|
| Host can remove a lobby no-show | Host gets a "remove" control in the lobby list | ✓ |
| No removal - just wait | No kick mechanism | |

**User's choice:** Host can remove.

| Option | Description | Selected |
|--------|-------------|----------|
| Host role transfers | Passes to another connected player if host disconnects in lobby | ✓ |
| Room is stuck until they return | | |

**User's choice:** Host role transfers.

| Option | Description | Selected |
|--------|-------------|----------|
| Match by name | If name matches an existing disconnected player, they take over that seat | ✓ (with a follow-up refinement) |
| Something stricter | | |

**User's choice:** Match by name, recommended option.

**Follow-up: name-collision edge case.**

| Option | Description | Selected |
|--------|-------------|----------|
| Only match if exactly one disconnected seat has that name | Otherwise treat as new join / show error | ✓ |
| Always match on name, first hit wins | | |
| You decide | | |

**User's choice:** Only match if exactly one disconnected seat has that name.

| Option | Description | Selected |
|--------|-------------|----------|
| ~60 seconds grace period | | ✓ |
| Shorter (~20-30s) | | |
| Longer (2-3 min) | | |

**User's choice:** ~60 seconds.

---

## Disconnect/presence display

| Option | Description | Selected |
|--------|-------------|----------|
| Greyed-out seat + small badge | Dims + offline icon | ✓ |
| Banner/toast announcement | One-off toast, no persistent indicator | |
| You decide | | |

**User's choice:** Greyed-out seat + small badge.

| Option | Description | Selected |
|--------|-------------|----------|
| Show distinct "auto-playing" state | Badge changes once grace period expires | ✓ |
| Single generic offline indicator | | |

**User's choice:** Show distinct "auto-playing" state.

| Option | Description | Selected |
|--------|-------------|----------|
| Brief toast + badge clears on reconnect | | ✓ |
| Badge just clears silently | | |

**User's choice:** Brief toast + badge clears.

---

## Move rejection / reconciliation UX

| Option | Description | Selected |
|--------|-------------|----------|
| Snap-back + toast explaining why | | ✓ |
| Silent snap-back | | |
| You decide | | |

**User's choice:** Snap-back + toast, but pushed back first: "Why would there be another race with a player's move, the game is turn based... I don't see it ever being needed."
**Notes:** Claude clarified the two genuine race sources given turn-based play: same-identity multi-tab races (the player's own two devices), and the grace-period auto-pickup firing right as the player reconnects and submits a real move for the same turn - not concurrent-player races, which turn ownership already rules out.

| Option | Description | Selected |
|--------|-------------|----------|
| Rare, but still needs a real toast | | ✓ |
| Common enough to design carefully | | |
| You decide | | |

**User's choice:** Rare, but still needs a real toast.

| Option | Description | Selected |
|--------|-------------|----------|
| Reuse the same toast style | Matches Phase 1's D-06 (one style for all error codes) | |
| Distinct style for reconciliation failures | | ✓ |

**User's choice:** Distinct style for reconciliation failures - a deliberate departure from Phase 1's D-06 for this specific case.

---

## Closing the CR-01 play-order gap

| Option | Description | Selected |
|--------|-------------|----------|
| Close it as part of Phase 2 | Fold into the applyMove hardening work for MPLAY-04 | ✓ |
| Defer to a later phase | | |

**User's choice:** Close it as part of Phase 2.

---

## Abandoning a dead game

| Option | Description | Selected |
|--------|-------------|----------|
| "Leave game" button, always available | No special dead-game detection | ✓ |
| Auto-detect and prompt | | |
| You decide | | |

**User's choice:** "Leave game" button, always available.

---

## Display name persistence

| Option | Description | Selected |
|--------|-------------|----------|
| Yes, pre-fill last-used name | Stored alongside persisted session | ✓ |
| No, always ask fresh | | |

**User's choice:** Yes, pre-fill last-used name.

---

## Room code sharing UX

| Option | Description | Selected |
|--------|-------------|----------|
| Copy-to-clipboard button | | |
| Shareable join link | Pre-fills join form via URL | |
| Both | | ✓ |

**User's choice:** Both.

---

## Claude's Discretion

- Exact Edge Function invocation pattern and Postgres schema shape for rooms/players/moves.
- Precise visual treatment of the offline/auto-playing badges and the distinct reconciliation-toast style.
- The ~60 second grace period is a starting point, not hard-locked - tunable during implementation.
- Route/URL scheme for the join-link - whatever fits the existing router setup (currently phase-based, no URL routing today).

## Deferred Ideas

None - discussion stayed within phase scope throughout.
