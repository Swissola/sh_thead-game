/**
 * Shared test fixture builders for GameState/Player/Card.
 *
 * Builders merge shallow overrides onto sensible defaults, matching the
 * interfaces in src/types.ts exactly. `players` overrides replace the whole
 * array (no deep-merge) so callers can supply a custom roster without the
 * defaults leaking in.
 */
import { TURN_GRACE_MS } from '../../supabase/roomTypes';
import type { Card, GameState, Player } from '../../types';

export function buildCard(overrides: Partial<Card> = {}): Card {
    return {
        suit: '♠',
        rank: '5',
        id: '5s-default',
        deckColor: 'red',
        ...overrides,
    };
}

export function buildPlayer(overrides: Partial<Player> = {}): Player {
    return {
        id: 'p0',
        name: 'Player 0',
        hand: [buildCard({ id: 'p0-hand-0' })],
        faceUp: [],
        faceDown: [],
        isReady: false,
        ...overrides,
    };
}

export function buildGameState(overrides: Partial<GameState> = {}): GameState {
    return {
        roomCode: 'TEST',
        host: 'p0',
        players: [
            buildPlayer({ id: 'p0', name: 'Alice' }),
            buildPlayer({ id: 'p1', name: 'Bob' }),
        ],
        phase: 'playing',
        currentTurn: 0,
        deck: [],
        discardPile: [],
        burnPile: [],
        lastAction: '',
        isFirstTurn: false,
        turnTimeoutMs: TURN_GRACE_MS,
        ...overrides,
    };
}
