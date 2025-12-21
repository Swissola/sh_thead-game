import { useCallback } from 'react';
import type { GameState } from '../types';

/**
 * Provides a stable updater that respects testMode and room storage.
 * Integrate in App by replacing inline updateGameState with this hook.
 */
export function useGameStateUpdater(testMode: boolean, roomCode: string, setGameState: (s: GameState) => void) {
    const updateGameState = useCallback((newState: GameState) => {
        if (testMode) {
            setGameState(newState);
        } else {
            // Persist to storage, then update local state
            window.storage.set(`game:${roomCode}`, JSON.stringify(newState), true);
            setGameState(newState);
        }
    }, [testMode, roomCode, setGameState]);

    return updateGameState;
}
