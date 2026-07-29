/**
 * D-05: server-verified grace-period auto-pickup for a stalled turn.
 *
 * Any authenticated player in the room may trigger this lazy sweep - it is
 * not a privileged action, and it cannot do anything the timer does not
 * already permit. The authorisation that matters is temporal, not
 * identity-based: elapsed time is always recomputed from `store.now()`
 * against the room's stored `turn_started_at`, never a caller-supplied
 * timestamp (T-02-24, RESEARCH.md Architectural Responsibility Map).
 *
 * Revised after a live two-device play test (02-13 Task 3): the original
 * version fired purely on turn duration, with no connectivity check at all
 * - a fully-present player whose own turn simply ran long got auto-picked-up
 * exactly like a genuinely disconnected one, which is the opposite of what
 * D-05's own rationale ("keeps the game moving without them") intends. The
 * grace-period timer now only proceeds if the current-turn player is also
 * stale by `DISCONNECT_THRESHOLD_MS` - the same server-verified staleness
 * threshold D-08's host transfer already uses, so "disconnected" has one
 * definition across the whole system rather than two.
 */
import {
    DISCONNECT_THRESHOLD_MS,
    EDGE_ERROR_CODES,
    TURN_GRACE_MS,
    type EdgeError,
    type EdgeResult,
} from '../../../src/supabase/roomTypes.ts';
import { withVersionRetry, type ComputeResult, type RoomStore } from './db.ts';
import { applyMove, ERROR_CODES, GameLogic, type Card, type GameState, type Move, type Player } from './engine.ts';

export interface CheckTurnTimeoutInput {
    roomCode: string;
}

/**
 * Resolves the single card an auto-play should submit on a timed-out
 * player's behalf, for the D-05 empty-pile fallback (`checkTurnTimeout`
 * below). Pure and store-free, matching `heartbeat.ts`'s
 * `transferHostIfStale` precedent for a unit-testable decision helper.
 *
 * Returns `null` only when the resolved source holds no non-null card - the
 * one case the caller cannot resolve on the player's behalf, and must fall
 * back to forwarding the original `PILE_EMPTY` rejection instead.
 */
export function selectAutoPlayMove(state: GameState, player: Player): Extract<Move, { type: 'PLAY_CARDS' }> | null {
    const source = GameLogic.getAvailableCardSource(player);

    if (source === 'faceDown') {
        // Face-down cards are blind by game design (CLAUDE.md: a face-down
        // card's identity must never be consulted before commit) - there is
        // no rank to compare, so the lowest non-null index is the
        // deterministic choice.
        const index = player.faceDown.findIndex((card) => card !== null);
        if (index === -1) return null;
        return { type: 'PLAY_CARDS', playerId: player.id, cards: [{ type: 'faceDown', index }] };
    }

    const sourceArray = source === 'hand' ? player.hand : player.faceUp;
    let candidates: { card: Card; index: number }[] = sourceArray
        .map((card, index) => ({ card, index }))
        .filter((entry): entry is { card: Card; index: number } => entry.card !== null);

    if (candidates.length === 0) return null;

    if (state.isFirstTurn) {
        // Without this restriction the fallback could pick a rank the engine's
        // FIRST_TURN_INVALID gate then rejects, reproducing the very stall
        // this plan closes. When getStartingCard is null the player has no
        // legal opening move under existing rules - fall through to the
        // plain lowest-card selection below and let the engine's own error
        // surface, rather than inventing a rule here.
        const startingCard = GameLogic.getStartingCard(player);
        if (startingCard) {
            const restricted = candidates.filter((entry) => entry.card.rank === startingCard.rank);
            if (restricted.length > 0) candidates = restricted;
        }
    }

    let lowest = candidates[0];
    for (const entry of candidates) {
        if (GameLogic.RANK_VALUES[entry.card.rank] < GameLogic.RANK_VALUES[lowest.card.rank]) {
            lowest = entry;
        }
    }

    return { type: 'PLAY_CARDS', playerId: player.id, cards: [{ type: source, index: lowest.index }] };
}

