/**
 * Shared client/server room contract.
 *
 * This module is imported by both the browser client (via `src/`) and, in a
 * later plan, Deno Edge Functions (via an `npm:`-free re-export). It must
 * depend only on `../types.ts` - never the Supabase browser SDK - so Deno can
 * import it without pulling that SDK in.
 *
 * `EDGE_ERROR_CODES` is a deliberately *separate* closed set from
 * `src/engine/errors.ts`'s `ERROR_CODES` (Phase 1 D-04): engine codes describe
 * illegal moves, edge codes describe network/lifecycle failures. Do not merge
 * the two sets.
 */
import type { GameState } from '../types.ts';

/** Raw Postgres row shape for the `rooms` table (snake_case, as PostgREST returns it). */
export interface RoomRow {
  room_code: string;
  state: GameState;
  version: number;
  turn_started_at: string;
  player_seen: Record<string, string>;
  created_at: string;
  updated_at: string;
}

/** Client-facing camelCase view of a room, used everywhere outside the raw DB layer. */
export interface ServerRoom {
  roomCode: string;
  state: GameState;
  version: number;
  turnStartedAt: string;
  playerSeen: Record<string, string>;
}

/**
 * Maps a snake_case `RoomRow` to a camelCase `ServerRoom`.
 * - `version` is coerced to a number (PostgREST can return `bigint` columns as strings).
 * - `turn_started_at` passes through unchanged as an ISO string.
 * - a null/absent `player_seen` defaults to `{}` rather than throwing.
 */
export function rowToServerRoom(row: RoomRow): ServerRoom {
  return {
    roomCode: row.room_code,
    state: row.state,
    version: Number(row.version),
    turnStartedAt: row.turn_started_at,
    playerSeen: row.player_seen ?? {},
  };
}

/**
 * Closed set of machine-readable edge/network/lifecycle error codes, returned
 * by Edge Functions (later plans). Deliberately disjoint from
 * `src/engine/errors.ts`'s `ERROR_CODES` - see module docstring.
 */
export const EDGE_ERROR_CODES = Object.freeze({
  UNAUTHENTICATED: 'UNAUTHENTICATED',
  ROOM_NOT_FOUND: 'ROOM_NOT_FOUND',
  ROOM_CODE_COLLISION: 'ROOM_CODE_COLLISION',
  GAME_ALREADY_STARTED: 'GAME_ALREADY_STARTED',
  NAME_AMBIGUOUS: 'NAME_AMBIGUOUS',
  NAME_IN_USE: 'NAME_IN_USE',
  NOT_IN_ROOM: 'NOT_IN_ROOM',
  NOT_HOST: 'NOT_HOST',
  NOT_ENOUGH_PLAYERS: 'NOT_ENOUGH_PLAYERS',
  CONFLICT: 'CONFLICT',
  TIMEOUT_NOT_ELAPSED: 'TIMEOUT_NOT_ELAPSED',
  BAD_REQUEST: 'BAD_REQUEST',
} as const);

export type EdgeErrorCode = (typeof EDGE_ERROR_CODES)[keyof typeof EDGE_ERROR_CODES];

export interface EdgeError {
  code: EdgeErrorCode;
  message: string;
}

export interface EdgeResult {
  room?: ServerRoom;
  error?: EdgeError;
}

/** D-05's turn grace period: auto-`PICK_UP_PILE` after this many ms of inactivity. */
export const TURN_GRACE_MS = 60000;

/** Client presence heartbeat interval (MPLAY-06). */
export const HEARTBEAT_INTERVAL_MS = 15000;

/** Threshold after which a missed heartbeat is treated as disconnected (MPLAY-06). */
export const DISCONNECT_THRESHOLD_MS = 45000;

/**
 * First retry delay after a dropped room-data Realtime channel
 * (CHANNEL_ERROR/TIMED_OUT/CLOSED, MPLAY-02, 02-UAT.md test 8). Fast enough
 * that a brief blip (a few seconds of backgrounding, a momentary network
 * hiccup) recovers close to instantly.
 */
export const SUBSCRIPTION_RECONNECT_BASE_MS = 1000;

/**
 * Backoff ceiling for the room-data channel's reconnect delay. Retries are
 * deliberately never capped in *count*, only in *delay*: MPLAY-02's whole
 * point is that a dropped connection self-heals without a manual rejoin, so
 * giving up after N attempts would silently reintroduce the exact
 * permanent-freeze failure this plan closes, just delayed. A 30s ceiling
 * keeps a genuinely-down network from being hammered while still trying
 * indefinitely until the network returns.
 */
export const SUBSCRIPTION_RECONNECT_MAX_MS = 30000;

/**
 * Minimum time a resubscribed room-data channel must stay connected before
 * its reconnect backoff counter resets to base. Without this, a flapping
 * connection (a brief reconnect immediately followed by another drop -
 * plausible for a Wi-Fi/cell handoff, one of the causes behind
 * `02-UAT.md` test 8's "tab backgrounding, brief network blip") would have
 * every SUBSCRIBED status reset the counter to 0, pinning retry cadence near
 * the 1s base indefinitely even though the connection never actually
 * stabilises. 5s is comfortably shorter than the 30s cap but long enough
 * that a channel merely bouncing through SUBSCRIBED for a moment before
 * re-erroring is not mistaken for a genuine recovery.
 */
export const SUBSCRIPTION_RECONNECT_RESET_DWELL_MS = 5000;

/**
 * Safety-net upper bound for `GameContext`'s pending-move tracker (MPLAY-05):
 * comfortably above a normal Realtime broadcast round-trip, and safely below
 * `HEARTBEAT_INTERVAL_MS` (15000) so a stuck flag self-heals well before the
 * next heartbeat cycle could otherwise make the symptom harder to diagnose.
 *
 * Accepted trade-off: on a slow-but-not-dead connection, a broadcast that is
 * merely delayed past this bound - not lost - has its resolution silently
 * missed once the timeout fires and clears the flag first, exactly as if the
 * broadcast had never arrived at all. This is a deliberate choice, not an
 * oversight: a bounded, self-healing flag beats one that can leak open
 * forever. A future reader tuning this value up or down is trading responsiveness
 * of the self-heal against the width of that missed-if-merely-slow window.
 */
export const PENDING_MOVE_TIMEOUT_MS = 8000;
