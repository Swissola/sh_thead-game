/**
 * The pure applyMove(state, move) -> {state, error?} reducer.
 *
 * This is the actual Phase 2 security boundary (D-02): every rule decision
 * routes through gameLogic.ts predicates, every array touched is freshly
 * copied (ENGINE-02), and every rejection returns the *original* state
 * reference unchanged.
 *
 * This file implements all four Move types: READY_UP, SWAP_CARDS,
 * PICK_UP_PILE, and PLAY_CARDS.
 */
import * as GameLogic from '../gameLogic.ts';
import { MAX_TURN_TIMEOUT_MS, MIN_TURN_TIMEOUT_MS } from '../supabase/roomTypes.ts';
import type { Card, CardSelection, CardSource, GameState, Player } from '../types.ts';
import { ERROR_CODES } from './errors.ts';
import type { ApplyMoveResult, Move, MoveError } from './moves.ts';

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
            return applyPlayCards(state, move, playerIndex);
        case 'SET_TURN_TIMEOUT':
            return applySetTurnTimeout(state, move, playerIndex);
        default:
            // WR-01: runtime guard for malformed/unexpected move objects - TypeScript's
            // exhaustiveness only holds statically. Without this, a bad-input call falls
            // through to an implicit `undefined` despite the declared ApplyMoveResult
            // return type, which crashes the caller (GameContext.dispatchMove reads
            // result.error on an undefined result).
            return { state, error: { code: ERROR_CODES.INVALID_SELECTION, message: 'Unrecognised move type' } };
    }
}

// ============================================================================
// PLAY_CARDS
//
// Split into one function per validation/computation phase (rather than one
// large applyPlayCards body) purely to keep cognitive complexity under
// control (S3776) - each helper below is a verbatim extraction of the
// original inline block, not a behavioural change. applyPlayCards itself
// stays the single orchestrator: every rule decision and every array copy
// still happens exactly where it always did, just under a name.
// ============================================================================

function validatePlayCardsBasics(state: GameState, move: Extract<Move, { type: 'PLAY_CARDS' }>): MoveError | null {
    if (state.phase !== 'playing') {
        return { code: ERROR_CODES.WRONG_PHASE, message: 'Cannot play cards outside playing phase' };
    }
    if (move.playerId !== state.players[state.currentTurn].id) {
        return { code: ERROR_CODES.NOT_YOUR_TURN, message: "It is not this player's turn" };
    }
    if (move.cards.length === 0) {
        return { code: ERROR_CODES.NO_SELECTION, message: 'Please select a card to play' };
    }
    return null;
}

function computePlayContext(
    move: Extract<Move, { type: 'PLAY_CARDS' }>,
    player: Player
): { effectiveHand: (Card | null)[]; cardSource: CardSource; isBlindPlay: boolean; hasMixedSelection: boolean } {
    const effectiveHand = move.reorderedHand ?? player.hand;
    const cardSource = GameLogic.getAvailableCardSource({ ...player, hand: effectiveHand });
    const isBlindPlay = move.cards[0].type === 'faceDown';
    const hasMixedSelection =
        move.cards.some((s) => s.type === 'hand') && move.cards.some((s) => s.type === 'faceUp');
    return { effectiveHand, cardSource, isBlindPlay, hasMixedSelection };
}

function validateMixedSelection(
    state: GameState,
    move: Extract<Move, { type: 'PLAY_CARDS' }>,
    player: Player,
    effectiveHand: (Card | null)[],
    cardSource: CardSource
): MoveError | null {
    if (state.deck.length > 0 || cardSource !== 'hand') {
        return {
            code: ERROR_CODES.INVALID_COMBINATION,
            message: 'You can only combine hand and face-up cards when the deck is empty and playing from your hand',
        };
    }
    const handSelected = move.cards
        .filter((s) => s.type === 'hand')
        .map((s) => effectiveHand[s.index])
        .filter((c): c is Card => c !== null && c !== undefined);
    const faceUpSelected = move.cards
        .filter((s) => s.type === 'faceUp')
        .map((s) => player.faceUp[s.index])
        .filter((c): c is Card => c !== null && c !== undefined);
    if (!GameLogic.canPlayMixedSources(state.deck.length, handSelected, faceUpSelected, state.discardPile)) {
        return {
            code: ERROR_CODES.INVALID_COMBINATION,
            message: 'You can only combine hand and face-up cards with matching ranks when the deck is empty',
        };
    }
    return null;
}

