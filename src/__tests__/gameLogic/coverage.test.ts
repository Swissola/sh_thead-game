import { describe, it, expect } from 'vitest';
import * as GameLogic from '../../gameLogic';
import type { Card, Player } from '../../types';

const c = (rank: Card['rank'], suit: Card['suit'], id: string): Card => ({ rank, suit, id, deckColor: 'red' });

describe('Coverage targets for gameLogic', () => {
    it('canPlayCard: allows any card on empty discard pile', () => {
        const card = c('9', '♣', '9c');
        expect(GameLogic.canPlayCard(card, [])).toBe(true);
    });

    it("canPlayCard: '2' on top resets and allows any next card", () => {
        const topTwo = c('2', '♥', '2h');
        const next = c('K', '♠', 'Ks');
        expect(GameLogic.canPlayCard(next, [topTwo])).toBe(true);
    });

    it('getStartingPlayer: falls back to index 0 when no start cards', () => {
        const players: Player[] = [
            { id: 'a', name: 'A', hand: [c('9', '♣', '9c')], faceUp: [], faceDown: [], isReady: false },
            { id: 'b', name: 'B', hand: [c('J', '♠', 'Js')], faceUp: [], faceDown: [], isReady: false },
            { id: 'c', name: 'C', hand: [c('Q', '♦', 'Qd')], faceUp: [], faceDown: [], isReady: false },
        ];
        expect(GameLogic.getStartingPlayer(players)).toBe(0);
    });

    it('getStartingCard: returns null when player has no cards in hand', () => {
        const player: Player = { id: 'p', name: 'P', hand: [null, null, null], faceUp: [], faceDown: [], isReady: false };
        expect(GameLogic.getStartingCard(player)).toBeNull();
    });

    it('getVisiblePileCards: empty pile yields empty array', () => {
        expect(GameLogic.getVisiblePileCards([], 3)).toEqual([]);
    });

    it('getEffectiveTopCard: empty pile yields null', () => {
        expect(GameLogic.getEffectiveTopCard([])).toBeNull();
    });
});
