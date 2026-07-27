import { describe, it, expect, vi, afterEach } from 'vitest';
import { createRoom } from '../../../supabase/functions/_shared/createRoom';
import type { RoomStore, RoomUpdatePatch } from '../../../supabase/functions/_shared/db';
import { EDGE_ERROR_CODES, type RoomRow } from '../../supabase/roomTypes';

/** In-memory fake so createRoom is unit-tested without a Deno runtime or a live database. */
class FakeRoomStore implements RoomStore {
    rooms = new Map<string, RoomRow>();
    insertCount = 0;
    nowValue = '2026-07-26T00:00:01.000Z';

    async readRoom(roomCode: string): Promise<RoomRow | null> {
        return this.rooms.get(roomCode) ?? null;
    }

    async insertRoom(row: RoomRow): Promise<boolean> {
        this.insertCount++;
        if (this.rooms.has(row.room_code)) return false;
        this.rooms.set(row.room_code, row);
        return true;
    }

    async updateRoom(roomCode: string, expectedVersion: number, patch: RoomUpdatePatch): Promise<number> {
        const row = this.rooms.get(roomCode);
        if (!row || row.version !== expectedVersion) return 0;
        this.rooms.set(roomCode, { ...row, ...patch });
        return 1;
    }

    async appendMove(): Promise<void> {
        // not used by createRoom
    }

    now(): string {
        return this.nowValue;
    }
}

/**
 * Deterministic stand-in for `crypto.getRandomValues` so collision tests can
 * control exactly which codes get generated, in order.
 */
function mockRandomCodes(bytesSequence: number[][]): void {
    let call = 0;
    vi.spyOn(crypto, 'getRandomValues').mockImplementation(((array: Uint8Array) => {
        const bytes = bytesSequence[Math.min(call, bytesSequence.length - 1)];
        call++;
        bytes.forEach((b, i) => {
            array[i] = b;
        });
        return array;
    }) as typeof crypto.getRandomValues);
}

afterEach(() => {
    vi.restoreAllMocks();
});

describe('createRoom', () => {
    it('returns a lobby room with the caller as host and sole player', async () => {
        const store = new FakeRoomStore();

        const result = await createRoom(store, { playerId: 'player-1', playerName: 'Alice' });

        expect(result.error).toBeUndefined();
        expect(result.room?.state.phase).toBe('lobby');
        expect(result.room?.state.host).toBe('player-1');
        expect(result.room?.state.players).toEqual([
            { id: 'player-1', name: 'Alice', hand: [], faceUp: [], faceDown: [], isReady: false },
        ]);
    });

    it('generates a 6-character uppercase code from crypto.getRandomValues', async () => {
        const store = new FakeRoomStore();
        mockRandomCodes([[0, 1, 2, 3, 4, 5]]);

        const result = await createRoom(store, { playerId: 'player-1', playerName: 'Alice' });

        expect(result.room?.roomCode).toHaveLength(6);
        expect(result.room?.roomCode).toBe(result.room?.roomCode?.toUpperCase());
        expect(crypto.getRandomValues).toHaveBeenCalled();
    });

    it('regenerates and retries the code on a reported collision, up to 5 attempts', async () => {
        const store = new FakeRoomStore();
        // First code collides with a pre-existing room; second code succeeds.
        mockRandomCodes([
            [0, 0, 0, 0, 0, 0],
            [1, 1, 1, 1, 1, 1],
        ]);
        const collidingRow: RoomRow = {
            room_code: '000000',
            state: {
                roomCode: '000000',
                host: 'other',
                players: [],
                phase: 'lobby',
                currentTurn: 0,
                deck: [],
                discardPile: [],
                burnPile: [],
                lastAction: '',
                isFirstTurn: true,
            },
            version: 0,
            turn_started_at: store.now(),
            player_seen: {},
            created_at: store.now(),
            updated_at: store.now(),
        };
        store.rooms.set('000000', collidingRow);

        const result = await createRoom(store, { playerId: 'player-1', playerName: 'Alice' });

        expect(result.error).toBeUndefined();
        expect(result.room?.roomCode).toBe('111111');
        expect(store.insertCount).toBe(2);
    });

    it('returns ROOM_CODE_COLLISION after 5 collisions', async () => {
        const store = new FakeRoomStore();
        mockRandomCodes([[9, 9, 9, 9, 9, 9]]);
        // Pre-seed the one code that will always be generated so every attempt collides.
        store.rooms.set('999999', {
            room_code: '999999',
            state: {
                roomCode: '999999',
                host: 'other',
                players: [],
                phase: 'lobby',
                currentTurn: 0,
                deck: [],
                discardPile: [],
                burnPile: [],
                lastAction: '',
                isFirstTurn: true,
            },
            version: 0,
            turn_started_at: store.now(),
            player_seen: {},
            created_at: store.now(),
            updated_at: store.now(),
        });

        const result = await createRoom(store, { playerId: 'player-1', playerName: 'Alice' });

        expect(result.error?.code).toBe(EDGE_ERROR_CODES.ROOM_CODE_COLLISION);
        expect(store.insertCount).toBe(5);
    });

    it('rejects an empty or whitespace-only name with BAD_REQUEST and attempts no insert', async () => {
        const store = new FakeRoomStore();

        const result = await createRoom(store, { playerId: 'player-1', playerName: '   ' });

        expect(result.error?.code).toBe(EDGE_ERROR_CODES.BAD_REQUEST);
        expect(store.insertCount).toBe(0);
    });

    it('sources version 0, turnStartedAt and playerSeen[playerId] from store.now(), never a caller value', async () => {
        const store = new FakeRoomStore();
        store.nowValue = '2026-07-26T12:34:56.000Z';

        const result = await createRoom(store, { playerId: 'player-1', playerName: 'Alice' });

        expect(result.room?.version).toBe(0);
        expect(result.room?.turnStartedAt).toBe('2026-07-26T12:34:56.000Z');
        expect(result.room?.playerSeen['player-1']).toBe('2026-07-26T12:34:56.000Z');
    });
});
