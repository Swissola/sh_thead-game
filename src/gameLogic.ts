/**
 * Shithead Game Logic Module
 *
 * Contains all pure game logic functions for card validation,
 * special card effects, and game rules.
 */

import type { Card, Player, CardSource } from './types';

export const RANK_VALUES: Record<string, number> = {
  '2': 2,
  '3': 3,
  '4': 4,
  '5': 5,
  '6': 6,
  '7': 7,
  '8': 8,
  '9': 9,
  '10': 10,
  J: 11,
  Q: 12,
  K: 13,
  A: 14,
};

// ============================================================================
// CARD IDENTIFICATION
// ============================================================================

export function isSpecialCard(card: Card): boolean {
  return ['2', '3', '7', '10'].includes(card.rank);
}

export function isReset(card: Card): boolean {
  return card.rank === '2';
}

export function isInvisible(card: Card): boolean {
  return card.rank === '3';
}

export function isLimiter(card: Card): boolean {
  return card.rank === '7';
}

export function isBurn(card: Card): boolean {
  return card.rank === '10';
}

// ============================================================================
// PILE MANAGEMENT
// ============================================================================

export function getEffectiveTopCard(discardPile: Card[]): Card | null {
  if (discardPile.length === 0) return null;

  for (let i = discardPile.length - 1; i >= 0; i--) {
    if (!isInvisible(discardPile[i])) {
      return discardPile[i];
    }
  }

  return null;
}

export function getVisiblePileCards(discardPile: Card[], count: number = 5): Card[] {
  return discardPile.slice(-count);
}

// ============================================================================
// CARD VALIDATION
// ============================================================================

export function canPlayCard(card: Card, discardPile: Card[]): boolean {
  if (isReset(card) || isInvisible(card)) {
    return true;
  }

  const topCard = getEffectiveTopCard(discardPile);

  if (!topCard) {
    return true;
  }

  if (isReset(topCard)) {
    return true;
  }

  if (isBurn(card) && isLimiter(topCard)) {
    return false;
  }

  if (isBurn(card)) {
    return true;
  }

  if (isLimiter(topCard)) {
    return RANK_VALUES[card.rank] <= 7;
  }

  return RANK_VALUES[card.rank] >= RANK_VALUES[topCard.rank];
}

export function canPlayMultipleCards(cards: Card[], discardPile: Card[]): boolean {
  if (cards.length === 0) return false;
  if (cards.length === 1) return canPlayCard(cards[0], discardPile);

  const firstRank = cards[0].rank;
  const allSameRank = cards.every((card) => card.rank === firstRank);

  if (!allSameRank) return false;

  return canPlayCard(cards[0], discardPile);
}

// ============================================================================
// SPECIAL EFFECTS
// ============================================================================

export function shouldBurnPile(discardPile: Card[]): boolean {
  if (discardPile.length === 0) return false;

  const lastCard = discardPile[discardPile.length - 1];
  if (isBurn(lastCard)) return true;

  return isFourOfAKind(discardPile);
}

export function isFourOfAKind(discardPile: Card[]): boolean {
  if (discardPile.length < 4) return false;

  const nonInvisibleCards = discardPile.filter((card) => !isInvisible(card));

  if (nonInvisibleCards.length < 4) return false;

  const lastFour = nonInvisibleCards.slice(-4);
  const firstRank = lastFour[0].rank;

  return lastFour.every((card) => card.rank === firstRank);
}

export interface PlayResult {
  burned: boolean;
  cardsPlayed: number;
  message: string;
}

export function getPlayResult(cardsPlayed: Card[], discardPile: Card[]): PlayResult {
  const burned = shouldBurnPile(discardPile);

  if (burned) {
    if (isBurn(cardsPlayed[0])) {
      return {
        burned: true,
        cardsPlayed: cardsPlayed.length,
        message: `Burned the pile with ${cardsPlayed.length} ${cardsPlayed.length > 1 ? '10s' : '10'}!`,
      };
    } else {
      return {
        burned: true,
        cardsPlayed: cardsPlayed.length,
        message: 'Four of a kind! Pile burned!',
      };
    }
  }

  if (isReset(cardsPlayed[0])) {
    return {
      burned: false,
      cardsPlayed: cardsPlayed.length,
      message: `Reset with ${cardsPlayed.length} ${cardsPlayed.length > 1 ? '2s' : '2'}!`,
    };
  }

  if (isInvisible(cardsPlayed[0])) {
    return {
      burned: false,
      cardsPlayed: cardsPlayed.length,
      message: `Invisible ${cardsPlayed.length} ${cardsPlayed.length > 1 ? '3s' : '3'}!`,
    };
  }

  return {
    burned: false,
    cardsPlayed: cardsPlayed.length,
    message: `Played ${cardsPlayed.length} ${cardsPlayed[0].rank}${cardsPlayed.length > 1 ? 's' : ''}`,
  };
}