// Enforce the hand -> face-up -> face-down play order (CR-01): outside the
// documented hand+faceUp combo exception, every selection's source must equal
// the player's single currently-available source. Without this, a caller
// could submit a faceDown or pure faceUp selection while hand cards remain,
// bypassing the play-order rule this reducer exists to enforce.
function validatePlayOrder(move: Extract<Move, { type: 'PLAY_CARDS' }>, cardSource: CardSource): MoveError | null {
    const selectionTypes = new Set(move.cards.map((s) => s.type));
    for (const type of selectionTypes) {
        if (type !== cardSource) {
            return {
                code: ERROR_CODES.INVALID_SELECTION,
                message: `You must play from your ${cardSource} cards first`,
            };
        }
    }
    return null;
}

function resolveSelectionSourceArray(
    selection: CardSelection,
    effectiveHand: (Card | null)[],
    player: Player
): (Card | null)[] {
    if (selection.type === 'hand') return effectiveHand;
    if (selection.type === 'faceUp') return player.faceUp;
    return player.faceDown;
}

function resolveCardsToPlay(
    move: Extract<Move, { type: 'PLAY_CARDS' }>,
    effectiveHand: (Card | null)[],
    player: Player
): { cards: Card[] } | { error: MoveError } {
    const cardsToPlay: Card[] = [];
    for (const selection of move.cards) {
        const sourceArray = resolveSelectionSourceArray(selection, effectiveHand, player);
        if (selection.index < 0 || selection.index >= sourceArray.length) {
            return { error: { code: ERROR_CODES.INVALID_SELECTION, message: 'Selected index is out of bounds' } };
        }
        const card = sourceArray[selection.index];
        if (!card) {
            return { error: { code: ERROR_CODES.INVALID_SELECTION, message: 'Selected slot is empty' } };
        }
        cardsToPlay.push(card);
    }
    return { cards: cardsToPlay };
}

function validateFirstTurn(player: Player, effectiveHand: (Card | null)[], cardsToPlay: Card[]): MoveError | null {
    const startingCard = GameLogic.getStartingCard({ ...player, hand: effectiveHand });
    const allCardsMatch = !!startingCard && cardsToPlay.every((card) => card.rank === startingCard.rank);
    if (!allCardsMatch) {
        return {
            code: ERROR_CODES.FIRST_TURN_INVALID,
            message: startingCard
                ? `First turn: you can only play ${startingCard.rank}s`
                : 'You must have the starting card to play first',
        };
    }
    return null;
}

// Fresh copies before any index-assignment - never mutate player.hand/faceUp/faceDown
// or effectiveHand directly (RESEARCH.md Pitfall 1 / ENGINE-02).
function buildPostSelectionArrays(
    move: Extract<Move, { type: 'PLAY_CARDS' }>,
    effectiveHand: (Card | null)[],
    player: Player
): { newHand: (Card | null)[]; newFaceUp: (Card | null)[]; newFaceDown: (Card | null)[] } {
    const newHand = [...effectiveHand];
    const newFaceUp = [...player.faceUp];
    const newFaceDown = [...player.faceDown];

    for (const selection of move.cards) {
        if (selection.type === 'hand') newHand[selection.index] = null;
        else if (selection.type === 'faceUp') newFaceUp[selection.index] = null;
        else newFaceDown[selection.index] = null;
    }
    return { newHand, newFaceUp, newFaceDown };
}

// Invalid blind play - pick up the pile plus the cards played (D-02: a valid move
// outcome, not a rejection). Fill null slots first, then extend.
function applyInvalidBlindPickup(
    state: GameState,
    player: Player,
    playerIndex: number,
    cardsToPlay: Card[],
    newHand: (Card | null)[],
    newFaceUp: (Card | null)[],
    newFaceDown: (Card | null)[]
): ApplyMoveResult {
    const pickedUpCards = [...cardsToPlay, ...state.discardPile];
    let fillIndex = 0;
    for (const card of pickedUpCards) {
        while (fillIndex < newHand.length && newHand[fillIndex] !== null) {
            fillIndex++;
        }
        if (fillIndex < newHand.length) {
            newHand[fillIndex] = card;
            fillIndex++;
        } else {
            newHand.push(card);
        }
    }

    const updatedPlayer: Player = { ...player, hand: newHand, faceUp: newFaceUp, faceDown: newFaceDown };
    const updatedPlayers = state.players.map((p, i) => (i === playerIndex ? updatedPlayer : p));
    const nextTurn = GameLogic.getNextPlayer(playerIndex, updatedPlayers);

    return {
        state: {
            ...state,
            players: updatedPlayers,
            discardPile: [],
            currentTurn: nextTurn,
            lastAction: `${player.name} played ${cardsToPlay[0].rank} blind - invalid! Picked up pile.`,
            isFirstTurn: false,
        },
    };
}

