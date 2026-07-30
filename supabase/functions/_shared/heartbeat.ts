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
import {
    DISCONNECT_THRESHOLD_MS,
    EDGE_ERROR_CODES,
    rowToServerRoom,
    type EdgeResult,
} from '../../../src/supabase/roomTypes.ts';
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
 * `transferHostIfStale` on the result before deciding how to write it. Never
 * reads or writes anything related to the per-turn grace-period clock: a
 * connected-but-idle player must still be swept by the separate D-05 check,
 * so the two mechanisms stay independent.
 *
 * A pre-read decides the branch: the common ~15s case where the host does
 * not change goes through `store.touchPlayerSeen` - version-exempt, so it
 * never enters the client's game-state reconciliation stream (T-02-29/plan
 * 02-15). The rare case where a stale lobby host is actually replaced falls
 * through to `withVersionRetry`'s full CAS path, because that genuinely
 * mutates `state.host` and every client must see it. The branch is decided
 * on `nextState.host !== row.state.host` rather than object identity: all of
 * `transferHostIfStale`'s early exits happen to `return state` today, but
 * that is an incidental implementation detail, not a documented contract.
 */
export async function heartbeat(store: RoomStore, input: HeartbeatInput): Promise<EdgeResult> {
    const row = await store.readRoom(input.roomCode);
    if (!row) {
        return { error: { code: EDGE_ERROR_CODES.ROOM_NOT_FOUND, message: `Room ${input.roomCode} not found` } };
    }
    if (!row.state.players.some((player) => player.id === input.playerId)) {
        return { error: { code: EDGE_ERROR_CODES.NOT_IN_ROOM, message: 'Player is not seated in this room' } };
    }

    const nowIso = store.now();
    const nextPlayerSeen = { ...row.player_seen, [input.playerId]: nowIso };
    const nextState = transferHostIfStale(row.state, nextPlayerSeen, Date.parse(nowIso));

    if (nextState.host === row.state.host) {
        const updated = await store.touchPlayerSeen(input.roomCode, input.playerId, nowIso);
        if (!updated) {
            // The room was deleted between the pre-read and this write.
            return { error: { code: EDGE_ERROR_CODES.ROOM_NOT_FOUND, message: `Room ${input.roomCode} not found` } };
        }
        return { room: rowToServerRoom(updated) };
    }

    // Lobby host transfer: genuinely mutates state, so it needs the full
    // version-bumping CAS path. Recompute against the freshly re-read row
    // rather than reusing the pre-read values above - that recompute is the
    // whole point of withVersionRetry's retry loop.
    return withVersionRetry(store, input.roomCode, (freshRow): ComputeResult => {
        if (!freshRow.state.players.some((player) => player.id === input.playerId)) {
            return { code: EDGE_ERROR_CODES.NOT_IN_ROOM, message: 'Player is not seated in this room' };
        }

        const freshNowIso = store.now();
        const freshPlayerSeen = { ...freshRow.player_seen, [input.playerId]: freshNowIso };
        const freshNextState = transferHostIfStale(freshRow.state, freshPlayerSeen, Date.parse(freshNowIso));

        return { state: freshNextState, playerSeen: freshPlayerSeen };
    });
}
