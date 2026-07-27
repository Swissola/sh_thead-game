import { describe, it, expect } from 'vitest';
import { startGame } from '../../../supabase/functions/_shared/startGame';
import type { RoomStore, RoomUpdatePatch, MoveLogEntry } from '../../../supabase/functions/_shared/db';
import { EDGE_ERROR_CODES, type RoomRow } from '../../supabase/roomTypes';
import type { GameState } from '../../types';
import { buildGameState, buildPlayer } from '../testUtils/buildGameState';

function makeRoomRow(overrides: Partial<RoomRow> = {}): RoomRow {
    return {
        room_code: 'ABC123',
        state: buildGameState({ phase: 'lobby' }),
        version: 0,
        turn_started_at: '2026-07-26T00:00:00.000Z',
        player_seen: {},
        created_at: '2026-07-26T00:00:00.000Z',
        updated_at: '2026-07-26T00:00:00.000Z',
        ...overrides,
    };
}

/** In-memory fake so startGame is unit-tested without a Deno runtime or a live database. */
class FakeRoomStore implements RoomStore {
    rooms = new Map<string, RoomRow>();
    moves: MoveLogEntry[] = [];
    readCount = 0;
    writeCount = 0;
    nowValue = '2026-07-27T00:00:01.000Z';

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

function lobbyState(overrides: Partial<GameState> = {}): GameState {
    return buildGameState({
        phase: 'lobby',
        host: 'p0',
        players: [
            buildPlayer({ id: 'p0', name: 'Alice', hand: [], faceUp: [], faceDown: [] }),
            buildPlayer({ id: 'p1', name: 'Bob', hand: [], faceUp: [], faceDown: [] }),
        ],
        deck: [],
        ...overrides,
    });
}

describe('startGame', () => {
    it('rejects a non-host caller with NOT_HOST and does not modify the room', async () => {
        const store = new FakeRoomStore(makeRoomRow({ state: lobbyState() }));

        const result = await startGame(store, { playerId: 'p1', roomCode: 'ABC123' });

        expect(result.error?.code).toBe(EDGE_ERROR_CODES.NOT_HOST);
        expect(store.writeCount).toBe(0);
        expect(store.rooms.get('ABC123')?.state.phase).toBe('lobby');
    });

    it('rejects fewer than 2 players with NOT_ENOUGH_PLAYERS', async () => {
        const store = new FakeRoomStore(
            makeRoomRow({ state: lobbyState({ players: [buildPlayer({ id: 'p0', name: 'Alice' })] }) })
        );

        const result = await startGame(store, { playerId: 'p0', roomCode: 'ABC123' });

        expect(result.error?.code).toBe(EDGE_ERROR_CODES.NOT_ENOUGH_PLAYERS);
        expect(store.writeCount).toBe(0);
    });

    it('rejects a room whose phase is not lobby with GAME_ALREADY_STARTED', async () => {
        const store = new FakeRoomStore(makeRoomRow({ state: lobbyState({ phase: 'setup' }) }));

        const result = await startGame(store, { playerId: 'p0', roomCode: 'ABC123' });

        expect(result.error?.code).toBe(EDGE_ERROR_CODES.GAME_ALREADY_STARTED);
        expect(store.writeCount).toBe(0);
    });

    it('deals 3 hand, 3 faceUp and 3 faceDown cards to every player, unready, phase setup', async () => {
        const store = new FakeRoomStore(makeRoomRow({ state: lobbyState() }));

        const result = await startGame(store, { playerId: 'p0', roomCode: 'ABC123' });

        expect(result.error).toBeUndefined();
        const players = result.room!.state.players;
        expect(players).toHaveLength(2);
        for (const player of players) {
            expect(player.hand).toHaveLength(3);
            expect(player.faceUp).toHaveLength(3);
            expect(player.faceDown).toHaveLength(3);
            expect(player.isReady).toBe(false);
        }
        expect(result.room!.state.phase).toBe('setup');
        expect(result.room!.state.isFirstTurn).toBe(true);
    });

    it('deals ceil(playerCount / 4) decks with total cards conserved across players and deck', async () => {
        const fivePlayers = Array.from({ length: 5 }, (_, i) =>
            buildPlayer({ id: `p${i}`, name: `Player ${i}`, hand: [], faceUp: [], faceDown: [] })
        );
        const store = new FakeRoomStore(makeRoomRow({ state: lobbyState({ host: 'p0', players: fivePlayers }) }));

        const result = await startGame(store, { playerId: 'p0', roomCode: 'ABC123' });

        expect(result.error).toBeUndefined();
        const numDecks = Math.ceil(5 / 4);
        expect(numDecks).toBe(2);
        const state = result.room!.state;
        const dealtCount = state.players.reduce(
            (sum, p) => sum + p.hand.length + p.faceUp.length + p.faceDown.length,
            0
        );
        expect(dealtCount + state.deck.length).toBe(52 * numDecks);
        expect(state.lastAction).toBe(`Game started with ${numDecks} decks! Swap cards then ready up.`);
    });

    it('never deals the same card id in more than one place across all players and the deck', async () => {
        const store = new FakeRoomStore(makeRoomRow({ state: lobbyState() }));

        const result = await startGame(store, { playerId: 'p0', roomCode: 'ABC123' });

        expect(result.error).toBeUndefined();
        const state = result.room!.state;
        const allIds = [
            ...state.deck.map((c) => c.id),
            ...state.players.flatMap((p) => [
                ...p.hand.map((c) => c?.id),
                ...p.faceUp.map((c) => c?.id),
                ...p.faceDown.map((c) => c?.id),
            ]),
        ];
        const idSet = new Set(allIds);
        expect(idSet.size).toBe(allIds.length);
    });

    it('sets turn_started_at to store.now() on success', async () => {
        const store = new FakeRoomStore(makeRoomRow({ state: lobbyState(), turn_started_at: '2000-01-01T00:00:00.000Z' }));

        const result = await startGame(store, { playerId: 'p0', roomCode: 'ABC123' });

        expect(result.error).toBeUndefined();
        expect(result.room?.turnStartedAt).toBe(store.nowValue);
    });
});
