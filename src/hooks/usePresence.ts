import { useState, useRef, useEffect, useCallback } from 'react';
import { getSupabaseClient } from '../supabase/client';
import { HEARTBEAT_INTERVAL_MS } from '../supabase/roomTypes';

// Module-level (rather than an inline nested arrow inside the 'leave'
// handler's setOnlinePlayerIds updater) so the filter predicate isn't a 5th
// level of nested function literal - S2004 caps nesting at 4 levels deep.
function removePlayerId(ids: string[], key: string): string[] {
    return ids.filter((id) => id !== key);
}

export interface UsePresenceArgs {
    roomCode: string;
    playerId: string;
    testMode: boolean;
}

export interface UsePresenceResult {
    onlinePlayerIds: string[];
    isPlayerOffline: (id: string) => boolean;
    /**
     * Read-and-clear signal for 02-UAT.md test 10 (D-10): returns true
     * exactly once per recovery if this client's own Presence channel just
     * dropped (CHANNEL_ERROR/TIMED_OUT/CLOSED) and has now caught back up
     * (the first presence `sync` delivered after recovering). Calling it
     * clears the flag, so a later, genuinely unrelated sync does not
     * re-report the same recovery. See GameScreen.tsx's reconnect-toast
     * effect for the consumer - it must not attribute this client's own
     * connection recovering (and onlinePlayerIds batch-catching-up as a
     * result) to another player's genuine reconnect.
     */
    consumeJustReconnected: () => boolean;
}

/**
 * Per-room Realtime Presence channel (MPLAY-06, D-10, RESEARCH.md Pattern 5)
 * plus the client's heartbeat cadence against the `heartbeat` Edge Function.
 *
 * Presence and the heartbeat are deliberately two separate signals: Presence
 * is ephemeral and client-reported, and drives the offline badge only. The
 * server-written `player_seen` (refreshed by the heartbeat call) is what
 * D-06's rejoin matching and D-08's host transfer trust instead - never let
 * this hook's online set drive a rules decision, and never key it on the
 * D-05 turn-grace timeout.
 */
export function usePresence({ roomCode, playerId, testMode }: UsePresenceArgs): UsePresenceResult {
    const [onlinePlayerIds, setOnlinePlayerIds] = useState<string[]>([]);
    const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
    // 02-UAT.md test 10 (D-10): mirrors useRoomSubscription.ts's own
    // hadDisconnected/hadPendingMoveAtDrop pattern, but deliberately does not
    // borrow its manual resubscribe/backoff machinery - a Presence channel's
    // 'sync' event is itself the recovery signal (the batched catch-up this
    // gap is about), so all that is needed here is to remember "did this
    // channel's own status go bad since the last successful sync" and flag
    // the very next sync that lands after it did. hadDisconnectedRef is only
    // ever set on CHANNEL_ERROR/TIMED_OUT/CLOSED; justReconnectedRef is only
    // ever set (from hadDisconnectedRef) inside the sync handler, so a
    // consumer reading justReconnectedRef can only ever observe "the drop
    // that just got caught up by this exact sync", never a stale one - both
    // refs reset on cleanup (room/player change or unmount) so nothing leaks
    // across rooms.
    const hadDisconnectedRef = useRef(false);
    const justReconnectedRef = useRef(false);

    useEffect(() => {
        // No setState here for the bail-out case (react-hooks/set-state-in-effect) -
        // the initial `useState([])` already covers it, and the "connected" branch's
        // own cleanup below resets the set on transition away from a valid room/player.
        if (testMode || !roomCode || !playerId) {
            return;
        }

        const supabase = getSupabaseClient();
        const channel = supabase.channel(`room-${roomCode}-presence`, {
            config: { presence: { key: playerId } },
        });

        const sendHeartbeat = () => {
            // A missed beat is not a user-facing error - the next beat corrects it.
            void supabase.functions.invoke('heartbeat', { body: { roomCode } }).catch(() => {});
        };

        channel
            .on('presence', { event: 'sync' }, () => {
                // Must run before setOnlinePlayerIds below: this is the exact
                // sync payload GameScreen's reconcile effect will observe as
                // the trigger (isPlayerOffline's identity changes with
                // onlinePlayerIds) - the flag has to already be true by the
                // time that re-render happens, not merely be scheduled to be.
                if (hadDisconnectedRef.current) {
                    hadDisconnectedRef.current = false;
                    justReconnectedRef.current = true;
                }
                const state = channel.presenceState() as Record<string, unknown>;
                setOnlinePlayerIds(Object.keys(state));
            })
            .on('presence', { event: 'leave' }, ({ key }: { key: string }) => {
                setOnlinePlayerIds((prev) => removePlayerId(prev, key));
            })
            .subscribe(async (status: string) => {
                if (status === 'SUBSCRIBED') {
                    await channel.track({ player_id: playerId, online_at: new Date().toISOString() });
                    sendHeartbeat();
                    intervalRef.current = setInterval(sendHeartbeat, HEARTBEAT_INTERVAL_MS);
                    return;
                }

                if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') {
                    hadDisconnectedRef.current = true;
                }
            });

        return () => {
            if (intervalRef.current) clearInterval(intervalRef.current);
            intervalRef.current = null;
            supabase.removeChannel(channel);
            setOnlinePlayerIds([]);
            hadDisconnectedRef.current = false;
            justReconnectedRef.current = false;
        };
    }, [roomCode, playerId, testMode]);

    const isPlayerOffline = useCallback(
        (id: string) => !onlinePlayerIds.includes(id),
        [onlinePlayerIds]
    );

    const consumeJustReconnected = useCallback(() => {
        if (justReconnectedRef.current) {
            justReconnectedRef.current = false;
            return true;
        }
        return false;
    }, []);

    return { onlinePlayerIds, isPlayerOffline, consumeJustReconnected };
}
