import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { ReactNode } from 'react';
import { renderHook, act } from '@testing-library/react';

vi.mock('../../supabase/client', () => ({
    getSupabaseClient: vi.fn(),
}));

import { getSupabaseClient } from '../../supabase/client';
import { GameProvider, useGameContext } from '../../context/GameContext';
import { buildGameState, buildPlayer } from '../testUtils/buildGameState';
import type { ServerRoom } from '../../supabase/roomTypes';

function makeFakeSupabase(invokeImpl?: (...args: unknown[]) => unknown) {
    const invoke = vi.fn(invokeImpl ?? (() => Promise.resolve({ data: {}, error: null })));
    const supabase = { functions: { invoke } };
    return { supabase, invoke };
}

function wrapper({ children }: { children: ReactNode }) {
    return <GameProvider playerId="p0">{children}</GameProvider>;
}

describe('GameContext', () => {
    beforeEach(() => {
        vi.mocked(getSupabaseClient).mockReset();
        window.storage = { set: vi.fn(), get: vi.fn() };
    });

    it("dispatchMove with an illegal move shows the engine's error toast and makes no network call", async () => {
        const { supabase, invoke } = makeFakeSupabase();
        vi.mocked(getSupabaseClient).mockReturnValue(supabase as never);

        const { result } = renderHook(() => useGameContext(), { wrapper });

        const state = buildGameState({ phase: 'playing' }); // READY_UP is illegal outside setup
        await act(async () => {
            await result.current.setGameState(state);
        });

        act(() => {
            result.current.dispatchMove({ type: 'READY_UP', playerId: 'p0' });
        });

        expect(result.current.toast?.message).toBe('Cannot ready up outside setup phase');
        expect(result.current.toast?.code).toBe('WRONG_PHASE');
        expect(result.current.toast?.variant).toBe('error');
        expect(invoke).not.toHaveBeenCalled();
    });

    it('dispatchMove with a legal move sets local state to the predicted state synchronously, then submits the move', async () => {
        const { supabase, invoke } = makeFakeSupabase();
        vi.mocked(getSupabaseClient).mockReturnValue(supabase as never);

        const { result } = renderHook(() => useGameContext(), { wrapper });

        const state = buildGameState({
            phase: 'setup',
            players: [
                buildPlayer({ id: 'p0', name: 'Alice', isReady: false }),
                buildPlayer({ id: 'p1', name: 'Bob', isReady: false }),
            ],
        });
        await act(async () => {
            await result.current.setGameState(state);
        });

        act(() => {
            result.current.dispatchMove({ type: 'READY_UP', playerId: 'p0' });
        });

        expect(result.current.gameState?.players.find((p) => p.id === 'p0')?.isReady).toBe(true);
        expect(invoke).toHaveBeenCalledWith(
            'apply-move',
            expect.objectContaining({ body: expect.objectContaining({ roomCode: 'TEST' }) })
        );
    });

    it("applyServerRoom(room) replaces gameState with the server's state and records version/turnStartedAt", async () => {
        const { supabase } = makeFakeSupabase();
        vi.mocked(getSupabaseClient).mockReturnValue(supabase as never);

        const { result } = renderHook(() => useGameContext(), { wrapper });

        const serverState = buildGameState({ lastAction: 'server wrote this' });
        const room: ServerRoom = {
            roomCode: 'TEST',
            state: serverState,
            version: 5,
            turnStartedAt: '2026-01-01T00:00:00.000Z',
            playerSeen: {},
        };

        act(() => {
            result.current.applyServerRoom(room);
        });

        expect(result.current.gameState).toEqual(serverState);
        expect(result.current.roomVersion).toBe(5);
        expect(result.current.turnStartedAt).toBe('2026-01-01T00:00:00.000Z');
    });

    it('applyServerRoom with a version at or below the current one is ignored', async () => {
        const { supabase } = makeFakeSupabase();
        vi.mocked(getSupabaseClient).mockReturnValue(supabase as never);

        const { result } = renderHook(() => useGameContext(), { wrapper });

        const firstState = buildGameState({ lastAction: 'first' });
        act(() => {
            result.current.applyServerRoom({
                roomCode: 'TEST',
                state: firstState,
                version: 5,
                turnStartedAt: '2026-01-01T00:00:00.000Z',
                playerSeen: {},
            });
        });

        const staleState = buildGameState({ lastAction: 'stale, should be ignored' });
        act(() => {
            result.current.applyServerRoom({
                roomCode: 'TEST',
                state: staleState,
                version: 5,
                turnStartedAt: '2026-02-02T00:00:00.000Z',
                playerSeen: {},
            });
        });

        expect(result.current.gameState).toEqual(firstState);
        expect(result.current.roomVersion).toBe(5);
        expect(result.current.turnStartedAt).toBe('2026-01-01T00:00:00.000Z');

        const olderState = buildGameState({ lastAction: 'older, should be ignored' });
        act(() => {
            result.current.applyServerRoom({
                roomCode: 'TEST',
                state: olderState,
                version: 3,
                turnStartedAt: '2025-12-31T00:00:00.000Z',
                playerSeen: {},
            });
        });

        expect(result.current.gameState).toEqual(firstState);
        expect(result.current.roomVersion).toBe(5);
    });

    it("notifyReconciled() shows the UI-SPEC reconciliation copy with variant 'reconcile'", () => {
        const { result } = renderHook(() => useGameContext(), { wrapper });

        act(() => {
            result.current.notifyReconciled();
        });

        expect(result.current.toast?.message).toBe("Your move didn't stick - synced with the latest game state.");
        expect(result.current.toast?.variant).toBe('reconcile');
    });

    it('setGameState performs no storage or database write in any mode', async () => {
        const storageSetSpy = vi.fn();
        window.storage = { set: storageSetSpy, get: vi.fn() };

        const { result } = renderHook(() => useGameContext(), { wrapper });

        const state = buildGameState();
        await act(async () => {
            await result.current.setGameState(state);
        });
        expect(storageSetSpy).not.toHaveBeenCalled();

        act(() => {
            result.current.setTestMode(true);
        });
        await act(async () => {
            await result.current.setGameState(buildGameState({ lastAction: 'test mode write' }));
        });
        expect(storageSetSpy).not.toHaveBeenCalled();
    });

    it('exposes roomVersion and turnStartedAt on the context, defaulting sensibly before any server room arrives', () => {
        const { result } = renderHook(() => useGameContext(), { wrapper });

        expect(typeof result.current.roomVersion).toBe('number');
        expect(typeof result.current.turnStartedAt).toBe('string');
    });
});