// Fills null hand slots with drawnCards first, then appends any that don't
// fit - extracted from applyValidPlay purely to keep that function's own
// cognitive complexity under the S3776 threshold.
function fillHandWithDrawnCards(hand: (Card | null)[], drawnCards: Card[]): (Card | null)[] {
    const finalHand = [...hand];
    let drawIndex = 0;
    for (let i = 0; i < finalHand.length && drawIndex < drawnCards.length; i++) {
        if (finalHand[i] === null) {
            finalHand[i] = drawnCards[drawIndex];
            drawIndex++;
        }
    }
    while (drawIndex < drawnCards.length) {
        finalHand.push(drawnCards[drawIndex]);
        drawIndex++;
    }
    return finalHand;
}

// Valid play (blind or not) - burn/draw/win sequencing, preserved verbatim from
// App.tsx:696-746 minus the DOM/flushSync/setTimeout animation wrapper.
function applyValidPlay(
    state: GameState,
    player: Player,
    playerIndex: number,
    cardsToPlay: Card[],
    newHand: (Card | null)[],
    newFaceUp: (Card | null)[],
    newFaceDown: (Card | null)[]
): ApplyMoveResult {
    let newDiscardPile = [...state.discardPile, ...cardsToPlay];
    let newBurnPile = [...state.burnPile];
    const burned = GameLogic.shouldBurnPile(newDiscardPile);
    const playResult = GameLogic.getPlayResult(cardsToPlay, newDiscardPile);

    if (burned) {
        newBurnPile = [...newBurnPile, ...newDiscardPile];
        newDiscardPile = [];
    }

    const preDrawPlayer: Player = { ...player, hand: newHand, faceUp: newFaceUp, faceDown: newFaceDown };
    const cardsToDraw = GameLogic.getCardsToDrawCount(preDrawPlayer, state.deck.length);
    const drawnCards = cardsToDraw > 0 ? state.deck.slice(0, cardsToDraw) : [];

    const finalHand = fillHandWithDrawnCards(newHand, drawnCards);

    const updatedPlayer: Player = { ...player, hand: finalHand, faceUp: newFaceUp, faceDown: newFaceDown };
    const updatedPlayers = state.players.map((p, i) => (i === playerIndex ? updatedPlayer : p));

    const playerWon = GameLogic.hasPlayerWon(updatedPlayer);
    const nextTurn = burned ? playerIndex : GameLogic.getNextPlayer(playerIndex, updatedPlayers);
    const gameOver = GameLogic.isGameOver(updatedPlayers);

    let lastAction = `${player.name}: ${playResult.message}`;
    if (cardsToDraw > 0) {
        lastAction += ` Drew ${cardsToDraw} card${cardsToDraw > 1 ? 's' : ''}.`;
    }
    if (playerWon) {
        lastAction += ` ${player.name} has finished!`;
    }
    if (gameOver) {
        const losers = updatedPlayers.filter((p) => !GameLogic.hasPlayerWon(p));
        if (losers.length > 0) {
            lastAction = `Game Over! ${losers[0].name} is the Sh!thead! \u{1F4A9}`;
        }
    }

    return {
        state: {
            ...state,
            players: updatedPlayers,
            discardPile: newDiscardPile,
            burnPile: newBurnPile,
            deck: state.deck.slice(cardsToDraw),
            currentTurn: nextTurn,
            phase: gameOver ? 'finished' : 'playing',
            lastAction,
            isFirstTurn: false,
        },
    };
}

