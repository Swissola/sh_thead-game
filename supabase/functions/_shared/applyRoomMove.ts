/**
 * Server-authoritative move application (MPLAY-04 / T-02-18, T-02-21, T-02-22).
 *
 * Every move is validated and applied by the exact `applyMove` reducer the
 * browser calls, imported unmodified through `./engine.ts`. This file's own
 * job is purely the network-trust boundary `applyMove` cannot provide on its
 * own: rejecting a malformed move shape before the engine sees it, and
 * overwriting the caller's claimed identity with the verified JWT subject.
 */
import { EDGE_ERROR_CODES, type EdgeError, type EdgeResult } from '../../../src/supabase/roomTypes.ts';
import { edgeError } from './respond.ts';
import { withVersionRetry, type RoomStore } from './db.ts';
import { applyMove, type Move } from './engine.ts';

export interface ApplyRoomMoveInput {
    playerId: string;
    roomCode: string;
    move: unknown;
}

const VALID_MOVE_TYPES = new Set(['PLAY_CARDS', 'PICK_UP_PILE', 'SWAP_CARDS', 'READY_UP', 'SET_TURN_TIMEOUT']);

function isValidMoveShape(move: unknown): move is Move {
    return (
        typeof move === 'object' &&
        move !== null &&
        'type' in move &&
        typeof (move as { type: unknown }).type === 'string' &&
        VALID_MOVE_TYPES.has((move as { type: string }).type)
    );
}

/**
 * Validates the move shape, overrides its `playerId` with the caller's
 * verified identity, then applies it through `applyMove` under
 * `withVersionRetry`, auditing every successful write.
 */
export function applyRoomMove(store: RoomStore, input: ApplyRoomMoveInput): Promise<EdgeResult> {
    if (!isValidMoveShape(input.move)) {
        // ASVS V5: reject a malformed move shape before the engine ever sees it -
        // no read, no write.
        return Promise.resolve({ error: edgeError(EDGE_ERROR_CODES.BAD_REQUEST, 'Unrecognised move type') });
    }

    // T-02-18: never trust move.playerId from the request body - a modified client
    // could claim to be any player. The verified JWT subject (input.playerId) is the
    // only trustworthy identity. Copy first; never mutate the caller's object.
    const move: Move = { ...input.move, playerId: input.playerId };

    return withVersionRetry(
        store,
        input.roomCode,
        (row) => {
            const result = applyMove(row.state, move);
            if (result.error) {
                // Engine error codes (ERROR_CODES) and edge error codes (EDGE_ERROR_CODES)
                // are a deliberately disjoint closed set (roomTypes.ts docstring) - bridge
                // the two tiers here by forwarding the engine's code/message verbatim so
                // the client's toast copy stays consistent regardless of which tier
                // rejected the move. No write happens on this path.
                return { code: result.error.code, message: result.error.message } as unknown as EdgeError;
            }

            // Pitfall 4 (RESEARCH.md, Open Question 1 - resolved): reset turn_started_at
            // on every successful move, unconditionally - not only when whose turn it is
            // changes. applyPlayCards can leave the acting player unchanged after a burn
            // (the same player goes again) - from that player's perspective this is still
            // a fresh decision point, and an unconditional reset is simpler and cannot
            // strand a player mid-burn-sequence with an expired clock.
            return { state: result.state, turnStartedAt: store.now() };
        },
        { playerId: input.playerId, move }
    );
}