/**
 * Reads the room, checks whether the current turn's grace period has
 * elapsed against the server clock, and - if so - applies a `PICK_UP_PILE`
 * move on behalf of the timed-out player through the shared `applyMove`
 * reducer. Never hand-rolls the pickup, and never reveals a face-down card
 * on the player's behalf (D-04/D-05).
 *
 * When the pile is empty, `PICK_UP_PILE` is illegal (`PILE_EMPTY`) and the
 * turn would otherwise stall forever, since nothing about the room changes
 * between sweeps. `selectAutoPlayMove` resolves a fallback single-card play
 * from whichever source the play-order rules currently force the player to
 * use, submitted through the same `applyMove` boundary (MPLAY-04).
 */
export function checkTurnTimeout(store: RoomStore, input: CheckTurnTimeoutInput): Promise<EdgeResult> {
    return withVersionRetry(store, input.roomCode, (row): ComputeResult => {
        if (row.state.phase !== 'playing') {
            return {
                code: EDGE_ERROR_CODES.TIMEOUT_NOT_ELAPSED,
                message: 'Room is not in the playing phase',
            };
        }

        const nowMs = Date.parse(store.now());
        const elapsedMs = nowMs - Date.parse(row.turn_started_at);
        if (elapsedMs < TURN_GRACE_MS) {
            return {
                code: EDGE_ERROR_CODES.TIMEOUT_NOT_ELAPSED,
                message: 'Grace period has not yet elapsed',
            };
        }

        const timedOutPlayer = row.state.players[row.state.currentTurn];

        // The turn timer alone cannot tell "present but slow" apart from
        // "genuinely gone" - only the server-verified heartbeat signal can.
        // A missing entry (never sent a heartbeat) counts as stale: there is
        // no evidence of connectivity to withhold the pickup for.
        const lastSeen = row.player_seen[timedOutPlayer.id];
        const isStillConnected = lastSeen !== undefined && nowMs - Date.parse(lastSeen) <= DISCONNECT_THRESHOLD_MS;
        if (isStillConnected) {
            return {
                code: EDGE_ERROR_CODES.TIMEOUT_NOT_ELAPSED,
                message: 'Grace period elapsed, but the current player is still connected',
            };
        }

        const move: Move = { type: 'PICK_UP_PILE', playerId: timedOutPlayer.id };
        const result = applyMove(row.state, move);
        if (result.error) {
            if (result.error.code !== ERROR_CODES.PILE_EMPTY) {
                // Forward any other engine rejection unchanged - no write. Engine
                // codes (ERROR_CODES) and edge codes (EDGE_ERROR_CODES) are a
                // deliberately disjoint closed set (roomTypes.ts docstring).
                return { code: result.error.code, message: result.error.message } as unknown as EdgeError;
            }

            // D-05 empty-pile fallback: PICK_UP_PILE is illegal with nothing to
            // pick up, so auto-play the player's lowest-ranked card instead -
            // otherwise the identical PILE_EMPTY rejection repeats every sweep
            // forever with nothing about the room ever changing (02-UAT.md gap).
            const autoPlayMove = selectAutoPlayMove(row.state, timedOutPlayer);
            if (!autoPlayMove) {
                // No card in any source - forward the original PILE_EMPTY
                // rejection unwritten, exactly as before this fallback existed.
                return { code: result.error.code, message: result.error.message } as unknown as EdgeError;
            }

            const autoPlayResult = applyMove(row.state, autoPlayMove);
            if (autoPlayResult.error) {
                // Forward this second rejection unwritten too, with no further
                // fallback attempt - selectAutoPlayMove's rules make this branch
                // near-unreachable (see its own docstring for the one remaining
                // case: an opening-turn player with no legal starting card).
                return {
                    code: autoPlayResult.error.code,
                    message: autoPlayResult.error.message,
                } as unknown as EdgeError;
            }

            const isBlindPlay = autoPlayMove.cards[0].type === 'faceDown';
            const lastAction = isBlindPlay
                ? `${timedOutPlayer.name} was disconnected too long - the pile was empty, so a face-down card was played automatically`
                : `${timedOutPlayer.name} was disconnected too long - the pile was empty, so their lowest card was played automatically`;

            return {
                state: {
                    ...autoPlayResult.state,
                    lastAction,
                },
                turnStartedAt: store.now(),
            };
        }

        return {
            state: {
                ...result.state,
                lastAction: `${timedOutPlayer.name} was disconnected too long - the pile was automatically picked up`,
            },
            turnStartedAt: store.now(),
        };
    });
}
