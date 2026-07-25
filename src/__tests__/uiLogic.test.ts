import { describe, it, expect } from 'vitest';
import { getCardPlayability } from '../uiLogic';
import { buildCard } from './testUtils/buildGameState';

/**
 * WR-04: getCardPlayability is the shared logic extracted out of Hand.tsx's
 * hand-card branch and Table.tsx's face-up-card branch. These tests lock down
 * the exact tooltip text and isPlayable outcomes both components rely on.
 */
describe('uiLogic - getCardPlayability', () => {
    it('is playable with no tooltip when the pile is empty', () => {
        const card = buildCard({ id: 'c-5s', rank: '5', suit: '♠' });
        const result = getCardPlayability(card, [], []);
        expect(result).toEqual({ isPlayable: true, tooltip: undefined });
    });

    it('rejects a card that cannot beat the current top card, with the generic tooltip', () => {
        const top = buildCard({ id: 'top-9', rank: '9', suit: '♣' });
        const card = buildCard({ id: 'c-5s', rank: '5', suit: '♠' });
        const result = getCardPlayability(card, [top], []);
        expect(result).toEqual({ isPlayable: false, tooltip: "Can't be played on the current pile" });
    });

    it('rejects a burn (10) on a limiter (7) with the specific burn-on-limiter tooltip', () => {
        const top = buildCard({ id: 'top-7', rank: '7', suit: '♣' });
        const card = buildCard({ id: 'c-10s', rank: '10', suit: '♠' });
        const result = getCardPlayability(card, [top], []);
        expect(result).toEqual({ isPlayable: false, tooltip: '10 cannot be played on a 7' });
    });

    it('rejects a rank above 7 on a limiter (7) with the limiter tooltip', () => {
        const top = buildCard({ id: 'top-7', rank: '7', suit: '♣' });
        const card = buildCard({ id: 'c-king', rank: 'K', suit: '♠' });
        const result = getCardPlayability(card, [top], []);
        expect(result).toEqual({ isPlayable: false, tooltip: 'Limiter (7): only 7 or lower allowed' });
    });

    it('allows a rank of 7 or lower on a limiter (7)', () => {
        const top = buildCard({ id: 'top-7', rank: '7', suit: '♣' });
        const card = buildCard({ id: 'c-4s', rank: '4', suit: '♠' });
        const result = getCardPlayability(card, [top], []);
        expect(result).toEqual({ isPlayable: true, tooltip: undefined });
    });

    it('rejects a playable-on-pile card that does not match already-selected cards\' rank', () => {
        const top = buildCard({ id: 'top-4', rank: '4', suit: '♣' });
        const alreadySelected = buildCard({ id: 'sel-6h', rank: '6', suit: '♥' });
        const card = buildCard({ id: 'c-9s', rank: '9', suit: '♠' });
        const result = getCardPlayability(card, [top], [alreadySelected]);
        expect(result).toEqual({ isPlayable: false, tooltip: 'Select same rank to play together' });
    });

    it('allows a playable-on-pile card that matches already-selected cards\' rank', () => {
        const top = buildCard({ id: 'top-4', rank: '4', suit: '♣' });
        const alreadySelected = buildCard({ id: 'sel-6h', rank: '6', suit: '♥' });
        const card = buildCard({ id: 'c-6s', rank: '6', suit: '♠' });
        const result = getCardPlayability(card, [top], [alreadySelected]);
        expect(result).toEqual({ isPlayable: true, tooltip: undefined });
    });
});
