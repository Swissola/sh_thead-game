---
phase: 02-real-cross-device-multiplayer
verified: 2026-07-28T20:30:00Z
status: gaps_found
score: 3/7 scenarios sound, 3 gaps found, 1 not yet traced
---

# Phase 2: Real Cross-Device Multiplayer - Scenario-Based Verification Report

**Approach:** Code-traced scenario audit, prompted by three live findings during 02-13 Task 3's
two-device play test (see `02-UAT.md`). Rather than only reacting to what surfaced in one manual
play session, this walks a designed set of concurrency/timing/identity scenarios through the
actual code paths, to catch what a single live session wouldn't happen to exercise.

**Verified:** 2026-07-28
**Status:** gaps_found

## Scenario Checklist and Results

| # | Scenario (Q) | Traced? | Answer | Verdict |
|---|---|---|---|---|
| 1 | Two different players submit moves at nearly the same instant | Yes | `withVersionRetry`'s CAS serializes them; the loser re-reads fresh state and re-validates via `applyMove`'s own turn/card-presence checks | ✓ SOUND |
| 2 | The same identity is open in two tabs (D-03) and both submit different moves for the same turn | Yes | Same CAS mechanism; `applyMove` re-validates turn ownership (`move.playerId !== state.players[state.currentTurn].id`) and card presence against freshly-read state on every retry - a stale tab's move is rejected cleanly, not silently corrupted | ✓ SOUND |
| 3 | A routine heartbeat lands while a player has a move in flight | Yes | `heartbeat()` writes through the same version-incrementing path as real moves even though `state` is unchanged outside the lobby; the client's reconciliation check compares incoming state against its own optimistic display, producing a false "didn't stick" toast | ✗ GAP (see 02-UAT.md Gap: heartbeat/reconnect writes pollute version stream) |
| 4 | A player reconnects (D-01 auto-rejoin via `join-room`'s 'existing' branch) while another player has a move in flight | Yes | Identical mechanism and identical gap to #3 - the 'existing' branch also writes state-unchanged through the version-bumping path | ✗ GAP (same as #3, listed once in 02-UAT.md) |
| 5 | D-05's auto-pickup races a player's own live reconnect-move for the same turn (the one race source `02-CONTEXT.md` already documents) | Yes | Whichever write lands first in the DB wins the version; the loser's `withVersionRetry` attempt re-reads fresh state, which also re-evaluates the connectivity gate - the revised D-05 fix narrows this race rather than widening it, since a pickup can now only "win" when the player was genuinely stale | ✓ SOUND (verified after the D-05 fix, not a regression) |
| 6 | A player's turn times out while the discard pile is empty | Yes | `PICK_UP_PILE` requires a non-empty pile (`PILE_EMPTY` otherwise); `checkTurnTimeout` forwards that error unwritten, and `useTurnTimeoutSweep` silently swallows every sweep error - the turn never resolves, forever, with no user-visible signal | ✗ GAP (see 02-UAT.md Gap: turn timeout with an empty pile) |
| 7 | The host leaves the lobby (not mid-game) via Leave Game | Yes | `transferHostIfStale` uses the identical `player_seen`-staleness mechanism as D-05, so it inherits the identical "staleness clock starts from the last heartbeat, not the leave moment" interaction with D-14 | Same root cause as the D-14/D-05 gap in `02-UAT.md` - not a distinct new gap |
| 8 | Only one player is in the room - can they ready up and start solo? | No | Not traced this pass | ? OPEN QUESTION |
| 9 | 4+ players in a room - does turn order/dealing scale correctly? | No | Not traced this pass | ? OPEN QUESTION |
| 10 | A third player joins while the first two are mid-swap in setup phase | No | Not traced this pass | ? OPEN QUESTION |
| 11 | The host disconnects mid-game (not lobby) | No | `02-CONTEXT.md` states host has no mid-game powers, so this is expected to be a non-issue, but not directly verified | ? OPEN QUESTION |
| 12 | Two consecutive stale turns for the same player (repeated auto-pickup) | No | Not traced this pass | ? OPEN QUESTION |
| 13 | A rejoin-by-name attempt races a trailing heartbeat from the same stale seat | No | `resolveSeat`'s logic itself was read in full and is correctly conservative (exact-one-stale-match only), but the race timing itself wasn't traced | ? OPEN QUESTION, low suspicion given #13's underlying logic already checked sound |

**Score:** 3/7 traced scenarios sound, 3 gap-producing scenarios (2 distinct gaps: heartbeat/reconnect version pollution, empty-pile stall - both already filed in `02-UAT.md`'s Gaps section with root_cause/artifacts/missing filled), 6 scenarios not yet traced (open questions, not confirmed gaps - do not plan fixes against these without tracing them first)

## Gaps Summary

**No new gap entries here** - both confirmed gaps from this scenario pass (heartbeat/reconnect
version pollution; empty-pile permanent stall) surfaced from live findings already logged in
`02-UAT.md`'s `## Gaps` YAML section with `root_cause`/`artifacts`/`missing` filled in. This
report's job was to confirm they're real via independent code tracing (done) and to check
whether related scenarios (#4, #5, #7) share the same root cause or are distinct (documented
above - #4 and #7 share root causes with existing gaps, no new entries needed).

### Open Questions (not gaps - not yet traced, do not generate fix plans from these)

Scenarios #8-13 above are recorded as a checklist for a future verification pass, not as
confirmed defects. Recommend tracing #8 (solo start) and #10 (late join during setup) first,
since incorrect handling there would be most visible.

## Verification Metadata

**Verification approach:** Scenario-driven code trace, prompted by 02-13 Task 3 findings
**Automated checks:** N/A (this is a manual code-reading pass, not a scripted check)
**Human checks required:** 0 (this report itself is the human-requested code-tracing pass)
**Total verification time:** ~45 min across the scenario checklist

---
*Verified: 2026-07-28*
*Verifier: Claude (main session, prompted by user)*
