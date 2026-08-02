import { createContext, useContext, useState, useCallback, useMemo, useRef, type ReactNode } from 'react';
import { applyMove } from '../engine/applyMove';
import type { Move } from '../engine/moves';
import type { GameState } from '../types';
import { PENDING_MOVE_TIMEOUT_MS, type ServerRoom } from '../supabase/roomTypes';
import { useGameStateUpdater } from '../hooks/useGameState';
import { useToast, type ToastState, type ToastVariant } from '../hooks/useToast';

/**
 * GameContextValue - the complete context surface consumed by Plan 01-05's
 * orchestrator and Plan 01-06's screens. dispatchMove implements Pattern 4's
 * Approach A (RESEARCH.md): calls applyMove directly, no useReducer, so the
 * caller and the toast share one code path with no double-computation
 * (resolves Pitfall 3 - useReducer cannot report per-dispatch failure).
 *
 * Plan 02-09 extends this with the MPLAY-05 optimistic-dispatch/reconcile
 * pair: dispatchMove now submits to the server after applying locally,
 * applyServerRoom is the D-11 "always snap to server truth" seam fed by
 * useRoomSubscription, and notifyReconciled raises the distinct D-12 toast.
 */
export interface GameContextValue {
    gameState: GameState | null;
    dispatchMove: (move: Move) => void;
    setGameState: (state: GameState | null) => Promise<void>;
    applyServerRoom: (room: ServerRoom) => void;
    notifyReconciled: () => void;
    roomVersion: number;
    turnStartedAt: string;
    hasPendingMove: () => boolean;
    toast: ToastState | null;
    showToast: (message: string, code?: string, variant?: ToastVariant) => void;
    dismissToast: () => void;
    currentPlayerId: string;
    playerId: string;
    testMode: boolean;
    setTestMode: (testMode: boolean) => void;
    controllingPlayer: number;
    setControllingPlayer: (controllingPlayer: number) => void;
}

const GameContext = createContext<GameContextValue | null>(null);

