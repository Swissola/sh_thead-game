import { describe, it, expect } from 'vitest';
import { checkTurnTimeout, selectAutoPlayMove } from '../../../supabase/functions/_shared/turnTimeout';
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
    /** Counts touchPlayerSeen calls separately from writeCount - see class docstring. */
    touchCount = 0;
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

    it('auto-picks-up once elapsed time passes a configured turnTimeoutMs lower than TURN_GRACE_MS, even though still under TURN_GRACE_MS', async () => {
        const store = new FakeRoomStore(
            makeRoomRow({ state: playingState({ turnTimeoutMs: 30000 }) }),
            afterMs(45000)
        );

        const result = await checkTurnTimeout(store, { roomCode: 'ABC123' });

        expect(result.error).toBeUndefined();
        expect(store.writeCount).toBe(1);
    });

    it('does not auto-pick-up once elapsed time passes TURN_GRACE_MS when a configured turnTimeoutMs is higher, proving the sweep no longer secretly uses 60s as a ceiling', async () => {
        const store = new FakeRoomStore(
            makeRoomRow({ state: playingState({ turnTimeoutMs: 120000 }) }),
            afterMs(90000)
        );

        const result = await checkTurnTimeout(store, { roomCode: 'ABC123' });

        expect(result.error?.code).toBe(EDGE_ERROR_CODES.TIMEOUT_NOT_ELAPSED);
        expect(store.writeCount).toBe(0);
    });

    it('falls back to TURN_GRACE_MS (60s) unchanged when the stored state has no turnTimeoutMs field at all (pre-existing room)', async () => {
        const legacyState = { ...playingState(), turnTimeoutMs: undefined as unknown as number };
        const notElapsedStore = new FakeRoomStore(
            makeRoomRow({ state: legacyState }),
            afterMs(TURN_GRACE_MS - 1)
        );

        const notElapsedResult = await checkTurnTimeout(notElapsedStore, { roomCode: 'ABC123' });

        expect(notElapsedResult.error?.code).toBe(EDGE_ERROR_CODES.TIMEOUT_NOT_ELAPSED);
        expect(notElapsedStore.writeCount).toBe(0);

        const elapsedStore = new FakeRoomStore(
            makeRoomRow({ state: legacyState }),
            afterMs(TURN_GRACE_MS + 1)
        );

        const elapsedResult = await checkTurnTimeout(elapsedStore, { roomCode: 'ABC123' });

        expect(elapsedResult.error).toBeUndefined();
        expect(elapsedStore.writeCount).toBe(1);
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

    it('D-05 gap closure: auto-plays the lowest card instead of forwarding PILE_EMPTY when the discard pile is empty and the player holds cards', async () => {
        // Superseded expectation: this used to assert the pre-fix stall
        // (PILE_EMPTY forwarded, zero writes). The empty-pile fallback in
        // 'checkTurnTimeout empty-pile fallback (D-05 gap closure)' below now
        // resolves this case instead - see that describe block for the full
        // selection-matrix and write-behaviour coverage.
        const store = new FakeRoomStore(
            makeRoomRow({ state: playingState({ discardPile: [] }) }),
            afterMs(TURN_GRACE_MS + 1)
        );

        const result = await checkTurnTimeout(store, { roomCode: 'ABC123' });

        expect(result.error).toBeUndefined();
        expect(store.writeCount).toBe(1);
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

/** playingState with an empty discard pile - the D-05 empty-pile fallback scenario. */
function emptyPileState(overrides: Partial<GameState> = {}): GameState {
    return playingState({ discardPile: [], ...overrides });
}

describe('selectAutoPlayMove (D-05 empty-pile fallback selection matrix)', () => {
    it('selects the lowest RANK_VALUES card from hand when hand cards are available', () => {
        const player = buildPlayer({
            id: 'p0',
            hand: [
                buildCard({ id: 'c-ace', rank: 'A' }),
                buildCard({ id: 'c-two', rank: '2' }),
                buildCard({ id: 'c-ten', rank: '10' }),
            ],
        });

        const move = selectAutoPlayMove(buildGameState(), player);

        expect(move).toEqual({ type: 'PLAY_CARDS', playerId: 'p0', cards: [{ type: 'hand', index: 1 }] });
    });

    it('compares on RANK_VALUES, not face order - a hand of A and K plays the K (the lower RANK_VALUES)', () => {
        const player = buildPlayer({
            id: 'p0',
            hand: [buildCard({ id: 'c-ace', rank: 'A' }), buildCard({ id: 'c-king', rank: 'K' })],
        });

        const move = selectAutoPlayMove(buildGameState(), player);

        expect(move).toEqual({ type: 'PLAY_CARDS', playerId: 'p0', cards: [{ type: 'hand', index: 1 }] });
    });

    it('ties on RANK_VALUES break to the lower array index', () => {
        const player = buildPlayer({
            id: 'p0',
            hand: [buildCard({ id: 'c-5a', rank: '5' }), buildCard({ id: 'c-5b', rank: '5' })],
        });

        const move = selectAutoPlayMove(buildGameState(), player);

        expect(move).toEqual({ type: 'PLAY_CARDS', playerId: 'p0', cards: [{ type: 'hand', index: 0 }] });
    });

    it('selects from faceUp when hand is empty, via GameLogic.getAvailableCardSource', () => {
        const player = buildPlayer({
            id: 'p0',
            hand: [],
            faceUp: [buildCard({ id: 'fu-9', rank: '9' }), buildCard({ id: 'fu-4', rank: '4' })],
        });

        const move = selectAutoPlayMove(buildGameState(), player);

        expect(move).toEqual({ type: 'PLAY_CARDS', playerId: 'p0', cards: [{ type: 'faceUp', index: 1 }] });
    });

    it('selects faceDown by lowest non-null index with no rank comparison - a lower-ranked card at a higher index is not chosen', () => {
        const player = buildPlayer({
            id: 'p0',
            hand: [],
            faceUp: [],
            faceDown: [
                buildCard({ id: 'fd-king', rank: 'K' }),
                buildCard({ id: 'fd-2', rank: '2' }),
                buildCard({ id: 'fd-3', rank: '3' }),
            ],
        });

        const move = selectAutoPlayMove(buildGameState(), player);

        expect(move).toEqual({ type: 'PLAY_CARDS', playerId: 'p0', cards: [{ type: 'faceDown', index: 0 }] });
    });

    it('faceDown selection skips null slots to find the lowest non-null index', () => {
        const player = buildPlayer({
            id: 'p0',
            hand: [],
            faceUp: [],
            faceDown: [null, null, buildCard({ id: 'fd-7', rank: '7' })],
        });

        const move = selectAutoPlayMove(buildGameState(), player);

        expect(move).toEqual({ type: 'PLAY_CARDS', playerId: 'p0', cards: [{ type: 'faceDown', index: 2 }] });
    });

    it('returns null when the resolved source (faceDown, by elimination) holds no non-null card', () => {
        const player = buildPlayer({ id: 'p0', hand: [], faceUp: [], faceDown: [null, null] });

        const move = selectAutoPlayMove(buildGameState(), player);

        expect(move).toBeNull();
    });

    it('on the first turn, restricts hand selection to the starting-card rank, even when a lower-RANK_VALUES card exists', () => {
        // Starting order checks red 4 before anything else - a plain 2 has a
        // lower RANK_VALUES but is not a legal opening card.
        const player = buildPlayer({
            id: 'p0',
            hand: [buildCard({ id: 'c-2', rank: '2', suit: '♠' }), buildCard({ id: 'c-4h', rank: '4', suit: '♥' })],
        });

        const move = selectAutoPlayMove(buildGameState({ isFirstTurn: true }), player);

        expect(move).toEqual({ type: 'PLAY_CARDS', playerId: 'p0', cards: [{ type: 'hand', index: 1 }] });
    });

    it('on the first turn, falls through to plain lowest-card selection when getStartingCard returns null', () => {
        // Neither '2' nor '3' is ever a legal starting rank - getStartingCard returns null.
        const player = buildPlayer({
            id: 'p0',
            hand: [buildCard({ id: 'c-3', rank: '3' }), buildCard({ id: 'c-2', rank: '2' })],
        });

        const move = selectAutoPlayMove(buildGameState({ isFirstTurn: true }), player);

        expect(move).toEqual({ type: 'PLAY_CARDS', playerId: 'p0', cards: [{ type: 'hand', index: 1 }] });
    });
});

describe('checkTurnTimeout empty-pile fallback (D-05 gap closure)', () => {
    it('auto-plays the lowest-RANK_VALUES hand card and advances the turn instead of returning PILE_EMPTY', async () => {
        const store = new FakeRoomStore(makeRoomRow({ state: emptyPileState() }), afterMs(TURN_GRACE_MS + 1));

        const result = await checkTurnTimeout(store, { roomCode: 'ABC123' });

        expect(result.error).toBeUndefined();
        expect(result.room?.state.currentTurn).not.toBe(0);
        const p0 = result.room?.state.players.find((p) => p.id === 'p0');
        // p0's hand was [5]; the 5 should have been played (no cards left in hand,
        // p0 has no faceUp so nothing was drawn from an empty deck).
        expect(p0?.hand.some((c) => c?.id === 'p0-hand-0')).toBe(false);
    });

    it('produces two different room versions across two consecutive sweeps of a stale, empty-pile room - the permanent-stall signature never repeats', async () => {
        const store = new FakeRoomStore(makeRoomRow({ state: emptyPileState() }), afterMs(TURN_GRACE_MS + 1));

        const first = await checkTurnTimeout(store, { roomCode: 'ABC123' });
        expect(first.error).toBeUndefined();
        const firstVersion = first.room?.version;

        // Second sweep after another grace period against the *new* current player.
        store.nowValue = afterMs(TURN_GRACE_MS + 1 + TURN_GRACE_MS + 1);
        const second = await checkTurnTimeout(store, { roomCode: 'ABC123' });

        expect(second.error).toBeUndefined();
        expect(second.room?.version).not.toBe(firstVersion);
    });

    it("the auto-play lastAction does not contain 'picked up', and the auto-pickup lastAction does not contain 'played automatically'", async () => {
        const autoPlayStore = new FakeRoomStore(makeRoomRow({ state: emptyPileState() }), afterMs(TURN_GRACE_MS + 1));
        const autoPlayResult = await checkTurnTimeout(autoPlayStore, { roomCode: 'ABC123' });
        expect(autoPlayResult.room?.state.lastAction).not.toContain('picked up');

        const pickupStore = new FakeRoomStore(makeRoomRow({ state: playingState() }), afterMs(TURN_GRACE_MS + 1));
        const pickupResult = await checkTurnTimeout(pickupStore, { roomCode: 'ABC123' });
        expect(pickupResult.room?.state.lastAction).not.toContain('played automatically');
    });

    it('resets turn_started_at to store.now() after a successful auto-play', async () => {
        const store = new FakeRoomStore(makeRoomRow({ state: emptyPileState() }), afterMs(TURN_GRACE_MS + 1));

        const result = await checkTurnTimeout(store, { roomCode: 'ABC123' });

        expect(result.error).toBeUndefined();
        expect(result.room?.turnStartedAt).toBe(store.nowValue);
    });

    it('takes the existing PICK_UP_PILE path unchanged when the pile is non-empty', async () => {
        const store = new FakeRoomStore(makeRoomRow({ state: playingState() }), afterMs(TURN_GRACE_MS + 1));

        const result = await checkTurnTimeout(store, { roomCode: 'ABC123' });

        expect(result.error).toBeUndefined();
        expect(result.room?.state.lastAction).toContain('picked up');
        expect(result.room?.state.discardPile).toHaveLength(0);
    });

    it('forwards PILE_EMPTY unwritten when the timed-out player holds no cards in any source', async () => {
        const state = emptyPileState({
            players: [
                buildPlayer({ id: 'p0', name: 'Alice', hand: [], faceUp: [], faceDown: [] }),
                buildPlayer({ id: 'p1', name: 'Bob', hand: [buildCard({ id: 'p1-hand-0', rank: '6' })] }),
            ],
        });
        const store = new FakeRoomStore(makeRoomRow({ state }), afterMs(TURN_GRACE_MS + 1));

        const result = await checkTurnTimeout(store, { roomCode: 'ABC123' });

        expect(result.error?.code).toBe(ERROR_CODES.PILE_EMPTY);
        expect(store.writeCount).toBe(0);
    });

    it('forwards the second applyMove rejection unwritten when the opening-turn player has no legal opening move (getStartingCard is null)', async () => {
        // isFirstTurn true, and neither '2' nor '3' is a legal starting rank -
        // getStartingCard returns null, selectAutoPlayMove falls through to a
        // plain lowest-card pick, and the engine's own FIRST_TURN_INVALID gate
        // rejects it.
        const state = emptyPileState({
            isFirstTurn: true,
            players: [
                buildPlayer({
                    id: 'p0',
                    name: 'Alice',
                    hand: [buildCard({ id: 'c-3', rank: '3' }), buildCard({ id: 'c-2', rank: '2' })],
                }),
                buildPlayer({ id: 'p1', name: 'Bob', hand: [buildCard({ id: 'p1-hand-0', rank: '6' })] }),
            ],
        });
        const store = new FakeRoomStore(makeRoomRow({ state }), afterMs(TURN_GRACE_MS + 1));

        const result = await checkTurnTimeout(store, { roomCode: 'ABC123' });

        expect(result.error?.code).toBe(ERROR_CODES.FIRST_TURN_INVALID);
        expect(store.writeCount).toBe(0);
    });

    it('a still-connected current-turn player returns TIMEOUT_NOT_ELAPSED with zero writes, even with an empty pile', async () => {
        const store = new FakeRoomStore(
            makeRoomRow({
                state: emptyPileState(),
                player_seen: { p0: afterMs(TURN_GRACE_MS + 1) },
            }),
            afterMs(TURN_GRACE_MS + 1)
        );

        const result = await checkTurnTimeout(store, { roomCode: 'ABC123' });

        expect(result.error?.code).toBe(EDGE_ERROR_CODES.TIMEOUT_NOT_ELAPSED);
        expect(store.writeCount).toBe(0);
    });
});
