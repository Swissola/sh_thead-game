import { describe, it, expect } from 'vitest';
import * as GameLogic from '../../gameLogic';
import type { Card, Player } from '../../types';

describe('GameLogic - Card Validation', () => {
    it('should validate that two cards have the same rank', () => {
        const card1: Card = { suit: '♥', rank: '5', id: '5h', deckColor: 'red' };
        const card2: Card = { suit: '♠', rank: '5', id: '5s', deckColor: 'red' };
        expect(GameLogic.canPlayCard(card2, [card1])).toBe(true);
    });

    it('should not allow playing a lower card (4 on K)', () => {
        const cardK: Card = { suit: '♥', rank: 'K', id: 'Kh', deckColor: 'red' };
        const card4: Card = { suit: '♠', rank: '4', id: '4s', deckColor: 'red' };
        expect(GameLogic.canPlayCard(card4, [cardK])).toBe(false);
    });

    it('should allow 2 to be played on any card', () => {
        const card2: Card = { suit: '♥', rank: '2', id: '2h', deckColor: 'red' };
        const anyCard: Card = { suit: '♠', rank: '9', id: '9s', deckColor: 'red' };
        expect(GameLogic.canPlayCard(card2, [anyCard])).toBe(true);
    });

    it('should allow 10 to clear the discard pile', () => {
        const card10: Card = { suit: '♣', rank: '10', id: '10c', deckColor: 'red' };
        const discardPile = [card10];
        expect(GameLogic.shouldBurnPile(discardPile)).toBe(true);
    });
});

describe('GameLogic - Starting Player', () => {
    it('should return the player with the lowest starting card (red 4)', () => {
        const card4h: Card = { suit: '♥', rank: '4', id: '4h', deckColor: 'red' };
        const card4d: Card = { suit: '♦', rank: '4', id: '4d', deckColor: 'red' };
        const card5h: Card = { suit: '♥', rank: '5', id: '5h', deckColor: 'red' };

        const players: Player[] = [
            {
                id: 'p1',
                name: 'Alice',
                hand: [card5h, null, null],
                faceUp: [],
                faceDown: [],
                isReady: false,
            },
            {
                id: 'p2',
                name: 'Bob',
                hand: [card4d, null, null],
                faceUp: [],
                faceDown: [],
                isReady: false,
            },
            {
                id: 'p3',
                name: 'Charlie',
                hand: [card4h, null, null],
                faceUp: [],
                faceDown: [],
                isReady: false,
            },
        ];

        const startingPlayerIndex = GameLogic.getStartingPlayer(players);
        expect(startingPlayerIndex).toBe(2); // Charlie with red 4
    });

    it('should get the correct starting card for a player', () => {
        const card4h: Card = { suit: '♥', rank: '4', id: '4h', deckColor: 'red' };
        const card5s: Card = { suit: '♠', rank: '5', id: '5s', deckColor: 'red' };

        const player: Player = {
            id: 'p1',
            name: 'Alice',
            hand: [card5s, card4h, null],
            faceUp: [],
            faceDown: [],
            isReady: false,
        };

        const startingCard = GameLogic.getStartingCard(player);
        expect(startingCard?.rank).toBe('4');
        expect(startingCard?.suit).toBe('♥');
    });
});

describe('GameLogic - Burn Pile Detection', () => {
    it('should burn pile when 10 is played', () => {
        const card10: Card = { suit: '♥', rank: '10', id: '10h', deckColor: 'red' };
        const card9: Card = { suit: '♠', rank: '9', id: '9s', deckColor: 'red' };

        const discardPile = [card9, card10];
        expect(GameLogic.shouldBurnPile(discardPile)).toBe(true);
    });

    it('should burn pile when four cards of same rank are played', () => {
        const card5h: Card = { suit: '♥', rank: '5', id: '5h', deckColor: 'red' };
        const card5d: Card = { suit: '♦', rank: '5', id: '5d', deckColor: 'red' };
        const card5s: Card = { suit: '♠', rank: '5', id: '5s', deckColor: 'red' };
        const card5c: Card = { suit: '♣', rank: '5', id: '5c', deckColor: 'red' };

        const discardPile = [card5h, card5d, card5s, card5c];
        expect(GameLogic.shouldBurnPile(discardPile)).toBe(true);
    });

    it('should not burn pile when less than 4 cards of same rank', () => {
        const card5h: Card = { suit: '♥', rank: '5', id: '5h', deckColor: 'red' };
        const card5d: Card = { suit: '♦', rank: '5', id: '5d', deckColor: 'red' };
        const card5s: Card = { suit: '♠', rank: '5', id: '5s', deckColor: 'red' };

        const discardPile = [card5h, card5d, card5s];
        expect(GameLogic.shouldBurnPile(discardPile)).toBe(false);
    });
});

