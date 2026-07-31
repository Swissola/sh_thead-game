import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook } from '@testing-library/react';

vi.mock('../../supabase/client', () => ({
    getSupabaseClient: vi.fn(),
}));

import { getSupabaseClient } from '../../supabase/client';
import { useRoomSubscription } from '../../hooks/useRoomSubscription';
import {
    SUBSCRIPTION_RECONNECT_BASE_MS,
    SUBSCRIPTION_RECONNECT_MAX_MS,
    SUBSCRIPTION_RECONNECT_RESET_DWELL_MS,
    type RoomRow,
} from '../../supabase/roomTypes';
import type { GameState } from '../../types';

type PostgresHandler = (payload: { new: RoomRow }) => void;
type SubscribeCb = (status: string) => void;

/** A fake `.channel()` return value recording `.on` registrations by event
 * name and exposing `_fire`/`_fireStatus` so tests can simulate an inbound
 * payload or a subscribe-status transition (usePresence.test.ts's
 * established shape, extended with an error status). */
function makeFakeChannel() {
    const handlers: Record<string, PostgresHandler> = {};
    let subscribeCb: SubscribeCb | null = null;
    const channel = {
        on: vi.fn((_type: string, config: { event: string }, handler: PostgresHandler) => {
            handlers[config.event] = handler;
            return channel;
        }),
        subscribe: vi.fn((cb?: SubscribeCb) => {
            subscribeCb = cb ?? null;
            return channel;
        }),
        _fire(event: 'UPDATE' | 'INSERT', payload: { new: RoomRow }) {
            handlers[event]?.(payload);
        },
        _fireStatus(status: string) {
            subscribeCb?.(status);
        },
    };
    return channel;
}

