/**
 * Closed set of machine-readable error codes for applyMove rejections.
 *
 * This is the complete, closed set for this phase (D-04) - Plan 01-02/01-03
 * must use only these codes, not invent new ones ad hoc. Each code's meaning:
 * - UNKNOWN_PLAYER: move.playerId matches no player
 * - NOT_YOUR_TURN: D-03 turn-ownership rejection
 * - WRONG_PHASE: move's type isn't valid for state.phase
 * - NO_SELECTION: PLAY_CARDS with no cards/revealed card chosen
 * - INVALID_SELECTION: out-of-bounds index or null-card reference in a move
 *   payload (the V5 bounds-checking rejection)
 * - INVALID_PLAY: cards don't satisfy canPlayMultipleCards/pile rules
 * - INVALID_COMBINATION: mixed hand+faceUp play violates canPlayMixedSources
 * - FIRST_TURN_INVALID: first-turn rank mismatch
 * - PILE_EMPTY: PICK_UP_PILE with an empty discard pile
 */
export const ERROR_CODES = {
    UNKNOWN_PLAYER: 'UNKNOWN_PLAYER',
    NOT_YOUR_TURN: 'NOT_YOUR_TURN',
    WRONG_PHASE: 'WRONG_PHASE',
    NO_SELECTION: 'NO_SELECTION',
    INVALID_SELECTION: 'INVALID_SELECTION',
    INVALID_PLAY: 'INVALID_PLAY',
    INVALID_COMBINATION: 'INVALID_COMBINATION',
    FIRST_TURN_INVALID: 'FIRST_TURN_INVALID',
    PILE_EMPTY: 'PILE_EMPTY',
} as const;

export type ErrorCode = (typeof ERROR_CODES)[keyof typeof ERROR_CODES];
