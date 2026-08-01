import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';

vi.mock('../../supabase/client', () => ({
    getSupabaseClient: vi.fn(),
}));

import { getSupabaseClient } from '../../supabase/client';
import { usePresence } from '../../hooks/usePresence';
import { HEARTBEAT_INTERVAL_MS } from '../../supabase/roomTypes';

type SubscribeCb = (status: string) => void;
type PresenceHandler = (payload?: { key: string }) => void;

/** A fake presence `.channel()` return value recording `.on` registrations
 * by presence event name and exposing `_fire*` helpers plus spies.
 * `_fireStatus` (matching useRoomSubscription.test.ts's established shape)
 * lets a test simulate any subscribe-status transition, not just SUBSCRIBED. */
function makeFakeChannel(presenceKeys: string[] = []) {
    const handlers: Record<string, PresenceHandler> = {};
    let subscribeCb: SubscribeCb | null = null;
    const channel = {
        on: vi.fn((_type: string, config: { event: string }, handler: PresenceHandler) => {
            handlers[config.event] = handler;
            return channel;
        }),
        subscribe: vi.fn((cb?: SubscribeCb) => {
            subscribeCb = cb ?? null;
            return channel;
        }),
        track: vi.fn().mockResolvedValue(undefined),
        presenceState: vi.fn(() => Object.fromEntries(presenceKeys.map((k) => [k, [{}]]))),
        _fireSubscribed() {
            subscribeCb?.('SUBSCRIBED');
        },
        _fireStatus(status: string) {
            subscribeCb?.(status);
        },
        _fireSync(keys: string[]) {
            presenceKeys.length = 0;
            presenceKeys.push(...keys);
            handlers['sync']?.();
        },
        _fireLeave(key: string) {
            handlers['leave']?.({ key });
        },
    };
    return channel;
}

function makeFakeSupabase() {
    const channels: ReturnType<typeof makeFakeChannel>[] = [];
    const invoke = vi.fn().mockResolvedValue({ data: {}, error: null });
    const supabase = {
        channel: vi.fn(() => {
            const ch = makeFakeChannel();
            channels.push(ch);
            return ch;
        }),
        removeChannel: vi.fn(),
        functions: { invoke },
    };
    return { supabase, channels, invoke };
}

