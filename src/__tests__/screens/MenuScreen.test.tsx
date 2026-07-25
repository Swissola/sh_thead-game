import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
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

    it('clicking "Test Mode (3 Players)" sets testMode and a 3-player setup gameState', () => {
        renderMenu();

        fireEvent.change(screen.getByPlaceholderText('Enter your name'), {
            target: { value: 'Alice' },
        });
        fireEvent.click(screen.getByText('Test Mode (3 Players)'));

        expect(screen.getByTestId('probe')).toHaveTextContent('testMode:true');
        expect(screen.getByTestId('probe')).toHaveTextContent('phase:setup');
        expect(screen.getByTestId('probe')).toHaveTextContent('players:3');
    });

    it('clicking "Create Room" with an empty playerName shows a toast and does not call setGameState', () => {
        renderMenu();

        // The rendered button is natively disabled when playerName is empty
        // (matching today's behavior exactly), which itself prevents this
        // path in normal use. Force-enable it to prove createRoom's own
        // internal guard still rejects an empty name if the disabled
        // attribute were ever bypassed client-side.
        const createRoomButton = screen.getByText('Create Room').closest('button')!;
        createRoomButton.removeAttribute('disabled');
        fireEvent.click(createRoomButton);

        expect(screen.getByRole('alert')).toHaveTextContent('Please enter your name');
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
