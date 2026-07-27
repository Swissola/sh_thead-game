/**
 * D-05: server-verified grace-period auto-pickup for a stalled turn.
 *
 * Any authenticated player in the room may trigger this lazy sweep - it is
 * not a privileged action, and it cannot do anything the timer does not
 * already permit. The authorisation that matters is temporal, not
 * identity-based: elapsed time is always recomputed from `store.now()`
 * against the room's stored `turn_started_at`, never a caller-supplied
 * timestamp (T-02-24, RESEARCH.md Architectural Responsibility Map).
 */
import { EDGE_ERROR_CODES, TURN_GRACE_MS, type EdgeError, type EdgeResult } from '../../../src/supabase/roomTypes.ts';
import { withVersionRetry, type ComputeResult, type RoomStore } from './db.ts';
import { applyMove, type Move } from './engine.ts';

export interface CheckTurnTimeoutInput {
    roomCode: string;
}

/**
 * Reads the room, checks whether the current turn's grace period has
 * elapsed against the server clock, and - if so - applies a `PICK_UP_PILE`
 * move on behalf of the timed-out player through the shared `applyMove`
 * reducer. Never hand-rolls the pickup, and never reveals a face-down card
 * on the player's behalf (D-04/D-05).
 */
export function checkTurnTimeout(store: RoomStore, input: CheckTurnTimeoutInput): Promise<EdgeResult> {
    return withVersionRetry(store, input.roomCode, (row): ComputeResult => {
        if (row.state.phase !== 'playing') {
            return {
                code: EDGE_ERROR_CODES.TIMEOUT_NOT_ELAPSED,
                message: 'Room is not in the playing phase',
            };
        }

        const elapsedMs = Date.parse(store.now()) - Date.parse(row.turn_started_at);
        if (elapsedMs < TURN_GRACE_MS) {
            return {
                code: EDGE_ERROR_CODES.TIMEOUT_NOT_ELAPSED,
                message: 'Grace period has not yet elapsed',
            };
        }

        const timedOutPlayer = row.state.players[row.state.currentTurn];
        const move: Move = { type: 'PICK_UP_PILE', playerId: timedOutPlayer.id };
        const result = applyMove(row.state, move);
        if (result.error) {
            // Forward the engine's rejection (e.g. PILE_EMPTY) unchanged - no write.
            // Engine codes (ERROR_CODES) and edge codes (EDGE_ERROR_CODES) are a
            // deliberately disjoint closed set (roomTypes.ts docstring).
            return { code: result.error.code, message: result.error.message } as unknown as EdgeError;
        }

        return {
            state: {
                ...result.state,
                lastAction: `${timedOutPlayer.name} was disconnected too long - the pile was automatically picked up`,
            },
            turnStartedAt: store.now(),
        };
    });
}
