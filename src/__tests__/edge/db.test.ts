import { describe, it, expect } from 'vitest';
import { withVersionRetry, MAX_WRITE_ATTEMPTS, type RoomStore, type RoomUpdatePatch } from '../../../supabase/functions/_shared/db';
import { jsonResponse, edgeError } from '../../../supabase/functions/_shared/respond';
import { EDGE_ERROR_CODES, type RoomRow, type EdgeResult } from '../../supabase/roomTypes';
import type { GameState } from '../../types';

function makeGameState(overrides: Partial<GameState> = {}): GameState {
    return {
        roomCode: 'ABC123',
        host: 'player-1',
        players: [],
        phase: 'lobby',
        currentTurn: 0,
        deck: [],
        discardPile: [],
        burnPile: [],
        lastAction: '',
        isFirstTurn: false,
        ...overrides,
    };
}

function makeRoomRow(overrides: Partial<RoomRow> = {}): RoomRow {
    return {
        room_code: 'ABC123',
        state: makeGameState(),
        version: 0,
        turn_started_at: '2026-07-26T00:00:00.000Z',
        player_seen: {},
        created_at: '2026-07-26T00:00:00.000Z',
        updated_at: '2026-07-26T00:00:00.000Z',
        ...overrides,
    };
}

/** In-memory fake so withVersionRetry is unit-tested without a Deno runtime or a live database. */
class FakeRoomStore implements RoomStore {
    rooms = new Map<string, RoomRow>();
    moves: unknown[] = [];
    readCount = 0;
    writeCount = 0;
    /** Number of leading updateRoom calls that report 0 affected rows before succeeding. */
    failWritesRemaining = 0;
    /** Counts touchPlayerSeen calls separately from writeCount - see class docstring. */
    touchCount = 0;
    nowValue = '2026-07-26T00:00:01.000Z';

    constructor(seed?: RoomRow) {
        if (seed) this.rooms.set(seed.room_code, seed);
    }

    async readRoom(roomCode: string): Promise<RoomRow | null> {
        this.readCount++;
        return this.rooms.get(roomCode) ?? null;
    }

    async insertRoom(row: RoomRow): Promise<boolean> {
        if (this.rooms.has(row.room_code)) return false;
        this.rooms.set(row.room_code, row);
        return true;
    }

    async updateRoom(roomCode: string, expectedVersion: number, patch: RoomUpdatePatch): Promise<number> {
        this.writeCount++;
        if (this.failWritesRemaining > 0) {
            this.failWritesRemaining--;
            return 0;
        }
        const row = this.rooms.get(roomCode);
        if (!row || row.version !== expectedVersion) return 0;
        this.rooms.set(roomCode, { ...row, ...patch });
        return 1;
    }

    async appendMove(entry: unknown): Promise<void> {
        this.moves.push(entry);
    }

    async touchPlayerSeen(roomCode: string, playerId: string, seenAt: string): Promise<RoomRow | null> {
        this.touchCount++;
        const row = this.rooms.get(roomCode);
        if (!row) return null;
        const updated = { ...row, player_seen: { ...row.player_seen, [playerId]: seenAt } };
        this.rooms.set(roomCode, updated);
        return updated;
    }

    now(): string {
        return this.nowValue;
    }
}

describe('withVersionRetry', () => {
    it('returns ROOM_NOT_FOUND when read returns null, without writing', async () => {
        const store = new FakeRoomStore();

        const result = await withVersionRetry(store, 'MISSING', () => ({ state: makeGameState() }));

        expect(result.error?.code).toBe(EDGE_ERROR_CODES.ROOM_NOT_FOUND);
        expect(store.writeCount).toBe(0);
        expect(store.readCount).toBe(1);
    });

    it('returns the compute error immediately, without writing or retrying', async () => {
        const store = new FakeRoomStore(makeRoomRow());
        const err = edgeError(EDGE_ERROR_CODES.BAD_REQUEST, 'nope');

        const result = await withVersionRetry(store, 'ABC123', () => err);

        expect(result.error).toEqual(err);
        expect(store.writeCount).toBe(0);
        expect(store.readCount).toBe(1);
    });

    it('reads, computes and writes once on the happy path, returning the updated room', async () => {
        const store = new FakeRoomStore(makeRoomRow({ version: 0 }));
        const nextState = makeGameState({ lastAction: 'moved' });

        const result = await withVersionRetry(store, 'ABC123', () => ({ state: nextState }));

        expect(result.error).toBeUndefined();
        expect(result.room?.state).toEqual(nextState);
        expect(result.room?.version).toBe(1);
        expect(store.readCount).toBe(1);
        expect(store.writeCount).toBe(1);
    });

    it('re-reads and recomputes after a 0-affected-row write, then succeeds on the retry', async () => {
        const store = new FakeRoomStore(makeRoomRow({ version: 0 }));
        store.failWritesRemaining = 1;
        let computeCalls = 0;

        const result = await withVersionRetry(store, 'ABC123', () => {
            computeCalls++;
            return { state: makeGameState({ lastAction: `attempt-${computeCalls}` }) };
        });

        expect(result.error).toBeUndefined();
        expect(result.room?.version).toBe(1);
        expect(computeCalls).toBe(2);
        expect(store.readCount).toBe(2);
        expect(store.writeCount).toBe(2);
    });

    it('gives up with CONFLICT after MAX_WRITE_ATTEMPTS failed writes', async () => {
        const store = new FakeRoomStore(makeRoomRow({ version: 0 }));
        store.failWritesRemaining = MAX_WRITE_ATTEMPTS;

        const result = await withVersionRetry(store, 'ABC123', () => ({ state: makeGameState() }));

        expect(result.error?.code).toBe(EDGE_ERROR_CODES.CONFLICT);
        expect(store.readCount).toBe(MAX_WRITE_ATTEMPTS);
        expect(store.writeCount).toBe(MAX_WRITE_ATTEMPTS);
    });
});

