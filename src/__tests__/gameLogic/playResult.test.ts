import { describe, it, expect } from 'vitest';
import * as GameLogic from '../../gameLogic';
import type { Card } from '../../types';

const c = (rank: Card['rank'], suit: Card['suit'], id: string): Card => ({ rank, suit, id, deckColor: 'red' });

describe('GameLogic - getPlayResult messages and burn detection', () => {
    it('reports burn message for single 10', () => {
        const ten = c('10', '♠', '10s');
        const pile: Card[] = [c('9', '♦', '9d'), ten];
        const res = GameLogic.getPlayResult([ten], pile);
        expect(res.burned).toBe(true);
        expect(res.message).toMatch(/Burned the pile/);
        expect(res.cardsPlayed).toBe(1);
    });

    it('reports burn message for multiple 10s', () => {
        const ten1 = c('10', '♠', '10s');
        const ten2 = c('10', '♥', '10h');
        const pile: Card[] = [c('9', '♦', '9d'), ten1, ten2];
        const res = GameLogic.getPlayResult([ten1, ten2], pile);
        expect(res.burned).toBe(true);
        expect(res.message).toMatch(/Burned the pile/);
        expect(res.cardsPlayed).toBe(2);
    });

    it('reports four-of-a-kind burn', () => {
        const fiveH = c('5', '♥', '5h');
        const fiveD = c('5', '♦', '5d');
        const fiveS = c('5', '♠', '5s');
        const fiveC = c('5', '♣', '5c');
        const pile: Card[] = [fiveH, fiveD, fiveS, fiveC];
        const res = GameLogic.getPlayResult([fiveC], pile);
        expect(res.burned).toBe(true);
        expect(res.message).toMatch(/Four of a kind/);
    });

    it('reports reset message for 2s', () => {
        const two1 = c('2', '♥', '2h');
        const two2 = c('2', '♦', '2d');
        const pile: Card[] = [c('9', '♣', '9c'), two1, two2];
        const res = GameLogic.getPlayResult([two1, two2], pile);
        expect(res.burned).toBe(false);
        expect(res.message).toMatch(/Reset with .*2s/);
    });

    it('reports invisible message for 3s', () => {
        const three1 = c('3', '♥', '3h');
        const pile: Card[] = [c('Q', '♣', 'Qc'), three1];
        const res = GameLogic.getPlayResult([three1], pile);
        expect(res.burned).toBe(false);
        expect(res.message).toMatch(/Invisible/);
    });

    it('reports normal play message for non-special', () => {
        const nine = c('9', '♥', '9h');
        const pile: Card[] = [c('8', '♣', '8c'), nine];
        const res = GameLogic.getPlayResult([nine], pile);
        expect(res.burned).toBe(false);
        expect(res.message).toMatch(/Played 1 9/);
    });
});

describe('GameLogic - visible pile default count', () => {
    it('returns last 5 by default', () => {
        const pile: Card[] = [
            c('4', '♥', '4h'), c('5', '♦', '5d'), c('6', '♣', '6c'), c('7', '♠', '7s'), c('8', '♥', '8h'),
            c('9', '♦', '9d'), c('10', '♣', '10c')
        ];
        const visible = GameLogic.getVisiblePileCards(pile);
        expect(visible.map((x) => x.id)).toEqual(['6c', '7s', '8h', '9d', '10c']);
    });
});
