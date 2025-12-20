/**
 * Shared TypeScript types and interfaces for the Shithead game
 */

export interface Card {
  suit: string;
  rank: string;
  id: string;
  deckColor: string;
}

export interface Player {
  id: string;
  name: string;
  hand: Card[];
  faceUp: Card[];
  faceDown: Card[];
  isReady: boolean;
}

export interface GameState {
  roomCode: string;
  host: string;
  players: Player[];
  phase: 'lobby' | 'setup' | 'playing' | 'finished';
  currentTurn: number;
  deck: Card[];
  discardPile: Card[];
  lastAction: string;
}

export type CardSource = 'hand' | 'faceUp' | 'faceDown';

export interface CardSelection {
  type: CardSource;
  index: number;
}

export interface CardProps {
  card: Card;
  faceDown?: boolean;
  onClick?: () => void;
  selectable?: boolean;
  selected?: boolean;
  small?: boolean;
}

export interface PlayResult {
  valid: boolean;
  message: string;
}
