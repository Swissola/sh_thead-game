import { createContext, useContext, useState, useCallback, type ReactNode } from 'react';
import { applyMove } from '../engine/applyMove';
import type { Move } from '../engine/moves';
import type { GameState } from '../types';
import { useGameStateUpdater } from '../hooks/useGameState';
import { useToast, type ToastState } from '../hooks/useToast';

/**
 * GameContextValue - the complete context surface consumed by Plan 01-05's
 * orchestrator and Plan 01-06's screens. dispatchMove implements Pattern 4's
 * Approach A (RESEARCH.md): calls applyMove directly, no useReducer, so the
 * caller and the toast share one code path with no double-computation
 * (resolves Pitfall 3 - useReducer cannot report per-dispatch failure).
 */
export interface GameContextValue {
    gameState: GameState | null;
    dispatchMove: (move: Move) => void;
    setGameState: (state: GameState | null) => Promise<void>;
    toast: ToastState | null;
    showToast: (message: string, code?: string) => void;
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
    const { toast, show: showToast, dismiss: dismissToast } = useToast();

    // D-10 cleanup: roomCode is derived from gameState each render, not a separate
    // state field - removes the dual-purpose roomCode state bug present in App.tsx.
    const roomCode = gameState?.roomCode ?? '';
    const updateGameState = useGameStateUpdater(testMode, roomCode, setGameStateInternal);

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
            updateGameState(result.state);
        },
        [gameState, updateGameState, showToast]
    );

    // D-10 cleanup: the single persistence path for room creation/joining/starting -
    // Plan 01-05's MenuScreen/LobbyScreen call this instead of duplicating
    // window.storage.set calls outside the useGameStateUpdater seam.
    const setGameState = useCallback(
        async (state: GameState | null) => {
            if (state === null) {
                setGameStateInternal(null);
                return;
            }
            if (!testMode) {
                await window.storage.set(`game:${state.roomCode}`, JSON.stringify(state), true);
            }
            setGameStateInternal(state);
        },
        [testMode]
    );

    const value: GameContextValue = {
        gameState,
        dispatchMove,
        setGameState,
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
