import { describe, it, expect } from 'vitest';
import { heartbeat, transferHostIfStale } from '../../../supabase/functions/_shared/heartbeat';
import type { RoomStore, RoomUpdatePatch, MoveLogEntry } from '../../../supabase/functions/_shared/db';
import { DISCONNECT_THRESHOLD_MS, EDGE_ERROR_CODES, type RoomRow } from '../../supabase/roomTypes';
import type { GameState } from '../../types';
import { buildGameState, buildPlayer } from '../testUtils/buildGameState';

const NOW_ISO = '2026-07-27T00:10:00.000Z';
const NOW_MS = Date.parse(NOW_ISO);
const STALE_SEEN = new Date(NOW_MS - DISCONNECT_THRESHOLD_MS - 1000).toISOString();
const LIVE_SEEN = new Date(NOW_MS - 1000).toISOString();

function makeRoomRow(overrides: Partial<RoomRow> = {}): RoomRow {
    return {
        room_code: 'ABC123',
        state: buildGameState({ phase: 'lobby' }),
        version: 0,
        turn_started_at: NOW_ISO,
        player_seen: {},
        created_at: NOW_ISO,
        updated_at: NOW_ISO,
        ...overrides,
    };
}

/** In-memory fake so heartbeat is unit-tested without a Deno runtime or a live database. */
class FakeRoomStore implements RoomStore {
    rooms = new Map<string, RoomRow>();
    moves: MoveLogEntry[] = [];
    writeCount = 0;
    /** Counts touchPlayerSeen calls separately from writeCount - see class docstring. */
    touchCount = 0;
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

function lobbyState(overrides: Partial<GameState> = {}): GameState {
    return buildGameState({
        phase: 'lobby',
        host: 'p0',
        players: [
            buildPlayer({ id: 'p0', name: 'Alice' }),
            buildPlayer({ id: 'p1', name: 'Bob' }),
            buildPlayer({ id: 'p2', name: 'Carol' }),
        ],
        ...overrides,
    });
}

describe('heartbeat', () => {
    it("sets player_seen[callerId] to store.now() and leaves every other entry untouched", async () => {
        const row = makeRoomRow({ state: lobbyState(), player_seen: { p0: STALE_SEEN, p1: LIVE_SEEN } });
        const store = new FakeRoomStore(row);

        const result = await heartbeat(store, { playerId: 'p1', roomCode: 'ABC123' });

        expect(result.error).toBeUndefined();
        expect(result.room?.playerSeen.p1).toBe(NOW_ISO);
        expect(result.room?.playerSeen.p0).toBe(STALE_SEEN);
    });

    it('returns NOT_IN_ROOM and writes nothing when the caller id is not in state.players', async () => {
        const row = makeRoomRow({ state: lobbyState() });
        const store = new FakeRoomStore(row);

        const result = await heartbeat(store, { playerId: 'ghost', roomCode: 'ABC123' });

        expect(result.error?.code).toBe(EDGE_ERROR_CODES.NOT_IN_ROOM);
        expect(store.writeCount).toBe(0);
        expect(store.touchCount).toBe(0);
    });

    it('returns ROOM_NOT_FOUND and writes nothing when the room does not exist', async () => {
        const store = new FakeRoomStore();

        const result = await heartbeat(store, { playerId: 'p0', roomCode: 'MISSING' });

        expect(result.error?.code).toBe(EDGE_ERROR_CODES.ROOM_NOT_FOUND);
        expect(store.writeCount).toBe(0);
        expect(store.touchCount).toBe(0);
    });

    it('does not touch the per-turn timer field on a successful heartbeat', async () => {
        const row = makeRoomRow({ state: lobbyState(), turn_started_at: '2000-01-01T00:00:00.000Z' });
        const store = new FakeRoomStore(row);

        const result = await heartbeat(store, { playerId: 'p0', roomCode: 'ABC123' });

        expect(result.error).toBeUndefined();
        expect(result.room?.turnStartedAt).toBe('2000-01-01T00:00:00.000Z');
    });

    it('leaves version unchanged and performs zero updateRoom calls, exactly one touchPlayerSeen call, on an ordinary heartbeat', async () => {
        const row = makeRoomRow({ state: lobbyState(), version: 4, player_seen: { p0: LIVE_SEEN, p1: LIVE_SEEN } });
        const store = new FakeRoomStore(row);

        const result = await heartbeat(store, { playerId: 'p1', roomCode: 'ABC123' });

        expect(result.error).toBeUndefined();
        expect(result.room?.version).toBe(4);
        expect(store.writeCount).toBe(0);
        expect(store.touchCount).toBe(1);
    });

    it('takes the withVersionRetry path on a genuine lobby host transfer: version increments, host changes, lastAction names the new host', async () => {
        const row = makeRoomRow({
            state: lobbyState({ host: 'p0' }),
            version: 4,
            player_seen: { p0: STALE_SEEN },
        });
        const store = new FakeRoomStore(row);

        const result = await heartbeat(store, { playerId: 'p1', roomCode: 'ABC123' });

        expect(result.error).toBeUndefined();
        expect(result.room?.version).toBe(5);
        expect(result.room?.state.host).toBe('p1');
        expect(result.room?.state.lastAction).toContain('Bob');
        expect(store.writeCount).toBe(1);
        expect(store.touchCount).toBe(0);
    });

    it('does not touch the per-turn timer field on a host-transferring heartbeat', async () => {
        const row = makeRoomRow({
            state: lobbyState({ host: 'p0' }),
            player_seen: { p0: STALE_SEEN },
            turn_started_at: '2000-01-01T00:00:00.000Z',
        });
        const store = new FakeRoomStore(row);

        const result = await heartbeat(store, { playerId: 'p1', roomCode: 'ABC123' });

        expect(result.error).toBeUndefined();
        expect(result.room?.turnStartedAt).toBe('2000-01-01T00:00:00.000Z');
    });
});

describe('transferHostIfStale', () => {
    it("reassigns host only when phase is 'lobby' and the current host is stale", () => {
        const state = lobbyState({ phase: 'lobby', host: 'p0' });
        const playerSeen = { p0: STALE_SEEN, p1: LIVE_SEEN };

        const next = transferHostIfStale(state, playerSeen, NOW_MS);

        expect(next.host).toBe('p1');
    });

    it('picks the earliest-seated currently-connected player among several candidates', () => {
        const state = lobbyState({ phase: 'lobby', host: 'p0' });
        const playerSeen = { p0: STALE_SEEN, p1: LIVE_SEEN, p2: LIVE_SEEN };

        const next = transferHostIfStale(state, playerSeen, NOW_MS);

        // p1 is earlier-seated than p2 in the players array.
        expect(next.host).toBe('p1');
    });

    it('leaves the host unchanged when no player is currently connected', () => {
        const state = lobbyState({ phase: 'lobby', host: 'p0' });
        const playerSeen = { p0: STALE_SEEN, p1: STALE_SEEN, p2: STALE_SEEN };

        const next = transferHostIfStale(state, playerSeen, NOW_MS);

        expect(next.host).toBe('p0');
        expect(next).toEqual(state);
    });

    it('never changes the host while phase is playing, setup or finished', () => {
        const playerSeen = { p0: STALE_SEEN, p1: LIVE_SEEN };

        for (const phase of ['playing', 'setup', 'finished'] as const) {
            const state = lobbyState({ phase, host: 'p0' });
            const next = transferHostIfStale(state, playerSeen, NOW_MS);
            expect(next.host).toBe('p0');
        }
    });

    it('sets lastAction naming the new host on a successful transfer', () => {
        const state = lobbyState({ phase: 'lobby', host: 'p0' });
        const playerSeen = { p0: STALE_SEEN, p1: LIVE_SEEN };

        const next = transferHostIfStale(state, playerSeen, NOW_MS);

        expect(next.lastAction).toContain('Bob');
    });

    it('leaves the host unchanged when the current host is not stale', () => {
        const state = lobbyState({ phase: 'lobby', host: 'p0' });
        const playerSeen = { p0: LIVE_SEEN, p1: LIVE_SEEN };

        const next = transferHostIfStale(state, playerSeen, NOW_MS);

        expect(next).toEqual(state);
    });
});
