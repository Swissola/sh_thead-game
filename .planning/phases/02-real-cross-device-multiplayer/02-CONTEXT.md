# Phase 2: Real Cross-Device Multiplayer - Context

**Gathered:** 2026-07-26
**Status:** Ready for planning

<domain>
## Phase Boundary

Replace the localStorage-poll illusion with real Supabase-backed multiplayer: rooms stored in Postgres, live updates via Realtime subscriptions, persistent per-player identity via anonymous auth, moves validated server-side through the same `applyMove` engine Phase 1 built, optimistic client updates that reconcile against the authoritative server state, and visible presence/disconnect handling so a friend can actually join a room from another device and play a full game with you in real time.

This phase also closes a Phase 1 residual gap (CR-01, see Decisions) since it directly affects whether `applyMove` is safe to trust as a server boundary. Visual/responsive polish stays out of scope (Phase 3/5/6's job) except where a decision below explicitly asks for a small UI addition (e.g. a copy button, a leave-game button) needed to make the multiplayer flow usable.

</domain>

<decisions>
## Implementation Decisions

### Reconnect & session recovery (MPLAY-03)
- **D-01:** A player who closes the tab mid-game and reopens it (same device/browser) auto-rejoins their seat via the persisted Supabase anon session - no re-entry of room code or name required.
- **D-02:** If the session is unrecoverable (private/incognito, cleared storage, different browser), the player falls back to manual rejoin: room code + name at the menu. See D-06 for how they get matched back to their old seat rather than added as a new player.
- **D-03:** The same identity can be open in multiple tabs/devices simultaneously (e.g. phone and laptop at once). Both share the live Realtime state; either can act. This is the source of one of the two genuine move-race scenarios called out in D-11.
- **D-04:** A disconnected player's seat is never freed or reclaimed by anyone else - it stays theirs indefinitely. This works because D-05 keeps the game moving without them; there's no "stuck room" problem to solve by freeing seats.
- **D-05:** If a player doesn't act within ~60 seconds of their turn starting (grace period), the server automatically executes `PICK_UP_PILE` on their behalf. This is always a legal move (no guessing what they'd have played), so it's safe to automate. They keep their hand/seat and resume playing normally whenever they reconnect. Chosen over "pause and wait" (stalls the whole table indefinitely) and "eliminate from round" (too harsh for a brief drop, and reshapes deck/turn-order math unnecessarily). The engine currently has **no "pass" move** - `PICK_UP_PILE` is the only always-legal action when a turn can't otherwise be resolved, which is why this was the natural mechanism rather than inventing a new one.
- **D-06:** Manual rejoin-by-name (D-02) only takes over a seat if **exactly one** currently-disconnected player in that room has a matching name. If the name matches a still-connected player, or matches more than one disconnected seat, treat it as a new join (or surface an error) rather than guessing wrong.
- **D-07:** In the lobby (pre-game), the host can remove a non-host player who's disconnected/AFK so the rest can start without waiting on them.
- **D-08:** If the host disconnects while still in the lobby, host status automatically transfers to another connected player, so the room isn't permanently stuck waiting for the original host to return. (Host has no mid-game powers today - it only matters pre-game, per the existing `LobbyScreen.tsx` usage.)
- **D-09:** Last-used display name is remembered (alongside the persisted anon session) and pre-filled on return visits, editable if they want to change it.

### Disconnect/presence display (MPLAY-06)
- **D-10:** A disconnected opponent's seat is shown greyed-out with a small "offline" badge. Once the grace period (D-05) expires and the server starts auto-picking-up on their turns, the badge changes to a distinct "offline - auto-picking up" state so the table can tell "just dropped" apart from "the game is compensating for them." On reconnect, a brief toast (e.g. "Bob reconnected") plays and the badge clears.

### Move rejection / reconciliation UX (MPLAY-05)
- **D-11:** When an optimistic local move gets overridden by the server, the client snaps back to the server's authoritative state and shows a toast explaining why. Confirmed rare given turn-based play + client-side legal-move filtering - the two real sources are same-identity multi-tab races (D-03) and the grace-period auto-pickup (D-05) racing a live reconnect-move for the same turn, not concurrent-player races (turn ownership already rules those out).
- **D-12:** Move-rejection toasts use a visually distinct style from ordinary invalid-move toasts, so it reads as "the system reconciled something" rather than "you tried an illegal move." This is a deliberate departure from Phase 1's D-06 (one generic style for all error codes) for this specific case.

### Closing the CR-01 play-order gap (supports MPLAY-04)
- **D-13:** Phase 2 closes the Phase 1 code-review finding CR-01 - `applyMove`'s `PLAY_CARDS` case computes the hand→faceUp→faceDown play-order rule but doesn't fully enforce it outside one branch. Harmless today (the only client only ever offers legal plays), but once `applyMove` becomes the server's trust boundary (MPLAY-04), a modified client could exploit the gap. Close it as part of the same hardening pass that wires `applyMove` into the Edge Function, not as a separate follow-up.

### Abandoning a dead game
- **D-14:** Any player can leave a game and return to the menu at any time via a "Leave game" button, dead game or not. No special detection logic for "has everyone else vanished" - this is the simplest way to make sure a lone remaining player is never stuck babysitting an empty table forever.

### Room code sharing UX (supports MPLAY-01)
- **D-15:** Both a copy-to-clipboard button (for the raw room code) and a shareable join link (e.g. `yourgame.app/join/ABC123` that pre-fills the join form when opened) are in scope. The join-link requires basic URL routing/deep-link handling that doesn't exist yet in the current Menu/Router setup.

