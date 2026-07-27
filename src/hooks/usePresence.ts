import { useState, useRef, useEffect, useCallback } from 'react';
import { getSupabaseClient } from '../supabase/client';
import { HEARTBEAT_INTERVAL_MS } from '../supabase/roomTypes';

export interface UsePresenceArgs {
    roomCode: string;
    playerId: string;
    testMode: boolean;
}

export interface UsePresenceResult {
    onlinePlayerIds: string[];
    isPlayerOffline: (id: string) => boolean;
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
                const state = channel.presenceState() as Record<string, unknown>;
                setOnlinePlayerIds(Object.keys(state));
            })
            .on('presence', { event: 'leave' }, ({ key }: { key: string }) => {
                setOnlinePlayerIds((prev) => prev.filter((id) => id !== key));
            })
            .subscribe(async (status: string) => {
                if (status === 'SUBSCRIBED') {
                    await channel.track({ player_id: playerId, online_at: new Date().toISOString() });
                    sendHeartbeat();
                    intervalRef.current = setInterval(sendHeartbeat, HEARTBEAT_INTERVAL_MS);
                }
            });

        return () => {
            if (intervalRef.current) clearInterval(intervalRef.current);
            intervalRef.current = null;
            supabase.removeChannel(channel);
            setOnlinePlayerIds([]);
        };
    }, [roomCode, playerId, testMode]);

    const isPlayerOffline = useCallback(
        (id: string) => !onlinePlayerIds.includes(id),
        [onlinePlayerIds]
    );

    return { onlinePlayerIds, isPlayerOffline };
}