describe('usePresence', () => {
    beforeEach(() => {
        vi.mocked(getSupabaseClient).mockReset();
        vi.useFakeTimers();
    });

    afterEach(() => {
        vi.useRealTimers();
    });

    it('with testMode true, creates no channel and returns an empty online set', () => {
        const { supabase } = makeFakeSupabase();
        vi.mocked(getSupabaseClient).mockReturnValue(supabase as never);

        const { result } = renderHook(() => usePresence({ roomCode: 'ABC123', playerId: 'p1', testMode: true }));

        expect(supabase.channel).not.toHaveBeenCalled();
        expect(result.current.onlinePlayerIds).toEqual([]);
    });

    it('with an empty room code, creates no channel and returns an empty online set', () => {
        const { supabase } = makeFakeSupabase();
        vi.mocked(getSupabaseClient).mockReturnValue(supabase as never);

        const { result } = renderHook(() => usePresence({ roomCode: '', playerId: 'p1', testMode: false }));

        expect(supabase.channel).not.toHaveBeenCalled();
        expect(result.current.onlinePlayerIds).toEqual([]);
    });

    it('with an empty player id, creates no channel and returns an empty online set', () => {
        const { supabase } = makeFakeSupabase();
        vi.mocked(getSupabaseClient).mockReturnValue(supabase as never);

        const { result } = renderHook(() => usePresence({ roomCode: 'ABC123', playerId: '', testMode: false }));

        expect(supabase.channel).not.toHaveBeenCalled();
        expect(result.current.onlinePlayerIds).toEqual([]);
    });

    it('on SUBSCRIBED, calls track once with the local player id', async () => {
        const { supabase, channels } = makeFakeSupabase();
        vi.mocked(getSupabaseClient).mockReturnValue(supabase as never);

        renderHook(() => usePresence({ roomCode: 'ABC123', playerId: 'p1', testMode: false }));

        await act(async () => {
            channels[0]._fireSubscribed();
            await Promise.resolve();
        });

        expect(channels[0].track).toHaveBeenCalledTimes(1);
        expect(channels[0].track).toHaveBeenCalledWith(
            expect.objectContaining({ player_id: 'p1' })
        );
    });

    it('a sync event replaces the returned online set with the channel current presence keys', async () => {
        const { supabase, channels } = makeFakeSupabase();
        vi.mocked(getSupabaseClient).mockReturnValue(supabase as never);

        const { result } = renderHook(() => usePresence({ roomCode: 'ABC123', playerId: 'p1', testMode: false }));

        await act(async () => {
            channels[0]._fireSubscribed();
            await Promise.resolve();
        });

        act(() => {
            channels[0]._fireSync(['p1', 'p2']);
        });

        expect(result.current.onlinePlayerIds.sort()).toEqual(['p1', 'p2']);
    });

    it('a leave event for another player removes that player from the online set', async () => {
        const { supabase, channels } = makeFakeSupabase();
        vi.mocked(getSupabaseClient).mockReturnValue(supabase as never);

        const { result } = renderHook(() => usePresence({ roomCode: 'ABC123', playerId: 'p1', testMode: false }));

        await act(async () => {
            channels[0]._fireSubscribed();
            await Promise.resolve();
        });

        act(() => {
            channels[0]._fireSync(['p1', 'p2']);
        });
        expect(result.current.onlinePlayerIds.sort()).toEqual(['p1', 'p2']);

        act(() => {
            channels[0]._fireLeave('p2');
        });

        expect(result.current.onlinePlayerIds).toEqual(['p1']);
    });

    it('invokes the heartbeat edge function immediately on subscribe and then every HEARTBEAT_INTERVAL_MS', async () => {
        const { supabase, channels, invoke } = makeFakeSupabase();
        vi.mocked(getSupabaseClient).mockReturnValue(supabase as never);

        renderHook(() => usePresence({ roomCode: 'ABC123', playerId: 'p1', testMode: false }));

        await act(async () => {
            channels[0]._fireSubscribed();
            await Promise.resolve();
        });

        expect(invoke).toHaveBeenCalledTimes(1);
        expect(invoke).toHaveBeenCalledWith('heartbeat', { body: { roomCode: 'ABC123' } });

        await act(async () => {
            vi.advanceTimersByTime(HEARTBEAT_INTERVAL_MS);
            await Promise.resolve();
        });
        expect(invoke).toHaveBeenCalledTimes(2);

        await act(async () => {
            vi.advanceTimersByTime(HEARTBEAT_INTERVAL_MS);
            await Promise.resolve();
        });
        expect(invoke).toHaveBeenCalledTimes(3);
    });

    it('unmounting removes the channel and clears the heartbeat interval', async () => {
        const { supabase, channels, invoke } = makeFakeSupabase();
        vi.mocked(getSupabaseClient).mockReturnValue(supabase as never);

        const { unmount } = renderHook(() => usePresence({ roomCode: 'ABC123', playerId: 'p1', testMode: false }));

        await act(async () => {
            channels[0]._fireSubscribed();
            await Promise.resolve();
        });
        expect(invoke).toHaveBeenCalledTimes(1);

        unmount();

        expect(supabase.removeChannel).toHaveBeenCalledTimes(1);

        // No further heartbeats after unmount, proving the interval was cleared.
        await act(async () => {
            vi.advanceTimersByTime(HEARTBEAT_INTERVAL_MS * 3);
            await Promise.resolve();
        });
        expect(invoke).toHaveBeenCalledTimes(1);
    });

    it('isPlayerOffline(playerId) returns true for an absent player and false for a present one', async () => {
        const { supabase, channels } = makeFakeSupabase();
        vi.mocked(getSupabaseClient).mockReturnValue(supabase as never);

        const { result } = renderHook(() => usePresence({ roomCode: 'ABC123', playerId: 'p1', testMode: false }));

        await act(async () => {
            channels[0]._fireSubscribed();
            await Promise.resolve();
        });

        act(() => {
            channels[0]._fireSync(['p1']);
        });

        expect(result.current.isPlayerOffline('p1')).toBe(false);
        expect(result.current.isPlayerOffline('p2')).toBe(true);
    });

    describe('consumeJustReconnected (D-10, 02-UAT.md test 10)', () => {
        it('returns false when the channel has never dropped', async () => {
            const { supabase, channels } = makeFakeSupabase();
            vi.mocked(getSupabaseClient).mockReturnValue(supabase as never);

            const { result } = renderHook(() =>
                usePresence({ roomCode: 'ABC123', playerId: 'p1', testMode: false })
            );

            await act(async () => {
                channels[0]._fireSubscribed();
                await Promise.resolve();
            });

            act(() => {
                channels[0]._fireSync(['p1', 'p2']);
            });

            expect(result.current.consumeJustReconnected()).toBe(false);
        });

        it.each(['CHANNEL_ERROR', 'TIMED_OUT', 'CLOSED'])(
            'returns true exactly once for the sync that lands after a %s recovers',
            async (dropStatus) => {
                const { supabase, channels } = makeFakeSupabase();
                vi.mocked(getSupabaseClient).mockReturnValue(supabase as never);

                const { result } = renderHook(() =>
                    usePresence({ roomCode: 'ABC123', playerId: 'p1', testMode: false })
                );

                await act(async () => {
                    channels[0]._fireSubscribed();
                    await Promise.resolve();
                });
                act(() => {
                    channels[0]._fireSync(['p1']);
                });
                // Not yet reconnected - nothing has dropped.
                expect(result.current.consumeJustReconnected()).toBe(false);

                // The channel drops...
                act(() => {
                    channels[0]._fireStatus(dropStatus);
                });
                // ...and later recovers, immediately followed by the batched
                // presence sync catch-up described in 02-UAT.md test 10's
                // root_cause - this is the pass that must be flagged.
                await act(async () => {
                    channels[0]._fireSubscribed();
                    await Promise.resolve();
                });
                act(() => {
                    channels[0]._fireSync(['p1', 'p2']);
                });

                expect(result.current.consumeJustReconnected()).toBe(true);
                // Consuming clears the signal - a second read must not
                // re-report the same recovery.
                expect(result.current.consumeJustReconnected()).toBe(false);
            }
        );

        it('does not flag a routine sync that happens without any prior drop, even after SUBSCRIBED fires again on remount-free re-track', async () => {
            const { supabase, channels } = makeFakeSupabase();
            vi.mocked(getSupabaseClient).mockReturnValue(supabase as never);

            const { result } = renderHook(() =>
                usePresence({ roomCode: 'ABC123', playerId: 'p1', testMode: false })
            );

            await act(async () => {
                channels[0]._fireSubscribed();
                await Promise.resolve();
            });
            act(() => {
                channels[0]._fireSync(['p1']);
            });
            act(() => {
                channels[0]._fireSync(['p1', 'p2']);
            });

            expect(result.current.consumeJustReconnected()).toBe(false);
        });

        it('does not carry an unconsumed recovery flag from one room into the next room on the same mounted hook', async () => {
            const { supabase, channels } = makeFakeSupabase();
            vi.mocked(getSupabaseClient).mockReturnValue(supabase as never);

            const { result, rerender } = renderHook(
                ({ roomCode }: { roomCode: string }) =>
                    usePresence({ roomCode, playerId: 'p1', testMode: false }),
                { initialProps: { roomCode: 'ABC123' } }
            );

            await act(async () => {
                channels[0]._fireSubscribed();
                await Promise.resolve();
            });
            act(() => {
                channels[0]._fireStatus('CHANNEL_ERROR');
            });
            await act(async () => {
                channels[0]._fireSubscribed();
                await Promise.resolve();
            });
            // The recovery flag is now live but deliberately left unconsumed
            // (no _fireSync yet, and no consumeJustReconnected() call) before
            // the room changes out from under this same hook instance -
            // Router keeps usePresence mounted across a room change, only its
            // effect's cleanup/re-run fires (roomCode is an effect dependency).
            rerender({ roomCode: 'XYZ789' });

            await act(async () => {
                channels[1]._fireSubscribed();
                await Promise.resolve();
            });
            act(() => {
                channels[1]._fireSync(['p1']);
            });

            expect(result.current.consumeJustReconnected()).toBe(false);
        });
    });
});