describe('GameLogic - Available Card Source', () => {
    it('should return hand when hand has cards', () => {
        const card: Card = { suit: '♥', rank: '5', id: '5h', deckColor: 'red' };
        const player: Player = {
            id: 'p1',
            name: 'Alice',
            hand: [card, null, null],
            faceUp: [],
            faceDown: [],
            isReady: false,
        };

        expect(GameLogic.getAvailableCardSource(player)).toBe('hand');
    });

    it('should return faceUp when hand is empty', () => {
        const card: Card = { suit: '♥', rank: '5', id: '5h', deckColor: 'red' };
        const player: Player = {
            id: 'p1',
            name: 'Alice',
            hand: [null, null, null],
            faceUp: [card],
            faceDown: [],
            isReady: false,
        };

        expect(GameLogic.getAvailableCardSource(player)).toBe('faceUp');
    });

    it('should return faceDown when hand and faceUp are empty', () => {
        const card: Card = { suit: '♥', rank: '5', id: '5h', deckColor: 'red' };
        const player: Player = {
            id: 'p1',
            name: 'Alice',
            hand: [null, null, null],
            faceUp: [],
            faceDown: [card],
            isReady: false,
        };

        expect(GameLogic.getAvailableCardSource(player)).toBe('faceDown');
    });
});

describe('GameLogic - Can Player Play (Pickup Confirmation)', () => {
    it('should return true when player has playable card in hand', () => {
        const card5: Card = { suit: '♥', rank: '5', id: '5h', deckColor: 'red' };
        const card5d: Card = { suit: '♦', rank: '5', id: '5d', deckColor: 'red' };
        const player: Player = {
            id: 'p1',
            name: 'Alice',
            hand: [card5, null, null],
            faceUp: [],
            faceDown: [],
            isReady: false,
        };
        const discardPile = [card5d];

        expect(GameLogic.canPlayerPlay(player, discardPile)).toBe(true);
    });

    it('should return false when player has no playable cards in hand', () => {
        const card5: Card = { suit: '♥', rank: '5', id: '5h', deckColor: 'red' };
        const cardK: Card = { suit: '♦', rank: 'K', id: 'Kd', deckColor: 'red' };
        const player: Player = {
            id: 'p1',
            name: 'Alice',
            hand: [card5, null, null],
            faceUp: [],
            faceDown: [],
            isReady: false,
        };
        const discardPile = [cardK];

        expect(GameLogic.canPlayerPlay(player, discardPile)).toBe(false);
    });

    it('should return true when player has playable card in faceUp (hand empty)', () => {
        const card5: Card = { suit: '♥', rank: '5', id: '5h', deckColor: 'red' };
        const card5d: Card = { suit: '♦', rank: '5', id: '5d', deckColor: 'red' };
        const player: Player = {
            id: 'p1',
            name: 'Alice',
            hand: [null, null, null],
            faceUp: [card5],
            faceDown: [],
            isReady: false,
        };
        const discardPile = [card5d];

        expect(GameLogic.canPlayerPlay(player, discardPile)).toBe(true);
    });

    it('should return false when player has no playable cards in faceUp (hand empty)', () => {
        const card5: Card = { suit: '♥', rank: '5', id: '5h', deckColor: 'red' };
        const cardK: Card = { suit: '♦', rank: 'K', id: 'Kd', deckColor: 'red' };
        const player: Player = {
            id: 'p1',
            name: 'Alice',
            hand: [null, null, null],
            faceUp: [card5],
            faceDown: [],
            isReady: false,
        };
        const discardPile = [cardK];

        expect(GameLogic.canPlayerPlay(player, discardPile)).toBe(false);
    });

    it('should return true when player has faceDown cards (can play anything from faceDown)', () => {
        const cardK: Card = { suit: '♦', rank: 'K', id: 'Kd', deckColor: 'red' };
        const faceDownCard: Card = { suit: '♠', rank: '2', id: '2s', deckColor: 'red' };
        const player: Player = {
            id: 'p1',
            name: 'Alice',
            hand: [null, null, null],
            faceUp: [],
            faceDown: [faceDownCard],
            isReady: false,
        };
        const discardPile = [cardK];

        expect(GameLogic.canPlayerPlay(player, discardPile)).toBe(true);
    });

    it('should return true when player has 2 (can play on anything)', () => {
        const card2: Card = { suit: '♥', rank: '2', id: '2h', deckColor: 'red' };
        const cardK: Card = { suit: '♦', rank: 'K', id: 'Kd', deckColor: 'red' };
        const player: Player = {
            id: 'p1',
            name: 'Alice',
            hand: [card2, null, null],
            faceUp: [],
            faceDown: [],
            isReady: false,
        };
        const discardPile = [cardK];

        expect(GameLogic.canPlayerPlay(player, discardPile)).toBe(true);
    });
});
