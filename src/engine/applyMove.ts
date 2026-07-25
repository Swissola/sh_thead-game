/**
 * The pure applyMove(state, move) -> {state, error?} reducer.
 *
 * This is the actual Phase 2 security boundary (D-02): every rule decision
 * routes through gameLogic.ts predicates, every array touched is freshly
 * copied (ENGINE-02), and every rejection returns the *original* state
 * reference unchanged.
 *
 * This file implements READY_UP, SWAP_CARDS, and PICK_UP_PILE in full.
 * PLAY_CARDS is a deliberate stub - see applyPlayCardsStub below - deferred
 * to Plan 01-03, which replaces this function entirely.
 */
import * as GameLogic from '../gameLogic';
import type { Card, CardSource, GameState, Player } from '../types';
import { ERROR_CODES } from './errors';
import type { ApplyMoveResult, Move } from './moves';

export function applyMove(state: GameState, move: Move): ApplyMoveResult {
    const playerIndex = state.players.findIndex((p) => p.id === move.playerId);
    if (playerIndex === -1) {
        return { state, error: { code: ERROR_CODES.UNKNOWN_PLAYER, message: 'Player not found' } };
    }

    switch (move.type) {
        case 'READY_UP':
            return applyReadyUp(state, playerIndex);
        case 'SWAP_CARDS':
            return applySwapCards(state, move, playerIndex);
        case 'PICK_UP_PILE':
            return applyPickUpPile(state, move, playerIndex);
        case 'PLAY_CARDS':
            return applyPlayCardsStub(state);
    }
}

// TODO(01-03): replace with real PLAY_CARDS implementation
function applyPlayCardsStub(state: GameState): ApplyMoveResult {
    return { state, error: { code: ERROR_CODES.INVALID_PLAY, message: 'PLAY_CARDS not yet implemented' } };
}

function applyReadyUp(state: GameState, playerIndex: number): ApplyMoveResult {
    if (state.phase !== 'setup') {
        return { state, error: { code: ERROR_CODES.WRONG_PHASE, message: 'Cannot ready up outside setup phase' } };
    }

    const player = state.players[playerIndex];
    const updatedPlayers = state.players.map((p, i) => (i === playerIndex ? { ...p, isReady: true } : p));

    if (updatedPlayers.every((p) => p.isReady)) {
        const startPlayer = GameLogic.getStartingPlayer(updatedPlayers);
        return {
            state: {
                ...state,
                players: updatedPlayers,
                phase: 'playing',
                currentTurn: startPlayer,
                isFirstTurn: true,
                lastAction: `${updatedPlayers[startPlayer].name} starts!`,
            },
        };
    }

    return {
        state: {
            ...state,
            players: updatedPlayers,
            lastAction: `${player.name} is ready`,
        },
    };
}

function resolveSourceArray(player: Player, source: CardSource): (Card | null)[] | null {
    if (source === 'hand') return player.hand;
    if (source === 'faceUp') return player.faceUp;
    return null; // faceDown swapping is unsupported
}

function applySwapCards(
    state: GameState,
    move: Extract<Move, { type: 'SWAP_CARDS' }>,
    playerIndex: number
): ApplyMoveResult {
    if (state.phase !== 'setup') {
        return { state, error: { code: ERROR_CODES.WRONG_PHASE, message: 'Cannot swap cards outside setup phase' } };
    }

    const player = state.players[playerIndex];
    const { sourceA, indexA, sourceB, indexB } = move;

    const arrA = resolveSourceArray(player, sourceA);
    const arrB = resolveSourceArray(player, sourceB);
    if (!arrA || !arrB) {
        return { state, error: { code: ERROR_CODES.INVALID_SELECTION, message: 'Unsupported swap source' } };
    }

    if (indexA < 0 || indexA >= arrA.length || indexB < 0 || indexB >= arrB.length) {
        return { state, error: { code: ERROR_CODES.INVALID_SELECTION, message: 'Swap index out of bounds' } };
    }

    const cardA = arrA[indexA];
    const cardB = arrB[indexB];
    if (!cardA || !cardB) {
        return { state, error: { code: ERROR_CODES.INVALID_SELECTION, message: 'Cannot swap an empty slot' } };
    }

    let updatedPlayer: Player;
    if (sourceA === sourceB) {
        const newArr = [...arrA];
        newArr[indexA] = cardB;
        newArr[indexB] = cardA;
        updatedPlayer = { ...player, [sourceA]: newArr };
    } else {
        const newArrA = [...arrA];
        const newArrB = [...arrB];
        newArrA[indexA] = cardB;
        newArrB[indexB] = cardA;
        updatedPlayer = { ...player, [sourceA]: newArrA, [sourceB]: newArrB };
    }

    const updatedPlayers = state.players.map((p, i) => (i === playerIndex ? updatedPlayer : p));

    return {
        state: {
            ...state,
            players: updatedPlayers,
            lastAction: `${player.name} swapped cards`,
        },
    };
}

function applyPickUpPile(
    state: GameState,
    move: Extract<Move, { type: 'PICK_UP_PILE' }>,
    playerIndex: number
): ApplyMoveResult {
    if (state.phase !== 'playing') {
        return { state, error: { code: ERROR_CODES.WRONG_PHASE, message: 'Cannot pick up pile outside playing phase' } };
    }
    if (move.playerId !== state.players[state.currentTurn].id) {
        return { state, error: { code: ERROR_CODES.NOT_YOUR_TURN, message: "It is not this player's turn" } };
    }
    if (state.discardPile.length === 0) {
        return { state, error: { code: ERROR_CODES.PILE_EMPTY, message: 'The pile is empty - you must play a card' } };
    }

    const player = state.players[playerIndex];
    const updatedHand = [...player.hand];
    const cardsToAdd = [...state.discardPile];

    const newFaceDown = [...player.faceDown];
    if (move.revealedFaceDownIndex !== undefined) {
        const idx = move.revealedFaceDownIndex;
        if (idx >= 0 && idx < newFaceDown.length) {
            const revealedCard = newFaceDown[idx];
            if (revealedCard) {
                cardsToAdd.unshift(revealedCard);
                newFaceDown[idx] = null;
            }
        }
    }

    let addIndex = 0;
    for (let i = 0; i < updatedHand.length && addIndex < cardsToAdd.length; i++) {
        if (updatedHand[i] === null) {
            updatedHand[i] = cardsToAdd[addIndex];
            addIndex++;
        }
    }
    while (addIndex < cardsToAdd.length) {
        updatedHand.push(cardsToAdd[addIndex]);
        addIndex++;
    }

    const updatedPlayer: Player = {
        ...player,
        hand: updatedHand,
        faceDown: newFaceDown,
    };

    const updatedPlayers = state.players.map((p, i) => (i === playerIndex ? updatedPlayer : p));
    const nextTurn = GameLogic.getNextPlayer(playerIndex, updatedPlayers);

    return {
        state: {
            ...state,
            players: updatedPlayers,
            discardPile: [],
            currentTurn: nextTurn,
            lastAction: `${player.name} picked up ${state.discardPile.length} cards from the pile`,
        },
    };
}
