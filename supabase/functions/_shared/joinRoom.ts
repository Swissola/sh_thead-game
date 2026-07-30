/**
 * Server-side room joining: new join, auto-rejoin by uid (D-01), and
 * rejoin-by-name (D-02/D-06), with D-04's never-free-a-seat guarantee.
 *
 * Ports `MenuScreen.tsx`'s `joinRoom` behaviour server-side, replacing its
 * WR-02-documented read-modify-write race with `withVersionRetry`'s
 * conditional update.
 */
import type { GameState } from '../../../src/types.ts';
import type { EdgeError, EdgeResult, RoomRow } from '../../../src/supabase/roomTypes.ts';
import { DISCONNECT_THRESHOLD_MS, EDGE_ERROR_CODES, rowToServerRoom } from '../../../src/supabase/roomTypes.ts';
import { withVersionRetry, type ComputeResult } from './db.ts';
import type { RoomStore } from './db.ts';

export interface JoinRoomInput {
    playerId: string;
    playerName: string;
    roomCode: string;
}

export type SeatResolution =
    | { type: 'existing' }
    | { type: 'takeover'; matchedPlayerId: string }
    | { type: 'new' };

function isEdgeError(value: SeatResolution | EdgeError): value is EdgeError {
    return 'code' in value;
}

/**
 * Pure seat-matching decision, exported for direct unit testing of the full
 * D-06 matrix without needing a store or a room read.
 *
 * - D-01: an existing seat matching `playerId` always wins, in any phase.
 * - D-06: a name match only becomes a `takeover` when exactly one seat with
 *   that trimmed, case-insensitive name is stale (missing `playerSeen` entry,
 *   or `nowMs - Date.parse(seen) > DISCONNECT_THRESHOLD_MS`). A match against
 *   a still-connected seat is `NAME_IN_USE`; two or more stale matches is
 *   `NAME_AMBIGUOUS`. Never guess.
 * - With zero name matches, a new join is only allowed while `state.phase`
 *   is `'lobby'`; otherwise `GAME_ALREADY_STARTED` (unless a takeover applied
 *   above).
 */
export function resolveSeat(
    state: GameState,
    playerSeen: Record<string, string>,
    playerId: string,
    playerName: string,
    nowMs: number
): SeatResolution | EdgeError {
    if (state.players.some((player) => player.id === playerId)) {
        return { type: 'existing' };
    }

    const normalizedName = playerName.trim().toLowerCase();
    const staleMatches: string[] = [];
    let hasLiveMatch = false;

    for (const player of state.players) {
        if (player.name.trim().toLowerCase() !== normalizedName) continue;
        const seen = playerSeen[player.id];
        const isStale = !seen || nowMs - Date.parse(seen) > DISCONNECT_THRESHOLD_MS;
        if (isStale) {
            staleMatches.push(player.id);
        } else {
            hasLiveMatch = true;
        }
    }

    if (hasLiveMatch) {
        return { code: EDGE_ERROR_CODES.NAME_IN_USE, message: `${playerName} is already connected to this room` };
    }
    if (staleMatches.length === 1) {
        return { type: 'takeover', matchedPlayerId: staleMatches[0] };
    }
    if (staleMatches.length >= 2) {
        return {
            code: EDGE_ERROR_CODES.NAME_AMBIGUOUS,
            message: `Multiple disconnected players are named ${playerName}`,
        };
    }

    if (state.phase !== 'lobby') {
        return { code: EDGE_ERROR_CODES.GAME_ALREADY_STARTED, message: 'Game has already started' };
    }
    return { type: 'new' };
}

export async function joinRoom(store: RoomStore, input: JoinRoomInput): Promise<EdgeResult> {
    const trimmedName = input.playerName.trim();
    if (!trimmedName) {
        return { error: { code: EDGE_ERROR_CODES.BAD_REQUEST, message: 'Player name is required' } };
    }
    const roomCode = input.roomCode.trim().toUpperCase();
    if (!roomCode) {
        return { error: { code: EDGE_ERROR_CODES.BAD_REQUEST, message: 'Room code is required' } };
    }

    // Pre-read, D-01 fast path: an already-seated caller's rejoin does not
    // change `state` at all, so - and only so - it goes through
    // `touchPlayerSeen`'s version-exempt write instead of `withVersionRetry`.
    // Every other resolution (`takeover`, `new`, and all three `EdgeError`
    // outcomes) genuinely mutates `state.players`/`state.host`/`state.lastAction`
    // and must still fall through below to keep bumping the version.
    //
    // Between this read and the `touchPlayerSeen` call below, a concurrent
    // remove-player or D-06 takeover could unseat this caller, leaving an
    // orphan `player_seen` key for an id no longer in `state.players`. That is
    // harmless and deliberately not guarded against: `resolveSeat` and
    // `transferHostIfStale` both iterate `state.players` and look entries up
    // by seated id, so a key nobody is seated under is never read. Do not add
    // a defensive re-check here - it would reintroduce the version bump this
    // task removes.
    const preReadRow = await store.readRoom(roomCode);
    if (preReadRow) {
        const preReadNowIso = store.now();
        const preReadNowMs = Date.parse(preReadNowIso);
        const preReadResolution = resolveSeat(
            preReadRow.state,
            preReadRow.player_seen,
            input.playerId,
            trimmedName,
            preReadNowMs
        );
        if (!isEdgeError(preReadResolution) && preReadResolution.type === 'existing') {
            const updated = await store.touchPlayerSeen(roomCode, input.playerId, preReadNowIso);
            if (updated) {
                return { room: rowToServerRoom(updated) };
            }
            // The room was deleted between the pre-read and this write - fall
            // through to withVersionRetry below, which already produces the
            // correct ROOM_NOT_FOUND for that case without a duplicated
            // error-construction path here.
        }
    }

    return withVersionRetry(store, roomCode, (row: RoomRow): ComputeResult => {
        const nowIso = store.now();
        const nowMs = Date.parse(nowIso);
        const resolution = resolveSeat(row.state, row.player_seen, input.playerId, trimmedName, nowMs);
        if (isEdgeError(resolution)) {
            return resolution;
        }

        if (resolution.type === 'existing') {
            return {
                state: row.state,
                playerSeen: { ...row.player_seen, [input.playerId]: nowIso },
            };
        }

        if (resolution.type === 'takeover') {
            const matchedId = resolution.matchedPlayerId;
            const nextPlayers = row.state.players.map((player) =>
                player.id === matchedId ? { ...player, id: input.playerId } : player
            );
            const nextHost = row.state.host === matchedId ? input.playerId : row.state.host;
            const nextState: GameState = {
                ...row.state,
                players: nextPlayers,
                host: nextHost,
                lastAction: `${trimmedName} reconnected`,
            };
            const nextPlayerSeen = { ...row.player_seen };
            delete nextPlayerSeen[matchedId];
            nextPlayerSeen[input.playerId] = nowIso;
            return { state: nextState, playerSeen: nextPlayerSeen };
        }

        // resolution.type === 'new'
        const nextPlayers = [
            ...row.state.players,
            { id: input.playerId, name: trimmedName, hand: [], faceUp: [], faceDown: [], isReady: false },
        ];
        const nextState: GameState = {
            ...row.state,
            players: nextPlayers,
            lastAction: `${trimmedName} joined the room`,
        };
        return {
            state: nextState,
            playerSeen: { ...row.player_seen, [input.playerId]: nowIso },
        };
    });
}
