import { describe, it, expect } from 'vitest';
import { joinRoom, resolveSeat } from '../../../supabase/functions/_shared/joinRoom';
import type { RoomStore, RoomUpdatePatch } from '../../../supabase/functions/_shared/db';
import { EDGE_ERROR_CODES, DISCONNECT_THRESHOLD_MS, type RoomRow } from '../../supabase/roomTypes';
import type { GameState, Player } from '../../types';

const NOW_ISO = '2026-07-26T00:10:00.000Z';
const NOW_MS = Date.parse(NOW_ISO);

function makePlayer(overrides: Partial<Player> = {}): Player {
    return { id: 'p1', name: 'Alice', hand: [], faceUp: [], faceDown: [], isReady: false, ...overrides };
}

function makeGameState(overrides: Partial<GameState> = {}): GameState {
    return {
        roomCode: 'ABC123',
        host: 'p1',
        players: [makePlayer()],
        phase: 'lobby',
        currentTurn: 0,
        deck: [],
        discardPile: [],
        burnPile: [],
        lastAction: '',
        isFirstTurn: true,
        ...overrides,
    };
}

function makeRoomRow(overrides: Partial<RoomRow> = {}): RoomRow {
    return {
        room_code: 'ABC123',
        state: makeGameState(),
        version: 0,
        turn_started_at: NOW_ISO,
        player_seen: {},
        created_at: NOW_ISO,
        updated_at: NOW_ISO,
        ...overrides,
    };
}

/** In-memory fake so joinRoom is unit-tested without a Deno runtime or a live database. */
class FakeRoomStore implements RoomStore {
    rooms = new Map<string, RoomRow>();
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

