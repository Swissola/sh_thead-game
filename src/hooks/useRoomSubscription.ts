import { useEffect, useRef } from 'react';
import { getSupabaseClient } from '../supabase/client';
import {
    rowToServerRoom,
    type RoomRow,
    type ServerRoom,
    SUBSCRIPTION_RECONNECT_BASE_MS,
    SUBSCRIPTION_RECONNECT_MAX_MS,
    SUBSCRIPTION_RECONNECT_RESET_DWELL_MS,
} from '../supabase/roomTypes';
import type { GameState } from '../types';

export interface UseRoomSubscriptionArgs {
    roomCode: string;
    testMode: boolean;
    localState: GameState | null;
    onServerRoom: (room: ServerRoom) => void;
    onReconciled: () => void;
    hasPendingMove: () => boolean;
}

/**
 * Deterministic key-order JSON serialisation, used only for equality
 * comparison (never for the actual payload sent anywhere). Postgres jsonb
 * does not guarantee the browser's original key insertion order survives a
 * round trip, so a plain `JSON.stringify` diff would produce false
 * mismatches between a locally-built GameState and the server's copy of the
 * "same" state. Sorting keys before comparing removes that false positive.
 */
function stableStringify(value: unknown): string {
    return JSON.stringify(value, (_key, val: unknown) => {
        if (val && typeof val === 'object' && !Array.isArray(val)) {
            const sorted: Record<string, unknown> = {};
            for (const k of Object.keys(val as Record<string, unknown>).sort()) {
                sorted[k] = (val as Record<string, unknown>)[k];
            }
            return sorted;
        }
        return val;
    });
}

/**
 * Replaces App.tsx's Router timed-interval localStorage poll
 * (pre-refactor lines 23-32) with a Supabase Realtime `postgres_changes`
 * subscription on the `rooms` table (MPLAY-02, RESEARCH.md Pattern 1).
 *
 * This hook's callback is also the reconciliation trigger for MPLAY-05
 * (RESEARCH.md Pattern 3): the `functions.invoke()` response is not
 * authoritative because either it or this subscription's broadcast can
 * arrive first, and only the broadcast is guaranteed to reflect the
 * server's final write.
 */
