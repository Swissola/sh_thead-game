import { describe, it, expect } from 'vitest';
import { applyMove } from '../../engine/applyMove';
import { ERROR_CODES } from '../../engine/errors';
import { buildGameState, buildPlayer, buildCard } from '../testUtils/buildGameState';
import * as GameLogic from '../../gameLogic';

/** Deep snapshot used to prove the input state object is never mutated (ENGINE-02/D-11). */
function snapshot<T>(value: T): T {
    return structuredClone(value);
}

describe('applyMove - READY_UP', () => {
    it('sets isReady true for the calling player only, leaving others and phase untouched', () => {
        const state = buildGameState({
            phase: 'setup',
            players: [
                buildPlayer({ id: 'p0', isReady: false }),
                buildPlayer({ id: 'p1', isReady: false }),
            ],
        });
        const before = snapshot(state);

        const result = applyMove(state, { type: 'READY_UP', playerId: 'p0' });

        expect(result.error).toBeUndefined();
        expect(result.state).not.toBe(state);
        expect(result.state.players).not.toBe(state.players);
        expect(result.state.players[0].isReady).toBe(true);
        expect(result.state.players[1].isReady).toBe(false);
        expect(result.state.phase).toBe('setup');
        expect(state).toEqual(before);
    });

    it('transitions phase to playing, sets currentTurn via getStartingPlayer, and sets isFirstTurn true once every player is ready', () => {
        const card4h = buildCard({ id: 'p1-4h', rank: '4', suit: '♥' });
        const state = buildGameState({
            phase: 'setup',
            players: [
                buildPlayer({ id: 'p0', isReady: true, hand: [buildCard({ id: 'p0-9s', rank: '9', suit: '♠' })] }),
                buildPlayer({ id: 'p1', isReady: false, hand: [card4h] }),
            ],
        });
        const before = snapshot(state);

        const result = applyMove(state, { type: 'READY_UP', playerId: 'p1' });

        expect(result.error).toBeUndefined();
        expect(result.state.players.every((p) => p.isReady)).toBe(true);
        expect(result.state.phase).toBe('playing');
        expect(result.state.isFirstTurn).toBe(true);
        const expectedStarter = GameLogic.getStartingPlayer(result.state.players);
        expect(result.state.currentTurn).toBe(expectedStarter);
        expect(state).toEqual(before);
    });

    it('rejects READY_UP for an unknown playerId and returns the original state reference unchanged', () => {
        const state = buildGameState({ phase: 'setup' });
        const before = snapshot(state);

        const result = applyMove(state, { type: 'READY_UP', playerId: 'not-a-player' });

        expect(result.error?.code).toBe(ERROR_CODES.UNKNOWN_PLAYER);
        expect(result.state).toBe(state);
        expect(state).toEqual(before);
    });

    it('rejects READY_UP when state.phase is not setup', () => {
        const state = buildGameState({ phase: 'playing' });
        const before = snapshot(state);

        const result = applyMove(state, { type: 'READY_UP', playerId: 'p0' });

        expect(result.error?.code).toBe(ERROR_CODES.WRONG_PHASE);
        expect(result.state).toBe(state);
        expect(state).toEqual(before);
    });
});

