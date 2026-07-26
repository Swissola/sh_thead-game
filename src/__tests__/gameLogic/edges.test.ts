import { describe, it, expect } from 'vitest';
import * as GameLogic from '../../gameLogic';
import type { Card, Player } from '../../types';

const c = (rank: Card['rank'], suit: Card['suit'], id: string): Card => ({ rank, suit, id, deckColor: 'red' });

describe('GameLogic edge conditions', () => {
    it('effective top skips 3s', () => {
        const pile: Card[] = [c('9', '♣', '9c'), c('3', '♦', '3d'), c('3', '♠', '3s'), c('Q', '♥', 'Qh')];
        const top = GameLogic.getEffectiveTopCard(pile);
        expect(top?.rank).toBe('Q');
        expect(top?.suit).toBe('♥');
    });

    it('four-of-a-kind ignores 3s', () => {
        const pile: Card[] = [c('5', '♣', '5c'), c('3', '♦', '3d'), c('5', '♠', '5s'), c('5', '♥', '5h'), c('5', '♦', '5d')];
        expect(GameLogic.isFourOfAKind(pile)).toBe(true);
    });

    it('10 cannot be played on 7', () => {
        const seven = c('7', '♣', '7c');
        const ten = c('10', '♠', '10s');
        expect(GameLogic.canPlayCard(ten, [seven])).toBe(false);
    });

    it('7 restricts to 7 or lower', () => {
        const seven = c('7', '♣', '7c');
        expect(GameLogic.canPlayCard(c('6', '♦', '6d'), [seven])).toBe(true);
        expect(GameLogic.canPlayCard(c('7', '♦', '7d'), [seven])).toBe(true);
        expect(GameLogic.canPlayCard(c('8', '♦', '8d'), [seven])).toBe(false);
    });

    it('multiple cards must match rank', () => {
        const pile: Card[] = [];
        expect(GameLogic.canPlayMultipleCards([c('5', '♥', '5h'), c('5', '♦', '5d')], pile)).toBe(true);
        expect(GameLogic.canPlayMultipleCards([c('5', '♥', '5h'), c('6', '♦', '6d')], pile)).toBe(false);
    });

    it('next player skips finished players', () => {
        const players: Player[] = [
            { id: 'a', name: 'A', hand: [null], faceUp: [], faceDown: [], isReady: false },
            { id: 'b', name: 'B', hand: [c('4', '♥', '4h')], faceUp: [], faceDown: [], isReady: false },
            { id: 'c', name: 'C', hand: [null], faceUp: [], faceDown: [], isReady: false },
        ];
        const next = GameLogic.getNextPlayer(1, players);
        expect(next).toBe(1);
    });

    it('shouldDrawCards and draw count adhere to limits', () => {
        const player: Player = { id: 'p', name: 'P', hand: [c('4', '♥', '4h'), null], faceUp: [], faceDown: [], isReady: false };
        expect(GameLogic.shouldDrawCards(player, 2)).toBe(true);
        // Hand has 1 card, needs 2 to reach 3 - capped by deck size.
        expect(GameLogic.getCardsToDrawCount(player, 2)).toBe(2);
        expect(GameLogic.getCardsToDrawCount(player, 10)).toBe(2);
        const player2: Player = { id: 'q', name: 'Q', hand: [null, null, null], faceUp: [], faceDown: [], isReady: false };
        expect(GameLogic.getCardsToDrawCount(player2, 5)).toBe(3);
        expect(GameLogic.getCardsToDrawCount(player2, 2)).toBe(2);
    });

    it('starting card prefers red over black at same rank', () => {
        const player: Player = {
            id: 'p', name: 'P', hand: [c('6', '♣', '6c'), c('6', '♥', '6h')], faceUp: [], faceDown: [], isReady: false,
        };
        const start = GameLogic.getStartingCard(player);
        expect(start?.suit).toBe('♥');
        expect(start?.rank).toBe('6');
    });

    it('getVisiblePileCards returns last N', () => {
        const pile: Card[] = [c('4', '♥', '4h'), c('5', '♦', '5d'), c('6', '♣', '6c'), c('7', '♠', '7s')];
        const visible = GameLogic.getVisiblePileCards(pile, 2);
        expect(visible.map((x) => x.id)).toEqual(['6c', '7s']);
    });
});
