# Phase 2: Real Cross-Device Multiplayer - Research

**Researched:** 2026-07-26
**Domain:** Supabase (Postgres + Realtime + Anonymous Auth + Edge Functions) as a server-authoritative multiplayer backend for an existing client-only React card game
**Confidence:** MEDIUM-HIGH (stack and primitives are HIGH confidence, verified against current official docs and registries; the specific schema/concurrency/timeout design is this research's own synthesis of those primitives, so treat the *shape* as MEDIUM and validate during planning/task breakdown)

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

**Reconnect & session recovery (MPLAY-03)**
- **D-01:** A player who closes the tab mid-game and reopens it (same device/browser) auto-rejoins their seat via the persisted Supabase anon session - no re-entry of room code or name required.
- **D-02:** If the session is unrecoverable (private/incognito, cleared storage, different browser), the player falls back to manual rejoin: room code + name at the menu. See D-06 for how they get matched back to their old seat rather than added as a new player.
- **D-03:** The same identity can be open in multiple tabs/devices simultaneously (e.g. phone and laptop at once). Both share the live Realtime state; either can act. This is the source of one of the two genuine move-race scenarios called out in D-11.
- **D-04:** A disconnected player's seat is never freed or reclaimed by anyone else - it stays theirs indefinitely. This works because D-05 keeps the game moving without them; there's no "stuck room" problem to solve by freeing seats.
- **D-05:** If a player doesn't act within ~60 seconds of their turn starting (grace period), the server automatically executes `PICK_UP_PILE` on their behalf. This is always a legal move (no guessing what they'd have played), so it's safe to automate. They keep their hand/seat and resume playing normally whenever they reconnect. Chosen over "pause and wait" (stalls the whole table indefinitely) and "eliminate from round" (too harsh for a brief drop, and reshapes deck/turn-order math unnecessarily). The engine currently has **no "pass" move** - `PICK_UP_PILE` is the only always-legal action when a turn can't otherwise be resolved, which is why this was the natural mechanism rather than inventing a new one.
- **D-06:** Manual rejoin-by-name (D-02) only takes over a seat if **exactly one** currently-disconnected player in that room has a matching name. If the name matches a still-connected player, or matches more than one disconnected seat, treat it as a new join (or surface an error) rather than guessing wrong.
- **D-07:** In the lobby (pre-game), the host can remove a non-host player who's disconnected/AFK so the rest can start without waiting on them.
- **D-08:** If the host disconnects while still in the lobby, host status automatically transfers to another connected player, so the room isn't permanently stuck waiting for the original host to return. (Host has no mid-game powers today - it only matters pre-game, per the existing `LobbyScreen.tsx` usage.)
- **D-09:** Last-used display name is remembered (alongside the persisted anon session) and pre-filled on return visits, editable if they want to change it.

**Disconnect/presence display (MPLAY-06)**
- **D-10:** A disconnected opponent's seat is shown greyed-out with a small "offline" badge. Once the grace period (D-05) expires and the server starts auto-picking-up on their turns, the badge changes to a distinct "offline - auto-picking up" state so the table can tell "just dropped" apart from "the game is compensating for them." On reconnect, a brief toast (e.g. "Bob reconnected") plays and the badge clears.

**Move rejection / reconciliation UX (MPLAY-05)**
- **D-11:** When an optimistic local move gets overridden by the server, the client snaps back to the server's authoritative state and shows a toast explaining why. Confirmed rare given turn-based play + client-side legal-move filtering - the two real sources are same-identity multi-tab races (D-03) and the grace-period auto-pickup (D-05) racing a live reconnect-move for the same turn, not concurrent-player races (turn ownership already rules those out).
- **D-12:** Move-rejection toasts use a visually distinct style from ordinary invalid-move toasts, so it reads as "the system reconciled something" rather than "you tried an illegal move." This is a deliberate departure from Phase 1's D-06 (one generic style for all error codes) for this specific case.

**Closing the CR-01 play-order gap (supports MPLAY-04)**
- **D-13:** Phase 2 closes the Phase 1 code-review finding CR-01 - `applyMove`'s `PLAY_CARDS` case computes the hand→faceUp→faceDown play-order rule but doesn't fully enforce it outside one branch. Harmless today (the only client only ever offers legal plays), but once `applyMove` becomes the server's trust boundary (MPLAY-04), a modified client could exploit the gap. Close it as part of the same hardening pass that wires `applyMove` into the Edge Function, not as a separate follow-up.

  > **Research finding - read before planning tasks for D-13:** this is already fixed in the current codebase. See "CR-01 is already closed" under Common Pitfalls below - the planner should verify, not re-implement.

**Abandoning a dead game**
- **D-14:** Any player can leave a game and return to the menu at any time via a "Leave game" button, dead game or not. No special detection logic for "has everyone else vanished" - this is the simplest way to make sure a lone remaining player is never stuck babysitting an empty table forever.

**Room code sharing UX (supports MPLAY-01)**
- **D-15:** Both a copy-to-clipboard button (for the raw room code) and a shareable join link (e.g. `yourgame.app/join/ABC123` that pre-fills the join form when opened) are in scope. The join-link requires basic URL routing/deep-link handling that doesn't exist yet in the current Menu/Router setup.

### Claude's Discretion
- Exact Edge Function invocation pattern (RPC-per-move vs. queue table vs. other) and Postgres schema shape for rooms/players/moves - implementation detail for research/planning to figure out, not a user decision. **This research resolves it - see Architecture Patterns.**
- Precise visual treatment of the offline/auto-playing badges and the distinct reconciliation-toast style (D-10, D-12) - concrete styling is Claude's call within the existing Toast/UI patterns.
- The ~60 second grace period (D-05) is a starting point, not a hard-locked number - fine to tune during implementation if testing suggests otherwise.
- Route/URL scheme for the join-link (D-15) - whatever fits the existing router setup (currently phase-based, no URL routing at all today).

