import { describe, it, expect } from 'vitest';
import * as GameLogic from '../../gameLogic';
import type { Card, Player } from '../../types';

const c = (rank: Card['rank'], suit: Card['suit'], id: string): Card => ({ rank, suit, id, deckColor: 'red' });

describe('Mixed source plays (hand + faceUp)', () => {
    it('disallows mixed-source plays when deck is not empty', () => {
        const pile: Card[] = [c('4', '♣', '4c')];
        const handCards: Card[] = [c('5', '♥', '5h')];
        const faceUpCards: Card[] = [c('5', '♦', '5d')];
        const ok = GameLogic.canPlayMixedSources(3, handCards, faceUpCards, pile);
        expect(ok).toBe(false);
    });

    it('allows mixed-source plays when deck is empty and ranks match', () => {
        const pile: Card[] = [c('4', '♣', '4c')];
        const handCards: Card[] = [c('6', '♥', '6h')];
        const faceUpCards: Card[] = [c('6', '♦', '6d')];
        const ok = GameLogic.canPlayMixedSources(0, handCards, faceUpCards, pile);
        expect(ok).toBe(true);
    });

    it('rejects mixed-source plays with mismatched ranks even with empty deck', () => {
        const pile: Card[] = [c('4', '♣', '4c')];
        const handCards: Card[] = [c('7', '♥', '7h')];
        const faceUpCards: Card[] = [c('8', '♦', '8d')];
        const ok = GameLogic.canPlayMixedSources(0, handCards, faceUpCards, pile);
        expect(ok).toBe(false);
    });
});

describe('Pickup confirmation logic', () => {
    it('confirms pickup when a hand card can be played', () => {
        const player: Player = { id: 'p', name: 'P', hand: [c('9', '♥', '9h')], faceUp: [], faceDown: [], isReady: false };
        const pile: Card[] = [c('8', '♣', '8c')];
        expect(GameLogic.shouldConfirmPickUp(player, pile, null)).toBe(true);
    });

    it('confirms pickup when a faceUp card can be played and hand is empty', () => {
        const player: Player = { id: 'p', name: 'P', hand: [null], faceUp: [c('Q', '♦', 'Qd')], faceDown: [], isReady: false };
        const pile: Card[] = [c('J', '♣', 'Jc')];
        expect(GameLogic.shouldConfirmPickUp(player, pile, null)).toBe(true);
    });

    it('with only faceDown available: confirms pickup only if revealed faceDown is playable', () => {
        const player: Player = { id: 'p', name: 'P', hand: [null], faceUp: [null], faceDown: [c('6', '♠', '6s')], isReady: false };
        const pile: Card[] = [c('7', '♣', '7c')];
        // 6 cannot be played on 7 (limiter) => no confirmation without a playable reveal
        expect(GameLogic.shouldConfirmPickUp(player, pile, null)).toBe(false);
        expect(GameLogic.shouldConfirmPickUp(player, pile, c('6', '♠', '6s'))).toBe(true);
        expect(GameLogic.shouldConfirmPickUp(player, pile, c('8', '♠', '8s'))).toBe(false);
    });
});
