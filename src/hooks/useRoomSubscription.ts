import { useEffect, useRef } from 'react';
import { getSupabaseClient } from '../supabase/client';
import { rowToServerRoom, type RoomRow, type ServerRoom } from '../supabase/roomTypes';
import type { GameState } from '../types';

export interface UseRoomSubscriptionArgs {
    roomCode: string;
    testMode: boolean;
    localState: GameState | null;
    onServerRoom: (room: ServerRoom) => void;
    onReconciled: () => void;
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
}: UseRoomSubscriptionArgs): void {
    // Refs so the effect's dependency array can stay keyed on just
    // `roomCode`/`testMode` (mirroring the replaced poll effect's shape)
    // without subscribing to a stale closure over the callbacks/state.
    const localStateRef = useRef(localState);
    localStateRef.current = localState;
    const onServerRoomRef = useRef(onServerRoom);
    onServerRoomRef.current = onServerRoom;
    const onReconciledRef = useRef(onReconciled);
    onReconciledRef.current = onReconciled;
    const lastAppliedVersionRef = useRef(-1);

    useEffect(() => {
        if (!roomCode || testMode) return;

        lastAppliedVersionRef.current = -1;

        const supabase = getSupabaseClient();
        const channel = supabase.channel(`room-${roomCode}`);

        const handlePayload = (payload: { new: RoomRow }) => {
            const row = payload.new;
            const version = Number(row.version);
            if (version <= lastAppliedVersionRef.current) return; // stale/duplicate delivery - T-02-29
            lastAppliedVersionRef.current = version;

            const serverRoom = rowToServerRoom(row);
            if (stableStringify(serverRoom.state) !== stableStringify(localStateRef.current)) {
                onReconciledRef.current();
            }
            onServerRoomRef.current(serverRoom); // always snap to server truth (D-11)
        };

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
            .subscribe();

        return () => {
            supabase.removeChannel(channel);
        };
    }, [roomCode, testMode]);
}
