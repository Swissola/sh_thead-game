import { describe, it, expect } from 'vitest';
import { checkTurnTimeout } from '../../../supabase/functions/_shared/turnTimeout';
import type { RoomStore, RoomUpdatePatch, MoveLogEntry } from '../../../supabase/functions/_shared/db';
import { DISCONNECT_THRESHOLD_MS, EDGE_ERROR_CODES, TURN_GRACE_MS, type RoomRow } from '../../supabase/roomTypes';
import { ERROR_CODES } from '../../engine/errors';
import type { GameState } from '../../types';
import { buildGameState, buildPlayer, buildCard } from '../testUtils/buildGameState';

const TURN_STARTED_AT = '2026-07-27T00:00:00.000Z';

function makeRoomRow(overrides: Partial<RoomRow> = {}): RoomRow {
    return {
        room_code: 'ABC123',
        state: buildGameState(),
        version: 0,
        turn_started_at: TURN_STARTED_AT,
        player_seen: {},
        created_at: TURN_STARTED_AT,
        updated_at: TURN_STARTED_AT,
        ...overrides,
    };
}

/** In-memory fake so checkTurnTimeout is unit-tested without a Deno runtime or a live database. */
class FakeRoomStore implements RoomStore {
    rooms = new Map<string, RoomRow>();
    moves: MoveLogEntry[] = [];
    readCount = 0;
    writeCount = 0;
    nowValue: string;

