/**
 * D-08: the server's own verified connectivity signal, plus a lazy lobby
 * host transfer folded into the same write.
 *
 * Realtime Presence cannot serve this role: it lives in the Realtime
 * cluster's memory, is reported by the client, and is not readable inside
 * an Edge Function. The field this module writes is populated only from
 * `store.now()`, so "connected" means "the server saw a request from this
 * player recently" - unforgeable in the way that matters (T-02-25).
 */
import type { GameState } from '../../../src/types.ts';
import { DISCONNECT_THRESHOLD_MS, EDGE_ERROR_CODES, type EdgeResult } from '../../../src/supabase/roomTypes.ts';
import { withVersionRetry, type ComputeResult, type RoomStore } from './db.ts';

export interface HeartbeatInput {
    playerId: string;
    roomCode: string;
}

/**
 * Reassigns `state.host` only while the room is still in the lobby and the
 * current host's last-seen entry has aged past `DISCONNECT_THRESHOLD_MS`.
 * Picks the earliest-seated player (array order == seating order) whose
 * last-seen entry is still current, so two simultaneous callers cannot
 * disagree about who the new host is. Leaves the host untouched when no
 * player currently qualifies, or when the phase is anything but 'lobby' -
 * per D-08 the host has no mid-game powers, so transferring outside the
 * lobby would only be churn.
 */
export function transferHostIfStale(state: GameState, playerSeen: Record<string, string>, nowMs: number): GameState {
    if (state.phase !== 'lobby') return state;

    const hostLastSeen = playerSeen[state.host];
    const hostIsStale = !hostLastSeen || nowMs - Date.parse(hostLastSeen) > DISCONNECT_THRESHOLD_MS;
    if (!hostIsStale) return state;

    const candidate = state.players.find((player) => {
        const lastSeen = playerSeen[player.id];
        return lastSeen !== undefined && nowMs - Date.parse(lastSeen) <= DISCONNECT_THRESHOLD_MS;
    });
    if (!candidate) return state;

    return {
        ...state,
        host: candidate.id,
        lastAction: `${candidate.name} is now the host`,
    };
}

/**
 * Refreshes only the caller's own last-seen entry, then runs
 * `transferHostIfStale` on the result before writing. Never reads or writes
 * anything related to the per-turn grace-period clock: a connected-but-idle
 * player must still be swept by the separate D-05 check, so the two
 * mechanisms stay independent.
 */
export function heartbeat(store: RoomStore, input: HeartbeatInput): Promise<EdgeResult> {
    return withVersionRetry(store, input.roomCode, (row): ComputeResult => {
        if (!row.state.players.some((player) => player.id === input.playerId)) {
            return { code: EDGE_ERROR_CODES.NOT_IN_ROOM, message: 'Player is not seated in this room' };
        }

        const nowIso = store.now();
        const nextPlayerSeen = { ...row.player_seen, [input.playerId]: nowIso };
        const nextState = transferHostIfStale(row.state, nextPlayerSeen, Date.parse(nowIso));

        return { state: nextState, playerSeen: nextPlayerSeen };
    });
}
