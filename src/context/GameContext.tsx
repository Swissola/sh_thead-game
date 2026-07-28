import { createContext, useContext, useState, useCallback, useRef, type ReactNode } from 'react';
import { applyMove } from '../engine/applyMove';
import type { Move } from '../engine/moves';
import type { GameState } from '../types';
import type { ServerRoom } from '../supabase/roomTypes';
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

export function GameProvider({ playerId, children }: { playerId: string; children: ReactNode }) {
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

    // D-10 cleanup: roomCode is derived from gameState each render, not a separate
    // state field - removes the dual-purpose roomCode state bug present in App.tsx.
    const roomCode = gameState?.roomCode ?? '';
    // Plan 02-09: the storage write is gone - submitMove applies the optimistic
    // state locally then submits to the apply-move Edge Function (MPLAY-05).
    const submitMove = useGameStateUpdater(testMode, roomCode, setGameStateInternal, showToast);

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
    const applyServerRoom = useCallback((room: ServerRoom) => {
        if (room.version <= roomVersionRef.current) return;
        roomVersionRef.current = room.version;
        setGameStateInternal(room.state);
        setRoomVersion(room.version);
        setTurnStartedAt(room.turnStartedAt);
    }, []);

    // D-12's deliberate departure from Phase 1's one-style-for-all-errors
    // rule: 'RECONCILED' is a client-side networking sentinel, not a member
    // of the engine's closed ERROR_CODES set (Phase 1 D-04) - reconciliation
    // is not an illegal move.
    const notifyReconciled = useCallback(() => {
        showToast("Your move didn't stick - synced with the latest game state.", 'RECONCILED', 'reconcile');
    }, [showToast]);

    const value: GameContextValue = {
        gameState,
        dispatchMove,
        setGameState,
        applyServerRoom,
        notifyReconciled,
        roomVersion,
        turnStartedAt,
        toast,
        showToast,
        dismissToast,
        currentPlayerId,
        playerId,
        testMode,
        setTestMode,
        controllingPlayer,
        setControllingPlayer,
    };

    return <GameContext.Provider value={value}>{children}</GameContext.Provider>;
}

export function useGameContext(): GameContextValue {
    const ctx = useContext(GameContext);
    if (!ctx) throw new Error('useGameContext must be used within GameProvider');
    return ctx;
}
