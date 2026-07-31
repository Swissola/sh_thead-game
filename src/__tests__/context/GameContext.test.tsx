import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { ReactNode } from 'react';
import { renderHook, act } from '@testing-library/react';

vi.mock('../../supabase/client', () => ({
    getSupabaseClient: vi.fn(),
}));

import { getSupabaseClient } from '../../supabase/client';
import { GameProvider, useGameContext } from '../../context/GameContext';
import { buildGameState, buildPlayer } from '../testUtils/buildGameState';
import { PENDING_MOVE_TIMEOUT_MS, type ServerRoom } from '../../supabase/roomTypes';

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

        expect(result.current.hasPendingMove()).toBe(false);

        act(() => {
            result.current.dispatchMove({ type: 'READY_UP', playerId: 'p0' });
        });

        expect(result.current.toast?.message).toBe('Cannot ready up outside setup phase');
        expect(result.current.toast?.code).toBe('WRONG_PHASE');
        expect(result.current.toast?.variant).toBe('error');
        expect(invoke).not.toHaveBeenCalled();
        expect(result.current.hasPendingMove()).toBe(false);
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

    // Plan 02-16 (MPLAY-05, UAT test 7): the per-client pending-move tracker
    // that gates the reconciliation toast (src/hooks/useRoomSubscription.ts).
    describe('pending-move tracker', () => {
        it('hasPendingMove() is false immediately after GameProvider mounts, before anything is dispatched', () => {
            const { result } = renderHook(() => useGameContext(), { wrapper });

            expect(result.current.hasPendingMove()).toBe(false);
        });

        it('dispatchMove with a legal, non-test-mode move makes hasPendingMove() become true synchronously, before the invoke promise settles', async () => {
            const { supabase } = makeFakeSupabase(() => new Promise(() => {})); // never resolves
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

            expect(result.current.hasPendingMove()).toBe(false);

            act(() => {
                result.current.dispatchMove({ type: 'READY_UP', playerId: 'p0' });
            });

            expect(result.current.hasPendingMove()).toBe(true);
        });

        it('when the invoke throws, hasPendingMove() becomes false once the rejection is handled, and the existing generic-failure toast still fires unduplicated', async () => {
            const { supabase } = makeFakeSupabase(() => Promise.reject(new Error('network down')));
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

            await act(async () => {
                result.current.dispatchMove({ type: 'READY_UP', playerId: 'p0' });
                await Promise.resolve();
                await Promise.resolve();
            });

            expect(result.current.hasPendingMove()).toBe(false);
            expect(result.current.toast?.message).toBe('Failed to save your move - please retry.');
        });

        it('when the invoke resolves with a top-level transport error, hasPendingMove() becomes false, and the existing generic-failure toast still fires unduplicated', async () => {
            const { supabase } = makeFakeSupabase(() =>
                Promise.resolve({ data: null, error: new Error('transport') })
            );
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

            await act(async () => {
                result.current.dispatchMove({ type: 'READY_UP', playerId: 'p0' });
                await Promise.resolve();
                await Promise.resolve();
            });

            expect(result.current.hasPendingMove()).toBe(false);
            expect(result.current.toast?.message).toBe('Failed to save your move - please retry.');
        });

        it("when the invoke resolves with an EdgeResult.error, hasPendingMove() becomes false, and the existing reconciliation-styled toast fires exactly once unduplicated", async () => {
            const { supabase } = makeFakeSupabase(() =>
                Promise.resolve({ data: { error: { code: 'CONFLICT', message: 'stale version' } }, error: null })
            );
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

            await act(async () => {
                result.current.dispatchMove({ type: 'READY_UP', playerId: 'p0' });
                await Promise.resolve();
                await Promise.resolve();
            });

            expect(result.current.hasPendingMove()).toBe(false);
            expect(result.current.toast?.message).toBe(
                "Your move didn't stick - synced with the latest game state."
            );
            expect(result.current.toast?.variant).toBe('reconcile');
        });

        it('when the invoke resolves successfully (no error at all), hasPendingMove() stays true - only a subsequent applyServerRoom call clears it', async () => {
            const { supabase } = makeFakeSupabase(() => Promise.resolve({ data: {}, error: null }));
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

            await act(async () => {
                result.current.dispatchMove({ type: 'READY_UP', playerId: 'p0' });
                await Promise.resolve();
                await Promise.resolve();
            });

            expect(result.current.hasPendingMove()).toBe(true);
        });

        it('applyServerRoom with a greater version resolves exactly one outstanding entry via resolveOldestPendingMove(), regardless of whether the state matches', async () => {
            const { supabase } = makeFakeSupabase(() => new Promise(() => {})); // never resolves - stays pending
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

            expect(result.current.hasPendingMove()).toBe(true);

            act(() => {
                result.current.applyServerRoom({
                    roomCode: 'TEST',
                    state: buildGameState({ phase: 'setup', lastAction: 'server accepted' }),
                    version: 5,
                    turnStartedAt: '2026-01-01T00:00:00.000Z',
                    playerSeen: {},
                });
            });

            expect(result.current.hasPendingMove()).toBe(false);
        });

        it('applyServerRoom with a version at or below the current one (the stale/duplicate guard) leaves a genuinely pending move untouched', async () => {
            const { supabase } = makeFakeSupabase(() => new Promise(() => {}));
            vi.mocked(getSupabaseClient).mockReturnValue(supabase as never);

            const { result } = renderHook(() => useGameContext(), { wrapper });

            const baselineState = buildGameState({
                phase: 'setup',
                lastAction: 'baseline',
                players: [
                    buildPlayer({ id: 'p0', name: 'Alice', isReady: false }),
                    buildPlayer({ id: 'p1', name: 'Bob', isReady: false }),
                ],
            });

            act(() => {
                result.current.applyServerRoom({
                    roomCode: 'TEST',
                    state: baselineState,
                    version: 5,
                    turnStartedAt: '2026-01-01T00:00:00.000Z',
                    playerSeen: {},
                });
            });

            act(() => {
                result.current.dispatchMove({ type: 'READY_UP', playerId: 'p0' });
            });

            expect(result.current.hasPendingMove()).toBe(true);

            act(() => {
                result.current.applyServerRoom({
                    roomCode: 'TEST',
                    state: buildGameState({ phase: 'setup', lastAction: 'stale, should be ignored' }),
                    version: 5,
                    turnStartedAt: '2026-02-02T00:00:00.000Z',
                    playerSeen: {},
                });
            });

            expect(result.current.hasPendingMove()).toBe(true);
        });

        it('with neither a definite failure nor a broadcast arriving, hasPendingMove() becomes false on its own once PENDING_MOVE_TIMEOUT_MS has elapsed', async () => {
            vi.useFakeTimers();
            try {
                const { supabase } = makeFakeSupabase(() => new Promise(() => {}));
                vi.mocked(getSupabaseClient).mockReturnValue(supabase as never);

                const { result } = renderHook(() => useGameContext(), { wrapper });

                const state = buildGameState({
                    phase: 'setup',
                    players: [
                        buildPlayer({ id: 'p0', name: 'Alice', isReady: false }),
                        buildPlayer({ id: 'p1', name: 'Bob', isReady: false }),
                    ],
                });
                act(() => {
                    void result.current.setGameState(state);
                });

                act(() => {
                    result.current.dispatchMove({ type: 'READY_UP', playerId: 'p0' });
                });

                expect(result.current.hasPendingMove()).toBe(true);

                act(() => {
                    vi.advanceTimersByTime(PENDING_MOVE_TIMEOUT_MS);
                });

                expect(result.current.hasPendingMove()).toBe(false);
            } finally {
                vi.useRealTimers();
            }
        });

        it('two overlapping submissions: if only the first settles via a definite failure, hasPendingMove() stays true (the still-outstanding second submission survives)', async () => {
            let callCount = 0;
            const { supabase } = makeFakeSupabase(() => {
                callCount += 1;
                return callCount === 1 ? Promise.reject(new Error('first fails')) : new Promise(() => {});
            });
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

            await act(async () => {
                result.current.dispatchMove({ type: 'READY_UP', playerId: 'p0' });
                result.current.dispatchMove({ type: 'READY_UP', playerId: 'p1' });
                await Promise.resolve();
                await Promise.resolve();
            });

            expect(result.current.hasPendingMove()).toBe(true);
        });

        it("two overlapping submissions: if only the first settles via a successful applyServerRoom broadcast, hasPendingMove() stays true (the second submission's credit survives)", async () => {
            const { supabase } = makeFakeSupabase(() => Promise.resolve({ data: {}, error: null }));
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

            await act(async () => {
                result.current.dispatchMove({ type: 'READY_UP', playerId: 'p0' });
                result.current.dispatchMove({ type: 'READY_UP', playerId: 'p1' });
                await Promise.resolve();
                await Promise.resolve();
            });

            expect(result.current.hasPendingMove()).toBe(true); // two outstanding

            act(() => {
                result.current.applyServerRoom({
                    roomCode: 'TEST',
                    state: buildGameState({ phase: 'setup', lastAction: 'server accepted p0' }),
                    version: 5,
                    turnStartedAt: '2026-01-01T00:00:00.000Z',
                    playerSeen: {},
                });
            });

            expect(result.current.hasPendingMove()).toBe(true); // second submission's credit survives
        });

        it('resolveOldestPendingMove() (exercised indirectly via applyServerRoom) removes exactly one of three outstanding entries per call, not all three', async () => {
            const { supabase } = makeFakeSupabase(() => new Promise(() => {})); // never resolves - stays pending
            vi.mocked(getSupabaseClient).mockReturnValue(supabase as never);

            const { result } = renderHook(() => useGameContext(), { wrapper });

            const state = buildGameState({
                phase: 'setup',
                players: [
                    buildPlayer({ id: 'p0', name: 'Alice', isReady: false }),
                    buildPlayer({ id: 'p1', name: 'Bob', isReady: false }),
                    buildPlayer({ id: 'p2', name: 'Carol', isReady: false }),
                ],
            });
            await act(async () => {
                await result.current.setGameState(state);
            });

            act(() => {
                result.current.dispatchMove({ type: 'READY_UP', playerId: 'p0' });
                result.current.dispatchMove({ type: 'READY_UP', playerId: 'p1' });
                result.current.dispatchMove({ type: 'READY_UP', playerId: 'p2' });
            });

            expect(result.current.hasPendingMove()).toBe(true); // three outstanding

            act(() => {
                result.current.applyServerRoom({
                    roomCode: 'TEST',
                    state: buildGameState({ phase: 'setup', lastAction: 'broadcast 1' }),
                    version: 5,
                    turnStartedAt: '2026-01-01T00:00:00.000Z',
                    playerSeen: {},
                });
            });
            expect(result.current.hasPendingMove()).toBe(true); // two remain

            act(() => {
                result.current.applyServerRoom({
                    roomCode: 'TEST',
                    state: buildGameState({ phase: 'setup', lastAction: 'broadcast 2' }),
                    version: 6,
                    turnStartedAt: '2026-01-01T00:00:00.000Z',
                    playerSeen: {},
                });
            });
            expect(result.current.hasPendingMove()).toBe(true); // one remains

            act(() => {
                result.current.applyServerRoom({
                    roomCode: 'TEST',
                    state: buildGameState({ phase: 'setup', lastAction: 'broadcast 3' }),
                    version: 7,
                    turnStartedAt: '2026-01-01T00:00:00.000Z',
                    playerSeen: {},
                });
            });
            expect(result.current.hasPendingMove()).toBe(false); // none remain
        });
    });
});