function applyPlayCards(
    state: GameState,
    move: Extract<Move, { type: 'PLAY_CARDS' }>,
    playerIndex: number
): ApplyMoveResult {
    const basicsError = validatePlayCardsBasics(state, move);
    if (basicsError) return { state, error: basicsError };

    const player = state.players[playerIndex];
    const { effectiveHand, cardSource, isBlindPlay, hasMixedSelection } = computePlayContext(move, player);

    if (hasMixedSelection) {
        const mixedError = validateMixedSelection(state, move, player, effectiveHand, cardSource);
        if (mixedError) return { state, error: mixedError };
    } else {
        const orderError = validatePlayOrder(move, cardSource);
        if (orderError) return { state, error: orderError };
    }

    const resolved = resolveCardsToPlay(move, effectiveHand, player);
    if ('error' in resolved) return { state, error: resolved.error };
    const { cards: cardsToPlay } = resolved;

    if (state.isFirstTurn) {
        const firstTurnError = validateFirstTurn(player, effectiveHand, cardsToPlay);
        if (firstTurnError) return { state, error: firstTurnError };
    }

    if (!isBlindPlay && !GameLogic.canPlayMultipleCards(cardsToPlay, state.discardPile)) {
        return { state, error: { code: ERROR_CODES.INVALID_PLAY, message: 'Those cards cannot be played on the current pile' } };
    }

    const { newHand, newFaceUp, newFaceDown } = buildPostSelectionArrays(move, effectiveHand, player);

    if (isBlindPlay && !GameLogic.canPlayMultipleCards(cardsToPlay, state.discardPile)) {
        return applyInvalidBlindPickup(state, player, playerIndex, cardsToPlay, newHand, newFaceUp, newFaceDown);
    }

    return applyValidPlay(state, player, playerIndex, cardsToPlay, newHand, newFaceUp, newFaceDown);
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

function applySetTurnTimeout(
    state: GameState,
    move: Extract<Move, { type: 'SET_TURN_TIMEOUT' }>,
    playerIndex: number
): ApplyMoveResult {
    if (state.phase !== 'lobby') {
        return {
            state,
            error: { code: ERROR_CODES.WRONG_PHASE, message: 'Cannot change the turn timeout outside the lobby phase' },
        };
    }
    if (move.playerId !== state.host) {
        return { state, error: { code: ERROR_CODES.HOST_ONLY, message: 'Only the host can change the turn timeout' } };
    }
    if (!Number.isFinite(move.timeoutMs) || move.timeoutMs < MIN_TURN_TIMEOUT_MS || move.timeoutMs > MAX_TURN_TIMEOUT_MS) {
        return {
            state,
            error: {
                code: ERROR_CODES.INVALID_TIMEOUT_RANGE,
                message: `Turn timeout must be between ${MIN_TURN_TIMEOUT_MS / 1000}s and ${MAX_TURN_TIMEOUT_MS / 1000}s`,
            },
        };
    }

    const player = state.players[playerIndex];

    return {
        state: {
            ...state,
            turnTimeoutMs: move.timeoutMs,
            lastAction: `${player.name} set the auto-pickup timeout to ${move.timeoutMs / 1000}s`,
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

// T-02-03 (Phase 2 hardening, D-13): under Phase 1's trusted client,
// revealedFaceDownIndex was deliberately left un-gated on
// getAvailableCardSource(player) === 'faceDown' because the UI (Table.tsx) only
// ever let a player reveal/select a face-down card once that source was already
// 'faceDown', so the risk was accepted as no worse than any other spoofed move
// field. Under MPLAY-04, applyMove is the server's trust boundary and the client
// is no longer trusted to have honoured that UI restriction, so a modified client
// could otherwise reveal (and thus learn the identity of) a face-down card while
// still holding hand or face-up cards. Gate it the same way CR-01 gates
// PLAY_CARDS: reject unless faceDown is the player's only available source.
// Picking up an unrevealed pile remains always legal regardless of source, which
// is what keeps D-05's server auto-pickup safe.
function applyRevealedFaceDownToPickup(
    move: Extract<Move, { type: 'PICK_UP_PILE' }>,
    cardsToAdd: Card[],
    faceDown: (Card | null)[]
): { faceDown: (Card | null)[]; cardsToAdd: Card[] } {
    const newFaceDown = [...faceDown];
    const updatedCardsToAdd = [...cardsToAdd];
    if (move.revealedFaceDownIndex !== undefined) {
        const idx = move.revealedFaceDownIndex;
        if (idx >= 0 && idx < newFaceDown.length) {
            const revealedCard = newFaceDown[idx];
            if (revealedCard) {
                updatedCardsToAdd.unshift(revealedCard);
                newFaceDown[idx] = null;
            }
        }
    }
    return { faceDown: newFaceDown, cardsToAdd: updatedCardsToAdd };
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

    const cardSource = GameLogic.getAvailableCardSource(player);
    if (move.revealedFaceDownIndex !== undefined && cardSource !== 'faceDown') {
        return {
            state,
            error: {
                code: ERROR_CODES.INVALID_SELECTION,
                message: `You must play from your ${cardSource} cards first`,
            },
        };
    }

    const { faceDown: newFaceDown, cardsToAdd } = applyRevealedFaceDownToPickup(move, state.discardPile, player.faceDown);

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
