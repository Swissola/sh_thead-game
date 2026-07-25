import { describe, it, expect } from 'vitest';
import * as GameLogic from '../../gameLogic';
import type { Card } from '../../types';

describe('GameLogic - sortHand', () => {
    const card5h: Card = { suit: '♥', rank: '5', id: '5h', deckColor: 'red' };
    const card2s: Card = { suit: '♠', rank: '2', id: '2s', deckColor: 'red' };
    const cardKd: Card = { suit: '♦', rank: 'K', id: 'Kd', deckColor: 'red' };

    it('drops null slots and preserves original order for mode "original", with arrayIndex pointing back to original positions', () => {
        const hand = [card5h, null, card2s, null, cardKd];
        const result = GameLogic.sortHand(hand, 'original');

        expect(result).toEqual([
            { card: card5h, arrayIndex: 0 },
            { card: card2s, arrayIndex: 2 },
            { card: cardKd, arrayIndex: 4 },
        ]);
    });

    it('sorts by rank then suit for mode "rank", dropping nulls', () => {
        const hand = [cardKd, null, card5h, card2s];
        const result = GameLogic.sortHand(hand, 'rank');

        expect(result.map((r) => r.card.id)).toEqual(['2s', '5h', 'Kd']);
        expect(result.map((r) => r.arrayIndex)).toEqual([3, 2, 0]);
    });

    it('sorts by suit then rank for mode "suit", dropping nulls', () => {
        const hand = [cardKd, null, card2s, card5h];
        const result = GameLogic.sortHand(hand, 'suit');

        // suit order: ♠(0), ♥(1), ♣(2), ♦(3)
        expect(result.map((r) => r.card.id)).toEqual(['2s', '5h', 'Kd']);
        expect(result.map((r) => r.arrayIndex)).toEqual([2, 3, 0]);
    });
});

describe('GameLogic - canAddToSelection', () => {
    const card5h: Card = { suit: '♥', rank: '5', id: '5h', deckColor: 'red' };
    const card5s: Card = { suit: '♠', rank: '5', id: '5s', deckColor: 'red' };
    const cardKd: Card = { suit: '♦', rank: 'K', id: 'Kd', deckColor: 'red' };

    it('returns true when selection is empty', () => {
        expect(GameLogic.canAddToSelection(card5h, [])).toBe(true);
    });

    it('returns true when candidate matches the rank of the current selection', () => {
        expect(GameLogic.canAddToSelection(card5s, [card5h])).toBe(true);
    });

    it('returns false when candidate rank does not match the current selection', () => {
        expect(GameLogic.canAddToSelection(cardKd, [card5h])).toBe(false);
    });
});
