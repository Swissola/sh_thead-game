import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';

vi.mock('../../supabase/client', () => ({
  getSupabaseClient: vi.fn(),
}));

import { getSupabaseClient } from '../../supabase/client';
import { useTurnTimeoutSweep, TURN_SWEEP_INTERVAL_MS } from '../../hooks/useTurnTimeoutSweep';
import { TURN_GRACE_MS } from '../../supabase/roomTypes';

const NOW = new Date('2026-01-01T00:00:00.000Z').getTime();

function makeFakeSupabase(invoke = vi.fn().mockResolvedValue({ data: {}, error: null })) {
  return { supabase: { functions: { invoke } }, invoke };
}

/** turnStartedAt chosen so the first TURN_SWEEP_INTERVAL_MS tick lands
 * exactly at TURN_GRACE_MS elapsed - one tick is enough to observe expiry. */
function nearExpiryStart(): string {
  return new Date(NOW - TURN_GRACE_MS + TURN_SWEEP_INTERVAL_MS).toISOString();
}

describe('useTurnTimeoutSweep', () => {
  beforeEach(() => {
    vi.mocked(getSupabaseClient).mockReset();
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('with testMode true, arms no interval, invokes nothing, and reports graceExpired false', () => {
    const { supabase, invoke } = makeFakeSupabase();
    vi.mocked(getSupabaseClient).mockReturnValue(supabase as never);

    const { result } = renderHook(() =>
      useTurnTimeoutSweep({
        roomCode: 'ABC123',
        testMode: true,
        phase: 'playing',
        turnStartedAt: nearExpiryStart(),
        currentTurnPlayerId: 'other',
        playerId: 'me',
      })
    );

    expect(result.current.graceExpired).toBe(false);

    act(() => {
      vi.advanceTimersByTime(TURN_SWEEP_INTERVAL_MS * 3);
    });

    expect(invoke).not.toHaveBeenCalled();
    expect(result.current.graceExpired).toBe(false);
  });

  it('with an empty room code, arms no interval, invokes nothing, and reports graceExpired false', () => {
    const { supabase, invoke } = makeFakeSupabase();
    vi.mocked(getSupabaseClient).mockReturnValue(supabase as never);

    const { result } = renderHook(() =>
      useTurnTimeoutSweep({
        roomCode: '',
        testMode: false,
        phase: 'playing',
        turnStartedAt: nearExpiryStart(),
        currentTurnPlayerId: 'other',
        playerId: 'me',
      })
    );

    act(() => {
      vi.advanceTimersByTime(TURN_SWEEP_INTERVAL_MS * 3);
    });

    expect(invoke).not.toHaveBeenCalled();
    expect(result.current.graceExpired).toBe(false);
  });

  it("with a phase other than 'playing', arms no interval, invokes nothing, and reports graceExpired false", () => {
    const { supabase, invoke } = makeFakeSupabase();
    vi.mocked(getSupabaseClient).mockReturnValue(supabase as never);

    const { result } = renderHook(() =>
      useTurnTimeoutSweep({
        roomCode: 'ABC123',
        testMode: false,
        phase: 'setup',
        turnStartedAt: nearExpiryStart(),
        currentTurnPlayerId: 'other',
        playerId: 'me',
      })
    );

    act(() => {
      vi.advanceTimersByTime(TURN_SWEEP_INTERVAL_MS * 3);
    });

    expect(invoke).not.toHaveBeenCalled();
    expect(result.current.graceExpired).toBe(false);
  });

  it('with an absent turnStartedAt, arms no interval, invokes nothing, and reports graceExpired false', () => {
    const { supabase, invoke } = makeFakeSupabase();
    vi.mocked(getSupabaseClient).mockReturnValue(supabase as never);

    const { result } = renderHook(() =>
      useTurnTimeoutSweep({
        roomCode: 'ABC123',
        testMode: false,
        phase: 'playing',
        turnStartedAt: '',
        currentTurnPlayerId: 'other',
        playerId: 'me',
      })
    );

    act(() => {
      vi.advanceTimersByTime(TURN_SWEEP_INTERVAL_MS * 3);
    });

    expect(invoke).not.toHaveBeenCalled();
    expect(result.current.graceExpired).toBe(false);
  });

  it('reports graceExpired false and invokes nothing while less than TURN_GRACE_MS has passed', () => {
    const { supabase, invoke } = makeFakeSupabase();
    vi.mocked(getSupabaseClient).mockReturnValue(supabase as never);

    const { result } = renderHook(() =>
      useTurnTimeoutSweep({
        roomCode: 'ABC123',
        testMode: false,
        phase: 'playing',
        turnStartedAt: new Date(NOW).toISOString(),
        currentTurnPlayerId: 'other',
        playerId: 'me',
      })
    );

    act(() => {
      vi.advanceTimersByTime(TURN_SWEEP_INTERVAL_MS);
    });

    expect(result.current.graceExpired).toBe(false);
    expect(invoke).not.toHaveBeenCalled();
  });

  it('reports graceExpired true once TURN_GRACE_MS has passed since turnStartedAt', () => {
    const { supabase } = makeFakeSupabase();
    vi.mocked(getSupabaseClient).mockReturnValue(supabase as never);

    const { result } = renderHook(() =>
      useTurnTimeoutSweep({
        roomCode: 'ABC123',
        testMode: false,
        phase: 'playing',
        turnStartedAt: new Date(NOW).toISOString(),
        currentTurnPlayerId: 'me', // own turn - isolates the graceExpired flag from invoke behaviour
        playerId: 'me',
      })
    );

    act(() => {
      vi.advanceTimersByTime(TURN_GRACE_MS);
    });

    expect(result.current.graceExpired).toBe(true);
  });

  it('invokes check-turn-timeout with a body containing exactly roomCode once expired, when not on your own turn', async () => {
    const { supabase, invoke } = makeFakeSupabase();
    vi.mocked(getSupabaseClient).mockReturnValue(supabase as never);

    renderHook(() =>
      useTurnTimeoutSweep({
        roomCode: 'ABC123',
        testMode: false,
        phase: 'playing',
        turnStartedAt: nearExpiryStart(),
        currentTurnPlayerId: 'other',
        playerId: 'me',
      })
    );

    await act(async () => {
      vi.advanceTimersByTime(TURN_SWEEP_INTERVAL_MS);
      await Promise.resolve();
    });

    expect(invoke).toHaveBeenCalledTimes(1);
    expect(invoke).toHaveBeenCalledWith('check-turn-timeout', { body: { roomCode: 'ABC123' } });
    const [, options] = invoke.mock.calls[0] as [string, { body: Record<string, unknown> }];
    expect(Object.keys(options.body)).toEqual(['roomCode']);
  });

  it('never invokes check-turn-timeout when the local player is the current-turn player, however long the turn has run', async () => {
    const { supabase, invoke } = makeFakeSupabase();
    vi.mocked(getSupabaseClient).mockReturnValue(supabase as never);

    renderHook(() =>
      useTurnTimeoutSweep({
        roomCode: 'ABC123',
        testMode: false,
        phase: 'playing',
        turnStartedAt: nearExpiryStart(),
        currentTurnPlayerId: 'me',
        playerId: 'me',
      })
    );

    await act(async () => {
      vi.advanceTimersByTime(TURN_SWEEP_INTERVAL_MS * 5);
      await Promise.resolve();
    });

    expect(invoke).not.toHaveBeenCalled();
  });

  it('only one invocation is in flight at a time - a tick during a pending call invokes nothing', async () => {
    let resolveInvoke!: (value: { data: unknown; error: unknown }) => void;
    const pending = new Promise<{ data: unknown; error: unknown }>((resolve) => {
      resolveInvoke = resolve;
    });
    const invoke = vi
      .fn()
      .mockReturnValueOnce(pending)
      .mockResolvedValue({ data: {}, error: null });
    vi.mocked(getSupabaseClient).mockReturnValue({ functions: { invoke } } as never);

    renderHook(() =>
      useTurnTimeoutSweep({
        roomCode: 'ABC123',
        testMode: false,
        phase: 'playing',
        turnStartedAt: nearExpiryStart(),
        currentTurnPlayerId: 'other',
        playerId: 'me',
      })
    );

    await act(async () => {
      vi.advanceTimersByTime(TURN_SWEEP_INTERVAL_MS);
      await Promise.resolve();
    });
    expect(invoke).toHaveBeenCalledTimes(1);

    // Next tick fires while the first call is still pending - no second call.
    await act(async () => {
      vi.advanceTimersByTime(TURN_SWEEP_INTERVAL_MS);
      await Promise.resolve();
    });
    expect(invoke).toHaveBeenCalledTimes(1);

    await act(async () => {
      resolveInvoke({ data: {}, error: null });
      await Promise.resolve();
    });

    // Now that the first call resolved, the next tick invokes again.
    await act(async () => {
      vi.advanceTimersByTime(TURN_SWEEP_INTERVAL_MS);
      await Promise.resolve();
    });
    expect(invoke).toHaveBeenCalledTimes(2);
  });

  it('a changed turnStartedAt resets graceExpired to false and re-arms the trigger', () => {
    const { supabase } = makeFakeSupabase();
    vi.mocked(getSupabaseClient).mockReturnValue(supabase as never);

    const { result, rerender } = renderHook(
      (props: { turnStartedAt: string }) =>
        useTurnTimeoutSweep({
          roomCode: 'ABC123',
          testMode: false,
          phase: 'playing',
          turnStartedAt: props.turnStartedAt,
          currentTurnPlayerId: 'me',
          playerId: 'me',
        }),
      { initialProps: { turnStartedAt: new Date(NOW - TURN_GRACE_MS - 1000).toISOString() } }
    );

    act(() => {
      vi.advanceTimersByTime(TURN_SWEEP_INTERVAL_MS);
    });
    expect(result.current.graceExpired).toBe(true);

    rerender({ turnStartedAt: new Date(Date.now()).toISOString() });

    expect(result.current.graceExpired).toBe(false);
  });

  it('a thrown invocation is swallowed without a toast and retried on the next tick', async () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const invoke = vi
      .fn()
      .mockRejectedValueOnce(new Error('network'))
      .mockResolvedValue({ data: {}, error: null });
    vi.mocked(getSupabaseClient).mockReturnValue({ functions: { invoke } } as never);

    renderHook(() =>
      useTurnTimeoutSweep({
        roomCode: 'ABC123',
        testMode: false,
        phase: 'playing',
        turnStartedAt: nearExpiryStart(),
        currentTurnPlayerId: 'other',
        playerId: 'me',
      })
    );

    await act(async () => {
      vi.advanceTimersByTime(TURN_SWEEP_INTERVAL_MS);
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(invoke).toHaveBeenCalledTimes(1);

    await act(async () => {
      vi.advanceTimersByTime(TURN_SWEEP_INTERVAL_MS);
      await Promise.resolve();
    });
    expect(invoke).toHaveBeenCalledTimes(2);
    // A thrown rejection stays in the .catch swallow path - never warned on,
    // and does not leave inFlightRef stuck (proven by the second call firing).
    expect(warnSpy).not.toHaveBeenCalled();

    warnSpy.mockRestore();
  });

  it('a TIMEOUT_NOT_ELAPSED result is swallowed without a toast, logs nothing, and is retried on the next tick', async () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const invoke = vi
      .fn()
      .mockResolvedValue({
        data: {
          error: { code: 'TIMEOUT_NOT_ELAPSED', message: 'Grace period has not yet elapsed' },
        },
        error: null,
      });
    vi.mocked(getSupabaseClient).mockReturnValue({ functions: { invoke } } as never);

    renderHook(() =>
      useTurnTimeoutSweep({
        roomCode: 'ABC123',
        testMode: false,
        phase: 'playing',
        turnStartedAt: nearExpiryStart(),
        currentTurnPlayerId: 'other',
        playerId: 'me',
      })
    );

    await act(async () => {
      vi.advanceTimersByTime(TURN_SWEEP_INTERVAL_MS);
      await Promise.resolve();
    });
    expect(invoke).toHaveBeenCalledTimes(1);

    await act(async () => {
      vi.advanceTimersByTime(TURN_SWEEP_INTERVAL_MS);
      await Promise.resolve();
    });
    expect(invoke).toHaveBeenCalledTimes(2);
    // TIMEOUT_NOT_ELAPSED is the every-5-seconds normal case on every client
    // and must stay completely quiet.
    expect(warnSpy).not.toHaveBeenCalled();

    warnSpy.mockRestore();
  });

  it('a CONFLICT result is swallowed without a toast, logs nothing, and is retried on the next tick', async () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const invoke = vi.fn().mockResolvedValue({
      data: {
        error: { code: 'CONFLICT', message: 'Could not update room after 3 attempts' },
      },
      error: null,
    });
    vi.mocked(getSupabaseClient).mockReturnValue({ functions: { invoke } } as never);

    renderHook(() =>
      useTurnTimeoutSweep({
        roomCode: 'ABC123',
        testMode: false,
        phase: 'playing',
        turnStartedAt: nearExpiryStart(),
        currentTurnPlayerId: 'other',
        playerId: 'me',
      })
    );

    await act(async () => {
      vi.advanceTimersByTime(TURN_SWEEP_INTERVAL_MS);
      await Promise.resolve();
    });
    expect(invoke).toHaveBeenCalledTimes(1);

    await act(async () => {
      vi.advanceTimersByTime(TURN_SWEEP_INTERVAL_MS);
      await Promise.resolve();
    });
    expect(invoke).toHaveBeenCalledTimes(2);
    // CONFLICT is withVersionRetry losing a race it will retry on the next
    // tick - expected and self-correcting, so it must stay quiet too.
    expect(warnSpy).not.toHaveBeenCalled();

    warnSpy.mockRestore();
  });

  it('an EdgeResult error whose code is neither TIMEOUT_NOT_ELAPSED nor CONFLICT logs exactly one console.warn naming that code', async () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const invoke = vi.fn().mockResolvedValue({
      data: {
        error: { code: 'ROOM_NOT_FOUND', message: 'Room ABC123 not found' },
      },
      error: null,
    });
    vi.mocked(getSupabaseClient).mockReturnValue({ functions: { invoke } } as never);

    renderHook(() =>
      useTurnTimeoutSweep({
        roomCode: 'ABC123',
        testMode: false,
        phase: 'playing',
        turnStartedAt: nearExpiryStart(),
        currentTurnPlayerId: 'other',
        playerId: 'me',
      })
    );

    await act(async () => {
      vi.advanceTimersByTime(TURN_SWEEP_INTERVAL_MS);
      await Promise.resolve();
    });

    expect(warnSpy).toHaveBeenCalledTimes(1);
    expect(warnSpy.mock.calls[0].some((arg) => String(arg).includes('ROOM_NOT_FOUND'))).toBe(true);

    warnSpy.mockRestore();
  });

  it('a resolved top-level transport error ({ data: null, error }, the uncaught-5xx shape) logs exactly one console.warn', async () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const invoke = vi.fn().mockResolvedValue({ data: null, error: { message: 'internal error' } });
    vi.mocked(getSupabaseClient).mockReturnValue({ functions: { invoke } } as never);

    renderHook(() =>
      useTurnTimeoutSweep({
        roomCode: 'ABC123',
        testMode: false,
        phase: 'playing',
        turnStartedAt: nearExpiryStart(),
        currentTurnPlayerId: 'other',
        playerId: 'me',
      })
    );

    await act(async () => {
      vi.advanceTimersByTime(TURN_SWEEP_INTERVAL_MS);
      await Promise.resolve();
    });
    expect(invoke).toHaveBeenCalledTimes(1);
    expect(warnSpy).toHaveBeenCalledTimes(1);

    // inFlightRef must not be left stuck true - the next tick invokes again.
    await act(async () => {
      vi.advanceTimersByTime(TURN_SWEEP_INTERVAL_MS);
      await Promise.resolve();
    });
    expect(invoke).toHaveBeenCalledTimes(2);
    expect(warnSpy).toHaveBeenCalledTimes(2);

    warnSpy.mockRestore();
  });

  it('unmounting clears the interval', async () => {
    const { supabase, invoke } = makeFakeSupabase();
    vi.mocked(getSupabaseClient).mockReturnValue(supabase as never);

    const { unmount } = renderHook(() =>
      useTurnTimeoutSweep({
        roomCode: 'ABC123',
        testMode: false,
        phase: 'playing',
        turnStartedAt: nearExpiryStart(),
        currentTurnPlayerId: 'other',
        playerId: 'me',
      })
    );

    await act(async () => {
      vi.advanceTimersByTime(TURN_SWEEP_INTERVAL_MS);
      await Promise.resolve();
    });
    expect(invoke).toHaveBeenCalledTimes(1);

    unmount();

    await act(async () => {
      vi.advanceTimersByTime(TURN_SWEEP_INTERVAL_MS * 5);
      await Promise.resolve();
    });
    expect(invoke).toHaveBeenCalledTimes(1);
  });
});
