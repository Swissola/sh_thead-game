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
            for (const k of Object.keys(val as Record<string, unknown>).sort((a, b) => a.localeCompare(b))) {
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
        // Plan 02-17 Task 2: snapshotted the instant the connection first
        // drops (hadPendingMoveAtDrop's own paragraph below has the full
        // two-case reasoning for why this must be a snapshot, not the live
        // hasPendingMove() value at refetch time).
        let hadPendingMoveAtDrop = false;
        let currentChannel: ReturnType<typeof supabase.channel> | null = null;

        // Shared core for both delivery paths (the live postgres_changes
        // handler below and Task 2's recovery refetch): exactly one
        // version-gate and exactly one stableStringify comparison in this
        // file, never two diverging copies. `forceReconciliationCheck`
        // widens the reconciliation gate beyond hasPendingMoveRef.current()
        // alone - see hadPendingMoveAtDrop's declaration above and the
        // refetch's SUBSCRIBED-branch call site below for why a client can
        // need the check to run even though the live pending flag has
        // already gone false by the time this runs.
        const applyRoomRow = (row: RoomRow, forceReconciliationCheck: boolean) => {
            const version = Number(row.version);
            if (version <= lastAppliedVersionRef.current) return; // stale/duplicate delivery - T-02-29
            lastAppliedVersionRef.current = version;

            const serverRoom = rowToServerRoom(row);
            // Plan 02-16 (MPLAY-05, UAT test 7): a mismatch alone used to be
            // enough to fire onReconciled, which meant any *other* player's
            // legitimate move mismatched this client's pre-move local state
            // and wrongly told this client "your move didn't stick". Gate on
            // the cheaper check first - false for the overwhelming majority
            // of deliveries - before the two stableStringify calls.
            if (
                (forceReconciliationCheck || hasPendingMoveRef.current()) &&
                stableStringify(serverRoom.state) !== stableStringify(localStateRef.current)
            ) {
                onReconciledRef.current();
            }
            onServerRoomRef.current(serverRoom); // always snap to server truth (D-11)
        };

        // The live-broadcast path always passes false - its behaviour is
        // unchanged from 02-16's landing, still gated purely by
        // hasPendingMove().
        const handlePayload = (payload: { new: RoomRow }) => applyRoomRow(payload.new, false);

        // Plan 02-17 Task 2: a one-off direct read of the room's current
        // state, fired only on recovery from a genuine drop - postgres_changes
        // does not replay/backfill, so a move that happened server-side
        // during the outage window would otherwise be silently missed
        // forever (02-UAT.md test 8). `forceReconciliationCheck` is always
        // the caller's hadPendingMoveAtDrop snapshot, never a literal `true`
        // - see the SUBSCRIBED branch below for why.
        const refetchRoomState = async (forceReconciliationCheck: boolean) => {
            try {
                const { data, error } = await supabase
                    .from('rooms')
                    .select('*')
                    .eq('room_code', roomCode)
                    .single();
                if (cancelled) return; // a resolution arriving after unmount/room-change must do nothing
                if (error || !data) return; // best-effort catch-up - the next broadcast or reconnect cycle is the fallback
                applyRoomRow(data as RoomRow, forceReconciliationCheck);
            } catch {
                // A rejected `.single()` promise (transport failure) is exactly as
                // recoverable as a resolved `error` above - swallow it the same way.
            }
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

        // Named (rather than inline) so scheduling it doesn't add another
        // level of nested function literal inside subscribeChannel's
        // .subscribe() callback - S2004 caps nesting at 4 levels deep.
        const resetBackoff = () => {
            resetDwellTimeoutId = null;
            reconnectAttempt = 0;
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
                        resetDwellTimeoutId = setTimeout(resetBackoff, SUBSCRIPTION_RECONNECT_RESET_DWELL_MS);
                        // hadDisconnected is only ever true here on a
                        // post-drop resubscribe - an initial mount's first
                        // SUBSCRIBED (which runs before any error could have
                        // occurred) never sets it, so never triggers a
                        // refetch. Capture both flags before resetting them
                        // (both reset immediately and unconditionally,
                        // independent of the dwell-gated backoff-counter
                        // reset above) so a *subsequent*, genuinely routine
                        // SUBSCRIBED does not look like a fresh recovery.
                        const wasDisconnected = hadDisconnected;
                        const forceReconciliationCheck = hadPendingMoveAtDrop;
                        hadDisconnected = false;
                        hadPendingMoveAtDrop = false;
                        if (wasDisconnected) {
                            void refetchRoomState(forceReconciliationCheck);
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
                        // Only the original transition into the outage
                        // snapshots hadPendingMoveAtDrop - `!hadDisconnected`
                        // here means "this is the first drop, not a failed
                        // reconnect attempt partway through an outage that is
                        // already under way". Without this guard, a failed
                        // retry's own re-error (which can land after 02-16's
                        // safety net has already cleared hasPendingMove())
                        // would overwrite what was genuinely true when the
                        // outage began, silently erasing case (a) below.
                        //
                        // Two cases hasPendingMove() === false cannot tell
                        // apart by refetch time, which is exactly why this
                        // snapshot exists rather than a hardcoded `true`:
                        // (a) this client genuinely had a move outstanding
                        // when the connection dropped, and 02-16's
                        // PENDING_MOVE_TIMEOUT_MS safety net cleared it
                        // during the outage before the matching broadcast
                        // could arrive - the reconciliation check must still
                        // catch this; (b) this client never submitted
                        // anything at all - an idle bystander whose channel
                        // happened to drop while the *opponent* moved during
                        // the outage (02-UAT.md test 8's own reproduction).
                        // Snapshotting here, at the one moment before either
                        // case has had a chance to make hasPendingMove()
                        // misleading, is what tells them apart: case (a)
                        // snapshots `true` and still forces the check even
                        // after the flag goes stale; case (b) snapshots
                        // `false` and leaves the refetch's reconciliation
                        // check exactly as gated as the live-broadcast path
                        // already is - never the toast, only the silent
                        // onServerRoom catch-up. Do not "simplify" the
                        // refetch call below back to a literal `true`.
                        if (!hadDisconnected) {
                            hadPendingMoveAtDrop = hasPendingMoveRef.current();
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