export function useRoomSubscription({
    roomCode,
    testMode,
    localState,
    onServerRoom,
    onReconciled,
    hasPendingMove,
}: UseRoomSubscriptionArgs): void {
    // Refs so the effect's dependency array can stay keyed on just
    // `roomCode`/`testMode` (mirroring the replaced poll effect's shape)
    // without subscribing to a stale closure over the callbacks/state.
    const localStateRef = useRef(localState);
    const onServerRoomRef = useRef(onServerRoom);
    const onReconciledRef = useRef(onReconciled);
    // Plan 02-16 (MPLAY-05, UAT test 7): read fresh on every payload, never a
    // stale closure captured at subscribe time - hasPendingMove's return
    // value can (and does) change between separate deliveries on the same
    // mounted hook.
    const hasPendingMoveRef = useRef(hasPendingMove);
    const lastAppliedVersionRef = useRef(-1);

    // Refs must not be written during render (react-hooks/refs) - sync them
    // in an effect that runs after every render instead.
    useEffect(() => {
        localStateRef.current = localState;
        onServerRoomRef.current = onServerRoom;
        onReconciledRef.current = onReconciled;
        hasPendingMoveRef.current = hasPendingMove;
    });

    useEffect(() => {
        if (!roomCode || testMode) return;

        lastAppliedVersionRef.current = -1;

        const supabase = getSupabaseClient();

        // Effect-scoped reconnect/backoff state (Plan 02-17, MPLAY-02,
        // 02-UAT.md test 8) - reset per [roomCode, testMode] effect run,
        // exactly like lastAppliedVersionRef above. Not useRef: nothing here
        // needs to survive across effect runs, only across the callbacks
        // this single effect run schedules.
        let cancelled = false;
        let reconnectAttempt = 0;
        let reconnectTimeoutId: ReturnType<typeof setTimeout> | null = null;
        let resetDwellTimeoutId: ReturnType<typeof setTimeout> | null = null;
        let hadDisconnected = false;
        let currentChannel: ReturnType<typeof supabase.channel> | null = null;

        const handlePayload = (payload: { new: RoomRow }) => {
            const row = payload.new;
            const version = Number(row.version);
            if (version <= lastAppliedVersionRef.current) return; // stale/duplicate delivery - T-02-29
            lastAppliedVersionRef.current = version;

            const serverRoom = rowToServerRoom(row);
            // Plan 02-16 (MPLAY-05, UAT test 7): a mismatch alone used to be
            // enough to fire onReconciled, which meant any *other* player's
            // legitimate move mismatched this client's pre-move local state
            // and wrongly told this client "your move didn't stick". Gate on
            // hasPendingMoveRef.current() first - the cheaper check, and
            // false for the overwhelming majority of deliveries - before the
            // two stableStringify calls.
            if (
                hasPendingMoveRef.current() &&
                stableStringify(serverRoom.state) !== stableStringify(localStateRef.current)
            ) {
                onReconciledRef.current();
            }
            onServerRoomRef.current(serverRoom); // always snap to server truth (D-11)
        };

        // No-op if a reconnect is already scheduled (overlapping-timer
        // guard) or the effect has been cancelled. Delay is capped
        // exponential backoff: SUBSCRIPTION_RECONNECT_BASE_MS doubling on
        // each consecutive failure, never exceeding
        // SUBSCRIPTION_RECONNECT_MAX_MS - retries are only capped in delay,
        // never in count, so a dropped connection keeps trying to self-heal
        // indefinitely rather than freezing the screen forever (02-UAT.md
        // test 8).
        const scheduleReconnect = () => {
            if (cancelled || reconnectTimeoutId !== null) return;
            const delay = Math.min(
                SUBSCRIPTION_RECONNECT_BASE_MS * 2 ** reconnectAttempt,
                SUBSCRIPTION_RECONNECT_MAX_MS
            );
            reconnectAttempt += 1;
            reconnectTimeoutId = setTimeout(() => {
                reconnectTimeoutId = null;
                if (!cancelled) subscribeChannel();
            }, delay);
        };

        // Creates and subscribes a fresh channel for this room, called once
        // synchronously at mount and again on every reconnect. Restructured
        // out of a single inline channel construction so a dropped
        // connection can be replaced mid-effect (Plan 02-17).
        const subscribeChannel = () => {
            const channel = supabase.channel(`room-${roomCode}`);
            currentChannel = channel;

            channel
                .on(
                    'postgres_changes',
                    { event: 'UPDATE', schema: 'public', table: 'rooms', filter: `room_code=eq.${roomCode}` },
                    handlePayload
                )
                .on(
                    'postgres_changes',
                    { event: 'INSERT', schema: 'public', table: 'rooms', filter: `room_code=eq.${roomCode}` },
                    handlePayload
                )
                .subscribe((status: string) => {
                    if (cancelled) return; // a status arriving after unmount/room-change must do nothing

                    if (status === 'SUBSCRIBED') {
                        // Defensive: 'SUBSCRIBED' only fires once per
                        // successful (re)subscribe, so there is never one
                        // already pending here under this plan's own control
                        // flow - cheap safety margin against a future edit
                        // changing that assumption.
                        if (resetDwellTimeoutId !== null) {
                            clearTimeout(resetDwellTimeoutId);
                        }
                        // Schedule, don't immediately apply, the backoff
                        // reset: a flapping connection (brief reconnect
                        // immediately followed by another drop) must not
                        // have its retry cadence reset to base on every
                        // blip - only a connection that stays up for a
                        // genuine dwell period counts as recovered.
                        resetDwellTimeoutId = setTimeout(() => {
                            resetDwellTimeoutId = null;
                            reconnectAttempt = 0;
                        }, SUBSCRIPTION_RECONNECT_RESET_DWELL_MS);
                        // hadDisconnected is only ever true here on a
                        // post-drop resubscribe - reset it now so a
                        // subsequent, genuinely routine SUBSCRIBED does not
                        // look like a recovery. Task 2 (Plan 02-17) extends
                        // this branch to capture the pre-reset value before
                        // clearing it and trigger the one-off recovery
                        // refetch from it.
                        if (hadDisconnected) {
                            hadDisconnected = false;
                        }
                        return;
                    }

                    if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') {
                        // A SUBSCRIBED blip that did not actually last must
                        // not be allowed to reset the backoff counter - stop
                        // that pending dwell timer before it fires.
                        if (resetDwellTimeoutId !== null) {
                            clearTimeout(resetDwellTimeoutId);
                            resetDwellTimeoutId = null;
                        }
                        hadDisconnected = true;
                        supabase.removeChannel(channel);
                        currentChannel = null; // the effect's cleanup must not try to remove this again
                        scheduleReconnect();
                    }
                });
        };

        subscribeChannel();

        return () => {
            cancelled = true;
            if (reconnectTimeoutId !== null) clearTimeout(reconnectTimeoutId);
            if (resetDwellTimeoutId !== null) clearTimeout(resetDwellTimeoutId);
            if (currentChannel !== null) supabase.removeChannel(currentChannel);
        };
    }, [roomCode, testMode]);
}
