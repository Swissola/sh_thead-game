import { useCallback } from 'react';
import type { GameState } from '../types';

/**
 * Provides a stable updater that respects testMode and room storage.
 * Integrate in App by replacing inline updateGameState with this hook.
 *
 * CR-02: the storage write is awaited and wrapped in try/catch, matching the
 * setGameState path (MenuScreen/LobbyScreen) rather than firing-and-forgetting -
 * without this, a failed write leaves local state showing a move that was
 * never persisted, silently reverted on the next poll tick with no feedback.
 */
export function useGameStateUpdater(
    testMode: boolean,
    roomCode: string,
    setGameState: (s: GameState) => void,
    showToast: (message: string, code?: string) => void
) {
    const updateGameState = useCallback(async (newState: GameState) => {
        if (testMode) {
            setGameState(newState);
            return;
        }
        try {
            // Persist to storage, then update local state
            await window.storage.set(`game:${roomCode}`, JSON.stringify(newState), true);
            setGameState(newState);
        } catch {
            showToast('Failed to save your move - please retry.');
        }
    }, [testMode, roomCode, setGameState, showToast]);

    return updateGameState;
}