export function GameProvider({ playerId, children }: Readonly<{ playerId: string; children: ReactNode }>) {
    const [gameState, setGameStateInternal] = useState<GameState | null>(null);
    const [testMode, setTestMode] = useState(false);
    const [controllingPlayer, setControllingPlayer] = useState(0);
    const [roomVersion, setRoomVersion] = useState(0);
    const [turnStartedAt, setTurnStartedAt] = useState('');
    const { toast, show: showToast, dismiss: dismissToast } = useToast();

    // Tracks the last-applied server version outside React state so
    // applyServerRoom's stale-version check (T-02-32) reads the current
    // value synchronously rather than a closure captured at render time.
    // Starts at -1, not 0 - a freshly created room's first row is version 0
    // (see create-room's Edge Function), and 0 <= 0 would wrongly treat that
    // first application as stale/duplicate and silently drop it. Mirrors
    // useRoomSubscription's own lastAppliedVersionRef, which already uses -1
    // for the same reason.
    const roomVersionRef = useRef(-1);

    // Plan 02-16 (MPLAY-05, UAT test 7): a per-client "pending move" tracker,
    // private to this file - only `hasPendingMove` is exposed on
    // GameContextValue, since that is the only piece useRoomSubscription
    // needs. pendingMoveCountRef counts how many of THIS client's own
    // submissions are currently unresolved; pendingMoveTimeoutsRef holds each
    // one's individual safety-net timeout so one submission's resolution can
    // never accidentally cancel another's. A Set's iteration order is
    // insertion order, which resolveOldestPendingMove relies on to find "the
    // oldest still-outstanding submission" without a separate ordered
    // structure.
    const pendingMoveCountRef = useRef(0);
    const pendingMoveTimeoutsRef = useRef<Set<ReturnType<typeof setTimeout>>>(new Set());

    // Called once per real (non-test-mode) submission, immediately before the
    // network call fires (from useGameState.ts's submitMove). Returns a
    // settle() closure that is idempotent: it only clears the timeout and
    // decrements the count if this specific timeout is still present in the
    // set - i.e. it hasn't already fired or already been settled once.
    // pendingMoveTimeoutsRef.current.delete(timeoutId) returning true is the
    // guard. This per-call independence is what makes overlapping
    // submissions resolve correctly: settling submission A can only ever
    // cancel/decrement submission A's own entry, never submission B's.
    //
    // Call sites for the returned settle() live in useGameState.ts, never
    // here - beginPendingMove only *creates* the tracking; it never assumes
    // when or whether it resolves.
    const beginPendingMove = useCallback((): (() => void) => {
        pendingMoveCountRef.current += 1;
        const timeoutId: ReturnType<typeof setTimeout> = setTimeout(() => {
            if (pendingMoveTimeoutsRef.current.delete(timeoutId)) {
                pendingMoveCountRef.current = Math.max(0, pendingMoveCountRef.current - 1);
            }
        }, PENDING_MOVE_TIMEOUT_MS);
        pendingMoveTimeoutsRef.current.add(timeoutId);

        return () => {
            if (pendingMoveTimeoutsRef.current.delete(timeoutId)) {
                clearTimeout(timeoutId);
                pendingMoveCountRef.current = Math.max(0, pendingMoveCountRef.current - 1);
            }
        };
    }, []);

    // Called from applyServerRoom, inside the existing stale-version guard's
    // *pass* branch - i.e. only when a broadcast is actually accepted.
    // Removes and clears ONLY the single oldest entry still tracked in
    // pendingMoveTimeoutsRef (a Set's iteration order is insertion order, so
    // .values().next().value is the oldest still-outstanding submission),
    // decrementing pendingMoveCountRef by exactly one (clamped at a floor of
    // 0 - a no-op when nothing is pending, e.g. a heartbeat or lobby
    // broadcast with no move in flight).
    //
    // FIFO, one-at-a-time removal - never a bulk clear - is what stops an
    // *earlier* submission's own broadcast from silently zeroing out a
    // *later*, still-genuinely-outstanding submission's pending credit. A
    // plan-checker review caught bulk-clearing the whole Set in one go as
    // this plan's first-draft bug: it let a real divergence on a later,
    // still-outstanding submission go unreported - the opposite of MPLAY-05's
    // contract. Do not "simplify" this back into a bulk clear (calling
    // .clear() on the whole tracked-timeouts Set); see the plan's "Scope
    // note on overlapping submissions" for exactly what this does and does
    // not additionally guarantee.
    const resolveOldestPendingMove = useCallback(() => {
        const oldest = pendingMoveTimeoutsRef.current.values().next().value;
        if (oldest === undefined) return;
        pendingMoveTimeoutsRef.current.delete(oldest);
        clearTimeout(oldest);
        pendingMoveCountRef.current = Math.max(0, pendingMoveCountRef.current - 1);
    }, []);

    // The query useRoomSubscription consults before calling onReconciled.
    const hasPendingMove = useCallback(() => pendingMoveCountRef.current > 0, []);

    // D-10 cleanup: roomCode is derived from gameState each render, not a separate
    // state field - removes the dual-purpose roomCode state bug present in App.tsx.
    const roomCode = gameState?.roomCode ?? '';
    // Plan 02-09: the storage write is gone - submitMove applies the optimistic
    // state locally then submits to the apply-move Edge Function (MPLAY-05).
    const submitMove = useGameStateUpdater(testMode, roomCode, setGameStateInternal, showToast, beginPendingMove);

    // D-10 cleanup: computed once here, replacing the four duplicate
    // `const currentPlayerId = testMode ? ... : playerId` lines in App.tsx.
    const currentPlayerId = testMode ? (gameState?.players[controllingPlayer]?.id ?? '') : playerId;

    const dispatchMove = useCallback(
        (move: Move) => {
            if (!gameState) return;
            const result = applyMove(gameState, move);
            if (result.error) {
                showToast(result.error.message, result.error.code);
                return;
            }
            // The client-side legal-move filter above is what makes D-11's races
            // rare in the first place - submitMove applies result.state locally
            // for instant feedback, then submits it to the server. Neither the
            // server's acceptance nor its rejection is awaited here: the
            // Realtime broadcast (applyServerRoom) is the authoritative
            // correction regardless of how apply-move responds.
            submitMove(move, result.state);
        },
        [gameState, submitMove, showToast]
    );

    // D-10 cleanup: the single local-state setter for room creation/joining/starting -
    // Plan 01-05's MenuScreen/LobbyScreen call this rather than setting state directly.
    //
    // Plan 02-09 (MPLAY-04): client code is no longer a writer of game state in
    // any mode - the only write path left is an Edge Function. This stays
    // async so existing `await setGameState(...)` call sites keep compiling.
    const setGameState = useCallback(async (state: GameState | null) => {
        setGameStateInternal(state);
    }, []);

    // D-11's "always snap to server truth": ignores anything at or below the
    // last-applied version (T-02-32 - the optimistic value is never treated
    // as authoritative), otherwise replaces gameState with the server's copy
    // and records its version/turnStartedAt for GameScreen's timeout check.
    const applyServerRoom = useCallback(
        (room: ServerRoom) => {
            if (room.version <= roomVersionRef.current) return;
            resolveOldestPendingMove();
            roomVersionRef.current = room.version;
            setGameStateInternal(room.state);
            setRoomVersion(room.version);
            setTurnStartedAt(room.turnStartedAt);
        },
        [resolveOldestPendingMove]
    );

    // D-12's deliberate departure from Phase 1's one-style-for-all-errors
    // rule: 'RECONCILED' is a client-side networking sentinel, not a member
    // of the engine's closed ERROR_CODES set (Phase 1 D-04) - reconciliation
    // is not an illegal move.
    const notifyReconciled = useCallback(() => {
        showToast("Your move didn't stick - synced with the latest game state.", 'RECONCILED', 'reconcile');
    }, [showToast]);

    const value: GameContextValue = useMemo(
        () => ({
            gameState,
            dispatchMove,
            setGameState,
            applyServerRoom,
            notifyReconciled,
            roomVersion,
            turnStartedAt,
            hasPendingMove,
            toast,
            showToast,
            dismissToast,
            currentPlayerId,
            playerId,
            testMode,
            setTestMode,
            controllingPlayer,
            setControllingPlayer,
        }),
        [
            gameState,
            dispatchMove,
            setGameState,
            applyServerRoom,
            notifyReconciled,
            roomVersion,
            turnStartedAt,
            hasPendingMove,
            toast,
            showToast,
            dismissToast,
            currentPlayerId,
            playerId,
            testMode,
            controllingPlayer,
        ]
    );

    return <GameContext.Provider value={value}>{children}</GameContext.Provider>;
}

export function useGameContext(): GameContextValue {
    const ctx = useContext(GameContext);
    if (!ctx) throw new Error('useGameContext must be used within GameProvider');
    return ctx;
}