describe('applyMove - SWAP_CARDS', () => {
    it('swaps a hand card with a faceUp card and returns new hand/faceUp array references', () => {
        const handCard = buildCard({ id: 'hand-0', rank: '7', suit: '♣' });
        const faceUpCard = buildCard({ id: 'faceUp-0', rank: 'K', suit: '♦' });
        const state = buildGameState({
            phase: 'setup',
            players: [
                buildPlayer({ id: 'p0', hand: [handCard], faceUp: [faceUpCard] }),
                buildPlayer({ id: 'p1' }),
            ],
        });
        const before = snapshot(state);

        const result = applyMove(state, {
            type: 'SWAP_CARDS',
            playerId: 'p0',
            sourceA: 'hand',
            indexA: 0,
            sourceB: 'faceUp',
            indexB: 0,
        });

        expect(result.error).toBeUndefined();
        expect(result.state).not.toBe(state);
        expect(result.state.players).not.toBe(state.players);
        expect(result.state.players[0].hand).not.toBe(state.players[0].hand);
        expect(result.state.players[0].faceUp).not.toBe(state.players[0].faceUp);
        expect(result.state.players[0].hand[0]).toEqual(faceUpCard);
        expect(result.state.players[0].faceUp[0]).toEqual(handCard);
        expect(state).toEqual(before);
    });

    it('swaps two hand slots via one new hand array reference', () => {
        const cardA = buildCard({ id: 'hand-a', rank: '3', suit: '♠' });
        const cardB = buildCard({ id: 'hand-b', rank: '9', suit: '♥' });
        const state = buildGameState({
            phase: 'setup',
            players: [buildPlayer({ id: 'p0', hand: [cardA, cardB] }), buildPlayer({ id: 'p1' })],
        });
        const before = snapshot(state);

        const result = applyMove(state, {
            type: 'SWAP_CARDS',
            playerId: 'p0',
            sourceA: 'hand',
            indexA: 0,
            sourceB: 'hand',
            indexB: 1,
        });

        expect(result.error).toBeUndefined();
        expect(result.state.players[0].hand).not.toBe(state.players[0].hand);
        expect(result.state.players[0].hand[0]).toEqual(cardB);
        expect(result.state.players[0].hand[1]).toEqual(cardA);
        expect(state).toEqual(before);
    });

    it('swaps two faceUp slots via one new faceUp array reference', () => {
        const cardA = buildCard({ id: 'faceUp-a', rank: '3', suit: '♠' });
        const cardB = buildCard({ id: 'faceUp-b', rank: '9', suit: '♥' });
        const state = buildGameState({
            phase: 'setup',
            players: [buildPlayer({ id: 'p0', faceUp: [cardA, cardB] }), buildPlayer({ id: 'p1' })],
        });
        const before = snapshot(state);

        const result = applyMove(state, {
            type: 'SWAP_CARDS',
            playerId: 'p0',
            sourceA: 'faceUp',
            indexA: 0,
            sourceB: 'faceUp',
            indexB: 1,
        });

        expect(result.error).toBeUndefined();
        expect(result.state.players[0].faceUp).not.toBe(state.players[0].faceUp);
        expect(result.state.players[0].faceUp[0]).toEqual(cardB);
        expect(result.state.players[0].faceUp[1]).toEqual(cardA);
        expect(state).toEqual(before);
    });

    it('rejects SWAP_CARDS when state.phase is not setup', () => {
        const state = buildGameState({
            phase: 'playing',
            players: [
                buildPlayer({ id: 'p0', hand: [buildCard()], faceUp: [buildCard({ id: 'fu' })] }),
                buildPlayer({ id: 'p1' }),
            ],
        });
        const before = snapshot(state);

        const result = applyMove(state, {
            type: 'SWAP_CARDS',
            playerId: 'p0',
            sourceA: 'hand',
            indexA: 0,
            sourceB: 'faceUp',
            indexB: 0,
        });

        expect(result.error?.code).toBe(ERROR_CODES.WRONG_PHASE);
        expect(result.state).toBe(state);
        expect(state).toEqual(before);
    });

    it('rejects SWAP_CARDS when indexA is out of bounds', () => {
        const state = buildGameState({
            phase: 'setup',
            players: [
                buildPlayer({ id: 'p0', hand: [buildCard()], faceUp: [buildCard({ id: 'fu' })] }),
                buildPlayer({ id: 'p1' }),
            ],
        });
        const before = snapshot(state);

        const result = applyMove(state, {
            type: 'SWAP_CARDS',
            playerId: 'p0',
            sourceA: 'hand',
            indexA: 5,
            sourceB: 'faceUp',
            indexB: 0,
        });

        expect(result.error?.code).toBe(ERROR_CODES.INVALID_SELECTION);
        expect(result.state).toBe(state);
        expect(state).toEqual(before);
    });

    it('rejects SWAP_CARDS when the resolved slot is null', () => {
        const state = buildGameState({
            phase: 'setup',
            players: [
                buildPlayer({ id: 'p0', hand: [null], faceUp: [buildCard({ id: 'fu' })] }),
                buildPlayer({ id: 'p1' }),
            ],
        });
        const before = snapshot(state);

        const result = applyMove(state, {
            type: 'SWAP_CARDS',
            playerId: 'p0',
            sourceA: 'hand',
            indexA: 0,
            sourceB: 'faceUp',
            indexB: 0,
        });

        expect(result.error?.code).toBe(ERROR_CODES.INVALID_SELECTION);
        expect(result.state).toBe(state);
        expect(state).toEqual(before);
    });

    it('rejects SWAP_CARDS when sourceA is faceDown (unsupported for swapping)', () => {
        const state = buildGameState({
            phase: 'setup',
            players: [
                buildPlayer({ id: 'p0', hand: [buildCard()], faceDown: [buildCard({ id: 'fd' })] }),
                buildPlayer({ id: 'p1' }),
            ],
        });
        const before = snapshot(state);

        const result = applyMove(state, {
            type: 'SWAP_CARDS',
            playerId: 'p0',
            sourceA: 'faceDown',
            indexA: 0,
            sourceB: 'hand',
            indexB: 0,
        });

        expect(result.error?.code).toBe(ERROR_CODES.INVALID_SELECTION);
        expect(result.state).toBe(state);
        expect(state).toEqual(before);
    });

    it('rejects SWAP_CARDS for an unknown playerId', () => {
        const state = buildGameState({ phase: 'setup' });
        const before = snapshot(state);

        const result = applyMove(state, {
            type: 'SWAP_CARDS',
            playerId: 'ghost',
            sourceA: 'hand',
            indexA: 0,
            sourceB: 'faceUp',
            indexB: 0,
        });

        expect(result.error?.code).toBe(ERROR_CODES.UNKNOWN_PLAYER);
        expect(result.state).toBe(state);
        expect(state).toEqual(before);
    });
});

