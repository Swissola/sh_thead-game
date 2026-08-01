/**
 * Server-side room creation: code generation, collision retry, and the
 * initial lobby `GameState` shape.
 *
 * Ports `MenuScreen.tsx`'s `generateRoomCode`/`createRoom` behaviour
 * server-side (RESEARCH.md Pitfall 3) - the client can no longer write the
 * room directly once RLS denies it, and code generation/collision-checking
 * are trust-boundary operations in their own right.
 */
import type { GameState } from '../../../src/types.ts';
import type { EdgeResult, RoomRow } from '../../../src/supabase/roomTypes.ts';
import { EDGE_ERROR_CODES, rowToServerRoom, TURN_GRACE_MS } from '../../../src/supabase/roomTypes.ts';
import type { RoomStore } from './db.ts';

const MAX_CODE_ATTEMPTS = 5;

/**
 * WR-03: 6 bytes from `crypto.getRandomValues`, each mapped to a base36
 * digit, uppercased - matches `MenuScreen.tsx`'s existing client-side
 * generator verbatim in behaviour. `crypto.getRandomValues` is a web
 * standard available in Deno, so no polyfill/import is needed.
 */
function generateRoomCode(): string {
    return Array.from(crypto.getRandomValues(new Uint8Array(6)))
        .map((b) => (b % 36).toString(36))
        .join('')
        .toUpperCase();
}

export interface CreateRoomInput {
    playerId: string;
    playerName: string;
}

/**
 * Creates a new room with a server-generated, collision-free code and a
 * fully-formed lobby `GameState`. Every timestamp comes from `store.now()` -
 * never a caller-supplied value - so a modified client cannot fake its own
 * liveness (D-05, D-06, D-08 all depend on this being trustworthy).
 */
export async function createRoom(store: RoomStore, input: CreateRoomInput): Promise<EdgeResult> {
    const trimmedName = input.playerName.trim();
    if (!trimmedName) {
        return { error: { code: EDGE_ERROR_CODES.BAD_REQUEST, message: 'Player name is required' } };
    }

    const now = store.now();
    const baseState: GameState = {
        roomCode: '',
        host: input.playerId,
        players: [
            {
                id: input.playerId,
                name: trimmedName,
                hand: [],
                faceUp: [],
                faceDown: [],
                isReady: false,
            },
        ],
        phase: 'lobby',
        currentTurn: 0,
        deck: [],
        discardPile: [],
        burnPile: [],
        lastAction: `${trimmedName} created the room`,
        isFirstTurn: true,
        turnTimeoutMs: TURN_GRACE_MS,
    };

    for (let attempt = 0; attempt < MAX_CODE_ATTEMPTS; attempt++) {
        const roomCode = generateRoomCode();
        const row: RoomRow = {
            room_code: roomCode,
            state: { ...baseState, roomCode },
            version: 0,
            turn_started_at: now,
            player_seen: { [input.playerId]: now },
            created_at: now,
            updated_at: now,
        };

        const inserted = await store.insertRoom(row);
        if (inserted) {
            return { room: rowToServerRoom(row) };
        }
        // Collision - regenerate and retry, bounded at MAX_CODE_ATTEMPTS.
    }

    return {
        error: {
            code: EDGE_ERROR_CODES.ROOM_CODE_COLLISION,
            message: `Could not generate a unique room code after ${MAX_CODE_ATTEMPTS} attempts`,
        },
    };
}