### Deferred Ideas (OUT OF SCOPE)
None - discussion stayed within phase scope. All seven discussed areas (four originally selected, three surfaced mid-discussion) were clarifications of how to implement MPLAY-01..06, not new capabilities.
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| MPLAY-01 | A friend on a different device/browser can join a room using a room code and see the same live game | Postgres `rooms` table + Realtime Postgres Changes subscription (Architecture Patterns, Pattern 1); room-code join link (D-15) via manual URL parsing (Don't Hand-Roll) |
| MPLAY-02 | Room state stored in Postgres, updates propagate via Realtime, replacing the 2s poll | `rooms.state` jsonb + `postgres_changes` subscription filtered on `room_code=eq.<code>` replaces `App.tsx`'s `setInterval` poll (Architecture Patterns, Pattern 1) |
| MPLAY-03 | Persistent, distinguishable identity via Supabase anonymous auth | `signInAnonymously()` + session-check-before-signin pattern (Code Examples, Anonymous Auth Bootstrap); D-01/D-02/D-06 reconnect flows (Architecture Patterns, Pattern 4) |
| MPLAY-04 | Moves validated server-side by an Edge Function calling `applyMove`, so a modified client cannot cheat | RLS deny-all-writes-for-authenticated + Edge Function using service-role client as the *only* write path (Architecture Patterns, Pattern 2 - the actual enforcement mechanism, not just calling `applyMove`); playerId-spoofing fix (Common Pitfalls); CR-01 status (Common Pitfalls) |
| MPLAY-05 | Optimistic client update, then reconciliation against authoritative server broadcast | Optimistic-apply via local `applyMove` + version-tagged reconciliation on Realtime confirmation (Architecture Patterns, Pattern 3) |
| MPLAY-06 | Players can see when an opponent has disconnected mid-game | Realtime Presence `track()`/`sync`/`join`/`leave` scoped to a per-room channel (Architecture Patterns, Pattern 5); distinct from the D-05 turn-timeout mechanism, which Presence does **not** drive (Common Pitfalls) |
</phase_requirements>

## Summary

This phase replaces the entire persistence/networking layer under an already-refactored, already-pure game engine. `src/engine/applyMove.ts` is genuinely ready to be the server's trust boundary - it never mutates state, always returns `{state, error?}`, and already enforces turn ownership. That significantly de-risks this phase: the hard problem isn't "can the engine be trusted server-side", it's "what's the smallest Postgres/Realtime/Edge Function shape that lets the *same* `applyMove` function run in a Deno Edge Function without duplicating any rule logic, while giving the client instant optimistic feedback and correct reconciliation."

The recommended shape stores the entire `GameState` as a single `jsonb` column per room row (not normalized player/card tables) so `applyMove`'s existing input/output shape needs zero adaptation. All client-facing writes go through Edge Functions; Row Level Security denies `authenticated`-role writes to the `rooms` table entirely, so the *only* way to change a room's state is through a Supabase service-role client inside an Edge Function - this is the actual mechanism that satisfies MPLAY-04, not just "the Edge Function happens to call `applyMove`". A player's real identity (`auth.uid()` from their verified JWT) must override whatever `playerId` a move payload claims, closing an impersonation gap that `applyMove` itself has no way to check (it only verifies turn ownership *within* the state, not caller identity - that check belongs entirely to the network layer this phase is building).

One research finding changes phase scope: **CR-01 (D-13) already appears to be fixed** in the current codebase, with regression tests in place (see Common Pitfalls). The planner should verify this rather than re-implement it, and instead spend D-13's hardening budget on the one adjacent gap that genuinely is still open: `PICK_UP_PILE`'s `revealedFaceDownIndex` is deliberately un-gated against `getAvailableCardSource`, which was an accepted risk under a trusted client and is worth re-examining now that the client is untrusted.

Realtime is used two ways: **Postgres Changes** for the authoritative game-state stream (simple, sufficient at 2-6 subscribers per room, well under Supabase's ~3,000-subscriber scaling ceiling for this mechanism), and **Presence** for online/offline display (MPLAY-06) - a separate, ephemeral, non-persisted signal that must not be confused with the D-05 turn-timeout mechanism, which needs its own server-verified clock check and is not something Presence provides out of the box.

**Primary recommendation:** One Postgres `rooms` table (`state jsonb`, `version bigint` for optimistic concurrency, `turn_started_at timestamptz` for D-05), RLS blocking all direct client writes, a small family of Edge Functions (`create-room`, `join-room`, `start-game`, `apply-move`, `check-turn-timeout`) that all import the *same* `src/gameLogic.ts` / `src/engine/*` modules the client uses, Postgres Changes for state sync, and Presence for disconnect display.

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Room/game state persistence | Database/Storage | API/Backend | Postgres is the single source of truth; only Edge Functions may write to it |
| Move validation (`applyMove` trust boundary) | API/Backend | — | Must run server-side or a modified client bypasses it entirely (MPLAY-04) |
| Live state sync to all clients | Database/Storage | Browser/Client | Postgres Changes pushes committed rows; client subscribes and re-renders |
| Player identity/session | Browser/Client | API/Backend | Anon JWT persisted client-side (localStorage), but *verified* server-side on every write |
| Optimistic move application | Browser/Client | — | Instant feedback reuses the same pure `applyMove` client-side, purely presentational until reconciled |
| Turn-timeout auto-pickup (D-05) | API/Backend | Browser/Client (trigger only) | Must be server-verified (server clock) even though a client's periodic check is what triggers the request - a client cannot be trusted to self-report "60s have passed" |
| Disconnect/presence display (D-10) | Browser/Client | Database/Storage (Realtime Presence) | Presence state lives in the Realtime cluster's memory, not Postgres; client renders badges from it |
| Room-code join link (D-15) | Browser/Client | — | Pure client-side URL parsing/routing, no new backend capability needed |
| Room creation/join/lobby management (D-06, D-07, D-08) | API/Backend | Browser/Client | Same reasoning as move validation - these are writes to the trust-boundary table, not just UI state |

## Standard Stack

### Core

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|---------------|
| `@supabase/supabase-js` | 2.110.8 [VERIFIED: npm registry, cross-checked against official Supabase JS client docs] | Client SDK: Postgres queries via PostgREST, anonymous auth, Realtime (Postgres Changes + Presence), invoking Edge Functions | The only supported JS client for Supabase; matches the project's pre-existing architectural decision (STATE.md) |
| `supabase` (CLI) | 2.109.1 [VERIFIED: npm registry; install method confirmed via official docs - "install the CLI as a project dev dependency" via `npm install supabase --save-dev`] | Local dev stack (`supabase start` - Postgres+Auth+Realtime in Docker), scaffolding and deploying Edge Functions, migrations | Official tooling; no viable alternative for local Supabase development |
| `@supabase/server` | 1.4.1 [VERIFIED: npm registry, official `supabase/server` GitHub org repo, matches current official Edge Functions auth docs] | Imported *inside* Edge Functions (`npm:@supabase/server`, a Deno npm specifier - not a `package.json` dependency) - provides `withSupabase()` wrapper that validates the caller's JWT/API key and hands back a pre-scoped Supabase client | Current (as of July 2026) officially documented pattern for securing Edge Functions, replacing the older hand-rolled `Deno.serve` + manual `createClient` + `auth.getUser()` boilerplate - see State of the Art |

### Supporting

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| None beyond the above | — | — | This phase deliberately needs no additional runtime dependencies: routing for the join-link (D-15) is a few lines of `URL`/`history.pushState` parsing, not a router library (see Don't Hand-Roll) |

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Postgres Changes for state sync | Realtime Broadcast (trigger-based, `realtime.broadcast_changes()`) | Broadcast is Supabase's own recommendation once a table exceeds ~3,000 concurrent subscribers on the same change stream; at 2-6 players/room this project is nowhere near that ceiling, so Postgres Changes is simpler and needs no trigger to maintain |
| Optimistic-concurrency version column + retry | Direct Postgres connection with `SELECT ... FOR UPDATE` row locks (`postgres.js`/`pg` from inside the Edge Function) | Row locks are the standard fix for *frequent* contention; D-11 explicitly frames races as rare (turn ownership already prevents most), so the extra connection-pooling complexity of holding a raw DB connection from an Edge Function isn't justified here |
| Client-triggered lazy turn-timeout check | `pg_cron` + `pg_net` scheduled sweep of expired turns | The scheduled-job approach works even if literally every player is disconnected; the lazy/client-triggered approach only resolves the timeout once *someone* reconnects. Given D-14 (anyone can leave, no "stuck room" requirement) and that this is explicitly a discretionary starting point (not locked), lazy checking is simpler for v1; flag `pg_cron`+`pg_net` as a fallback if testing shows staleness is a problem |
| Manual URL parsing for the join-link | `react-router-dom` | The app has exactly one deep-link route to support; a full router is unjustified weight/complexity for that, and doesn't fit the existing phase-based `Router` component in `App.tsx` |

**Installation:**
```bash
npm install @supabase/supabase-js
npm install supabase --save-dev
```
(`@supabase/server` is not installed via npm here - it's referenced with an `npm:` specifier directly inside Edge Function source files, which Deno resolves at deploy/serve time.)

**Version verification:** confirmed via `npm view @supabase/supabase-js version`, `npm view supabase version`, `npm view @supabase/server version` against the live npm registry on 2026-07-26, cross-checked against official Supabase docs (`supabase.com/docs/guides/local-development/cli/getting-started`, `supabase.com/docs/guides/functions/auth`) rather than training-data assumptions about version numbers.

## Package Legitimacy Audit

| Package | Registry | Age | Downloads | Source Repo | slopcheck | Disposition |
|---------|----------|-----|-----------|--------------|-----------|-------------|
| `@supabase/supabase-js` | npm | Long-established (core Supabase SDK) | Very high (foundational dependency of the whole Supabase ecosystem) | github.com/supabase/supabase-js | [OK] | Approved |
| `supabase` (CLI) | npm | Long-established | High | github.com/supabase/cli | [OK] - no `postinstall` script found via `npm view supabase scripts.postinstall` | Approved |
| `@supabase/server` | npm | Newer (published 1.4.1 as of 2026-07-22, 4 days before this research) | Not independently checked (no public download-count lookup performed) | github.com/supabase/server | [OK] | Approved - matches current official docs exactly (raw GitHub source of `auth.mdx` and the `select-from-table-with-auth-rls` example both use this exact API), so despite being a newer package it is not a slopsquat risk |

**Packages removed due to slopcheck [SLOP] verdict:** none
**Packages flagged as suspicious [SUS]:** none

slopcheck was successfully installed and run against all three packages (`python -m slopcheck scan <pkg> --pkg npm --json`) - all returned `[OK]` with no flags. Combined with confirming each package name against official Supabase documentation (not just training-data recall), these are tagged `[VERIFIED]` rather than `[ASSUMED]` per the provenance rule.

## Architecture Patterns

### System Architecture Diagram

```
                         ┌─────────────────────────────────────────┐
                         │              Browser Client              │
                         │                                           │
  ┌──────────┐  mount    │  1. check localStorage session           │
  │  App.tsx │──────────▶│     → signInAnonymously() if none         │
  └──────────┘           │                                           │
                         │  2. dispatchMove(move)                    │
                         │     ├─ optimistic: applyMove() locally ───┼─▶ instant UI update
                         │     └─ supabase.functions.invoke(         │
                         │          'apply-move', {move})  ──────────┼──┐
                         │                                           │  │
                         │  3. postgres_changes subscription         │  │
                         │     on rooms WHERE room_code=eq.<code> ◀──┼──┼───────┐
                         │     → reconcile: compare version,         │  │       │
                         │       snap to authoritative state if      │  │       │
                         │       it differs (D-11), toast (D-12)     │  │       │
                         │                                           │  │       │
                         │  4. Presence channel per room              │  │       │
                         │     track({player_id, online_at})          │  │       │
                         │     → sync/join/leave → offline badges     │  │       │
                         └─────────────────────────────────────────┘  │       │
                                                                        │       │
                         ┌──────────────────────────────────────────┐  │       │
                         │        Supabase Edge Functions (Deno)      │◀─┘       │
                         │  create-room / join-room / start-game /   │           │
                         │  apply-move / check-turn-timeout          │           │
                         │                                           │           │
                         │  a. withSupabase({auth:'user'}) verifies   │           │
                         │     the JWT, exposes ctx.userClaims.sub    │           │
                         │  b. OVERRIDE move.playerId with            │           │
                         │     ctx.userClaims.sub (never trust the    │           │
                         │     client-supplied field)                 │           │
                         │  c. read current row (state, version)      │           │
                         │  d. applyMove(state, move) — SAME TS        │           │
                         │     module the client imports, imported    │           │
                         │     from src/gameLogic.ts / src/engine/*    │           │
                         │  e. write via ctx.supabaseAdmin:             │           │
                         │     UPDATE rooms SET state=$1,version=v+1   │           │
                         │     WHERE room_code=$2 AND version=$v        │           │
                         │     → 0 rows updated? retry from (c),        │           │
                         │       bounded attempts                       │           │
                         └──────────────────────────────────────────┘           │
                                          │                                      │
                                          ▼                                      │
                         ┌──────────────────────────────────────────┐           │
                         │              Postgres (rooms table)        │───────────┘
                         │  RLS: authenticated role has SELECT only;  │
                         │  NO insert/update/delete policy exists     │
                         │  for authenticated — only supabaseAdmin     │
                         │  (service role, used only inside Edge       │
                         │  Functions) can write. This is the actual   │
                         │  MPLAY-04 enforcement mechanism.             │
                         └──────────────────────────────────────────┘
```

### Recommended Project Structure
```
supabase/
├── config.toml                  # from `supabase init`
├── migrations/
│   └── 0001_rooms_and_rls.sql   # rooms table, RLS policies, realtime publication
└── functions/
    ├── _shared/                 # re-exports of src/gameLogic.ts, src/engine/* for Deno
    │   └── engine.ts
    ├── create-room/index.ts
    ├── join-room/index.ts
    ├── start-game/index.ts
    ├── apply-move/index.ts
    └── check-turn-timeout/index.ts
src/
├── supabase/
│   └── client.ts                 # createClient(...) singleton, env-var wired
├── hooks/
│   ├── useRoomSubscription.ts    # postgres_changes subscription, replaces App.tsx's poll
│   └── usePresence.ts            # Presence track()/sync/join/leave → offline badges
```

### Pattern 1: Postgres Changes replacing the localStorage poll (MPLAY-01, MPLAY-02)
**What:** Subscribe to `UPDATE`/`INSERT` events on the `rooms` table filtered to the current room code; every confirmed write anywhere (Edge Function or otherwise) pushes the new row to every subscribed client within the room.
**When to use:** Always, for the authoritative game-state stream - this fully replaces `App.tsx`'s `setInterval`/`window.storage.get` poll.
**Example:**
```typescript
// Source: https://supabase.com/docs/guides/realtime/postgres-changes (official docs, verified 2026-07-26)
const channel = supabase
  .channel(`room-${roomCode}`)
  .on(
    'postgres_changes',
    { event: 'UPDATE', schema: 'public', table: 'rooms', filter: `room_code=eq.${roomCode}` },
    (payload) => {
      const newState = payload.new.state as GameState;
      const newVersion = payload.new.version as number;
      reconcile(newState, newVersion); // see Pattern 3
    }
  )
  .subscribe();
```
**Caveat (verified, official docs):** `UPDATE` payloads only include new column values unless `ALTER TABLE rooms REPLICA IDENTITY FULL;` is run - not needed here since the client only cares about `new.state`/`new.version`, never `old.*`.

### Pattern 2: RLS-as-trust-boundary + Edge Functions as the only write path (MPLAY-04)
**What:** Row Level Security denies the `authenticated` role write access to `rooms` entirely. The *only* code path that can change a room's state is an Edge Function using the service-role (`ctx.supabaseAdmin`) client. `applyMove` is called from inside that Edge Function, unmodified.
**When to use:** Every state-changing operation - not just the four `Move` types. `create-room`, `join-room`, and `start-game` (which deals cards) are equally "moves" from a trust perspective even though they aren't part of the `Move` union - see Common Pitfalls, "It's not just the four Move types".
**Example (`apply-move`):**
```typescript
// Source: pattern synthesized from official docs (supabase.com/docs/guides/functions/auth,
// raw GitHub source of supabase/supabase apps/docs/content/guides/functions/auth.mdx,
// verified 2026-07-26) - MEDIUM confidence on the retry-loop shape, which is this
// research's own design, not copied from an official tutorial.
import { withSupabase } from 'npm:@supabase/server';
import { applyMove } from '../_shared/engine.ts'; // same module src/ imports
import type { Move } from '../_shared/moves.ts';

export default {
  fetch: withSupabase({ auth: 'user' }, async (req, ctx) => {
    const move = (await req.json()) as Move;

    // CRITICAL: never trust move.playerId from the request body - a modified
    // client could claim to be any player. The verified JWT subject is the
    // only trustworthy identity.
    move.playerId = ctx.userClaims!.sub;

    const MAX_ATTEMPTS = 3;
    for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
      const { data: room } = await ctx.supabaseAdmin
        .from('rooms')
        .select('state, version')
        .eq('room_code', move.roomCode)
        .single();

      const result = applyMove(room.state, move);
      if (result.error) return Response.json({ error: result.error }, { status: 400 });

      const turnChanged = result.state.currentTurn !== room.state.currentTurn;
      const { data: updated } = await ctx.supabaseAdmin
        .from('rooms')
        .update({
          state: result.state,
          version: room.version + 1,
          ...(turnChanged ? { turn_started_at: new Date().toISOString() } : {}),
        })
        .eq('room_code', move.roomCode)
        .eq('version', room.version)
        .select();

      if (updated && updated.length > 0) {
        return Response.json({ state: result.state, version: room.version + 1 });
      }
      // 0 rows updated = concurrent write raced us (D-03/D-05/D-11) - retry.
    }
    return Response.json({ error: { code: 'CONFLICT', message: 'Too many concurrent updates' } }, { status: 409 });
  }),
};
```
**RLS migration:**
```sql
-- Source: pattern combines official RLS docs (supabase.com/docs/guides/realtime/postgres-changes,
-- supabase.com/docs/guides/database) with this phase's specific requirement that ONLY
-- service-role writes are permitted. Verified 2026-07-26.
alter table rooms enable row level security;

create policy "authenticated can read rooms"
on rooms for select
to authenticated
using (true); -- room code (36^6 ≈ 2.2bn combinations, WR-03) is the access-control
              -- boundary, same trust model as the existing localStorage version -
              -- not a new gap, see Security Domain.

-- Deliberately no insert/update/delete policy for `authenticated`.
-- The service_role (used only inside Edge Functions via ctx.supabaseAdmin)
-- bypasses RLS entirely and is the only writer.
```

### Pattern 3: Optimistic apply + version-tagged reconciliation (MPLAY-05)
**What:** `dispatchMove` computes `applyMove(gameState, move)` locally *first* for instant UI feedback (reusing the exact same reducer, so the optimistic prediction and the eventual server result are computed identically whenever no race occurs), then fires the Edge Function call. The Realtime subscription (Pattern 1) is the actual reconciliation signal - not the `functions.invoke()` response - because either can arrive first.
**When to use:** Every move dispatch.
**Example:**
```typescript
// MEDIUM confidence - this reconciliation shape is this research's synthesis of the
// documented primitives (functions.invoke, postgres_changes), not itself an official
// tutorial. Verify the exact ordering/race handling during implementation.
function dispatchMove(move: Move) {
  if (!gameState) return;
  const optimistic = applyMove(gameState, move);
  if (optimistic.error) {
    showToast(optimistic.error.message, optimistic.error.code); // ordinary invalid-move toast (Phase 1 D-06 style)
    return;
  }
  setGameState(optimistic.state); // instant feedback, tagged as "pending" internally

  void supabase.functions.invoke('apply-move', { body: move }).then(({ data, error }) => {
    if (error || data?.error) {
      // Server rejected what the client thought was legal - D-11's rare race case.
      showToast('Move reversed - the game state changed', 'RECONCILED'); // D-12: distinct style
      // gameState will correct itself via the next postgres_changes event regardless
    }
  });
}

// In the postgres_changes handler (Pattern 1):
function reconcile(serverState: GameState, serverVersion: number) {
  if (serverVersion > localOptimisticVersion) {
    if (!statesEqual(serverState, currentLocalState)) {
      showToast('Move reversed - the game state changed', 'RECONCILED'); // D-12
    }
    setGameState(serverState); // always snap to server truth on a newer version
  }
}
```
**Toast styling note (D-12):** use a new sentinel (`'RECONCILED'`, not one of `ERROR_CODES`) on `ToastState.code` so `Toast.tsx` can render a distinct border colour/icon without overloading the "closed set" of `applyMove` error codes (Phase 1 D-04) with a client-side-only concept.

### Pattern 4: Anonymous auth bootstrap + reconnect (MPLAY-03, D-01/D-02)
**What:** Check for an existing session before calling `signInAnonymously()` - calling it unconditionally creates a new user every time, silently breaking D-01's persistence guarantee.
**Example:**
```typescript
// Source: supabase.com/docs/guides/auth/auth-anonymous (official docs, verified 2026-07-26)
const { data: { session } } = await supabase.auth.getSession();
if (!session) {
  await supabase.auth.signInAnonymously();
}
// session.user.id (auth.uid()) is the stable, persistent playerId (MPLAY-03),
// replacing App.tsx's per-mount crypto.randomUUID().
```
**D-02 fallback (unrecoverable session):** manual rejoin by room code + name; `join-room` Edge Function implements D-06's exactly-one-disconnected-name-match rule before deciding "rejoin existing seat" vs "new player".

### Pattern 5: Presence for disconnect display (MPLAY-06) - separate from D-05's timeout
**What:** A per-room Realtime channel where every connected client `track()`s its own presence; `sync`/`join`/`leave` events drive the D-10 offline badges. Realtime Presence itself still does not drive the D-05 turn-timeout - Presence can flicker (tab backgrounded, brief network blip) well before/without a full 60-second turn timeout, so it stays display-only.
**Revised 2026-07-28:** D-05's grace-period pickup *does* now additionally require the current-turn player to be stale on `player_seen` (the server-verified heartbeat signal both D-06 and D-08 already use) - the original turn-duration-only check let a fully present player who simply hadn't acted yet be auto-picked-up, which is exactly the ambiguity this pattern's own next sentence used to warn about ("a player can remain 'present' while simply not acting on their turn" - true for ephemeral Realtime Presence, but `player_seen` is a different, server-verified signal, not that same ambiguous one). See `02-CONTEXT.md`'s D-05 entry for the corrected behaviour.
**Example:**
```typescript
// Source: supabase.com/docs/guides/realtime/presence (official docs, verified 2026-07-26)
const channel = supabase.channel(`room-${roomCode}-presence`, {
  config: { presence: { key: playerId } },
});

channel
  .on('presence', { event: 'sync' }, () => {
    const state = channel.presenceState();
    setOnlinePlayerIds(Object.keys(state));
  })
  .subscribe(async (status) => {
    if (status === 'SUBSCRIBED') {
      await channel.track({ player_id: playerId, online_at: new Date().toISOString() });
    }
  });
```

### Anti-Patterns to Avoid
- **Reimplementing `applyMove` in SQL/plpgsql for the Edge Function:** defeats the entire point of Phase 1's refactor. Import the same TypeScript module Deno-side (see project structure's `_shared/` directory) instead.
- **Trusting `move.playerId` from the request body:** `applyMove` only checks turn ownership *within* state; it has no concept of "who is actually making this HTTP request." That check is the network layer's job and must use `ctx.userClaims.sub`, not the payload.
- **Treating Presence as the D-05 timeout mechanism:** Presence is ephemeral client-reported connectivity, not a server-verified elapsed-time check. Use `turn_started_at` + a server-side `now()` comparison instead.
- **Calling `signInAnonymously()` on every mount without checking for an existing session first:** creates a fresh anonymous user every reload, breaking D-01 entirely.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|--------------|-----|
| Live state sync across devices | Custom WebSocket server, custom polling backoff | Supabase Realtime (Postgres Changes) | Already documented, handles reconnection/heartbeat, no server code to maintain |
| Per-player persistent identity | Custom token issuance/localStorage session scheme | Supabase Anonymous Auth (`signInAnonymously`) | Handles JWT issuance/refresh/expiry; `is_anonymous` claim already available for any future RLS distinctions |
| Concurrent-write safety on the room row | A custom mutex/locking service | Postgres optimistic concurrency (`version` column + conditional `UPDATE ... WHERE version = $v`) | Standard, well-understood pattern; no extra infrastructure |
| Deep-link routing for the join code | `react-router-dom` for a single route | `URL`/`URLSearchParams` + `history.pushState`, read once on mount | One route does not justify a router dependency, and doesn't fit the existing phase-based `Router` |
| Server-side scheduled sweeps (if ever needed) | A custom cron daemon | `pg_cron` + `pg_net` (both official Postgres/Supabase extensions) | Already a first-class, documented Supabase feature; only add if the lazy client-triggered check (recommended for v1) proves insufficient |

**Key insight:** Every "don't hand-roll" item above has an existing, maintained Supabase or Postgres primitive. The only genuinely custom logic this phase should write is (a) the retry-on-conflict loop around `applyMove`, and (b) the reconciliation-toast trigger condition - both small, both directly testable.

## Common Pitfalls

### Pitfall 1: CR-01 is already closed - don't re-implement it
**What goes wrong:** Re-doing work D-13 describes as still-needed, or writing a plan task around "fix CR-01" when it's already fixed.
**Why it happens:** CONTEXT.md's D-13 was written referencing Phase 1's `01-REVIEW.md` finding, but `01-REVIEW-FIX.md` (commit `a8a4ef3`) already applied the exact fix described - and the current `src/engine/applyMove.ts` (lines 94-112) contains the source-validation check, with a comment explicitly citing CR-01. Two regression tests already exist in `src/__tests__/engine/applyMove.test.ts` ("rejects INVALID_SELECTION for a faceDown selection while the player still holds hand cards (CR-01)" and the equivalent faceUp test).
**How to avoid:** The planner should verify (re-run `npx vitest run src/__tests__/engine/applyMove.test.ts`) rather than schedule new implementation work for the named CR-01 gap.
**Warning signs:** A task described as "enforce hand→faceUp→faceDown play order in applyMove" duplicating existing logic.

### Pitfall 2: The real remaining gap is `PICK_UP_PILE`'s `revealedFaceDownIndex`, not CR-01 itself
**What goes wrong:** Assuming "CR-01 is closed" means D-13's hardening intent is fully satisfied.
**Why it happens:** `applyPickUpPile` (lines 367-386) deliberately does **not** gate `revealedFaceDownIndex` on `getAvailableCardSource(player) === 'faceDown'` - the code comment explains this was an accepted risk under a *trusted client* ("the UI only ever lets a player reveal a face-down card when the source is already 'faceDown'... same class of untrusted-client risk as any other spoofed move field"). That reasoning was correct for Phase 1 (no server boundary existed to exploit) but Phase 2 changes the threat model: a modified client can now submit a `PICK_UP_PILE` move with an arbitrary `revealedFaceDownIndex` while still holding hand/faceUp cards, converting a face-down card into a known hand card without ever being entitled to look at it - an information-disclosure/rule-bypass risk that didn't matter when only the trusted client enforced ordering.
**How to avoid:** When implementing MPLAY-04's hardening pass, explicitly decide whether to gate `revealedFaceDownIndex` the same way CR-01 gates `PLAY_CARDS` (require `getAvailableCardSource(player) === 'faceDown'` before honouring it), or accept the risk with rationale documented for the new trust model. This is a genuine open decision, not a re-run of CR-01.
**Warning signs:** A cheating-client test suite that doesn't include a case for "pick up pile with `revealedFaceDownIndex` set while hand cards remain."

### Pitfall 3: It's not just the four `Move` types that need a trust boundary
**What goes wrong:** Scoping "wrap `applyMove` in an Edge Function" as the entirety of MPLAY-04, leaving `createRoom`/`joinRoom`/`startGame` as direct client writes.
**Why it happens:** `LobbyScreen.tsx`'s `startGame()` shuffles and deals the deck **client-side**, then writes the dealt hands directly to storage; `MenuScreen.tsx`'s `createRoom`/`joinRoom` do the same. None of these are part of the `Move` union `applyMove` recognises. Once RLS blocks all direct client writes to `rooms` (Pattern 2, required for MPLAY-04), these three operations *must* also become Edge Functions, or the game is unplayable (nobody could ever create/join/start a room). A malicious client could otherwise rig its own deck order by fabricating the "dealt" state.
**How to avoid:** Plan Edge Functions for room lifecycle operations (`create-room`, `join-room`, `start-game`) alongside `apply-move`, all using the same RLS-blocks-writes / service-role-writes-only pattern. `start-game` should reuse `GameLogic.shuffleDeck`/`createDeck` from the shared module, not re-implement dealing.
**Warning signs:** A plan that only creates one Edge Function (`apply-move`) and assumes lobby screens keep writing via `supabase.from('rooms').update(...)` directly - that write will fail once RLS is applied correctly.

### Pitfall 4: `turn_started_at` reset timing is genuinely ambiguous - decide it explicitly
**What goes wrong:** Assuming "reset the 60s clock whenever `currentTurn` changes" is the whole rule, missing the "burn and go again" case where the same player keeps the turn but arguably deserves a fresh 60s for their *next* action.
**Why it happens:** `GameLogic.shouldBurnPile` can result in the same player acting again (`nextTurn = burned ? playerIndex : ...` in `applyPlayCards`) - from the player's perspective this is a new decision point even though `state.currentTurn` is unchanged.
**How to avoid:** Decide during planning whether `turn_started_at` resets on (a) every successful move regardless of whether `currentTurn` changed, or (b) only when `currentTurn` changes. Either is defensible; (a) is simpler to implement and arguably more player-friendly. This research does not resolve it - see Open Questions.
**Warning signs:** A player who burns the pile getting auto-picked-up mid-action because the clock never reset.

### Pitfall 5: Vite env var prefix
**What goes wrong:** `import.meta.env.SUPABASE_URL` silently returns `undefined` at runtime with no build error.
**Why it happens:** Vite only exposes client-side env vars prefixed `VITE_` (`VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY`); this is unrelated to Supabase and purely a Vite convention, easy to forget when following Supabase's own Next.js-centric examples (which use different conventions).
**How to avoid:** Name env vars `VITE_SUPABASE_URL` / `VITE_SUPABASE_PUBLISHABLE_KEY` in `.env.local`, and add `.env*.local`/`.env` to `.gitignore` (currently only `*.local` is present, which does match `.env.local` but not a bare `.env` - verify the exact filename chosen doesn't slip through).

### Pitfall 6: Anonymous sign-in rate limits during dev/test
**What goes wrong:** Rapidly reloading/testing from the same IP (e.g. multiple incognito windows during manual multi-device testing) hits Supabase's default rate limit and sign-ins start failing with no obvious cause.
**Why it happens:** Supabase Auth enforces a default 30 requests/hour per-IP token-bucket limit on `signInAnonymously` (and other IP-limited endpoints) specifically to prevent anonymous-user database bloat. [CITED: supabase.com/docs/guides/auth/rate-limits, supabase.com/docs/guides/auth/auth-anonymous]
**How to avoid:** Be aware of this ceiling when manually testing D-01/D-02/D-06 reconnect flows repeatedly in a short window; the limit is dashboard-configurable if it becomes a real blocker. Enabling CAPTCHA is recommended for public launch but is out of this phase's scope (flagged for the LAUNCH-0x phase).

### Pitfall 7: Postgres Changes `UPDATE` payloads omit old values by default
**What goes wrong:** Code that expects `payload.old` to contain the previous full row silently gets an empty/partial object.
**Why it happens:** Requires `ALTER TABLE rooms REPLICA IDENTITY FULL;` to include old values on `UPDATE`. [CITED: supabase.com/docs/guides/realtime/postgres-changes]
**How to avoid:** Not needed for this phase's design (only `new.state`/`new.version` are read), but worth noting if a future phase wants delta-based diffing instead of full-state replacement.

## Code Examples

### Room + moves schema (initial migration)
```sql
-- MEDIUM confidence: this is this research's schema synthesis built on officially
-- documented Postgres/RLS/Realtime primitives, not copied from an official
-- "build a card game" tutorial (none exists). Verify shape during planning.
create table rooms (
  room_code text primary key,
  host_player_id uuid not null,
  state jsonb not null,
  version bigint not null default 0,
  turn_started_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table moves (  -- append-only audit log; supports debugging D-11/D-12 reconciliation
  id bigint generated always as identity primary key,
  room_code text not null references rooms(room_code) on delete cascade,
  player_id uuid not null,
  move jsonb not null,
  resulting_version bigint not null,
  created_at timestamptz not null default now()
);

alter publication supabase_realtime add table rooms;

alter table rooms enable row level security;
alter table moves enable row level security;

create policy "authenticated can read rooms" on rooms for select to authenticated using (true);
create policy "authenticated can read moves" on moves for select to authenticated using (true);
-- No write policies for `authenticated` on either table - service_role only.
```

### Anonymous auth client bootstrap
```typescript
// Source: supabase.com/docs/guides/auth/auth-anonymous + reference/javascript/initializing
// (official docs, verified 2026-07-26)
import { createClient } from '@supabase/supabase-js';

export const supabase = createClient(
  import.meta.env.VITE_SUPABASE_URL,
  import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
  { auth: { persistSession: true, autoRefreshToken: true } }
);
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|-------------------|---------------|--------|
| "anon key" / "service_role key" terminology and format | "publishable key" (`sb_publishable_...`) / "secret key" (`sb_secret_...`) - same privilege levels, new names, and secret keys can now be issued per-component | Rolling out through 2026; legacy keys deprecated by end of 2026 per Supabase's own changelog | Any training-data-recalled example using `SUPABASE_ANON_KEY`/`anon key` language should be read as `VITE_SUPABASE_PUBLISHABLE_KEY` for this project - both still work today, but publishable/secret is the currently-recommended terminology going forward [CITED: supabase.com/docs/guides/getting-started/migrating-to-new-api-keys] |
| Manual `Deno.serve` + `createClient(url, key, {global:{headers:{Authorization}}})` + `supabaseClient.auth.getUser()` boilerplate in every Edge Function | `withSupabase({auth: 'user'})` wrapper from the official `@supabase/server` package, exposing `ctx.supabase` (RLS-scoped), `ctx.supabaseAdmin` (service-role), and `ctx.userClaims` directly | Current as of the docs fetched 2026-07-26 (package last published 2026-07-22, 4 days prior) | This is materially different from most training-data Edge Function examples (which predate this wrapper) - use the `withSupabase` pattern shown in this research's Code Examples, not the older manual pattern, unless a reason emerges to avoid the extra dependency |

**Deprecated/outdated:** Legacy anon/service_role API keys - still functional today but scheduled for deprecation; new projects should be set up with publishable/secret keys from the start to avoid a later migration.

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | The specific Postgres schema shape (single `jsonb` state column + `version` + `turn_started_at`) is the right design for this game | Architecture Patterns, Code Examples | If wrong, the planner needs a different table shape - but the core principle (don't reimplement `applyMove`, let RLS be the write gate) should survive most reshaping |
| A2 | Lazy client-triggered turn-timeout checking (vs. `pg_cron`+`pg_net`) is sufficient for v1 given D-14's "no stuck room" framing | Standard Stack, Alternatives Considered | If both players go offline simultaneously for a long period, the timeout won't fire until someone reconnects - likely acceptable per D-14, but worth confirming with the user during planning if it matters |
| A3 | `turn_started_at` should reset on every successful move vs. only on `currentTurn` changes | Common Pitfalls, Pitfall 4 | Wrong choice makes the 60s grace period feel unfair around burn-and-go-again turns; low risk, easy to adjust post-implementation since the number itself is explicitly not locked (CONTEXT.md discretion) |
| A4 | `RLS using (true)` for room `SELECT` (any authenticated/anon user can read any room row by knowing/guessing the code) matches the existing trust model rather than introducing a new gap | Architecture Patterns, Pattern 2; Security Domain | If the user actually wants room codes to be a stronger access boundary than "36^6 combinations, unguessable in practice", this would need per-room membership-based RLS instead of `using (true)` |

## Open Questions

1. **Should `turn_started_at` reset on every move, or only when `currentTurn` changes?** (RESOLVED — see plan 02-06: reset unconditionally on every successful move)
   - What we know: `applyPlayCards` can return the same `currentTurn` after a burn (player goes again).
   - What's unclear: whether the 60s grace period should restart for that player's "next action" or keep counting from their original turn start.
   - Recommendation: default to resetting on every successful move (simpler, arguably fairer to the player); confirm with the user only if it turns out to matter in practice.

2. **Should `SELECT` on `rooms` be restricted to players actually in that room, rather than any authenticated (anonymous) user?** (RESOLVED — see plan 02-03: `using (true)` kept for parity, risk accepted as T-02-08)
   - What we know: the existing localStorage design has no real access control beyond an unguessable room code (WR-03's 36^6 combination space); `using (true)` preserves that exact posture.
   - What's unclear: whether Phase 2's move to a real backend raises the bar the user expects for "who can read a room's state."
   - Recommendation: keep `using (true)` for parity with existing risk acceptance; revisit only if a future phase adds anything more sensitive to room state than card positions in a party game.

3. **Exact set of Edge Functions for lobby management (D-06/D-07/D-08) - one per operation, or a single `manage-room` function with an action discriminator?** (RESOLVED — see plans 02-05/02-06/02-07: one function per operation, seven in total)
   - What we know: `create-room`, `join-room`, `start-game`, and `apply-move` are clearly distinct concerns; D-06 (rejoin-by-name), D-07 (host removes AFK player), D-08 (host transfer on disconnect) are smaller lobby-only operations that could be folded into `join-room` or split out.
   - What's unclear: this is a task-breakdown-level decision, not a research-level one.
   - Recommendation: leave to the planner; either shape satisfies the "RLS blocks direct writes, Edge Function is the only writer" architecture requirement.

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Docker (via Rancher Desktop) | Local Supabase dev stack (`supabase start`) | ✓ | 29.5.3-rd | — |
| Supabase CLI | Local dev, Edge Function scaffolding/deploy, migrations | ✗ (not yet installed) | — | Install as documented: `npm install supabase --save-dev` (official method, confirmed no risky `postinstall` script) |
| Node.js | Build tooling, CLI | ✓ | v24.12.0 | — |
| npm | Package management | ✓ | 11.6.2 | — |
| An actual Supabase project (hosted or local) | All of MPLAY-01..06 | ✗ (no `supabase/` directory, no `.env` found in repo) | — | Must be created (`supabase init`, then either `supabase start` for local dev or a hosted project via the dashboard/CLI login) as an early task in this phase's plan |

**Missing dependencies with no fallback:**
- A configured Supabase project (local or hosted) - this is a genuine Wave 0 prerequisite for every other task in this phase, not just tooling.

**Missing dependencies with fallback:**
- Supabase CLI - straightforward `npm install supabase --save-dev`, no blocker.

## Validation Architecture

### Test Framework

| Property | Value |
|----------|-------|
| Framework | Vitest 4.0.16 (already configured) |
| Config file | `vitest.config.ts` (jsdom environment, `src/test-setup.ts` setup file) |
| Quick run command | `npm test -- --run src/__tests__/engine/applyMove.test.ts` |
| Full suite command | `npm test -- --run` |

**Gap:** Vitest runs in Node/jsdom and cannot execute Deno-runtime Edge Function code directly. Edge Function logic that is *pure TypeScript re-exported from `src/gameLogic.ts`/`src/engine/*`* is already covered by existing Vitest suites (since it's the same module). The thin Edge Function wrapper itself (`withSupabase`, request/response handling, the optimistic-concurrency retry loop) needs either: (a) Deno's own test runner (`deno test`) run against the function source directly, or (b) integration-level smoke testing via `supabase functions serve` locally plus a small script (curl/fetch) exercising each function - not a Vitest-native path. Flag this as a Wave 0 gap requiring an explicit decision (Deno test runner vs. manual/scripted smoke tests) since it's new testing surface this project hasn't needed before.

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|---------------------|--------------|
| MPLAY-01 | Two clients joining the same room see the same state | integration/manual | `supabase functions serve` + two browser sessions, or a scripted two-client Realtime test | ❌ Wave 0 |
| MPLAY-02 | Postgres Changes replaces the poll | unit (subscription callback logic) + manual verification against local Supabase | `npm test -- --run src/__tests__/hooks/useRoomSubscription.test.ts` | ❌ Wave 0 (new file) |
| MPLAY-03 | Anon session persists across reload; falls back to manual rejoin | unit (session-check-before-signin logic, mockable) | `npm test -- --run src/__tests__/...` (new) | ❌ Wave 0 |
| MPLAY-04 | Modified-client move rejected server-side | unit (`applyMove` already covered) + Deno/integration test for the Edge Function's playerId-override and RLS-blocks-write behaviour | `npx vitest run src/__tests__/engine/applyMove.test.ts` (existing) + new Deno-side test | Partial - engine ✅, Edge Function wrapper ❌ Wave 0 |
| MPLAY-05 | Optimistic apply + reconcile on mismatch | unit (reconciliation function, given a fake server payload) | `npm test -- --run` (new test file) | ❌ Wave 0 |
| MPLAY-06 | Presence-driven offline badge | unit (presence-state-to-badge mapping) + manual multi-tab verification | `npm test -- --run` (new test file) | ❌ Wave 0 |

### Sampling Rate
- **Per task commit:** targeted Vitest file for the module just touched
- **Per wave merge:** `npm test -- --run` (full suite)
- **Phase gate:** full suite green, plus a manual two-device smoke test (this phase's success criteria are inherently cross-device and can't be fully proven by a single-process test suite)

### Wave 0 Gaps
- [ ] Decide and set up Edge Function test strategy (Deno test runner vs. scripted `supabase functions serve` smoke tests) - no existing convention in this project to follow
- [ ] `src/__tests__/hooks/useRoomSubscription.test.ts` - covers MPLAY-02
- [ ] New reconciliation-logic test file - covers MPLAY-05
- [ ] New presence-mapping test file - covers MPLAY-06
- [ ] A local Supabase project (`supabase init` + `supabase start`) so any of the above can run against something real rather than pure mocks

## Security Domain

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|----------------|---------|--------------------|
| V2 Authentication | yes | Supabase Anonymous Auth (`signInAnonymously`), JWT verified by `withSupabase({auth:'user'})` inside every Edge Function |
| V3 Session Management | yes | `persistSession: true` + `autoRefreshToken: true` on the client; JWT expiry/refresh handled by supabase-js, not hand-rolled |
| V4 Access Control | yes | Turn ownership enforced inside `applyMove` (existing); caller-identity enforcement (`move.playerId = ctx.userClaims.sub` override) is new and load-bearing for MPLAY-04; RLS denies all direct client writes to `rooms`/`moves` |
| V5 Input Validation | yes | `applyMove`'s existing bounds/null/selection-source checks (including the CR-01 fix); Edge Functions should also reject malformed JSON bodies before calling `applyMove` |
| V6 Cryptography | no (minimal) | No custom cryptography - JWT signing/verification is entirely Supabase-managed; room codes use `crypto.getRandomValues` (already in place from Phase 1's WR-03, unchanged) |

### Known Threat Patterns for this stack

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|------------------------|
| Client submits a move with a spoofed `playerId` claiming to be another player | Spoofing | Edge Function overrides `move.playerId` with the verified `ctx.userClaims.sub` before calling `applyMove` - never trust the request body's field |
| Client writes directly to `rooms`/`moves` tables via PostgREST, bypassing the Edge Function entirely | Tampering / Elevation of Privilege | RLS denies all `authenticated`-role writes; only the service-role client (used exclusively inside Edge Functions) can write |
| Duplicate/replayed move submission (e.g. flaky network causes a client to retry an already-applied move) | Tampering | Optimistic-concurrency `version` check makes a stale retry naturally a no-op (its expected `version` no longer matches, so the write is rejected/retried against current state rather than double-applied) |
| Anonymous sign-in abuse inflating the `auth.users` table | Denial of Service | Supabase's default 30 req/hour per-IP rate limit already applies out of the box; CAPTCHA is Supabase's own recommendation before public launch (out of this phase's scope, flag for LAUNCH phase) |
| A modified client sends `PICK_UP_PILE` with an arbitrary `revealedFaceDownIndex` while still holding hand/faceUp cards | Information Disclosure | Currently un-gated (see Common Pitfalls, Pitfall 2) - decide during this phase's hardening pass whether to close it |

## Sources

### Primary (HIGH confidence)
- supabase.com/docs/guides/auth/auth-anonymous - anonymous sign-in behaviour, session persistence, `is_anonymous` claim, CAPTCHA recommendation
- supabase.com/docs/guides/auth/rate-limits - 30 req/hour per-IP default limit on anonymous sign-in
- supabase.com/docs/guides/realtime/postgres-changes - subscription syntax, RLS requirement, `REPLICA IDENTITY FULL` caveat, scaling ceiling (~3,000 subscribers)
- supabase.com/docs/guides/realtime/presence - `track()`/`sync`/`join`/`leave` API and behaviour
- supabase.com/docs/guides/realtime/authorization - RLS-on-`realtime.messages` model for private channels (Broadcast/Presence/Postgres Changes)
- raw.githubusercontent.com/supabase/supabase (apps/docs/content/guides/functions/auth.mdx) - exact `withSupabase`/`createSupabaseContext` API, auth modes, code examples (fetched as raw source, not summarized)
- raw.githubusercontent.com/supabase/supabase (examples/edge-functions/.../select-from-table-with-auth-rls/index.ts) - confirms the documented API matches a real example file
- supabase.com/docs/guides/local-development/cli/getting-started - official CLI install methods (`npm install supabase --save-dev` confirmed as a supported path)
- supabase.com/docs/guides/getting-started/migrating-to-new-api-keys - publishable/secret key rename and deprecation timeline
- supabase.com/docs/reference/javascript/initializing - `createClient` options (`persistSession`, `autoRefreshToken`, `detectSessionInUrl`)
- npm registry (`npm view`) - exact current versions of `@supabase/supabase-js` (2.110.8), `supabase` (2.109.1), `@supabase/server` (1.4.1), publish dates, no `postinstall` script on `supabase`
- slopcheck (local run) - `[OK]` verdict on all three packages, no slop/suspicious flags
- This repository: `src/engine/applyMove.ts`, `src/engine/moves.ts`, `src/engine/errors.ts`, `src/context/GameContext.tsx`, `src/hooks/useGameState.ts`, `src/storage.ts`, `src/App.tsx`, `src/screens/MenuScreen.tsx`, `src/screens/LobbyScreen.tsx`, `src/types.ts`, `.planning/phases/01-rules-engine-refactor/01-REVIEW.md`, `.planning/phases/01-rules-engine-refactor/01-REVIEW-FIX.md`, `src/__tests__/engine/applyMove.test.ts` - direct code/test inspection, confirms CR-01 fix status and identifies the lobby-write-path gap

### Secondary (MEDIUM confidence)
- WebSearch summaries of Supabase Realtime concept pages (heartbeat ~25-30s default, exponential backoff reconnection) - not independently confirmed against raw source in this session, consistent across two related pages
- WebSearch summary of `pg_cron`+`pg_net` scheduled Edge Function invocation pattern - confirmed as an official Supabase feature (Supabase Cron module exists) but the specific code shown wasn't fetched from raw official docs in this session

### Tertiary (LOW confidence)
- None retained as authoritative claims in this document - anything only found via a single unverified WebSearch summary was either cross-checked against a second source/official docs or explicitly marked as this research's own synthesis (MEDIUM) rather than presented as fact

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH - package names/versions verified against live npm registry and cross-checked against official docs/GitHub source, not training-data recall alone
- Architecture: MEDIUM-HIGH - individual primitives (RLS, Postgres Changes, Presence, `withSupabase`, anonymous auth) are HIGH confidence (official docs/raw source); the specific schema and optimistic-concurrency-retry design combining them is this research's synthesis (no official "build a multiplayer card game on Supabase" tutorial exists to copy from), so MEDIUM on the composed shape
- Pitfalls: HIGH for the in-repo findings (CR-01 status, lobby-write-path gap, `revealedFaceDownIndex` gap - all directly verified by reading `applyMove.ts`/tests/review docs); HIGH for officially-documented platform behaviour (rate limits, `REPLICA IDENTITY`); MEDIUM for the `turn_started_at` reset-timing question (correctly identified as ambiguous, deliberately left open rather than asserted)

**Research date:** 2026-07-26
**Valid until:** ~30 days (Supabase's Edge Functions auth pattern is actively evolving - `@supabase/server` was updated 4 days before this research - re-verify the `withSupabase` API shape if planning/implementation is delayed past early September 2026)