describe('applyMove - PICK_UP_PILE', () => {
    it('moves every discardPile card into the caller hand, clears discardPile, and advances currentTurn', () => {
        const discard1 = buildCard({ id: 'discard-1', rank: '7', suit: '♣' });
        const discard2 = buildCard({ id: 'discard-2', rank: '9', suit: '♦' });
        const p0Hand = buildCard({ id: 'p0-hand-0' });
        const state = buildGameState({
            phase: 'playing',
            currentTurn: 0,
            discardPile: [discard1, discard2],
            players: [
                buildPlayer({ id: 'p0', hand: [p0Hand] }),
                buildPlayer({ id: 'p1', hand: [buildCard({ id: 'p1-hand-0' })] }),
            ],
        });
        const before = snapshot(state);

        const result = applyMove(state, { type: 'PICK_UP_PILE', playerId: 'p0' });

        expect(result.error).toBeUndefined();
        expect(result.state).not.toBe(state);
        expect(result.state.players).not.toBe(state.players);
        expect(result.state.players[0].hand).not.toBe(state.players[0].hand);
        expect(result.state.discardPile).toEqual([]);
        expect(result.state.players[0].hand).toEqual([p0Hand, discard1, discard2]);
        const expectedNextTurn = GameLogic.getNextPlayer(0, result.state.players);
        expect(result.state.currentTurn).toBe(expectedNextTurn);
        expect(state).toEqual(before);
    });

    it('unshifts the revealed face-down card into the pickup and nulls it out of faceDown when revealedFaceDownIndex is set', () => {
        const discard1 = buildCard({ id: 'discard-1', rank: '7', suit: '♣' });
        const faceDownCard = buildCard({ id: 'facedown-0', rank: 'Q', suit: '♠' });
        const p0Hand = buildCard({ id: 'p0-hand-0' });
        const state = buildGameState({
            phase: 'playing',
            currentTurn: 0,
            discardPile: [discard1],
            players: [
                buildPlayer({ id: 'p0', hand: [p0Hand], faceDown: [faceDownCard] }),
                buildPlayer({ id: 'p1' }),
            ],
        });
        const before = snapshot(state);

        const result = applyMove(state, {
            type: 'PICK_UP_PILE',
            playerId: 'p0',
            revealedFaceDownIndex: 0,
        });

        expect(result.error).toBeUndefined();
        expect(result.state.players[0].faceDown).not.toBe(state.players[0].faceDown);
        expect(result.state.players[0].faceDown[0]).toBeNull();
        expect(result.state.players[0].hand).toEqual([p0Hand, faceDownCard, discard1]);
        expect(state).toEqual(before);
    });

    it('rejects PICK_UP_PILE when discardPile is empty', () => {
        const state = buildGameState({ phase: 'playing', currentTurn: 0, discardPile: [] });
        const before = snapshot(state);

        const result = applyMove(state, { type: 'PICK_UP_PILE', playerId: state.players[0].id });

        expect(result.error?.code).toBe(ERROR_CODES.PILE_EMPTY);
        expect(result.state).toBe(state);
        expect(state).toEqual(before);
    });

    it('rejects PICK_UP_PILE when playerId does not match state.currentTurn player', () => {
        const state = buildGameState({
            phase: 'playing',
            currentTurn: 0,
            discardPile: [buildCard({ id: 'discard-1' })],
        });
        const before = snapshot(state);

        const result = applyMove(state, { type: 'PICK_UP_PILE', playerId: state.players[1].id });

        expect(result.error?.code).toBe(ERROR_CODES.NOT_YOUR_TURN);
        expect(result.state).toBe(state);
        expect(state).toEqual(before);
    });

    it('rejects PICK_UP_PILE when state.phase is not playing', () => {
        const state = buildGameState({
            phase: 'setup',
            currentTurn: 0,
            discardPile: [buildCard({ id: 'discard-1' })],
        });
        const before = snapshot(state);

        const result = applyMove(state, { type: 'PICK_UP_PILE', playerId: state.players[0].id });

        expect(result.error?.code).toBe(ERROR_CODES.WRONG_PHASE);
        expect(result.state).toBe(state);
        expect(state).toEqual(before);
    });

    it('rejects PICK_UP_PILE for an unknown playerId', () => {
        const state = buildGameState({
            phase: 'playing',
            currentTurn: 0,
            discardPile: [buildCard({ id: 'discard-1' })],
        });
        const before = snapshot(state);

        const result = applyMove(state, { type: 'PICK_UP_PILE', playerId: 'ghost' });

        expect(result.error?.code).toBe(ERROR_CODES.UNKNOWN_PLAYER);
        expect(result.state).toBe(state);
        expect(state).toEqual(before);
    });
});