function makeFakeSupabase() {
    const channels: ReturnType<typeof makeFakeChannel>[] = [];
    const supabase = {
        channel: vi.fn(() => {
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
                hasPendingMove: () => true,
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
                hasPendingMove: () => true,
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
                hasPendingMove: () => true,
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
                hasPendingMove: () => true,
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
                hasPendingMove: () => true,
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

    // Plan 02-16 (MPLAY-05, UAT test 7): calls onReconciled exactly once for
    // the identical mismatched payload when this client has a move genuinely
    // outstanding ("pending" case), retargeted from the pre-02-16 version of
    // this test which had no notion of a pending gate.
    it('calls onReconciled exactly once when the incoming server state differs from the local state AND hasPendingMove() is true (pending case)', () => {
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
                hasPendingMove: () => true,
            })
        );

        const serverState = buildState({ lastAction: 'server move' });
        channels[0]._fire('UPDATE', { new: buildRow({ version: 2, state: serverState }) });

        expect(onReconciled).toHaveBeenCalledTimes(1);
    });

    // The direct fix for the live PC/phone reproduction in 02-UAT.md test 7:
    // the identical mismatched payload as the test above, but with nothing
    // of this client's own outstanding - onReconciled must not fire, while
    // onServerRoom (D-11's "always snap to server truth") still does.
    it('does not call onReconciled on the identical mismatched payload when hasPendingMove() is false, while onServerRoom still fires (UAT test 7 fix)', () => {
        const { supabase, channels } = makeFakeSupabase();
        vi.mocked(getSupabaseClient).mockReturnValue(supabase as never);
        const onReconciled = vi.fn();
        const onServerRoom = vi.fn();
        const localState = buildState({ lastAction: 'local move' });

        renderHook(() =>
            useRoomSubscription({
                roomCode: 'ABC123',
                testMode: false,
                localState,
                onServerRoom,
                onReconciled,
                hasPendingMove: () => false,
            })
        );

        const serverState = buildState({ lastAction: 'server move' });
        channels[0]._fire('UPDATE', { new: buildRow({ version: 2, state: serverState }) });

        expect(onReconciled).not.toHaveBeenCalled();
        expect(onServerRoom).toHaveBeenCalledTimes(1);
    });

    it('reads hasPendingMove fresh on every payload via the render-sync ref, not a stale closure captured at subscribe time', () => {
        const { supabase, channels } = makeFakeSupabase();
        vi.mocked(getSupabaseClient).mockReturnValue(supabase as never);
        const onReconciled = vi.fn();
        let pending = false;
        const localState = buildState({ lastAction: 'local move' });

        const { rerender } = renderHook(
            (props: { hasPendingMove: () => boolean }) =>
                useRoomSubscription({
                    roomCode: 'ABC123',
                    testMode: false,
                    localState,
                    onServerRoom: vi.fn(),
                    onReconciled,
                    hasPendingMove: props.hasPendingMove,
                }),
            { initialProps: { hasPendingMove: () => pending } }
        );

        // First delivery: hasPendingMove() is false - no reconciliation.
        channels[0]._fire('UPDATE', {
            new: buildRow({ version: 2, state: buildState({ lastAction: 'server move 1' }) }),
        });
        expect(onReconciled).not.toHaveBeenCalled();

        // Toggle the mock and force the ref-sync effect to re-run.
        pending = true;
        rerender({ hasPendingMove: () => pending });

        // Second delivery on the SAME mounted hook: hasPendingMove() is now
        // true - reconciliation fires, proving the read was fresh, not a
        // stale closure from the initial subscribe.
        channels[0]._fire('UPDATE', {
            new: buildRow({ version: 3, state: buildState({ lastAction: 'server move 2' }) }),
        });
        expect(onReconciled).toHaveBeenCalledTimes(1);
    });

    it('does not call onReconciled when the incoming server state matches the local state, regardless of hasPendingMove()', () => {
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
                hasPendingMove: () => true,
            })
        );

        channels[0]._fire('UPDATE', {
            new: buildRow({ version: 2, state: buildState({ lastAction: 'same move' }) }),
        });

        expect(onReconciled).not.toHaveBeenCalled();
    });

    it('does not call onReconciled when the incoming server state matches the local state and hasPendingMove() is false', () => {
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
                hasPendingMove: () => false,
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
                hasPendingMove: () => true,
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
                    hasPendingMove: () => true,
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

    // Plan 02-17 (MPLAY-02, 02-UAT.md test 8): a dropped room-data channel
    // must self-heal with a dwell-gated capped exponential backoff, instead
    // of leaving the screen frozen on stale state forever.
    describe('self-healing reconnect on a dropped channel (02-UAT.md test 8)', () => {
        afterEach(() => {
            vi.useRealTimers();
        });

        it('subscribes with a status-callback function argument, not bare', () => {
            const { supabase, channels } = makeFakeSupabase();
            vi.mocked(getSupabaseClient).mockReturnValue(supabase as never);

            renderHook(() =>
                useRoomSubscription({
                    roomCode: 'ABC123',
                    testMode: false,
                    localState: buildState(),
                    onServerRoom: vi.fn(),
                    onReconciled: vi.fn(),
                    hasPendingMove: () => false,
                })
            );

            expect(channels[0].subscribe).toHaveBeenCalledWith(expect.any(Function));
        });

        it('a CHANNEL_ERROR status removes the channel and, after the backoff delay, creates and subscribes a new channel for the same room with the same two postgres_changes registrations', () => {
            vi.useFakeTimers();
            const { supabase, channels } = makeFakeSupabase();
            vi.mocked(getSupabaseClient).mockReturnValue(supabase as never);

            renderHook(() =>
                useRoomSubscription({
                    roomCode: 'ABC123',
                    testMode: false,
                    localState: buildState(),
                    onServerRoom: vi.fn(),
                    onReconciled: vi.fn(),
                    hasPendingMove: () => false,
                })
            );

            channels[0]._fireStatus('CHANNEL_ERROR');

            expect(supabase.removeChannel).toHaveBeenCalledWith(channels[0]);
            expect(channels).toHaveLength(1); // not yet reconnected

            vi.advanceTimersByTime(SUBSCRIPTION_RECONNECT_BASE_MS);

            expect(supabase.channel).toHaveBeenCalledTimes(2);
            expect(supabase.channel).toHaveBeenLastCalledWith('room-ABC123');
            expect(channels).toHaveLength(2);
            expect(channels[1].on).toHaveBeenCalledTimes(2);
            expect(channels[1].on).toHaveBeenCalledWith(
                'postgres_changes',
                { event: 'UPDATE', schema: 'public', table: 'rooms', filter: 'room_code=eq.ABC123' },
                expect.any(Function)
            );
            expect(channels[1].on).toHaveBeenCalledWith(
                'postgres_changes',
                { event: 'INSERT', schema: 'public', table: 'rooms', filter: 'room_code=eq.ABC123' },
                expect.any(Function)
            );
            expect(channels[1].subscribe).toHaveBeenCalledTimes(1);
        });

        it.each(['TIMED_OUT', 'CLOSED'] as const)(
            'a %s status triggers the identical remove-and-reconnect behaviour as CHANNEL_ERROR',
            (status) => {
                vi.useFakeTimers();
                const { supabase, channels } = makeFakeSupabase();
                vi.mocked(getSupabaseClient).mockReturnValue(supabase as never);

                renderHook(() =>
                    useRoomSubscription({
                        roomCode: 'ABC123',
                        testMode: false,
                        localState: buildState(),
                        onServerRoom: vi.fn(),
                        onReconciled: vi.fn(),
                        hasPendingMove: () => false,
                    })
                );

                channels[0]._fireStatus(status);
                expect(supabase.removeChannel).toHaveBeenCalledWith(channels[0]);

                vi.advanceTimersByTime(SUBSCRIPTION_RECONNECT_BASE_MS);
                expect(channels).toHaveLength(2);
            }
        );

        it('backs off exponentially, doubling each consecutive failure, capped at SUBSCRIPTION_RECONNECT_MAX_MS', () => {
            vi.useFakeTimers();
            const { supabase, channels } = makeFakeSupabase();
            vi.mocked(getSupabaseClient).mockReturnValue(supabase as never);

            renderHook(() =>
                useRoomSubscription({
                    roomCode: 'ABC123',
                    testMode: false,
                    localState: buildState(),
                    onServerRoom: vi.fn(),
                    onReconciled: vi.fn(),
                    hasPendingMove: () => false,
                })
            );

            // 1000, 2000, 4000, 8000, 16000, then capped at 30000 thereafter.
            const expectedDelays = [1000, 2000, 4000, 8000, 16000, 30000, 30000];
            expectedDelays.forEach((delay, i) => {
                channels[channels.length - 1]._fireStatus('CHANNEL_ERROR');
                expect(channels).toHaveLength(i + 1);

                vi.advanceTimersByTime(delay - 1);
                expect(channels).toHaveLength(i + 1); // not yet - one ms short

                vi.advanceTimersByTime(1);
                expect(channels).toHaveLength(i + 2); // now reconnected
            });
        });

        it('a SUBSCRIBED status held for at least the reset-dwell period resets the backoff counter to base for the next disconnect', () => {
            vi.useFakeTimers();
            const { supabase, channels } = makeFakeSupabase();
            vi.mocked(getSupabaseClient).mockReturnValue(supabase as never);

            renderHook(() =>
                useRoomSubscription({
                    roomCode: 'ABC123',
                    testMode: false,
                    localState: buildState(),
                    onServerRoom: vi.fn(),
                    onReconciled: vi.fn(),
                    hasPendingMove: () => false,
                })
            );

            // First disconnect -> reconnect at base delay (1000ms).
            channels[0]._fireStatus('CHANNEL_ERROR');
            vi.advanceTimersByTime(SUBSCRIPTION_RECONNECT_BASE_MS);
            expect(channels).toHaveLength(2);

            // Second failure escalates further, proving the counter was > 0
            // before the dwell-reset below.
            channels[1]._fireStatus('CHANNEL_ERROR');
            vi.advanceTimersByTime(SUBSCRIPTION_RECONNECT_BASE_MS * 2);
            expect(channels).toHaveLength(3);

            // The third channel stays SUBSCRIBED for the full dwell period.
            channels[2]._fireStatus('SUBSCRIBED');
            vi.advanceTimersByTime(SUBSCRIPTION_RECONNECT_RESET_DWELL_MS);

            // A later, genuinely separate disconnect starts its own retry
            // sequence again from base, not the prior escalated delay.
            channels[2]._fireStatus('CHANNEL_ERROR');
            vi.advanceTimersByTime(SUBSCRIPTION_RECONNECT_BASE_MS - 1);
            expect(channels).toHaveLength(3); // not yet - base delay hasn't fully elapsed
            vi.advanceTimersByTime(1);
            expect(channels).toHaveLength(4);
        });

        it('a SUBSCRIBED status followed by another drop before the reset-dwell period elapses does not reset the backoff counter - the next retry continues escalating (flapping connection)', () => {
            vi.useFakeTimers();
            const { supabase, channels } = makeFakeSupabase();
            vi.mocked(getSupabaseClient).mockReturnValue(supabase as never);

            renderHook(() =>
                useRoomSubscription({
                    roomCode: 'ABC123',
                    testMode: false,
                    localState: buildState(),
                    onServerRoom: vi.fn(),
                    onReconciled: vi.fn(),
                    hasPendingMove: () => false,
                })
            );

            // First disconnect -> reconnect at base delay (1000ms).
            channels[0]._fireStatus('CHANNEL_ERROR');
            vi.advanceTimersByTime(SUBSCRIPTION_RECONNECT_BASE_MS);
            expect(channels).toHaveLength(2);

            // Briefly subscribed, then drops again before the dwell period elapses.
            channels[1]._fireStatus('SUBSCRIBED');
            vi.advanceTimersByTime(SUBSCRIPTION_RECONNECT_RESET_DWELL_MS - 1);
            channels[1]._fireStatus('CHANNEL_ERROR');

            // The next retry delay must be the escalated 2000ms (attempt 1), not
            // a reset base 1000ms.
            vi.advanceTimersByTime(SUBSCRIPTION_RECONNECT_BASE_MS);
            expect(channels).toHaveLength(2); // not yet - still short of 2000ms total

            vi.advanceTimersByTime(SUBSCRIPTION_RECONNECT_BASE_MS);
            expect(channels).toHaveLength(3); // now reconnected at the escalated delay
        });

        it('a SUBSCRIBED status on a connection that never dropped is inert - no removeChannel, no extra channel creation', () => {
            const { supabase, channels } = makeFakeSupabase();
            vi.mocked(getSupabaseClient).mockReturnValue(supabase as never);

            renderHook(() =>
                useRoomSubscription({
                    roomCode: 'ABC123',
                    testMode: false,
                    localState: buildState(),
                    onServerRoom: vi.fn(),
                    onReconciled: vi.fn(),
                    hasPendingMove: () => false,
                })
            );

            channels[0]._fireStatus('SUBSCRIBED');

            expect(supabase.removeChannel).not.toHaveBeenCalled();
            expect(supabase.channel).toHaveBeenCalledTimes(1);
        });

        it('clears the dwell reset timer on unmount so no leaked timer fires afterwards', () => {
            vi.useFakeTimers();
            const { supabase, channels } = makeFakeSupabase();
            vi.mocked(getSupabaseClient).mockReturnValue(supabase as never);

            const { unmount } = renderHook(() =>
                useRoomSubscription({
                    roomCode: 'ABC123',
                    testMode: false,
                    localState: buildState(),
                    onServerRoom: vi.fn(),
                    onReconciled: vi.fn(),
                    hasPendingMove: () => false,
                })
            );

            channels[0]._fireStatus('SUBSCRIBED'); // schedules the dwell reset timer
            unmount();

            vi.advanceTimersByTime(SUBSCRIPTION_RECONNECT_RESET_DWELL_MS * 2);

            // No further channel/removeChannel calls happened after unmount -
            // proves the dwell timer did not leak and fire post-unmount.
            expect(supabase.channel).toHaveBeenCalledTimes(1);
            expect(supabase.removeChannel).toHaveBeenCalledTimes(1);
        });

        it('a second error status arriving while a reconnect is already scheduled does not schedule a second, overlapping timer', () => {
            vi.useFakeTimers();
            const { supabase, channels } = makeFakeSupabase();
            vi.mocked(getSupabaseClient).mockReturnValue(supabase as never);

            renderHook(() =>
                useRoomSubscription({
                    roomCode: 'ABC123',
                    testMode: false,
                    localState: buildState(),
                    onServerRoom: vi.fn(),
                    onReconciled: vi.fn(),
                    hasPendingMove: () => false,
                })
            );

            channels[0]._fireStatus('CHANNEL_ERROR');
            channels[0]._fireStatus('TIMED_OUT'); // second error before the first retry fires

            vi.advanceTimersByTime(SUBSCRIPTION_RECONNECT_BASE_MS);

            // Exactly one reconnect happened, not two.
            expect(channels).toHaveLength(2);
        });

        it('unmounting while a reconnect timer is outstanding clears it - no further channel or removeChannel call happens after unmount', () => {
            vi.useFakeTimers();
            const { supabase, channels } = makeFakeSupabase();
            vi.mocked(getSupabaseClient).mockReturnValue(supabase as never);

            const { unmount } = renderHook(() =>
                useRoomSubscription({
                    roomCode: 'ABC123',
                    testMode: false,
                    localState: buildState(),
                    onServerRoom: vi.fn(),
                    onReconciled: vi.fn(),
                    hasPendingMove: () => false,
                })
            );

            channels[0]._fireStatus('CHANNEL_ERROR'); // schedules a reconnect, removes channels[0]
            const channelCallsBeforeUnmount = supabase.channel.mock.calls.length;
            const removeChannelCallsBeforeUnmount = supabase.removeChannel.mock.calls.length;

            unmount();

            vi.advanceTimersByTime(SUBSCRIPTION_RECONNECT_MAX_MS);

            expect(supabase.channel.mock.calls.length).toBe(channelCallsBeforeUnmount);
            expect(supabase.removeChannel.mock.calls.length).toBe(removeChannelCallsBeforeUnmount);
        });

        it('changing the room code while a reconnect for the old room is pending cancels that pending reconnect', () => {
            vi.useFakeTimers();
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
                        hasPendingMove: () => false,
                    }),
                { initialProps: { roomCode: 'ABC123' } }
            );

            channels[0]._fireStatus('CHANNEL_ERROR'); // schedules a reconnect for ABC123

            rerender({ roomCode: 'XYZ789' });

            const roomCodeCallsAfterChange = supabase.channel.mock.calls.filter(
                (args) => args[0] === 'room-ABC123'
            );

            vi.advanceTimersByTime(SUBSCRIPTION_RECONNECT_MAX_MS);

            // No extra channel is ever created for the old room's cancelled
            // reconnect - only the original mount call used 'room-ABC123'.
            const roomCodeCallsAfterAdvance = supabase.channel.mock.calls.filter(
                (args) => args[0] === 'room-ABC123'
            );
            expect(roomCodeCallsAfterAdvance).toHaveLength(roomCodeCallsAfterChange.length);
            expect(roomCodeCallsAfterAdvance).toHaveLength(1);
        });
    });
});
