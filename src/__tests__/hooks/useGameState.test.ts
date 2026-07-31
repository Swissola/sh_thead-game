import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';

vi.mock('../../supabase/client', () => ({
    getSupabaseClient: vi.fn(),
}));

import { getSupabaseClient } from '../../supabase/client';
import { useGameStateUpdater } from '../../hooks/useGameState';
import { buildGameState } from '../testUtils/buildGameState';
import type { Move } from '../../engine/moves';

function makeFakeSupabase(invokeImpl?: (...args: unknown[]) => unknown) {
    const invoke = vi.fn(invokeImpl ?? (() => Promise.resolve({ data: {}, error: null })));
    const supabase = { functions: { invoke } };
    return { supabase, invoke };
}

const move: Move = { type: 'READY_UP', playerId: 'p0' };
const optimisticState = buildGameState();

describe('useGameStateUpdater', () => {
    beforeEach(() => {
        vi.mocked(getSupabaseClient).mockReset();
    });

    it('with testMode true, sets local state and makes no network call', () => {
        const { supabase, invoke } = makeFakeSupabase();
        vi.mocked(getSupabaseClient).mockReturnValue(supabase as never);
        const setGameState = vi.fn();
        const showToast = vi.fn();
        const beginPendingMove = vi.fn(() => vi.fn());

        const { result } = renderHook(() =>
            useGameStateUpdater(true, 'ABC123', setGameState, showToast, beginPendingMove)
        );

        act(() => {
            result.current(move, optimisticState);
        });

        expect(setGameState).toHaveBeenCalledWith(optimisticState);
        expect(getSupabaseClient).not.toHaveBeenCalled();
        expect(invoke).not.toHaveBeenCalled();
    });

    it('with testMode false, sets local state and invokes apply-move with the room code and move', () => {
        const { supabase, invoke } = makeFakeSupabase();
        vi.mocked(getSupabaseClient).mockReturnValue(supabase as never);
        const setGameState = vi.fn();
        const showToast = vi.fn();
        const beginPendingMove = vi.fn(() => vi.fn());

        const { result } = renderHook(() =>
            useGameStateUpdater(false, 'ABC123', setGameState, showToast, beginPendingMove)
        );

        act(() => {
            result.current(move, optimisticState);
        });

        expect(setGameState).toHaveBeenCalledWith(optimisticState);
        expect(invoke).toHaveBeenCalledWith('apply-move', { body: { roomCode: 'ABC123', move } });
    });

    it('submitMove never awaits the server before setting local state (synchronous optimistic update)', () => {
        const { supabase } = makeFakeSupabase(() => new Promise(() => {})); // never resolves
        vi.mocked(getSupabaseClient).mockReturnValue(supabase as never);
        const setGameState = vi.fn();
        const showToast = vi.fn();
        const beginPendingMove = vi.fn(() => vi.fn());

        const { result } = renderHook(() =>
            useGameStateUpdater(false, 'ABC123', setGameState, showToast, beginPendingMove)
        );

        act(() => {
            result.current(move, optimisticState);
        });

        // setGameState fired synchronously, before the never-resolving invoke settles.
        expect(setGameState).toHaveBeenCalledTimes(1);
        expect(setGameState).toHaveBeenCalledWith(optimisticState);
    });

    it('when the invocation throws, shows a toast with the generic failure copy', async () => {
        const { supabase } = makeFakeSupabase(() => Promise.reject(new Error('network down')));
        vi.mocked(getSupabaseClient).mockReturnValue(supabase as never);
        const setGameState = vi.fn();
        const showToast = vi.fn();
        const beginPendingMove = vi.fn(() => vi.fn());

        const { result } = renderHook(() =>
            useGameStateUpdater(false, 'ABC123', setGameState, showToast, beginPendingMove)
        );

        await act(async () => {
            result.current(move, optimisticState);
            await Promise.resolve();
            await Promise.resolve();
        });

        expect(showToast).toHaveBeenCalledWith('Failed to save your move - please retry.');
    });

    it('when the invocation returns a transport error, shows a toast with the generic failure copy', async () => {
        const { supabase } = makeFakeSupabase(() => Promise.resolve({ data: null, error: new Error('transport') }));
        vi.mocked(getSupabaseClient).mockReturnValue(supabase as never);
        const setGameState = vi.fn();
        const showToast = vi.fn();
        const beginPendingMove = vi.fn(() => vi.fn());

        const { result } = renderHook(() =>
            useGameStateUpdater(false, 'ABC123', setGameState, showToast, beginPendingMove)
        );

        await act(async () => {
            result.current(move, optimisticState);
            await Promise.resolve();
            await Promise.resolve();
        });

        expect(showToast).toHaveBeenCalledWith('Failed to save your move - please retry.');
    });

    it("when the invocation returns an EdgeResult with an error, shows a toast with variant 'reconcile'", async () => {
        const { supabase } = makeFakeSupabase(() =>
            Promise.resolve({ data: { error: { code: 'CONFLICT', message: 'stale version' } }, error: null })
        );
        vi.mocked(getSupabaseClient).mockReturnValue(supabase as never);
        const setGameState = vi.fn();
        const showToast = vi.fn();
        const beginPendingMove = vi.fn(() => vi.fn());

        const { result } = renderHook(() =>
            useGameStateUpdater(false, 'ABC123', setGameState, showToast, beginPendingMove)
        );

        await act(async () => {
            result.current(move, optimisticState);
            await Promise.resolve();
            await Promise.resolve();
        });

        expect(showToast).toHaveBeenCalledWith(
            "Your move didn't stick - synced with the latest game state.",
            'RECONCILED',
            'reconcile'
        );
    });

    // Plan 02-16 (MPLAY-05, UAT test 7): unit-level assertions on the
    // beginPendingMove wiring itself, distinct from GameContext.test.tsx's
    // integration-level ones.
    describe('beginPendingMove wiring', () => {
        it('is never called in testMode', () => {
            const { supabase } = makeFakeSupabase();
            vi.mocked(getSupabaseClient).mockReturnValue(supabase as never);
            const setGameState = vi.fn();
            const showToast = vi.fn();
            const beginPendingMove = vi.fn(() => vi.fn());

            const { result } = renderHook(() =>
                useGameStateUpdater(true, 'ABC123', setGameState, showToast, beginPendingMove)
            );

            act(() => {
                result.current(move, optimisticState);
            });

            expect(beginPendingMove).not.toHaveBeenCalled();
        });

        it('is called exactly once per non-test-mode submitMove invocation, before the invoke call', () => {
            const invokeOrder: string[] = [];
            const { supabase } = makeFakeSupabase(() => {
                invokeOrder.push('invoke');
                return new Promise(() => {}); // never resolves - only ordering matters here
            });
            vi.mocked(getSupabaseClient).mockReturnValue(supabase as never);
            const setGameState = vi.fn();
            const showToast = vi.fn();
            const beginPendingMove = vi.fn(() => {
                invokeOrder.push('beginPendingMove');
                return vi.fn();
            });

            const { result } = renderHook(() =>
                useGameStateUpdater(false, 'ABC123', setGameState, showToast, beginPendingMove)
            );

            act(() => {
                result.current(move, optimisticState);
            });

            expect(beginPendingMove).toHaveBeenCalledTimes(1);
            expect(invokeOrder).toEqual(['beginPendingMove', 'invoke']);
        });

        it('calls the returned resolver exactly once on the thrown catch branch', async () => {
            const { supabase } = makeFakeSupabase(() => Promise.reject(new Error('network down')));
            vi.mocked(getSupabaseClient).mockReturnValue(supabase as never);
            const setGameState = vi.fn();
            const showToast = vi.fn();
            const resolvePendingMove = vi.fn();
            const beginPendingMove = vi.fn(() => resolvePendingMove);

            const { result } = renderHook(() =>
                useGameStateUpdater(false, 'ABC123', setGameState, showToast, beginPendingMove)
            );

            await act(async () => {
                result.current(move, optimisticState);
                await Promise.resolve();
                await Promise.resolve();
            });

            expect(resolvePendingMove).toHaveBeenCalledTimes(1);
        });

        it('calls the returned resolver exactly once on the top-level transport-error branch', async () => {
            const { supabase } = makeFakeSupabase(() =>
                Promise.resolve({ data: null, error: new Error('transport') })
            );
            vi.mocked(getSupabaseClient).mockReturnValue(supabase as never);
            const setGameState = vi.fn();
            const showToast = vi.fn();
            const resolvePendingMove = vi.fn();
            const beginPendingMove = vi.fn(() => resolvePendingMove);

            const { result } = renderHook(() =>
                useGameStateUpdater(false, 'ABC123', setGameState, showToast, beginPendingMove)
            );

            await act(async () => {
                result.current(move, optimisticState);
                await Promise.resolve();
                await Promise.resolve();
            });

            expect(resolvePendingMove).toHaveBeenCalledTimes(1);
        });

        it('calls the returned resolver exactly once on the EdgeResult.error branch', async () => {
            const { supabase } = makeFakeSupabase(() =>
                Promise.resolve({ data: { error: { code: 'CONFLICT', message: 'stale version' } }, error: null })
            );
            vi.mocked(getSupabaseClient).mockReturnValue(supabase as never);
            const setGameState = vi.fn();
            const showToast = vi.fn();
            const resolvePendingMove = vi.fn();
            const beginPendingMove = vi.fn(() => resolvePendingMove);

            const { result } = renderHook(() =>
                useGameStateUpdater(false, 'ABC123', setGameState, showToast, beginPendingMove)
            );

            await act(async () => {
                result.current(move, optimisticState);
                await Promise.resolve();
                await Promise.resolve();
            });

            expect(resolvePendingMove).toHaveBeenCalledTimes(1);
        });

        it('is never called at all on a fully successful resolution (no error)', async () => {
            const { supabase } = makeFakeSupabase(() => Promise.resolve({ data: {}, error: null }));
            vi.mocked(getSupabaseClient).mockReturnValue(supabase as never);
            const setGameState = vi.fn();
            const showToast = vi.fn();
            const resolvePendingMove = vi.fn();
            const beginPendingMove = vi.fn(() => resolvePendingMove);

            const { result } = renderHook(() =>
                useGameStateUpdater(false, 'ABC123', setGameState, showToast, beginPendingMove)
            );

            await act(async () => {
                result.current(move, optimisticState);
                await Promise.resolve();
                await Promise.resolve();
            });

            expect(resolvePendingMove).not.toHaveBeenCalled();
        });
    });
});
