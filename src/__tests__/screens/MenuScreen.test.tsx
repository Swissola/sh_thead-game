import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import '../../storage';
import { GameProvider, useGameContext } from '../../context/GameContext';
import { MenuScreen } from '../../screens/MenuScreen';
import { Toast } from '../../components/Toast';

/**
 * Exposes context state as text so assertions can observe the result of
 * MenuScreen's actions without reaching into GameProvider's internals.
 */
function Probe() {
    const { gameState, testMode } = useGameContext();
    return (
        <div data-testid="probe">
            testMode:{String(testMode)} phase:{gameState?.phase ?? 'none'} players:
            {gameState?.players.length ?? 0}
        </div>
    );
}

function Harness() {
    const { toast, dismissToast } = useGameContext();
    return (
        <>
            <MenuScreen />
            <Probe />
            <Toast toast={toast} onDismiss={dismissToast} />
        </>
    );
}

function renderMenu() {
    return render(
        <GameProvider playerId="test-player">
            <Harness />
        </GameProvider>
    );
}

describe('MenuScreen', () => {
    beforeEach(() => {
        localStorage.clear();
    });

    it('clicking "Test Mode (3 Players)" sets testMode and a 3-player setup gameState', async () => {
        renderMenu();

        fireEvent.change(screen.getByPlaceholderText('Enter your name'), {
            target: { value: 'Alice' },
        });
        fireEvent.click(screen.getByText('Test Mode (3 Players)'));

        // setGameState's testMode branch closes over the pre-update testMode
        // value from this render, so the underlying state settles a tick
        // after setTestMode's own update - wait for it rather than asserting
        // synchronously.
        await waitFor(() => {
            expect(screen.getByTestId('probe')).toHaveTextContent('testMode:true');
            expect(screen.getByTestId('probe')).toHaveTextContent('phase:setup');
            expect(screen.getByTestId('probe')).toHaveTextContent('players:3');
        });
    });

    it('disables "Create Room" until playerName is non-empty, so an empty name can never call setGameState', () => {
        renderMenu();

        const createRoomButton = screen.getByText('Create Room').closest('button')!;
        expect(createRoomButton).toBeDisabled();

        fireEvent.change(screen.getByPlaceholderText('Enter your name'), {
            target: { value: 'Alice' },
        });
        expect(createRoomButton).toBeEnabled();

        expect(screen.getByTestId('probe')).toHaveTextContent('phase:none');
    });

    it('clicking "Join" with a non-empty name/room code shows "Room not found" when the room does not exist', async () => {
        renderMenu();

        fireEvent.change(screen.getByPlaceholderText('Enter your name'), {
            target: { value: 'Alice' },
        });
        fireEvent.change(screen.getByPlaceholderText('Room code'), {
            target: { value: 'NOPE99' },
        });
        fireEvent.click(screen.getByText('Join'));

        expect(await screen.findByRole('alert')).toHaveTextContent('Room not found');
    });
});
