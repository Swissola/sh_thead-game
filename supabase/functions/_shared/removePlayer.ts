/**
 * D-07: host removes a non-host player from the lobby.
 *
 * This is the one place in the phase where a player is genuinely removed
 * from `state.players`. It does not contradict D-04, which protects a
 * mid-game seat with cards in it: D-07 is explicitly a pre-game lobby
 * action so the rest of the table can start, and that boundary is enforced
 * here by rejecting anything outside the `'lobby'` phase.
 */
import type { GameState } from '../../../src/types.ts';
import { EDGE_ERROR_CODES, type EdgeResult } from '../../../src/supabase/roomTypes.ts';
import { withVersionRetry, type ComputeResult, type RoomStore } from './db.ts';

export interface RemovePlayerInput {
    playerId: string;
    roomCode: string;
    targetPlayerId: string;
}

/**
 * Reads the room, validates the caller is the host, the room is still in
 * the lobby, and the target is a non-host seated player, then removes the
 * target's seat and last-seen entry. Does not gate on the target's
 * connectivity - the host is the human judge of who is AFK, so no
 * `player_seen` staleness precondition is applied.
 */
export function removePlayer(store: RoomStore, input: RemovePlayerInput): Promise<EdgeResult> {
    return withVersionRetry(store, input.roomCode, (row): ComputeResult => {
        if (input.playerId !== row.state.host) {
            return { code: EDGE_ERROR_CODES.NOT_HOST, message: 'Only the host can remove a player' };
        }
        if (row.state.phase !== 'lobby') {
            return {
                code: EDGE_ERROR_CODES.GAME_ALREADY_STARTED,
                message: 'Cannot remove a player once the game has started',
            };
        }
        if (input.targetPlayerId === row.state.host) {
            return { code: EDGE_ERROR_CODES.BAD_REQUEST, message: 'The host cannot remove themselves' };
        }

        const target = row.state.players.find((player) => player.id === input.targetPlayerId);
        if (!target) {
            return { code: EDGE_ERROR_CODES.NOT_IN_ROOM, message: 'Target player is not in this room' };
        }

        const nextPlayers = row.state.players.filter((player) => player.id !== input.targetPlayerId);
        const nextState: GameState = {
            ...row.state,
            players: nextPlayers,
            lastAction: `${target.name} was removed from the lobby`,
        };

        const nextPlayerSeen = { ...row.player_seen };
        delete nextPlayerSeen[input.targetPlayerId];

        return { state: nextState, playerSeen: nextPlayerSeen };
    });
}