// ============================================================================
// PLAYER CARD MANAGEMENT
// ============================================================================

export function getAvailableCardSource(player: Player): CardSource {
  const nonNullHand = player.hand.filter((c): c is Card => c !== null);
  if (nonNullHand.length > 0) return 'hand';
  if (player.faceUp.length > 0) return 'faceUp';
  return 'faceDown';
}

export function canPlayerPlay(player: Player, discardPile: Card[]): boolean {
  const source = getAvailableCardSource(player);

  if (source === 'hand') {
    const nonNullHand = player.hand.filter((c): c is Card => c !== null);
    return nonNullHand.some((card) => canPlayCard(card, discardPile));
  }

  if (source === 'faceUp') {
    return player.faceUp.some((card) => canPlayCard(card, discardPile));
  }

  return player.faceDown.length > 0;
}

export function shouldDrawCards(player: Player, deckSize: number): boolean {
  const nonNullCount = player.hand.filter((c): c is Card => c !== null).length;
  return nonNullCount < 3 && deckSize > 0;
}

export function getCardsToDrawCount(player: Player, deckSize: number): number {
  const nonNullCount = player.hand.filter((c): c is Card => c !== null).length;
  const needed = 3 - nonNullCount;
  return Math.min(needed, deckSize);
}

// ============================================================================
// WIN CONDITIONS
// ============================================================================

export function hasPlayerWon(player: Player): boolean {
  const nonNullHand = player.hand.filter((c): c is Card => c !== null);
  return nonNullHand.length === 0 && player.faceUp.length === 0 && player.faceDown.length === 0;
}

export function getFinishedPlayers(players: Player[]): Player[] {
  return players.filter(hasPlayerWon);
}

export function isGameOver(players: Player[]): boolean {
  const playersWithCards = players.filter((p) => !hasPlayerWon(p));
  return playersWithCards.length <= 1;
}

export function getNextPlayer(currentPlayerIndex: number, players: Player[]): number {
  let nextIndex = (currentPlayerIndex + 1) % players.length;
  let searchCount = 0;

  while (hasPlayerWon(players[nextIndex]) && searchCount < players.length) {
    nextIndex = (nextIndex + 1) % players.length;
    searchCount++;
  }

  return nextIndex;
}

// ============================================================================
// STARTING PLAYER LOGIC
// ============================================================================

export function getStartingPlayer(players: Player[]): number {
  const startOrder = [
    { rank: '4', suit: '♥' },
    { rank: '4', suit: '♦' },
    { rank: '4', suit: '♠' },
    { rank: '4', suit: '♣' },
    { rank: '5', suit: '♥' },
    { rank: '5', suit: '♦' },
  ];

  for (const targetCard of startOrder) {
    for (let i = 0; i < players.length; i++) {
      const hasCard = players[i].hand.some(
        (card) => card != null && card.rank === targetCard.rank && card.suit === targetCard.suit
      );
      if (hasCard) {
        return i;
      }
    }
  }

  return 0;
}

export function getStartingCard(player: Player): Card | null {
  // Starting order: red 4, black 4, red 5, black 5, red 6, black 6... all the way to Ace
  const ranks = ['4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K', 'A'];
  const nonNullHand = player.hand.filter((c): c is Card => c !== null);

  for (const rank of ranks) {
    // Check for red first
    const redCard = nonNullHand.find((card) => {
      const isRed = card.suit === '♥' || card.suit === '♦';
      return card.rank === rank && isRed;
    });
    if (redCard) return redCard;

    // Then check for black
    const blackCard = nonNullHand.find((card) => {
      const isBlack = card.suit === '♠' || card.suit === '♣';
      return card.rank === rank && isBlack;
    });
    if (blackCard) return blackCard;
  }

  return null;
}
