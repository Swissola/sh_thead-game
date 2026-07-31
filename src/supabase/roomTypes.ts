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
