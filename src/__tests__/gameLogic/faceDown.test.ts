import { describe, it, expect } from 'vitest';
import * as GameLogic from '../../gameLogic';
import type { Card, Player } from '../../types';

const c = (rank: Card['rank'], suit: Card['suit'], id: string): Card => ({ rank, suit, id, deckColor: 'red' });

describe('Face-down play related logic', () => {
    it('source selection: faceDown when hand and faceUp empty', () => {
        const player: Player = { id: 'p', name: 'P', hand: [null, null], faceUp: [], faceDown: [c('9', '♣', '9c')], isReady: false };
        expect(GameLogic.getAvailableCardSource(player)).toBe('faceDown');
    });

    it('canPlayerPlay is true when faceDown exists (blind playable)', () => {
        const player: Player = { id: 'p', name: 'P', hand: [null], faceUp: [], faceDown: [c('K', '♠', 'Ks')], isReady: false };
        const discard: Card[] = [c('7', '♦', '7d')];
        expect(GameLogic.canPlayerPlay(player, discard)).toBe(true);
    });

    it('blind reveal invalid example: 10 cannot be played on 7', () => {
        const ten = c('10', '♠', '10s');
        const pile: Card[] = [c('7', '♣', '7c')];
        expect(GameLogic.canPlayCard(ten, pile)).toBe(false);
    });

    it('blind reveal valid example: 2 can be played on anything', () => {
        const two = c('2', '♥', '2h');
        const pile: Card[] = [c('K', '♣', 'Kc')];
        expect(GameLogic.canPlayCard(two, pile)).toBe(true);
    });

    it('all top cards invisible (3s) means next card can play freely', () => {
        const pile: Card[] = [c('3', '♥', '3h'), c('3', '♣', '3c')];
        expect(GameLogic.getEffectiveTopCard(pile)).toBeNull();
        expect(GameLogic.canPlayCard(c('9', '♦', '9d'), pile)).toBe(true);
    });

    it('visible top after 3s chain restricts normally', () => {
        const pile: Card[] = [c('3', '♥', '3h'), c('3', '♣', '3c'), c('6', '♠', '6s')];
        expect(GameLogic.getEffectiveTopCard(pile)?.rank).toBe('6');
        expect(GameLogic.canPlayCard(c('5', '♦', '5d'), pile)).toBe(false);
        expect(GameLogic.canPlayCard(c('7', '♦', '7d'), pile)).toBe(true);
    });

    it('limiter 7 allows <=7 (including 2 and 3), blocks 10', () => {
        const pile: Card[] = [c('7', '♠', '7s')];
        expect(GameLogic.canPlayCard(c('3', '♦', '3d'), pile)).toBe(true);
        expect(GameLogic.canPlayCard(c('2', '♦', '2d'), pile)).toBe(true);
        expect(GameLogic.canPlayCard(c('8', '♦', '8d'), pile)).toBe(false);
        expect(GameLogic.canPlayCard(c('10', '♦', '10d'), pile)).toBe(false);
    });
});
