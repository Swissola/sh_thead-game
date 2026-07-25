import { describe, it, expect, beforeEach } from 'vitest';
import { useEffect } from 'react';
import { render, screen } from '@testing-library/react';
import '../storage';
import { GameProvider, useGameContext } from '../context/GameContext';
import { Router } from '../App';
import { buildGameState, buildPlayer } from './testUtils/buildGameState';

/**
 * Seeds gameState via the context's setGameState in an effect on mount, so
 * Router's lobby/game routing branches can be exercised without going
 * through MenuScreen/LobbyScreen's own UI flows.
 */
function SeedGameState({ state }: { state: ReturnType<typeof buildGameState> }) {
    const { setGameState } = useGameContext();
    useEffect(() => {
        setGameState(state);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);
    return null;
}

describe('Router', () => {
    beforeEach(() => {
        localStorage.clear();
    });

    it('renders MenuScreen content and not Lobby/Game content when there is no gameState', () => {
        render(
            <GameProvider playerId="test-player">
                <Router />
            </GameProvider>
        );

        expect(screen.getByText('Create Room')).toBeInTheDocument();
        expect(screen.queryByText('Game Lobby')).not.toBeInTheDocument();
        expect(screen.queryByText(/Game screen placeholder/)).not.toBeInTheDocument();
    });

    it("renders LobbyScreen content and not MenuScreen content when gameState.phase is 'lobby'", async () => {
        const lobbyState = buildGameState({
            phase: 'lobby',
            host: 'test-player',
            players: [buildPlayer({ id: 'test-player', name: 'Alice' })],
        });

        render(
            <GameProvider playerId="test-player">
                <SeedGameState state={lobbyState} />
                <Router />
            </GameProvider>
        );

        expect(await screen.findByText('Game Lobby')).toBeInTheDocument();
        expect(screen.queryByText('Create Room')).not.toBeInTheDocument();
    });

    it("renders GameScreen content and not Menu/Lobby content when gameState.phase is a non-'lobby' value", async () => {
        const playingState = buildGameState({ phase: 'playing' });

        render(
            <GameProvider playerId="test-player">
                <SeedGameState state={playingState} />
                <Router />
            </GameProvider>
        );

        expect(await screen.findByText(/Game screen placeholder/)).toBeInTheDocument();
        expect(screen.queryByText('Create Room')).not.toBeInTheDocument();
        expect(screen.queryByText('Game Lobby')).not.toBeInTheDocument();
    });
});
