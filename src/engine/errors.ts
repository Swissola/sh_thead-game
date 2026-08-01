/**
 * Closed set of machine-readable error codes for applyMove rejections.
 *
 * This was the complete, closed set for Phase 1 (D-04) - Plan 01-02/01-03
 * used only these codes, not invented new ones ad hoc. That closure applied
 * to Phase 1's original nine codes; Phase 2 plans may append a genuinely new
 * engine-tier rejection category here (mirroring `EDGE_ERROR_CODES`'s own
 * precedent of growing per-plan), provided it never collides with an
 * `EDGE_ERROR_CODES` value. Each code's meaning:
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
 * - HOST_ONLY: the calling player is not state.host (currently only
 *   SET_TURN_TIMEOUT). Deliberately not named NOT_HOST - EDGE_ERROR_CODES.NOT_HOST
 *   already exists for the edge tier's own host-only Edge Functions
 *   (start-game, remove-player), and the two closed sets must never collide.
 * - INVALID_TIMEOUT_RANGE: SET_TURN_TIMEOUT's timeoutMs is non-finite or
 *   outside [MIN_TURN_TIMEOUT_MS, MAX_TURN_TIMEOUT_MS]
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
    HOST_ONLY: 'HOST_ONLY',
    INVALID_TIMEOUT_RANGE: 'INVALID_TIMEOUT_RANGE',
} as const;

export type ErrorCode = (typeof ERROR_CODES)[keyof typeof ERROR_CODES];
