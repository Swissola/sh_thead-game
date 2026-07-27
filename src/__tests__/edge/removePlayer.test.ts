import { describe, it, expect } from 'vitest';
import { removePlayer } from '../../../supabase/functions/_shared/removePlayer';
import type { RoomStore, RoomUpdatePatch, MoveLogEntry } from '../../../supabase/functions/_shared/db';
import { EDGE_ERROR_CODES, type RoomRow } from '../../supabase/roomTypes';
import { buildGameState, buildPlayer } from '../testUtils/buildGameState';

const NOW_ISO = '2026-07-27T00:10:00.000Z';

function makeRoomRow(overrides: Partial<RoomRow> = {}): RoomRow {
    return {
        room_code: 'ABC123',
        state: buildGameState({
            phase: 'lobby',
            host: 'p0',
            players: [
                buildPlayer({ id: 'p0', name: 'Alice' }),
                buildPlayer({ id: 'p1', name: 'Bob' }),
                buildPlayer({ id: 'p2', name: 'Carol' }),
            ],
        }),
        version: 0,
        turn_started_at: NOW_ISO,
        player_seen: { p0: NOW_ISO, p1: NOW_ISO, p2: NOW_ISO },
        created_at: NOW_ISO,
        updated_at: NOW_ISO,
        ...overrides,
    };
}

/** In-memory fake so removePlayer is unit-tested without a Deno runtime or a live database. */
class FakeRoomStore implements RoomStore {
    rooms = new Map<string, RoomRow>();
    moves: MoveLogEntry[] = [];
    writeCount = 0;
    nowValue = NOW_ISO;

    constructor(seed?: RoomRow) {
        if (seed) this.rooms.set(seed.room_code, seed);
    }

    async readRoom(roomCode: string): Promise<RoomRow | null> {
        return this.rooms.get(roomCode) ?? null;
    }

    async insertRoom(row: RoomRow): Promise<boolean> {
        if (this.rooms.has(row.room_code)) return false;
        this.rooms.set(row.room_code, row);
        return true;
    }

    async updateRoom(roomCode: string, expectedVersion: number, patch: RoomUpdatePatch): Promise<number> {
        this.writeCount++;
        const row = this.rooms.get(roomCode);
        if (!row || row.version !== expectedVersion) return 0;
        this.rooms.set(roomCode, { ...row, ...patch });
        return 1;
    }

    async appendMove(entry: MoveLogEntry): Promise<void> {
        this.moves.push(entry);
    }

    now(): string {
        return this.nowValue;
    }
}

describe('removePlayer (D-07)', () => {
    it('returns NOT_HOST when the caller is not state.host', async () => {
        const store = new FakeRoomStore(makeRoomRow());

        const result = await removePlayer(store, { playerId: 'p1', roomCode: 'ABC123', targetPlayerId: 'p2' });

        expect(result.error?.code).toBe(EDGE_ERROR_CODES.NOT_HOST);
        expect(store.writeCount).toBe(0);
    });

    it('returns GAME_ALREADY_STARTED when state.phase is not lobby', async () => {
        const store = new FakeRoomStore(makeRoomRow({ state: makeRoomRow().state }));
        store.rooms.get('ABC123')!.state.phase = 'playing';

        const result = await removePlayer(store, { playerId: 'p0', roomCode: 'ABC123', targetPlayerId: 'p1' });

        expect(result.error?.code).toBe(EDGE_ERROR_CODES.GAME_ALREADY_STARTED);
        expect(store.writeCount).toBe(0);
    });

    it('returns BAD_REQUEST when the target id equals state.host', async () => {
        const store = new FakeRoomStore(makeRoomRow());

        const result = await removePlayer(store, { playerId: 'p0', roomCode: 'ABC123', targetPlayerId: 'p0' });

        expect(result.error?.code).toBe(EDGE_ERROR_CODES.BAD_REQUEST);
        expect(store.writeCount).toBe(0);
    });

    it('returns NOT_IN_ROOM when the target id is not in state.players', async () => {
        const store = new FakeRoomStore(makeRoomRow());

        const result = await removePlayer(store, { playerId: 'p0', roomCode: 'ABC123', targetPlayerId: 'ghost' });

        expect(result.error?.code).toBe(EDGE_ERROR_CODES.NOT_IN_ROOM);
        expect(store.writeCount).toBe(0);
    });

    it('removes the target from state.players, deletes their player_seen entry, and names the removal in lastAction', async () => {
        const store = new FakeRoomStore(makeRoomRow());

        const result = await removePlayer(store, { playerId: 'p0', roomCode: 'ABC123', targetPlayerId: 'p1' });

        expect(result.error).toBeUndefined();
        expect(result.room?.state.players.map((p) => p.id)).toEqual(['p0', 'p2']);
        expect(result.room?.playerSeen.p1).toBeUndefined();
        expect(result.room?.state.lastAction).toContain('Bob');
    });

    it("does not change any other player's cards or order on success", async () => {
        const row = makeRoomRow();
        const store = new FakeRoomStore(row);
        const originalP0 = row.state.players[0];
        const originalP2 = row.state.players[2];

        const result = await removePlayer(store, { playerId: 'p0', roomCode: 'ABC123', targetPlayerId: 'p1' });

        expect(result.room?.state.players[0]).toEqual(originalP0);
        expect(result.room?.state.players[1]).toEqual(originalP2);
    });
});
