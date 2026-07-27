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
 * by presence event name and exposing `_fire*` helpers plus spies. */
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
});