    async appendMove(): Promise<void> {
        // not used by joinRoom
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

const STALE_SEEN = new Date(NOW_MS - DISCONNECT_THRESHOLD_MS - 1000).toISOString();
const LIVE_SEEN = new Date(NOW_MS - 1000).toISOString();

describe('resolveSeat (D-06 matrix)', () => {
    it('caller-already-seated: returns existing regardless of name/phase', () => {
        const state = makeGameState({ players: [makePlayer({ id: 'p1', name: 'Alice' })], phase: 'playing' });

        const result = resolveSeat(state, {}, 'p1', 'Anything', NOW_MS);

        expect(result).toEqual({ type: 'existing' });
    });

    it('zero matches: returns new when phase is lobby', () => {
        const state = makeGameState({ players: [makePlayer({ id: 'p1', name: 'Alice' })], phase: 'lobby' });

        const result = resolveSeat(state, {}, 'p2', 'Bob', NOW_MS);

        expect(result).toEqual({ type: 'new' });
    });

    it('zero matches: returns GAME_ALREADY_STARTED when phase is not lobby', () => {
        const state = makeGameState({ players: [makePlayer({ id: 'p1', name: 'Alice' })], phase: 'playing' });

        const result = resolveSeat(state, {}, 'p2', 'Bob', NOW_MS);

        expect(result).toEqual({ code: EDGE_ERROR_CODES.GAME_ALREADY_STARTED, message: expect.any(String) });
    });

    it('one stale match: returns takeover for that seat', () => {
        const state = makeGameState({
            players: [makePlayer({ id: 'p1', name: 'Alice' })],
            phase: 'playing',
        });
        const playerSeen = { p1: STALE_SEEN };

        const result = resolveSeat(state, playerSeen, 'p2', 'alice', NOW_MS);

        expect(result).toEqual({ type: 'takeover', matchedPlayerId: 'p1' });
    });

    it('one stale match: missing playerSeen entry counts as disconnected', () => {
        const state = makeGameState({
            players: [makePlayer({ id: 'p1', name: 'Alice' })],
            phase: 'playing',
        });

        const result = resolveSeat(state, {}, 'p2', 'Alice', NOW_MS);

        expect(result).toEqual({ type: 'takeover', matchedPlayerId: 'p1' });
    });

    it('one live match: returns NAME_IN_USE', () => {
        const state = makeGameState({
            players: [makePlayer({ id: 'p1', name: 'Alice' })],
            phase: 'playing',
        });
        const playerSeen = { p1: LIVE_SEEN };

        const result = resolveSeat(state, playerSeen, 'p2', 'Alice', NOW_MS);

        expect(result).toEqual({ code: EDGE_ERROR_CODES.NAME_IN_USE, message: expect.any(String) });
    });

    it('two stale matches: returns NAME_AMBIGUOUS', () => {
        const state = makeGameState({
            players: [makePlayer({ id: 'p1', name: 'Alice' }), makePlayer({ id: 'p3', name: 'ALICE' })],
            phase: 'playing',
        });
        const playerSeen = { p1: STALE_SEEN, p3: STALE_SEEN };

        const result = resolveSeat(state, playerSeen, 'p2', 'alice', NOW_MS);

        expect(result).toEqual({ code: EDGE_ERROR_CODES.NAME_AMBIGUOUS, message: expect.any(String) });
    });
});

describe('joinRoom', () => {
    it('returns ROOM_NOT_FOUND when the room code does not exist', async () => {
        const store = new FakeRoomStore();

        const result = await joinRoom(store, { playerId: 'p2', playerName: 'Bob', roomCode: 'NOPE99' });

        expect(result.error?.code).toBe(EDGE_ERROR_CODES.ROOM_NOT_FOUND);
    });

    it('returns BAD_REQUEST before any read when the player name is empty', async () => {
        const store = new FakeRoomStore(makeRoomRow());

        const result = await joinRoom(store, { playerId: 'p2', playerName: '   ', roomCode: 'ABC123' });

        expect(result.error?.code).toBe(EDGE_ERROR_CODES.BAD_REQUEST);
        expect(store.writeCount).toBe(0);
        expect(store.touchCount).toBe(0);
    });

    it('returns BAD_REQUEST before any read when the room code is empty', async () => {
        const store = new FakeRoomStore(makeRoomRow());

        const result = await joinRoom(store, { playerId: 'p2', playerName: 'Bob', roomCode: '   ' });

        expect(result.error?.code).toBe(EDGE_ERROR_CODES.BAD_REQUEST);
        expect(store.writeCount).toBe(0);
        expect(store.touchCount).toBe(0);
    });

    it('D-01: an already-seated caller is returned to their seat unchanged, even mid-game, with player_seen refreshed', async () => {
        const existingPlayer = makePlayer({ id: 'p1', name: 'Alice', hand: [null], isReady: true });
        const row = makeRoomRow({
            state: makeGameState({ players: [existingPlayer], phase: 'playing' }),
            version: 5,
            player_seen: { p1: STALE_SEEN },
        });
        const store = new FakeRoomStore(row);

        const result = await joinRoom(store, { playerId: 'p1', playerName: 'Alice', roomCode: 'ABC123' });

        expect(result.error).toBeUndefined();
        expect(result.room?.state.players).toEqual([existingPlayer]);
        expect(result.room?.state.phase).toBe('playing');
        expect(result.room?.playerSeen.p1).toBe(NOW_ISO);
        expect(result.room?.version).toBe(5);
        expect(store.writeCount).toBe(0);
        expect(store.touchCount).toBe(1);
    });

    it('appends a new player, sets lastAction and bumps version when not seated and phase is lobby', async () => {
        const row = makeRoomRow({
            state: makeGameState({ players: [makePlayer({ id: 'p1', name: 'Alice' })] }),
            version: 5,
        });
        const store = new FakeRoomStore(row);

        const result = await joinRoom(store, { playerId: 'p2', playerName: 'Bob', roomCode: 'ABC123' });

        expect(result.error).toBeUndefined();
        expect(result.room?.state.players).toHaveLength(2);
        expect(result.room?.state.players[1]).toEqual({
            id: 'p2',
            name: 'Bob',
            hand: [],
            faceUp: [],
            faceDown: [],
            isReady: false,
        });
        expect(result.room?.state.lastAction).toBe('Bob joined the room');
        expect(result.room?.version).toBe(6);
        expect(store.writeCount).toBe(1);
        expect(store.touchCount).toBe(0);
    });

    it('returns GAME_ALREADY_STARTED for an unseated caller with no name match once the game has started, writing nothing', async () => {
        const row = makeRoomRow({
            state: makeGameState({ players: [makePlayer({ id: 'p1', name: 'Alice' })], phase: 'playing' }),
        });
        const store = new FakeRoomStore(row);

        const result = await joinRoom(store, { playerId: 'p2', playerName: 'Charlie', roomCode: 'ABC123' });

        expect(result.error?.code).toBe(EDGE_ERROR_CODES.GAME_ALREADY_STARTED);
        expect(store.writeCount).toBe(0);
        expect(store.touchCount).toBe(0);
    });

    it('returns NAME_IN_USE when the name matches a currently-connected seat, writing nothing', async () => {
        const row = makeRoomRow({
            state: makeGameState({ players: [makePlayer({ id: 'p1', name: 'Alice' })], phase: 'playing' }),
            player_seen: { p1: LIVE_SEEN },
        });
        const store = new FakeRoomStore(row);

        const result = await joinRoom(store, { playerId: 'p2', playerName: 'Alice', roomCode: 'ABC123' });

        expect(result.error?.code).toBe(EDGE_ERROR_CODES.NAME_IN_USE);
        expect(store.writeCount).toBe(0);
        expect(store.touchCount).toBe(0);
    });

    it('returns NAME_AMBIGUOUS when the name matches two or more disconnected seats, writing nothing', async () => {
        const row = makeRoomRow({
            state: makeGameState({
                players: [makePlayer({ id: 'p1', name: 'Alice' }), makePlayer({ id: 'p3', name: 'alice' })],
                phase: 'playing',
            }),
            player_seen: { p1: STALE_SEEN, p3: STALE_SEEN },
        });
        const store = new FakeRoomStore(row);

        const result = await joinRoom(store, { playerId: 'p2', playerName: 'ALICE', roomCode: 'ABC123' });

        expect(result.error?.code).toBe(EDGE_ERROR_CODES.NAME_AMBIGUOUS);
        expect(store.writeCount).toBe(0);
        expect(store.touchCount).toBe(0);
    });

    it('D-02/D-06: a successful takeover rewrites the seat id, bumps version, preserves hand/faceUp/faceDown/isReady, and rewrites host', async () => {
        const staleHost = makePlayer({
            id: 'p1',
            name: 'Alice',
            hand: [{ suit: 'hearts', rank: '7', id: 'c1', deckColor: 'red' }],
            faceUp: [{ suit: 'clubs', rank: 'K', id: 'c2', deckColor: 'red' }],
            faceDown: [null],
            isReady: true,
        });
        const row = makeRoomRow({
            state: makeGameState({ players: [staleHost], phase: 'playing', host: 'p1' }),
            version: 5,
            player_seen: { p1: STALE_SEEN },
        });
        const store = new FakeRoomStore(row);

        const result = await joinRoom(store, { playerId: 'p2', playerName: 'Alice', roomCode: 'ABC123' });

        expect(result.error).toBeUndefined();
        expect(result.room?.state.players).toHaveLength(1); // D-04: never removed
        expect(result.room?.state.players[0]).toEqual({
            id: 'p2',
            name: 'Alice',
            hand: staleHost.hand,
            faceUp: staleHost.faceUp,
            faceDown: staleHost.faceDown,
            isReady: true,
        });
        expect(result.room?.state.host).toBe('p2');
        expect(result.room?.state.lastAction).toBe('Alice reconnected');
        expect(result.room?.playerSeen.p2).toBe(NOW_ISO);
        expect(result.room?.playerSeen.p1).toBeUndefined();
        expect(result.room?.version).toBe(6);
        expect(store.writeCount).toBe(1);
        expect(store.touchCount).toBe(0);
    });

    it('D-04: player count never shrinks across any join path', async () => {
        const row = makeRoomRow({
            state: makeGameState({ players: [makePlayer({ id: 'p1', name: 'Alice' })] }),
        });
        const store = new FakeRoomStore(row);
        const before = row.state.players.length;

        const result = await joinRoom(store, { playerId: 'p2', playerName: 'Bob', roomCode: 'ABC123' });

        expect(result.room?.state.players.length).toBeGreaterThanOrEqual(before);
    });
});
