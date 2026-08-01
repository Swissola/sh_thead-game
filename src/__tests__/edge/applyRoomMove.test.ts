import { describe, it, expect } from 'vitest';
import { applyRoomMove } from '../../../supabase/functions/_shared/applyRoomMove';
import {
    MAX_WRITE_ATTEMPTS,
    type RoomStore,
    type RoomUpdatePatch,
    type MoveLogEntry,
} from '../../../supabase/functions/_shared/db';
import { EDGE_ERROR_CODES, type RoomRow } from '../../supabase/roomTypes';
import { ERROR_CODES } from '../../engine/errors';
import type { GameState } from '../../types';
import { buildGameState, buildPlayer, buildCard } from '../testUtils/buildGameState';

function makeRoomRow(overrides: Partial<RoomRow> = {}): RoomRow {
    return {
        room_code: 'ABC123',
        state: buildGameState(),
        version: 0,
        turn_started_at: '2026-07-26T00:00:00.000Z',
        player_seen: {},
        created_at: '2026-07-26T00:00:00.000Z',
        updated_at: '2026-07-26T00:00:00.000Z',
        ...overrides,
    };
}

/** In-memory fake so applyRoomMove is unit-tested without a Deno runtime or a live database. */
class FakeRoomStore implements RoomStore {
    rooms = new Map<string, RoomRow>();
    moves: MoveLogEntry[] = [];
    readCount = 0;
    writeCount = 0;
    /** Number of leading updateRoom calls that report 0 affected rows before succeeding. */
    failWritesRemaining = 0;
    /** Counts touchPlayerSeen calls separately from writeCount - see class docstring. */
    touchCount = 0;
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
        if (this.failWritesRemaining > 0) {
            this.failWritesRemaining--;
            return 0;
        }
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

function playingState(overrides: Partial<GameState> = {}): GameState {
    return buildGameState({
        phase: 'playing',
        currentTurn: 0,
        players: [
            buildPlayer({ id: 'p0', name: 'Alice', hand: [buildCard({ id: 'p0-hand-0', rank: '5' })] }),
            buildPlayer({ id: 'p1', name: 'Bob', hand: [buildCard({ id: 'p1-hand-0', rank: '6' })] }),
        ],
        ...overrides,
    });
}

describe('applyRoomMove', () => {
    it('overrides a spoofed playerId with the caller identity, rejected NOT_YOUR_TURN', async () => {
        // p1 is not the current-turn player (p0 is), but claims to be p0 in the payload.
        const store = new FakeRoomStore(makeRoomRow({ state: playingState() }));

        const result = await applyRoomMove(store, {
            playerId: 'p1',
            roomCode: 'ABC123',
            move: { type: 'PLAY_CARDS', playerId: 'p0', cards: [{ type: 'hand', index: 0 }] },
        });

        expect(result.error?.code).toBe(ERROR_CODES.NOT_YOUR_TURN);
        expect(store.writeCount).toBe(0);
    });

    it('rejects a move whose type is outside the five-member union with BAD_REQUEST, untouched room', async () => {
        const store = new FakeRoomStore(makeRoomRow({ state: playingState() }));

        const result = await applyRoomMove(store, {
            playerId: 'p0',
            roomCode: 'ABC123',
            move: { type: 'DELETE_ROOM', playerId: 'p0' },
        });

        expect(result.error?.code).toBe(EDGE_ERROR_CODES.BAD_REQUEST);
        expect(store.readCount).toBe(0);
        expect(store.writeCount).toBe(0);
    });

    it('returns an applyMove engine error unchanged (code and message), performing no write', async () => {
        const store = new FakeRoomStore(makeRoomRow({ state: playingState({ phase: 'setup' }) }));

        const result = await applyRoomMove(store, {
            playerId: 'p0',
            roomCode: 'ABC123',
            move: { type: 'PLAY_CARDS', playerId: 'p0', cards: [{ type: 'hand', index: 0 }] },
        });

        expect(result.error?.code).toBe(ERROR_CODES.WRONG_PHASE);
        expect(result.error?.message).toBe('Cannot play cards outside playing phase');
        expect(store.writeCount).toBe(0);
    });

    it('increments version by exactly 1 and stores the engine-returned state on success', async () => {
        const store = new FakeRoomStore(makeRoomRow({ state: playingState({ phase: 'setup' }), version: 0 }));

        const result = await applyRoomMove(store, {
            playerId: 'p0',
            roomCode: 'ABC123',
            move: { type: 'READY_UP', playerId: 'p0' },
        });

        expect(result.error).toBeUndefined();
        expect(result.room?.version).toBe(1);
        expect(result.room?.state.players.find((p) => p.id === 'p0')?.isReady).toBe(true);
    });

    it('SET_TURN_TIMEOUT from the host in the lobby phase writes through withVersionRetry, incrementing version by exactly 1', async () => {
        const store = new FakeRoomStore(makeRoomRow({ state: buildGameState({ phase: 'lobby', host: 'p0' }) }));

        const result = await applyRoomMove(store, {
            playerId: 'p0',
            roomCode: 'ABC123',
            move: { type: 'SET_TURN_TIMEOUT', playerId: 'p0', timeoutMs: 120000 },
        });

        expect(result.error).toBeUndefined();
        expect(result.room?.state.turnTimeoutMs).toBe(120000);
        expect(result.room?.version).toBe(1);
        expect(store.writeCount).toBe(1);
    });

    it('SET_TURN_TIMEOUT from a non-host player is rejected HOST_ONLY, performing no write', async () => {
        const store = new FakeRoomStore(
            makeRoomRow({
                state: buildGameState({
                    phase: 'lobby',
                    host: 'p0',
                    players: [buildPlayer({ id: 'p0' }), buildPlayer({ id: 'p1' })],
                }),
            })
        );

        const result = await applyRoomMove(store, {
            playerId: 'p1',
            roomCode: 'ABC123',
            move: { type: 'SET_TURN_TIMEOUT', playerId: 'p1', timeoutMs: 120000 },
        });

        expect(result.error?.code).toBe(ERROR_CODES.HOST_ONLY);
        expect(store.writeCount).toBe(0);
    });

    it('sets turn_started_at on every successful move, including burn-and-go-again (currentTurn unchanged)', async () => {
        const state = playingState({
            phase: 'playing',
            currentTurn: 0,
            isFirstTurn: false,
            discardPile: [buildCard({ id: 'discard-5', rank: '5' })],
            players: [
                buildPlayer({ id: 'p0', name: 'Alice', hand: [buildCard({ id: 'p0-burn', rank: '10' })] }),
                buildPlayer({ id: 'p1', name: 'Bob', hand: [buildCard({ id: 'p1-hand-0', rank: '6' })] }),
            ],
        });
        const store = new FakeRoomStore(makeRoomRow({ state, turn_started_at: '2000-01-01T00:00:00.000Z' }));

        const result = await applyRoomMove(store, {
            playerId: 'p0',
            roomCode: 'ABC123',
            move: { type: 'PLAY_CARDS', playerId: 'p0', cards: [{ type: 'hand', index: 0 }] },
        });

        expect(result.error).toBeUndefined();
        // Burning a 10 leaves the same player's turn (burned ? playerIndex : ...).
        expect(result.room?.state.currentTurn).toBe(0);
        expect(result.room?.turnStartedAt).toBe(store.nowValue);
    });

    it('appends exactly one audit row with the caller id, applied move and resulting version', async () => {
        const store = new FakeRoomStore(makeRoomRow({ state: playingState({ phase: 'setup' }) }));

        await applyRoomMove(store, {
            playerId: 'p0',
            roomCode: 'ABC123',
            move: { type: 'READY_UP', playerId: 'p0' },
        });

        expect(store.moves).toHaveLength(1);
        expect(store.moves[0]).toEqual({
            room_code: 'ABC123',
            player_id: 'p0',
            move: { type: 'READY_UP', playerId: 'p0' },
            resulting_version: 1,
        });
    });

    it('retries the read/apply/write cycle on 0-affected-row writes, then CONFLICT after 3 attempts', async () => {
        const store = new FakeRoomStore(makeRoomRow({ state: playingState({ phase: 'setup' }) }));
        store.failWritesRemaining = MAX_WRITE_ATTEMPTS;

        const result = await applyRoomMove(store, {
            playerId: 'p0',
            roomCode: 'ABC123',
            move: { type: 'READY_UP', playerId: 'p0' },
        });

        expect(result.error?.code).toBe(EDGE_ERROR_CODES.CONFLICT);
        expect(store.readCount).toBe(MAX_WRITE_ATTEMPTS);
        expect(store.writeCount).toBe(MAX_WRITE_ATTEMPTS);
    });

    describe('cheating-client group', () => {
        it('(a) a PLAY_CARDS move carrying another player id is rejected with NOT_YOUR_TURN', async () => {
            const store = new FakeRoomStore(makeRoomRow({ state: playingState() }));

            const result = await applyRoomMove(store, {
                playerId: 'p1',
                roomCode: 'ABC123',
                move: { type: 'PLAY_CARDS', playerId: 'p0', cards: [{ type: 'hand', index: 0 }] },
            });

            expect(result.error?.code).toBe(ERROR_CODES.NOT_YOUR_TURN);
        });

        it('(b) a PICK_UP_PILE with revealedFaceDownIndex set while hand cards remain is rejected INVALID_SELECTION', async () => {
            const state = playingState({
                discardPile: [buildCard({ id: 'discard-1' })],
                players: [
                    buildPlayer({
                        id: 'p0',
                        name: 'Alice',
                        hand: [buildCard({ id: 'p0-hand-0' })],
                        faceDown: [buildCard({ id: 'p0-fd-0' })],
                    }),
                    buildPlayer({ id: 'p1', name: 'Bob' }),
                ],
            });
            const store = new FakeRoomStore(makeRoomRow({ state }));

            const result = await applyRoomMove(store, {
                playerId: 'p0',
                roomCode: 'ABC123',
                move: { type: 'PICK_UP_PILE', playerId: 'p0', revealedFaceDownIndex: 0 },
            });

            expect(result.error?.code).toBe(ERROR_CODES.INVALID_SELECTION);
        });

        it('(c) an unknown move type is rejected with BAD_REQUEST', async () => {
            const store = new FakeRoomStore(makeRoomRow({ state: playingState() }));

            const result = await applyRoomMove(store, {
                playerId: 'p0',
                roomCode: 'ABC123',
                move: { type: 'HACK_STATE', playerId: 'p0' },
            });

            expect(result.error?.code).toBe(EDGE_ERROR_CODES.BAD_REQUEST);
        });
    });
});
