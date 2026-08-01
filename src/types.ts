/**
 * Shared TypeScript types and interfaces for the Shithead game
 */
import type { FocusEventHandler } from 'react';

export interface Card {
    suit: string;
    rank: string;
    id: string;
    deckColor: string;
}

export interface Player {
    id: string;
    name: string;
    hand: (Card | null)[]; // Fixed array with nulls for empty slots
    faceUp: (Card | null)[]; // Fixed array with nulls to preserve positions
    faceDown: (Card | null)[]; // Fixed array with nulls to preserve positions
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
    burnPile: Card[]; // Cards that have been burned/removed from game
    lastAction: string;
    isFirstTurn: boolean; // True only for the very first card played in the game
    // MPLAY-07's host-configurable auto-pickup grace period in ms, bounded by
    // src/supabase/roomTypes.ts's MIN_TURN_TIMEOUT_MS/MAX_TURN_TIMEOUT_MS,
    // replacing the previously-hardcoded TURN_GRACE_MS as the value
    // checkTurnTimeout actually reads.
    turnTimeoutMs: number;
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
    title?: string;
    role?: 'option';
    ariaSelected?: boolean;
    ariaLabel?: string;
    tabIndex?: number;
    onFocus?: FocusEventHandler<HTMLDivElement>;
}
