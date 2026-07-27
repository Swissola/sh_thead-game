/**
 * Server-side deal (MPLAY-04 / T-02-19 / T-02-20).
 *
 * Reproduces LobbyScreen.tsx's `startGame` exactly, but the deck is built and
 * shuffled through `GameLogic.createDeck`/`shuffleDeck` (imported through the
 * `./engine.ts` barrel) rather than reimplemented here - a client-fabricated
 * dealt state has no write path once RLS denies direct client writes, and
 * this is the only place a real deal can happen.
 */
import { EDGE_ERROR_CODES, type EdgeResult } from '../../../src/supabase/roomTypes.ts';
import { edgeError } from './respond.ts';
import { withVersionRetry, type ComputeResult, type RoomStore } from './db.ts';
import { GameLogic, type GameState, type Player } from './engine.ts';
import type { RoomRow } from '../../../src/supabase/roomTypes.ts';

export interface StartGameInput {
    playerId: string;
    roomCode: string;
}

/** Deals `state` in place of LobbyScreen.tsx's client-side `startGame`, or rejects. */
function compute(row: RoomRow, callerId: string): ComputeResult {
    const state = row.state;

    // T-02-20: the client-side host/player-count guard in LobbyScreen.tsx is a UI
    // affordance, not a control - this is the control.
    if (state.host !== callerId) {
        return edgeError(EDGE_ERROR_CODES.NOT_HOST, 'Only the host can start the game');
    }
    if (state.players.length < 2) {
        return edgeError(EDGE_ERROR_CODES.NOT_ENOUGH_PLAYERS, 'At least 2 players are required to start');
    }
    if (state.phase !== 'lobby') {
        return edgeError(EDGE_ERROR_CODES.GAME_ALREADY_STARTED, 'The game has already started');
    }

    // Dealing order (3 hand, then 3 faceUp, then 3 faceDown, per player in
    // state.players order) and numDecks = ceil(players.length / 4) carried over
    // unchanged from LobbyScreen.tsx:22-50 - only the authorisation above is new.
    const numDecks = Math.ceil(state.players.length / 4);
    const deck = GameLogic.shuffleDeck(GameLogic.createDeck(numDecks));

    const updatedPlayers: Player[] = state.players.map((player) => ({
        ...player,
        hand: deck.splice(0, 3),
        faceUp: deck.splice(0, 3),
        faceDown: deck.splice(0, 3),
        isReady: false,
    }));

    const nextState: GameState = {
        ...state,
        players: updatedPlayers,
        deck,
        phase: 'setup',
        lastAction: `Game started with ${numDecks} deck${numDecks > 1 ? 's' : ''}! Swap cards then ready up.`,
        isFirstTurn: true,
    };

    return { state: nextState };
}

/** Deals the game server-side and starts D-05's grace clock from the deal. */
export function startGame(store: RoomStore, input: StartGameInput): Promise<EdgeResult> {
    return withVersionRetry(store, input.roomCode, (row) => {
        const result = compute(row, input.playerId);
        if ('state' in result) {
            return { ...result, turnStartedAt: store.now() };
        }
        return result;
    });
}
