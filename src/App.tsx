import { useState, useEffect } from 'react';
import { GameProvider, useGameContext } from './context/GameContext';
import { Toast } from './components/Toast';
import { MenuScreen } from './screens/MenuScreen';
import { LobbyScreen } from './screens/LobbyScreen';
import { GameScreen } from './screens/GameScreen';

/**
 * D-09 orchestrator's router: decides which screen renders based on
 * GameState.phase, and owns the shared chrome (background wrapper, toast
 * container) so it isn't duplicated across Menu/Lobby/Game. Exported as a
 * named export so tests can render it directly inside a test-controlled
 * GameProvider without going through ShitheadGame's own playerId generation.
 */
export function Router() {
    const { gameState, testMode, toast, dismissToast, setGameState } = useGameContext();

    // Ported from App.tsx's pollGameState/poll effect (pre-refactor lines
    // 331-353). Reuses the context's setGameState for the poll's write-back;
    // this whole polling mechanism is replaced outright by Supabase Realtime
    // in Phase 2 (MPLAY-02), so a bespoke read-only setter isn't worth adding
    // for one phase's remaining lifetime.
    useEffect(() => {
        if (!gameState || testMode) return;
        const interval = setInterval(async () => {
            const result = await window.storage.get(`game:${gameState.roomCode}`, true);
            if (result) {
                setGameState(JSON.parse(result.value));
            }
        }, 2000);
        return () => clearInterval(interval);
    }, [gameState?.roomCode, testMode, setGameState]);

    return (
        <div className="min-h-screen bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900 p-4">
            {!gameState && <MenuScreen />}
            {gameState?.phase === 'lobby' && <LobbyScreen />}
            {gameState && gameState.phase !== 'lobby' && <GameScreen />}
            <Toast toast={toast} onDismiss={dismissToast} />
        </div>
    );
}

export default function ShitheadGame() {
    const [playerId] = useState(() => crypto.randomUUID());

    return (
        <GameProvider playerId={playerId}>
            <Router />
        </GameProvider>
    );
}
