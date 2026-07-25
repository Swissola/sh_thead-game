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

describe('applyMove - PLAY_CARDS', () => {
    it('plays a single card from hand: removes it, adds to discardPile, advances currentTurn', () => {
        const played = buildCard({ id: 'hand-6s', rank: '6', suit: '♠' });
        const discardCard = buildCard({ id: 'discard-5h', rank: '5', suit: '♥' });
        const state = buildGameState({
            phase: 'playing',
            currentTurn: 0,
            discardPile: [discardCard],
            players: [
                buildPlayer({ id: 'p0', hand: [played] }),
                buildPlayer({ id: 'p1', hand: [buildCard({ id: 'p1-hand-0' })] }),
            ],
        });
        const before = snapshot(state);

        const result = applyMove(state, {
            type: 'PLAY_CARDS',
            playerId: 'p0',
            cards: [{ type: 'hand', index: 0 }],
        });

        expect(result.error).toBeUndefined();
        expect(result.state).not.toBe(state);
        expect(result.state.players).not.toBe(state.players);
        expect(result.state.players[0].hand).not.toBe(state.players[0].hand);
        expect(result.state.players[0].hand[0]).toBeNull();
        expect(result.state.discardPile).toEqual([discardCard, played]);
        const expectedNextTurn = GameLogic.getNextPlayer(0, result.state.players);
        expect(result.state.currentTurn).toBe(expectedNextTurn);
        expect(state).toEqual(before);
    });

    it('plays multiple same-rank cards from hand: removes all, advances currentTurn', () => {
        const cardA = buildCard({ id: 'hand-7s', rank: '7', suit: '♠' });
        const cardB = buildCard({ id: 'hand-7h', rank: '7', suit: '♥' });
        const extra = buildCard({ id: 'hand-9c', rank: '9', suit: '♣' });
        const discardCard = buildCard({ id: 'discard-5h', rank: '5', suit: '♥' });
        const state = buildGameState({
            phase: 'playing',
            currentTurn: 0,
            discardPile: [discardCard],
            players: [
                buildPlayer({ id: 'p0', hand: [cardA, cardB, extra] }),
                buildPlayer({ id: 'p1' }),
            ],
        });
        const before = snapshot(state);

        const result = applyMove(state, {
            type: 'PLAY_CARDS',
            playerId: 'p0',
            cards: [
                { type: 'hand', index: 0 },
                { type: 'hand', index: 1 },
            ],
        });

        expect(result.error).toBeUndefined();
        expect(result.state.players[0].hand).not.toBe(state.players[0].hand);
        expect(result.state.players[0].hand).toEqual([null, null, extra]);
        expect(result.state.discardPile).toEqual([discardCard, cardA, cardB]);
        const expectedNextTurn = GameLogic.getNextPlayer(0, result.state.players);
        expect(result.state.currentTurn).toBe(expectedNextTurn);
        expect(state).toEqual(before);
    });

    it('burns the pile via a 10: pile moves to burnPile, discardPile clears, turn does not advance', () => {
        const burnCard = buildCard({ id: 'hand-10s', rank: '10', suit: '♠' });
        const discardCard = buildCard({ id: 'discard-5h', rank: '5', suit: '♥' });
        const state = buildGameState({
            phase: 'playing',
            currentTurn: 0,
            discardPile: [discardCard],
            burnPile: [],
            players: [
                buildPlayer({ id: 'p0', hand: [burnCard] }),
                buildPlayer({ id: 'p1' }),
            ],
        });
        const before = snapshot(state);

        const result = applyMove(state, {
            type: 'PLAY_CARDS',
            playerId: 'p0',
            cards: [{ type: 'hand', index: 0 }],
        });

        expect(result.error).toBeUndefined();
        expect(result.state.discardPile).toEqual([]);
        expect(result.state.burnPile).toEqual([discardCard, burnCard]);
        expect(result.state.currentTurn).toBe(0);
        expect(state).toEqual(before);
    });

    it('burns the pile via four-of-a-kind (non-10 rank): pile moves to burnPile, turn does not advance', () => {
        const c1 = buildCard({ id: 'discard-5a', rank: '5', suit: '♠' });
        const c2 = buildCard({ id: 'discard-5b', rank: '5', suit: '♥' });
        const c3 = buildCard({ id: 'discard-5c', rank: '5', suit: '♣' });
        const c4 = buildCard({ id: 'hand-5d', rank: '5', suit: '♦' });
        const state = buildGameState({
            phase: 'playing',
            currentTurn: 0,
            discardPile: [c1, c2, c3],
            burnPile: [],
            players: [
                buildPlayer({ id: 'p0', hand: [c4] }),
                buildPlayer({ id: 'p1' }),
            ],
        });
        const before = snapshot(state);

        const result = applyMove(state, {
            type: 'PLAY_CARDS',
            playerId: 'p0',
            cards: [{ type: 'hand', index: 0 }],
        });

        expect(result.error).toBeUndefined();
        expect(result.state.discardPile).toEqual([]);
        expect(result.state.burnPile).toEqual([c1, c2, c3, c4]);
        expect(result.state.currentTurn).toBe(0);
        expect(state).toEqual(before);
    });

    it('draws up to 3 cards filling null slots then extending, when hand is fully empty and deck has cards', () => {
        const played = buildCard({ id: 'hand-6s', rank: '6', suit: '♠' });
        const faceUpCard = buildCard({ id: 'faceup-9h', rank: '9', suit: '♥' });
        const discardCard = buildCard({ id: 'discard-5h', rank: '5', suit: '♥' });
        const deckCards = [
            buildCard({ id: 'deck-0' }),
            buildCard({ id: 'deck-1' }),
            buildCard({ id: 'deck-2' }),
            buildCard({ id: 'deck-3' }),
            buildCard({ id: 'deck-4' }),
        ];
        const state = buildGameState({
            phase: 'playing',
            currentTurn: 0,
            discardPile: [discardCard],
            deck: deckCards,
            players: [
                buildPlayer({ id: 'p0', hand: [played], faceUp: [faceUpCard] }),
                buildPlayer({ id: 'p1' }),
            ],
        });
        const before = snapshot(state);

        const result = applyMove(state, {
            type: 'PLAY_CARDS',
            playerId: 'p0',
            cards: [{ type: 'hand', index: 0 }],
        });

        expect(result.error).toBeUndefined();
        expect(result.state.players[0].hand).toEqual([deckCards[0], deckCards[1], deckCards[2]]);
        expect(result.state.deck).toEqual([deckCards[3], deckCards[4]]);
        expect(state).toEqual(before);
    });

    it('wins and finishes the game when the second-to-last player empties hand/faceUp/faceDown', () => {
        const played = buildCard({ id: 'hand-6s', rank: '6', suit: '♠' });
        const discardCard = buildCard({ id: 'discard-5h', rank: '5', suit: '♥' });
        const state = buildGameState({
            phase: 'playing',
            currentTurn: 0,
            discardPile: [discardCard],
            deck: [],
            players: [
                buildPlayer({ id: 'p0', hand: [played], faceUp: [], faceDown: [] }),
                buildPlayer({ id: 'p1', hand: [buildCard({ id: 'p1-hand-0' })] }),
            ],
        });
        const before = snapshot(state);

        const result = applyMove(state, {
            type: 'PLAY_CARDS',
            playerId: 'p0',
            cards: [{ type: 'hand', index: 0 }],
        });

        expect(result.error).toBeUndefined();
        expect(result.state.players[0].hand.filter((c) => c !== null)).toEqual([]);
        expect(result.state.phase).toBe('finished');
        expect(state).toEqual(before);
    });

    it('blind face-down play, valid: resolves via player.faceDown, plays it, advances turn', () => {
        const faceDownCard = buildCard({ id: 'facedown-6h', rank: '6', suit: '♥' });
        const otherFaceDownCard = buildCard({ id: 'facedown-2c', rank: '2', suit: '♣' });
        const discardCard = buildCard({ id: 'discard-4c', rank: '4', suit: '♣' });
        const state = buildGameState({
            phase: 'playing',
            currentTurn: 0,
            discardPile: [discardCard],
            deck: [],
            players: [
                // hand and faceUp must both be empty (source === 'faceDown', CR-01)
                // for a faceDown selection to be legal. A second faceDown card is kept
                // so this player hasn't won after playing index 0 (keeps the assertions
                // below focused on the blind-play resolution, not a win side effect).
                buildPlayer({ id: 'p0', hand: [], faceUp: [], faceDown: [faceDownCard, otherFaceDownCard] }),
                buildPlayer({ id: 'p1' }),
            ],
        });
        const before = snapshot(state);

        const result = applyMove(state, {
            type: 'PLAY_CARDS',
            playerId: 'p0',
            cards: [{ type: 'faceDown', index: 0 }],
        });

        expect(result.error).toBeUndefined();
        expect(result.state.players[0].faceDown).not.toBe(state.players[0].faceDown);
        expect(result.state.players[0].faceDown[0]).toBeNull();
        expect(result.state.discardPile).toEqual([discardCard, faceDownCard]);
        const expectedNextTurn = GameLogic.getNextPlayer(0, result.state.players);
        expect(result.state.currentTurn).toBe(expectedNextTurn);
        expect(state).toEqual(before);
    });

    it('blind face-down play, invalid: hand receives the card plus entire former discardPile, no error', () => {
        const faceDownCard = buildCard({ id: 'facedown-5c', rank: '5', suit: '♣' });
        const topCard = buildCard({ id: 'discard-king', rank: 'K', suit: '♠' });
        const state = buildGameState({
            phase: 'playing',
            currentTurn: 0,
            discardPile: [topCard],
            deck: [],
            players: [
                // hand and faceUp must both be empty (source === 'faceDown', CR-01)
                // for a faceDown selection to be legal.
                buildPlayer({ id: 'p0', hand: [], faceUp: [], faceDown: [faceDownCard] }),
                buildPlayer({ id: 'p1' }),
            ],
        });
        const before = snapshot(state);

        const result = applyMove(state, {
            type: 'PLAY_CARDS',
            playerId: 'p0',
            cards: [{ type: 'faceDown', index: 0 }],
        });

        expect(result.error).toBeUndefined();
        expect(result.state.players[0].hand).toEqual([faceDownCard, topCard]);
        expect(result.state.players[0].faceDown).toEqual([null]);
        expect(result.state.discardPile).toEqual([]);
        const expectedNextTurn = GameLogic.getNextPlayer(0, result.state.players);
        expect(result.state.currentTurn).toBe(expectedNextTurn);
        expect(state).toEqual(before);
    });

    it('rejects INVALID_SELECTION for a faceDown selection while the player still holds hand cards (CR-01)', () => {
        const handCard = buildCard({ id: 'p0-hand-0', rank: '9', suit: '♦' });
        const faceDownCard = buildCard({ id: 'facedown-5c', rank: '5', suit: '♣' });
        const state = buildGameState({
            phase: 'playing',
            currentTurn: 0,
            discardPile: [buildCard({ id: 'discard-king', rank: 'K', suit: '♠' })],
            deck: [],
            players: [
                buildPlayer({ id: 'p0', hand: [handCard], faceUp: [], faceDown: [faceDownCard] }),
                buildPlayer({ id: 'p1' }),
            ],
        });
        const before = snapshot(state);

        const result = applyMove(state, {
            type: 'PLAY_CARDS',
            playerId: 'p0',
            cards: [{ type: 'faceDown', index: 0 }],
        });

        expect(result.error).toEqual({ code: ERROR_CODES.INVALID_SELECTION, message: 'You must play from your hand cards first' });
        expect(result.state).toBe(state);
        expect(state).toEqual(before);
    });

    it('rejects INVALID_SELECTION for a pure faceUp selection while the player still holds hand cards (CR-01)', () => {
        const handCard = buildCard({ id: 'p0-hand-0', rank: '9', suit: '♦' });
        const faceUpCard = buildCard({ id: 'faceup-9h', rank: '9', suit: '♥' });
        const state = buildGameState({
            phase: 'playing',
            currentTurn: 0,
            discardPile: [buildCard({ id: 'discard-king', rank: 'K', suit: '♠' })],
            deck: [],
            players: [
                buildPlayer({ id: 'p0', hand: [handCard], faceUp: [faceUpCard], faceDown: [] }),
                buildPlayer({ id: 'p1' }),
            ],
        });
        const before = snapshot(state);

        const result = applyMove(state, {
            type: 'PLAY_CARDS',
            playerId: 'p0',
            cards: [{ type: 'faceUp', index: 0 }],
        });

        expect(result.error).toEqual({ code: ERROR_CODES.INVALID_SELECTION, message: 'You must play from your hand cards first' });
        expect(result.state).toBe(state);
        expect(state).toEqual(before);
    });

    it('plays a mixed hand+faceUp selection when deck is empty and combination is valid', () => {
        const handCard = buildCard({ id: 'hand-6s', rank: '6', suit: '♠' });
        const extraHandCard = buildCard({ id: 'hand-9c', rank: '9', suit: '♣' });
        const faceUpCard = buildCard({ id: 'faceup-6h', rank: '6', suit: '♥' });
        const discardCard = buildCard({ id: 'discard-5h', rank: '5', suit: '♥' });
        const state = buildGameState({
            phase: 'playing',
            currentTurn: 0,
            discardPile: [discardCard],
            deck: [],
            players: [
                buildPlayer({ id: 'p0', hand: [handCard, extraHandCard], faceUp: [faceUpCard] }),
                buildPlayer({ id: 'p1' }),
            ],
        });
        const before = snapshot(state);

        const result = applyMove(state, {
            type: 'PLAY_CARDS',
            playerId: 'p0',
            cards: [
                { type: 'hand', index: 0 },
                { type: 'faceUp', index: 0 },
            ],
        });

        expect(result.error).toBeUndefined();
        expect(result.state.players[0].hand).toEqual([null, extraHandCard]);
        expect(result.state.players[0].faceUp).toEqual([null]);
        expect(result.state.discardPile).toEqual([discardCard, handCard, faceUpCard]);
        expect(state).toEqual(before);
    });

    it('rejects INVALID_COMBINATION for a mixed hand+faceUp selection when deck.length > 0', () => {
        const handCard = buildCard({ id: 'hand-6s', rank: '6', suit: '♠' });
        const faceUpCard = buildCard({ id: 'faceup-6h', rank: '6', suit: '♥' });
        const discardCard = buildCard({ id: 'discard-5h', rank: '5', suit: '♥' });
        const state = buildGameState({
            phase: 'playing',
            currentTurn: 0,
            discardPile: [discardCard],
            deck: [buildCard({ id: 'deck-0' })],
            players: [
                buildPlayer({ id: 'p0', hand: [handCard], faceUp: [faceUpCard] }),
                buildPlayer({ id: 'p1' }),
            ],
        });
        const before = snapshot(state);

        const result = applyMove(state, {
            type: 'PLAY_CARDS',
            playerId: 'p0',
            cards: [
                { type: 'hand', index: 0 },
                { type: 'faceUp', index: 0 },
            ],
        });

        expect(result.error?.code).toBe(ERROR_CODES.INVALID_COMBINATION);
        expect(result.state).toBe(state);
        expect(state).toEqual(before);
    });

    it('rejects INVALID_COMBINATION for a mixed selection when cardSource is not hand', () => {
        const faceUpCard = buildCard({ id: 'faceup-6h', rank: '6', suit: '♥' });
        const discardCard = buildCard({ id: 'discard-5h', rank: '5', suit: '♥' });
        const state = buildGameState({
            phase: 'playing',
            currentTurn: 0,
            discardPile: [discardCard],
            deck: [],
            players: [
                buildPlayer({ id: 'p0', hand: [null], faceUp: [faceUpCard] }),
                buildPlayer({ id: 'p1' }),
            ],
        });
        const before = snapshot(state);

        const result = applyMove(state, {
            type: 'PLAY_CARDS',
            playerId: 'p0',
            cards: [
                { type: 'hand', index: 0 },
                { type: 'faceUp', index: 0 },
            ],
        });

        expect(result.error?.code).toBe(ERROR_CODES.INVALID_COMBINATION);
        expect(result.state).toBe(state);
        expect(state).toEqual(before);
    });

    it('rejects FIRST_TURN_INVALID when a selected card rank does not match the starting card', () => {
        const fourHeart = buildCard({ id: 'p0-4h', rank: '4', suit: '♥' });
        const nineSpade = buildCard({ id: 'p0-9s', rank: '9', suit: '♠' });
        const state = buildGameState({
            phase: 'playing',
            currentTurn: 0,
            discardPile: [],
            isFirstTurn: true,
            players: [
                buildPlayer({ id: 'p0', hand: [fourHeart, nineSpade] }),
                buildPlayer({ id: 'p1' }),
            ],
        });
        const before = snapshot(state);

        const result = applyMove(state, {
            type: 'PLAY_CARDS',
            playerId: 'p0',
            cards: [{ type: 'hand', index: 1 }],
        });

        expect(result.error?.code).toBe(ERROR_CODES.FIRST_TURN_INVALID);
        expect(result.state).toBe(state);
        expect(state).toEqual(before);
    });

    it('accepts a first-turn play when the selected card rank matches the starting card', () => {
        const fourHeart = buildCard({ id: 'p0-4h', rank: '4', suit: '♥' });
        const nineSpade = buildCard({ id: 'p0-9s', rank: '9', suit: '♠' });
        const state = buildGameState({
            phase: 'playing',
            currentTurn: 0,
            discardPile: [],
            deck: [],
            isFirstTurn: true,
            players: [
                buildPlayer({ id: 'p0', hand: [fourHeart, nineSpade] }),
                buildPlayer({ id: 'p1' }),
            ],
        });
        const before = snapshot(state);

        const result = applyMove(state, {
            type: 'PLAY_CARDS',
            playerId: 'p0',
            cards: [{ type: 'hand', index: 0 }],
        });

        expect(result.error).toBeUndefined();
        expect(result.state.isFirstTurn).toBe(false);
        expect(result.state.discardPile).toEqual([fourHeart]);
        expect(state).toEqual(before);
    });

    it('uses move.reorderedHand as the effective hand for index resolution and mutation', () => {
        const cardA = buildCard({ id: 'hand-a', rank: '6', suit: '♠' });
        const cardB = buildCard({ id: 'hand-b', rank: '7', suit: '♥' });
        const discardCard = buildCard({ id: 'discard-5h', rank: '5', suit: '♥' });
        const state = buildGameState({
            phase: 'playing',
            currentTurn: 0,
            discardPile: [discardCard],
            deck: [],
            players: [
                buildPlayer({ id: 'p0', hand: [cardA, cardB] }),
                buildPlayer({ id: 'p1' }),
            ],
        });
        const before = snapshot(state);

        const result = applyMove(state, {
            type: 'PLAY_CARDS',
            playerId: 'p0',
            cards: [{ type: 'hand', index: 0 }],
            reorderedHand: [cardB, cardA],
        });

        expect(result.error).toBeUndefined();
        expect(result.state.players[0].hand).toEqual([null, cardA]);
        expect(result.state.discardPile).toEqual([discardCard, cardB]);
        expect(state).toEqual(before);
    });

    it('rejects NOT_YOUR_TURN when playerId does not match state.currentTurn player', () => {
        const state = buildGameState({
            phase: 'playing',
            currentTurn: 0,
            players: [
                buildPlayer({ id: 'p0', hand: [buildCard({ id: 'p0-hand-0' })] }),
                buildPlayer({ id: 'p1', hand: [buildCard({ id: 'p1-hand-0' })] }),
            ],
        });
        const before = snapshot(state);

        const result = applyMove(state, {
            type: 'PLAY_CARDS',
            playerId: 'p1',
            cards: [{ type: 'hand', index: 0 }],
        });

        expect(result.error?.code).toBe(ERROR_CODES.NOT_YOUR_TURN);
        expect(result.state).toBe(state);
        expect(state).toEqual(before);
    });

    it('rejects WRONG_PHASE when state.phase is not playing', () => {
        const state = buildGameState({
            phase: 'setup',
            currentTurn: 0,
            players: [
                buildPlayer({ id: 'p0', hand: [buildCard({ id: 'p0-hand-0' })] }),
                buildPlayer({ id: 'p1' }),
            ],
        });
        const before = snapshot(state);

        const result = applyMove(state, {
            type: 'PLAY_CARDS',
            playerId: 'p0',
            cards: [{ type: 'hand', index: 0 }],
        });

        expect(result.error?.code).toBe(ERROR_CODES.WRONG_PHASE);
        expect(result.state).toBe(state);
        expect(state).toEqual(before);
    });

    it('rejects NO_SELECTION when cards is empty', () => {
        const state = buildGameState({
            phase: 'playing',
            currentTurn: 0,
            players: [
                buildPlayer({ id: 'p0', hand: [buildCard({ id: 'p0-hand-0' })] }),
                buildPlayer({ id: 'p1' }),
            ],
        });
        const before = snapshot(state);

        const result = applyMove(state, { type: 'PLAY_CARDS', playerId: 'p0', cards: [] });

        expect(result.error?.code).toBe(ERROR_CODES.NO_SELECTION);
        expect(result.state).toBe(state);
        expect(state).toEqual(before);
    });

    it('rejects INVALID_PLAY when non-blind cards fail canPlayMultipleCards', () => {
        const lowCard = buildCard({ id: 'hand-5h', rank: '5', suit: '♥' });
        const highDiscard = buildCard({ id: 'discard-king', rank: 'K', suit: '♠' });
        const state = buildGameState({
            phase: 'playing',
            currentTurn: 0,
            discardPile: [highDiscard],
            players: [
                buildPlayer({ id: 'p0', hand: [lowCard] }),
                buildPlayer({ id: 'p1' }),
            ],
        });
        const before = snapshot(state);

        const result = applyMove(state, {
            type: 'PLAY_CARDS',
            playerId: 'p0',
            cards: [{ type: 'hand', index: 0 }],
        });

        expect(result.error?.code).toBe(ERROR_CODES.INVALID_PLAY);
        expect(result.state).toBe(state);
        expect(state).toEqual(before);
    });

    it('rejects INVALID_SELECTION when a selected index is out of bounds', () => {
        const state = buildGameState({
            phase: 'playing',
            currentTurn: 0,
            players: [
                buildPlayer({ id: 'p0', hand: [buildCard({ id: 'p0-hand-0' })] }),
                buildPlayer({ id: 'p1' }),
            ],
        });
        const before = snapshot(state);

        const result = applyMove(state, {
            type: 'PLAY_CARDS',
            playerId: 'p0',
            cards: [{ type: 'hand', index: 9 }],
        });

        expect(result.error?.code).toBe(ERROR_CODES.INVALID_SELECTION);
        expect(result.state).toBe(state);
        expect(state).toEqual(before);
    });

    it('rejects INVALID_SELECTION when a selected index resolves to a null slot', () => {
        const state = buildGameState({
            phase: 'playing',
            currentTurn: 0,
            players: [
                buildPlayer({ id: 'p0', hand: [null] }),
                buildPlayer({ id: 'p1' }),
            ],
        });
        const before = snapshot(state);

        const result = applyMove(state, {
            type: 'PLAY_CARDS',
            playerId: 'p0',
            cards: [{ type: 'hand', index: 0 }],
        });

        expect(result.error?.code).toBe(ERROR_CODES.INVALID_SELECTION);
        expect(result.state).toBe(state);
        expect(state).toEqual(before);
    });

    it('rejects UNKNOWN_PLAYER for a PLAY_CARDS move with an unrecognised playerId', () => {
        const state = buildGameState({
            phase: 'playing',
            currentTurn: 0,
            players: [
                buildPlayer({ id: 'p0', hand: [buildCard({ id: 'p0-hand-0' })] }),
                buildPlayer({ id: 'p1' }),
            ],
        });
        const before = snapshot(state);

        const result = applyMove(state, {
            type: 'PLAY_CARDS',
            playerId: 'ghost',
            cards: [{ type: 'hand', index: 0 }],
        });

        expect(result.error?.code).toBe(ERROR_CODES.UNKNOWN_PLAYER);
        expect(result.state).toBe(state);
        expect(state).toEqual(before);
    });

    it('draws zero cards without erroring when deck is empty (empty-deck edge case)', () => {
        const cardA = buildCard({ id: 'hand-6s', rank: '6', suit: '♠' });
        const cardB = buildCard({ id: 'hand-9c', rank: '9', suit: '♣' });
        const discardCard = buildCard({ id: 'discard-5h', rank: '5', suit: '♥' });
        const state = buildGameState({
            phase: 'playing',
            currentTurn: 0,
            discardPile: [discardCard],
            deck: [],
            players: [
                buildPlayer({ id: 'p0', hand: [cardA, cardB] }),
                buildPlayer({ id: 'p1' }),
            ],
        });
        const before = snapshot(state);

        const result = applyMove(state, {
            type: 'PLAY_CARDS',
            playerId: 'p0',
            cards: [{ type: 'hand', index: 0 }],
        });

        expect(result.error).toBeUndefined();
        expect(result.state.deck).toEqual([]);
        expect(result.state.players[0].hand).toEqual([null, cardB]);
        expect(state).toEqual(before);
    });
});