    constructor(seed?: RoomRow, nowValue = TURN_STARTED_AT) {
        if (seed) this.rooms.set(seed.room_code, seed);
        this.nowValue = nowValue;
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

function playingState(overrides: Partial<GameState> = {}): GameState {
    return buildGameState({
        phase: 'playing',
        currentTurn: 0,
        players: [
            buildPlayer({
                id: 'p0',
                name: 'Alice',
                hand: [buildCard({ id: 'p0-hand-0', rank: '5' })],
                faceUp: [buildCard({ id: 'p0-faceup-0', rank: '9' })],
                faceDown: [buildCard({ id: 'p0-facedown-0', rank: 'K' })],
            }),
            buildPlayer({ id: 'p1', name: 'Bob', hand: [buildCard({ id: 'p1-hand-0', rank: '6' })] }),
        ],
        discardPile: [buildCard({ id: 'discard-1', rank: '3' })],
        ...overrides,
    });
}

/** ISO timestamp `ms` milliseconds after TURN_STARTED_AT. */
function afterMs(ms: number): string {
    return new Date(Date.parse(TURN_STARTED_AT) + ms).toISOString();
}

describe('checkTurnTimeout (D-05)', () => {
    it('returns TIMEOUT_NOT_ELAPSED and writes nothing when the grace period has not elapsed', async () => {
        const store = new FakeRoomStore(makeRoomRow({ state: playingState() }), afterMs(TURN_GRACE_MS - 1));

        const result = await checkTurnTimeout(store, { roomCode: 'ABC123' });

        expect(result.error?.code).toBe(EDGE_ERROR_CODES.TIMEOUT_NOT_ELAPSED);
        expect(store.writeCount).toBe(0);
    });

    it('computes elapsed time from store.now() against the stored turn_started_at, not a caller-supplied timestamp', async () => {
        const store = new FakeRoomStore(
            makeRoomRow({ state: playingState(), turn_started_at: TURN_STARTED_AT }),
            afterMs(TURN_GRACE_MS + 1)
        );

        const result = await checkTurnTimeout(store, { roomCode: 'ABC123' });

        expect(result.error).toBeUndefined();
        expect(store.writeCount).toBe(1);
    });

    it('applies PICK_UP_PILE on behalf of the current-turn player once the grace period has elapsed, advancing the turn', async () => {
        const store = new FakeRoomStore(makeRoomRow({ state: playingState() }), afterMs(TURN_GRACE_MS + 1));

        const result = await checkTurnTimeout(store, { roomCode: 'ABC123' });

        expect(result.error).toBeUndefined();
        // p0 (currentTurn 0) picked up; turn should have advanced away from p0.
        expect(result.room?.state.currentTurn).not.toBe(0);
        expect(result.room?.state.discardPile).toHaveLength(0);
        const p0 = result.room?.state.players.find((p) => p.id === 'p0');
        expect(p0?.hand.some((c) => c?.id === 'discard-1')).toBe(true);
    });

    it('returns TIMEOUT_NOT_ELAPSED and writes nothing when state.phase is not playing', async () => {
        const store = new FakeRoomStore(
            makeRoomRow({ state: playingState({ phase: 'lobby' }) }),
            afterMs(TURN_GRACE_MS + 1)
        );

        const result = await checkTurnTimeout(store, { roomCode: 'ABC123' });

        expect(result.error?.code).toBe(EDGE_ERROR_CODES.TIMEOUT_NOT_ELAPSED);
        expect(store.writeCount).toBe(0);
    });

    it('forwards the engine PILE_EMPTY error unchanged and writes nothing when the discard pile is empty', async () => {
        const store = new FakeRoomStore(
            makeRoomRow({ state: playingState({ discardPile: [] }) }),
            afterMs(TURN_GRACE_MS + 1)
        );

        const result = await checkTurnTimeout(store, { roomCode: 'ABC123' });

        expect(result.error?.code).toBe(ERROR_CODES.PILE_EMPTY);
        expect(store.writeCount).toBe(0);
    });

    it('D-04: the timed-out player keeps their seat, hand, faceUp and faceDown cards intact (plus the picked-up pile)', async () => {
        const state = playingState();
        const store = new FakeRoomStore(makeRoomRow({ state }), afterMs(TURN_GRACE_MS + 1));

        const result = await checkTurnTimeout(store, { roomCode: 'ABC123' });

        const original = state.players[0];
        const p0 = result.room?.state.players.find((p) => p.id === 'p0');
        expect(p0).toBeDefined();
        expect(p0?.faceUp).toEqual(original.faceUp);
        expect(p0?.faceDown).toEqual(original.faceDown);
        // Hand keeps the original card plus the picked-up pile card.
        expect(p0?.hand.some((c) => c?.id === 'p0-hand-0')).toBe(true);
        expect(p0?.hand.some((c) => c?.id === 'discard-1')).toBe(true);
    });

    it('resets turn_started_at to store.now() after a successful auto-pickup', async () => {
        const store = new FakeRoomStore(makeRoomRow({ state: playingState() }), afterMs(TURN_GRACE_MS + 1));

        const result = await checkTurnTimeout(store, { roomCode: 'ABC123' });

        expect(result.error).toBeUndefined();
        expect(result.room?.turnStartedAt).toBe(store.nowValue);
    });

    it('records the automatic pickup in lastAction, naming the player', async () => {
        const store = new FakeRoomStore(makeRoomRow({ state: playingState() }), afterMs(TURN_GRACE_MS + 1));

        const result = await checkTurnTimeout(store, { roomCode: 'ABC123' });

        expect(result.error).toBeUndefined();
        expect(result.room?.state.lastAction).toContain('Alice');
    });

    describe('connectivity gate (revised after 02-13 Task 3)', () => {
        it('returns TIMEOUT_NOT_ELAPSED and writes nothing when the turn timer has elapsed but the current-turn player is still connected', async () => {
            const now = afterMs(TURN_GRACE_MS + 1);
            const store = new FakeRoomStore(
                makeRoomRow({
                    state: playingState(),
                    player_seen: { p0: afterMs(TURN_GRACE_MS + 1 - DISCONNECT_THRESHOLD_MS + 1000) },
                }),
                now
            );

            const result = await checkTurnTimeout(store, { roomCode: 'ABC123' });

            expect(result.error?.code).toBe(EDGE_ERROR_CODES.TIMEOUT_NOT_ELAPSED);
            expect(store.writeCount).toBe(0);
        });

        it('picks up as normal once the turn timer has elapsed and the current-turn player is also stale by DISCONNECT_THRESHOLD_MS', async () => {
            const store = new FakeRoomStore(
                makeRoomRow({
                    state: playingState(),
                    player_seen: { p0: afterMs(TURN_GRACE_MS + 1 - DISCONNECT_THRESHOLD_MS - 1000) },
                }),
                afterMs(TURN_GRACE_MS + 1)
            );

            const result = await checkTurnTimeout(store, { roomCode: 'ABC123' });

            expect(result.error).toBeUndefined();
            expect(result.room?.state.currentTurn).not.toBe(0);
        });

        it('picks up as normal when the current-turn player has no player_seen entry at all - no evidence of connectivity to withhold the pickup for', async () => {
            const store = new FakeRoomStore(makeRoomRow({ state: playingState() }), afterMs(TURN_GRACE_MS + 1));

            const result = await checkTurnTimeout(store, { roomCode: 'ABC123' });

            expect(result.error).toBeUndefined();
            expect(store.writeCount).toBe(1);
        });

        it('withholding the pickup for a connected player does not touch turn_started_at, so the next sweep still sees the same elapsed time', async () => {
            const store = new FakeRoomStore(
                makeRoomRow({
                    state: playingState(),
                    player_seen: { p0: afterMs(TURN_GRACE_MS + 1) },
                }),
                afterMs(TURN_GRACE_MS + 1)
            );

            await checkTurnTimeout(store, { roomCode: 'ABC123' });

            expect(store.rooms.get('ABC123')?.turn_started_at).toBe(TURN_STARTED_AT);
        });

        it("a different player's stale player_seen entry does not affect the current-turn player's connectivity check", async () => {
            const store = new FakeRoomStore(
                makeRoomRow({
                    state: playingState(),
                    // p0 (currentTurn) is fresh; p1's staleness is irrelevant to p0's pickup.
                    player_seen: { p0: afterMs(TURN_GRACE_MS + 1), p1: afterMs(0) },
                }),
                afterMs(TURN_GRACE_MS + 1)
            );

            const result = await checkTurnTimeout(store, { roomCode: 'ABC123' });

            expect(result.error?.code).toBe(EDGE_ERROR_CODES.TIMEOUT_NOT_ELAPSED);
            expect(store.writeCount).toBe(0);
        });
    });
});