### Claude's Discretion
- Exact Edge Function invocation pattern (RPC-per-move vs. queue table vs. other) and Postgres schema shape for rooms/players/moves - implementation detail for research/planning to figure out, not a user decision.
- Precise visual treatment of the offline/auto-playing badges and the distinct reconciliation-toast style (D-10, D-12) - concrete styling is Claude's call within the existing Toast/UI patterns.
- The ~60 second grace period (D-05) is a starting point, not a hard-locked number - fine to tune during implementation if testing suggests otherwise.
- Route/URL scheme for the join-link (D-15) - whatever fits the existing router setup (currently phase-based, no URL routing at all today).

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Project-level context
- `.planning/PROJECT.md` - Core Value, Constraints (Phase 1 → Phase 2 sequencing dependency, now delivered), Key Decisions table (Supabase/Postgres/Realtime/anon-auth backend choice, refactor-first rationale, the CR-01 note this phase's D-13 closes).
- `.planning/REQUIREMENTS.md` - full MPLAY-01..06 requirement text this phase must satisfy.
- `.planning/ROADMAP.md` - Phase 2 goal and success criteria.

### Phase 1 carry-forward (the engine this phase builds a server boundary on top of)
- `.planning/phases/01-rules-engine-refactor/01-CONTEXT.md` - D-01 (explicit `playerId` per move), D-02 (`applyMove` never throws, returns `{state, error?}`), D-03 (turn-ownership enforced internally), D-04 (machine-readable error codes) - all were explicitly designed in Phase 1 with this phase's server-validation requirement (MPLAY-04) in mind.
- `.planning/phases/01-rules-engine-refactor/01-REVIEW.md` - source of the CR-01 finding this phase's D-13 closes.
- `src/engine/applyMove.ts`, `src/engine/moves.ts`, `src/engine/errors.ts` - the pure reducer this phase wraps in a Supabase Edge Function; must not be reimplemented, only invoked server-side.

### Source planning documents
- `ROADMAP.md` (repo root) - original staged 7-stage plan; contains implementation-level detail beyond the condensed phase entry.
- `.planning/intel/context.md` - distilled extraction of the above, organized by topic.

No ADRs exist yet for this project - decisions above are the locked record for this phase.

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `src/engine/applyMove.ts` - the pure `applyMove(state, move) -> {state, error?}` reducer, already built with server-authority in mind (D-01 through D-04 of Phase 1's context). This is what the Supabase Edge Function calls for MPLAY-04 - not reimplemented server-side.
- `src/context/GameContext.tsx` - `dispatchMove` already isolates the single call-site pattern (`applyMove` → toast-on-error → `updateGameState`) that optimistic-then-reconcile (MPLAY-05) will extend, not replace.
- `src/hooks/useGameState.ts` (`useGameStateUpdater`) - the existing async persistence seam; Phase 2 replaces its `window.storage.set` body with a Supabase write, keeping the same call shape.
- `src/hooks/useToast.ts` / `src/components/Toast.tsx` - existing toast system reused for reconciliation messages (D-11) and reconnect confirmations (D-10), with a new distinct style needed for D-12.
- `crypto.getRandomValues`-based `generateRoomCode()` in `src/screens/MenuScreen.tsx` (WR-03 from Phase 1) - the collision-avoidance approach (regenerate on collision, bounded attempts) carries over conceptually; the collision check itself moves from a `window.storage.get` read to a Postgres unique-constraint/query.

### Established Patterns
- `App.tsx`'s `Router` component currently does the localStorage poll (2s `setInterval` calling `window.storage.get`) - this entire mechanism is what Realtime subscriptions replace outright (MPLAY-02); it's explicitly called out in the code's own comment as temporary for exactly this reason.
- `GameState.host` field exists today but is only read/used within `LobbyScreen.tsx` (start-game gating, host badge) - confirms D-08's note that host has no mid-game powers to migrate, only lobby-phase relevance.
- No "pass" or "skip" move exists in `gameLogic.ts`/`applyMove.ts` - `canPlayerPlay()` determines legality, and the only move when you can't or won't play is `PICK_UP_PILE`. This constraint directly shaped D-05 (auto-pickup, not an invented auto-skip).
- `src/storage.ts`'s `window.storage` interface (`set`/`get` with an async-like signature) is a clean seam - Phase 2 can swap its internals for Supabase calls without necessarily changing every call site's shape, though `MenuScreen.tsx`'s direct `window.storage.get` collision-check calls will need to become real Postgres queries either way.

### Integration Points
- `src/App.tsx`'s `ShitheadGame`/`Router` - currently generates `playerId` via `crypto.randomUUID()` on mount (Phase 1's D-01 fix); this becomes the Supabase anon-auth session's user ID instead (MPLAY-03).
- `src/screens/MenuScreen.tsx`'s `createRoom`/`joinRoom` - the functions that grow room-code copy/share UI (D-15) and display-name pre-fill (D-09).
- No URL routing exists anywhere in the app today (`App.tsx`'s `Router` is phase-based, not URL-based) - the shareable join-link (D-15) is new territory, not an extension of existing routing.

</code_context>

<specifics>
## Specific Ideas

No specific visual/UX references given beyond the decisions above. The user pushed back usefully on the reconciliation-race framing (D-11) - worth planning/research treating this as a genuinely rare edge case backed by turn ownership, not a frequent occurrence needing heavy UX investment, while still building the distinct-style toast (D-12) since "rare" isn't "never."

</specifics>

<deferred>
## Deferred Ideas

None - discussion stayed within phase scope. All seven discussed areas (four originally selected, three surfaced mid-discussion) were clarifications of how to implement MPLAY-01..06, not new capabilities.

</deferred>

---

*Phase: 02-real-cross-device-multiplayer*
*Context gathered: 2026-07-26*
