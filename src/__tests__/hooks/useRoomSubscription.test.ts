import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook } from '@testing-library/react';

vi.mock('../../supabase/client', () => ({
    getSupabaseClient: vi.fn(),
}));

import { getSupabaseClient } from '../../supabase/client';
import { useRoomSubscription } from '../../hooks/useRoomSubscription';
import type { RoomRow } from '../../supabase/roomTypes';
import type { GameState } from '../../types';

type PostgresHandler = (payload: { new: RoomRow }) => void;

/** A fake `.channel()` return value recording `.on` registrations by event
 * name and exposing `_fire` so tests can simulate an inbound payload. */
function makeFakeChannel() {
    const handlers: Record<string, PostgresHandler> = {};
    const channel = {
        on: vi.fn((_type: string, config: { event: string }, handler: PostgresHandler) => {
            handlers[config.event] = handler;
            return channel;
        }),
        subscribe: vi.fn(() => channel),
        _fire(event: 'UPDATE' | 'INSERT', payload: { new: RoomRow }) {
            handlers[event]?.(payload);
        },
    };
    return channel;
}

function makeFakeSupabase() {
    const channels: ReturnType<typeof makeFakeChannel>[] = [];
    const supabase = {
        channel: vi.fn((_name: string) => {
            const ch = makeFakeChannel();
            channels.push(ch);
            return ch;
        }),
        removeChannel: vi.fn(),
    };
    return { supabase, channels };
}

function buildState(overrides: Partial<GameState> = {}): GameState {
    return {
        roomCode: 'ABC123',
        host: 'p1',
        players: [],
        phase: 'playing',
        currentTurn: 0,
        deck: [],
        discardPile: [],
        burnPile: [],
        lastAction: '',
        isFirstTurn: false,
        ...overrides,
    };
}

function buildRow(overrides: Partial<RoomRow> = {}): RoomRow {
    return {
        room_code: 'ABC123',
        state: buildState(),
        version: 1,
        turn_started_at: '2026-01-01T00:00:00.000Z',
        player_seen: {},
        created_at: '2026-01-01T00:00:00.000Z',
        updated_at: '2026-01-01T00:00:00.000Z',
        ...overrides,
    };
}

