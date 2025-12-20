import { describe, it, expect } from 'vitest';
import type { Card } from '../../types';

const SUITS = ['♠', '♥', '♣', '♦'];
const RANKS = ['2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K', 'A'];

const createDeck = (numDecks = 1) => {
    const deck: Card[] = [];
    const deckColors = ['red', 'blue', 'green', 'purple', 'orange', 'teal'];
    for (let d = 0; d < numDecks; d++) {
        for (const suit of SUITS) {
            for (const rank of RANKS) {
                deck.push({
                    suit,
                    rank,
                    id: `${rank}${suit}-${d}`,
                    deckColor: deckColors[d % deckColors.length],
                });
            }
        }
    }
    return deck;
};

const shuffleDeck = (deck: Card[]): Card[] => {
    const shuffled = [...deck];
    for (let i = shuffled.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }
    return shuffled;
};

describe('Deck Utilities', () => {
    it('should create a deck with correct number of cards (52 per deck)', () => {
        const singleDeck = createDeck(1);
        expect(singleDeck).toHaveLength(52);
    });

    it('should create multiple decks correctly', () => {
        const twoDeck = createDeck(2);
        expect(twoDeck).toHaveLength(104);

        const threeDeck = createDeck(3);
        expect(threeDeck).toHaveLength(156);
    });

    it('should include all suits and ranks', () => {
        const deck = createDeck(1);
        const suits = new Set(deck.map((c) => c.suit));
        const ranks = new Set(deck.map((c) => c.rank));

        expect(suits.size).toBe(4);
        expect(ranks.size).toBe(13);
    });

    it('should assign unique IDs to each card', () => {
        const deck = createDeck(1);
        const ids = new Set(deck.map((c) => c.id));
        expect(ids.size).toBe(deck.length);
    });

    it('should shuffle deck without changing card count', () => {
        const deck = createDeck(1);
        const shuffled = shuffleDeck(deck);

        expect(shuffled).toHaveLength(deck.length);
        // Check all cards are still present (basic validation)
        const originalIds = new Set(deck.map((c) => c.id));
        const shuffledIds = new Set(shuffled.map((c) => c.id));
        expect(originalIds).toEqual(shuffledIds);
    });

    it('should produce different order after shuffle (with high probability)', () => {
        const deck = createDeck(1);
        const shuffled = shuffleDeck(deck);

        // Check that at least some cards are in different positions
        let diffCount = 0;
        for (let i = 0; i < deck.length; i++) {
            if (deck[i].id !== shuffled[i].id) {
                diffCount++;
            }
        }
        // Very unlikely to have all cards in same position after shuffle
        expect(diffCount).toBeGreaterThan(0);
    });
});