describe('FakeRoomStore.touchPlayerSeen (port contract)', () => {
    it('leaves version unchanged and preserves an unrelated player_seen entry', async () => {
        const store = new FakeRoomStore(makeRoomRow({ version: 3, player_seen: { p0: '2026-07-26T00:00:00.000Z' } }));

        const updated = await store.touchPlayerSeen('ABC123', 'p1', '2026-07-26T00:05:00.000Z');

        expect(updated?.version).toBe(3);
        expect(updated?.player_seen).toEqual({
            p0: '2026-07-26T00:00:00.000Z',
            p1: '2026-07-26T00:05:00.000Z',
        });
        expect(store.writeCount).toBe(0);
        expect(store.touchCount).toBe(1);
    });

    it('returns null when no room matches the code', async () => {
        const store = new FakeRoomStore();

        const updated = await store.touchPlayerSeen('MISSING', 'p1', '2026-07-26T00:05:00.000Z');

        expect(updated).toBeNull();
    });
});

describe('jsonResponse', () => {
    async function statusOf(result: EdgeResult): Promise<number> {
        return jsonResponse(result).status;
    }

    it('responds 200 with the room on success', async () => {
        const room = { roomCode: 'ABC123', state: makeGameState(), version: 1, turnStartedAt: '', playerSeen: {} };
        const response = jsonResponse({ room });

        expect(response.status).toBe(200);
        const body = await response.json();
        expect(body.room).toEqual(room);
    });

    it('maps BAD_REQUEST and other validation codes to 400', async () => {
        expect(await statusOf({ error: edgeError(EDGE_ERROR_CODES.BAD_REQUEST, 'x') })).toBe(400);
        expect(await statusOf({ error: edgeError(EDGE_ERROR_CODES.ROOM_CODE_COLLISION, 'x') })).toBe(400);
        expect(await statusOf({ error: edgeError(EDGE_ERROR_CODES.GAME_ALREADY_STARTED, 'x') })).toBe(400);
        expect(await statusOf({ error: edgeError(EDGE_ERROR_CODES.NAME_AMBIGUOUS, 'x') })).toBe(400);
        expect(await statusOf({ error: edgeError(EDGE_ERROR_CODES.NAME_IN_USE, 'x') })).toBe(400);
        expect(await statusOf({ error: edgeError(EDGE_ERROR_CODES.NOT_ENOUGH_PLAYERS, 'x') })).toBe(400);
        expect(await statusOf({ error: edgeError(EDGE_ERROR_CODES.TIMEOUT_NOT_ELAPSED, 'x') })).toBe(400);
    });

    it('maps UNAUTHENTICATED to 401', async () => {
        expect(await statusOf({ error: edgeError(EDGE_ERROR_CODES.UNAUTHENTICATED, 'x') })).toBe(401);
    });

    it('maps NOT_HOST and NOT_IN_ROOM to 403', async () => {
        expect(await statusOf({ error: edgeError(EDGE_ERROR_CODES.NOT_HOST, 'x') })).toBe(403);
        expect(await statusOf({ error: edgeError(EDGE_ERROR_CODES.NOT_IN_ROOM, 'x') })).toBe(403);
    });

    it('maps ROOM_NOT_FOUND to 404', async () => {
        expect(await statusOf({ error: edgeError(EDGE_ERROR_CODES.ROOM_NOT_FOUND, 'x') })).toBe(404);
    });

    it('maps CONFLICT to 409', async () => {
        expect(await statusOf({ error: edgeError(EDGE_ERROR_CODES.CONFLICT, 'x') })).toBe(409);
    });
});
