import { describe, it, expect, beforeEach } from 'vitest';
import { useEffect } from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import '../../storage';
import { GameProvider, useGameContext } from '../../context/GameContext';
import { LobbyScreen } from '../../screens/LobbyScreen';
import { buildGameState, buildPlayer } from '../testUtils/buildGameState';

/** Seeds gameState via the context's setGameState in an effect on mount. */
function SeedGameState({ state }: { state: ReturnType<typeof buildGameState> }) {
    const { setGameState } = useGameContext();
    useEffect(() => {
        setGameState(state);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);
    return null;
}

function Probe() {
    const { gameState } = useGameContext();
    return (
        <div data-testid="probe">
            phase:{gameState?.phase ?? 'none'} players:
            {gameState?.players
                .map((p) => `${p.name}(hand:${p.hand.length},faceUp:${p.faceUp.length},faceDown:${p.faceDown.length})`)
                .join(',') ?? 'none'}
        </div>
    );
}

function renderLobby(playerId: string, state: ReturnType<typeof buildGameState>) {
    return render(
        <GameProvider playerId={playerId}>
            <SeedGameState state={state} />
            <LobbyScreen />
            <Probe />
        </GameProvider>
    );
}

describe('LobbyScreen', () => {
    beforeEach(() => {
        localStorage.clear();
    });

    it("renders the room code from gameState.roomCode and a crown next to the host", async () => {
        const state = buildGameState({
            roomCode: 'ABC123',
            phase: 'lobby',
            host: 'p0',
            players: [buildPlayer({ id: 'p0', name: 'Alice' }), buildPlayer({ id: 'p1', name: 'Bob' })],
        });

        renderLobby('p0', state);

        expect(await screen.findByText('ABC123')).toBeInTheDocument();
        expect(screen.getByText('Alice')).toBeInTheDocument();
        expect(screen.getByText('Bob')).toBeInTheDocument();
    });

    it('enables Start Game only for the host with 2+ players, and shows a waiting message for non-hosts', async () => {
        const state = buildGameState({
            roomCode: 'ABC123',
            phase: 'lobby',
            host: 'p0',
            players: [buildPlayer({ id: 'p0', name: 'Alice' }), buildPlayer({ id: 'p1', name: 'Bob' })],
        });

        renderLobby('p1', state);

        expect(await screen.findByText('Waiting for host to start the game...')).toBeInTheDocument();
        expect(screen.queryByText('Start Game')).not.toBeInTheDocument();
    });

    it('clicking Start Game (as host, 2+ players) deals a fresh 3/3/3 hand to every player and moves to phase "setup"', async () => {
        const state = buildGameState({
            roomCode: 'ABC123',
            phase: 'lobby',
            host: 'p0',
            players: [buildPlayer({ id: 'p0', name: 'Alice' }), buildPlayer({ id: 'p1', name: 'Bob' })],
        });

        renderLobby('p0', state);

        const startButton = await screen.findByText('Start Game');
        expect(startButton.closest('button')).toBeEnabled();
        fireEvent.click(startButton);

        await waitFor(() => {
            expect(screen.getByTestId('probe')).toHaveTextContent('phase:setup');
        });
        expect(screen.getByTestId('probe')).toHaveTextContent(
            'Alice(hand:3,faceUp:3,faceDown:3),Bob(hand:3,faceUp:3,faceDown:3)'
        );
    });
});