describe('useRoomSubscription', () => {
    beforeEach(() => {
        vi.mocked(getSupabaseClient).mockReset();
    });

    it('with testMode true, subscribes to nothing and creates no channel', () => {
        const { supabase } = makeFakeSupabase();
        vi.mocked(getSupabaseClient).mockReturnValue(supabase as never);

        renderHook(() =>
            useRoomSubscription({
                roomCode: 'ABC123',
                testMode: true,
                localState: null,
                onServerRoom: vi.fn(),
                onReconciled: vi.fn(),
            })
        );

        expect(supabase.channel).not.toHaveBeenCalled();
    });

    it('with an empty room code, subscribes to nothing and creates no channel', () => {
        const { supabase } = makeFakeSupabase();
        vi.mocked(getSupabaseClient).mockReturnValue(supabase as never);

        renderHook(() =>
            useRoomSubscription({
                roomCode: '',
                testMode: false,
                localState: null,
                onServerRoom: vi.fn(),
                onReconciled: vi.fn(),
            })
        );

        expect(supabase.channel).not.toHaveBeenCalled();
    });

    it('on mount with a room code, creates one channel named for that room subscribed to UPDATE and INSERT filtered by room code', () => {
        const { supabase, channels } = makeFakeSupabase();
        vi.mocked(getSupabaseClient).mockReturnValue(supabase as never);

        renderHook(() =>
            useRoomSubscription({
                roomCode: 'ABC123',
                testMode: false,
                localState: buildState(),
                onServerRoom: vi.fn(),
                onReconciled: vi.fn(),
            })
        );

        expect(supabase.channel).toHaveBeenCalledTimes(1);
        expect(supabase.channel).toHaveBeenCalledWith('room-ABC123');
        const ch = channels[0];
        expect(ch.on).toHaveBeenCalledTimes(2);
        expect(ch.on).toHaveBeenCalledWith(
            'postgres_changes',
            { event: 'UPDATE', schema: 'public', table: 'rooms', filter: 'room_code=eq.ABC123' },
            expect.any(Function)
        );
        expect(ch.on).toHaveBeenCalledWith(
            'postgres_changes',
            { event: 'INSERT', schema: 'public', table: 'rooms', filter: 'room_code=eq.ABC123' },
            expect.any(Function)
        );
        expect(ch.subscribe).toHaveBeenCalledTimes(1);
    });

    it('a payload whose version is greater than the last applied version calls onServerRoom with the mapped ServerRoom', () => {
        const { supabase, channels } = makeFakeSupabase();
        vi.mocked(getSupabaseClient).mockReturnValue(supabase as never);
        const onServerRoom = vi.fn();

        renderHook(() =>
            useRoomSubscription({
                roomCode: 'ABC123',
                testMode: false,
                localState: buildState(),
                onServerRoom,
                onReconciled: vi.fn(),
            })
        );

        const row = buildRow({ version: 5 });
        channels[0]._fire('UPDATE', { new: row });

        expect(onServerRoom).toHaveBeenCalledTimes(1);
        expect(onServerRoom).toHaveBeenCalledWith({
            roomCode: 'ABC123',
            state: row.state,
            version: 5,
            turnStartedAt: row.turn_started_at,
            playerSeen: {},
        });
    });

    it('a payload whose version is less than or equal to the last applied version is ignored', () => {
        const { supabase, channels } = makeFakeSupabase();
        vi.mocked(getSupabaseClient).mockReturnValue(supabase as never);
        const onServerRoom = vi.fn();

        renderHook(() =>
            useRoomSubscription({
                roomCode: 'ABC123',
                testMode: false,
                localState: buildState(),
                onServerRoom,
                onReconciled: vi.fn(),
            })
        );

        channels[0]._fire('UPDATE', { new: buildRow({ version: 5 }) });
        expect(onServerRoom).toHaveBeenCalledTimes(1);

        // Equal version - ignored.
        channels[0]._fire('UPDATE', { new: buildRow({ version: 5 }) });
        expect(onServerRoom).toHaveBeenCalledTimes(1);

        // Lower version - ignored.
        channels[0]._fire('UPDATE', { new: buildRow({ version: 3 }) });
        expect(onServerRoom).toHaveBeenCalledTimes(1);
    });

    it('calls onReconciled exactly once when the incoming server state differs from the local state', () => {
        const { supabase, channels } = makeFakeSupabase();
        vi.mocked(getSupabaseClient).mockReturnValue(supabase as never);
        const onReconciled = vi.fn();
        const localState = buildState({ lastAction: 'local move' });

        renderHook(() =>
            useRoomSubscription({
                roomCode: 'ABC123',
                testMode: false,
                localState,
                onServerRoom: vi.fn(),
                onReconciled,
            })
        );

        const serverState = buildState({ lastAction: 'server move' });
        channels[0]._fire('UPDATE', { new: buildRow({ version: 2, state: serverState }) });

        expect(onReconciled).toHaveBeenCalledTimes(1);
    });

    it('does not call onReconciled when the incoming server state matches the local state', () => {
        const { supabase, channels } = makeFakeSupabase();
        vi.mocked(getSupabaseClient).mockReturnValue(supabase as never);
        const onReconciled = vi.fn();
        const sharedState = buildState({ lastAction: 'same move' });

        renderHook(() =>
            useRoomSubscription({
                roomCode: 'ABC123',
                testMode: false,
                localState: sharedState,
                onServerRoom: vi.fn(),
                onReconciled,
            })
        );

        channels[0]._fire('UPDATE', {
            new: buildRow({ version: 2, state: buildState({ lastAction: 'same move' }) }),
        });

        expect(onReconciled).not.toHaveBeenCalled();
    });

    it('unmounting removes the channel exactly once', () => {
        const { supabase } = makeFakeSupabase();
        vi.mocked(getSupabaseClient).mockReturnValue(supabase as never);

        const { unmount } = renderHook(() =>
            useRoomSubscription({
                roomCode: 'ABC123',
                testMode: false,
                localState: buildState(),
                onServerRoom: vi.fn(),
                onReconciled: vi.fn(),
            })
        );

        unmount();

        expect(supabase.removeChannel).toHaveBeenCalledTimes(1);
    });

    it('changing the room code removes the old channel before creating the new one', () => {
        const { supabase, channels } = makeFakeSupabase();
        vi.mocked(getSupabaseClient).mockReturnValue(supabase as never);

        const { rerender } = renderHook(
            ({ roomCode }) =>
                useRoomSubscription({
                    roomCode,
                    testMode: false,
                    localState: buildState(),
                    onServerRoom: vi.fn(),
                    onReconciled: vi.fn(),
                }),
            { initialProps: { roomCode: 'ABC123' } }
        );

        expect(supabase.channel).toHaveBeenCalledTimes(1);
        const firstChannel = channels[0];

        rerender({ roomCode: 'XYZ789' });

        expect(supabase.removeChannel).toHaveBeenCalledWith(firstChannel);
        expect(supabase.channel).toHaveBeenCalledTimes(2);
        expect(supabase.channel).toHaveBeenLastCalledWith('room-XYZ789');
    });
});
