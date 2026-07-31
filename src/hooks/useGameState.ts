import { useCallback } from 'react';
import type { GameState } from '../types';
import type { Move } from '../engine/moves';
import type { ToastVariant } from './useToast';
import { getSupabaseClient } from '../supabase/client';
import type { EdgeResult } from '../supabase/roomTypes';

/**
 * Provides submitMove: the single seam through which a move leaves the
 * client. Sets the optimistic state synchronously (before any network call)
 * so the caller's UI update is instant, then - outside testMode - submits
 * the move to the `apply-move` Edge Function.
 *
 * CR-02: the network call is awaited and wrapped in try/catch, matching the
 * old storage-write path (MenuScreen/LobbyScreen) - without this, a failed
 * submission leaves local state showing a move that never reached the
 * server, silently reverted on the next broadcast with no feedback.
 *
 * Reconciliation (D-11/D-12) is intentionally NOT performed here: the
 * Realtime broadcast picked up by useRoomSubscription is the authoritative
 * correction and arrives regardless of this invocation's outcome, so this
 * hook never rolls the optimistic state back itself - it only distinguishes
 * which toast copy/variant to show.
 *
 * Plan 02-16 (MPLAY-05, UAT test 7): `beginPendingMove` is called once per
 * real (non-test-mode) submission, immediately before the network call
 * fires, so GameContext's pending-move tracker knows this client has a move
 * genuinely outstanding for the whole window a reconciliation broadcast
 * could legitimately arrive. Its returned resolver is called on exactly the
 * three branches below that mean "no write happened, no broadcast is coming
 * for this attempt" - never on the bare-success path, since a successful
 * write still has a broadcast in flight and only GameContext's
 * applyServerRoom (via resolveOldestPendingMove) is responsible for
 * resolving that.
 */
export function useGameStateUpdater(
    testMode: boolean,
    roomCode: string,
    setGameState: (s: GameState) => void,
    showToast: (message: string, code?: string, variant?: ToastVariant) => void,
    beginPendingMove: () => () => void
) {
    const submitMove = useCallback(
        (move: Move, optimisticState: GameState) => {
            setGameState(optimisticState);
            if (testMode) {
                return;
            }
            const resolvePendingMove = beginPendingMove();
            void (async () => {
                try {
                    const { data, error } = await getSupabaseClient().functions.invoke('apply-move', {
                        body: { roomCode, move },
                    });
                    if (error) {
                        // Transport failure - the move may still land, so keep the
                        // generic retry copy rather than the reconciliation copy.
                        resolvePendingMove();
                        showToast('Failed to save your move - please retry.');
                        return;
                    }
                    const result = data as EdgeResult | undefined;
                    if (result?.error) {
                        // Server-side rejection - the server has definitively
                        // disagreed with the optimistic prediction. Do not roll
                        // back here; the Realtime broadcast will correct the state.
                        resolvePendingMove();
                        showToast(
                            "Your move didn't stick - synced with the latest game state.",
                            'RECONCILED',
                            'reconcile'
                        );
                    }
                } catch {
                    resolvePendingMove();
                    showToast('Failed to save your move - please retry.');
                }
            })();
        },
        [testMode, roomCode, setGameState, showToast, beginPendingMove]
    );

    return submitMove;
}
