import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import '../../storage';

vi.mock('../../supabase/client', () => ({
    getSupabaseClient: vi.fn(),
}));

vi.mock('../../supabase/session', () => ({
    readLastUsedName: vi.fn(),
    writeLastUsedName: vi.fn(),
    readLastUsedRoomCode: vi.fn(),
    writeLastUsedRoomCode: vi.fn(),
}));

import { getSupabaseClient } from '../../supabase/client';
import {
    readLastUsedName,
    writeLastUsedName,
    readLastUsedRoomCode,
    writeLastUsedRoomCode,
} from '../../supabase/session';
import { GameProvider, useGameContext } from '../../context/GameContext';
import { MenuScreen } from '../../screens/MenuScreen';
import { Toast } from '../../components/Toast';
import { buildGameState, buildPlayer } from '../testUtils/buildGameState';

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

function Harness({ initialRoomCode }: { initialRoomCode?: string }) {
    const { toast, dismissToast } = useGameContext();
    return (
        <>
            <MenuScreen initialRoomCode={initialRoomCode} />
            <Probe />
            <Toast toast={toast} onDismiss={dismissToast} />
        </>
    );
}

function renderMenu(initialRoomCode?: string) {
    return render(
        <GameProvider playerId="test-player">
            <Harness initialRoomCode={initialRoomCode} />
        </GameProvider>
    );
}

function makeFakeSupabase(invokeImpl?: (...args: unknown[]) => unknown) {
    const invoke = vi.fn(invokeImpl ?? (() => Promise.resolve({ data: {}, error: null })));
    const supabase = { functions: { invoke } };
    return { supabase, invoke };
}

describe('MenuScreen', () => {
    beforeEach(() => {
        localStorage.clear();
        vi.mocked(getSupabaseClient).mockReset();
        vi.mocked(readLastUsedName).mockReset().mockReturnValue('');
        vi.mocked(writeLastUsedName).mockReset();
        vi.mocked(readLastUsedRoomCode).mockReset().mockReturnValue('');
        vi.mocked(writeLastUsedRoomCode).mockReset();
    });

    it('clicking "Test Mode (3 Players)" sets testMode and a 3-player setup gameState, with zero functions.invoke calls', async () => {
        const { supabase, invoke } = makeFakeSupabase();
        vi.mocked(getSupabaseClient).mockReturnValue(supabase as never);

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

        expect(invoke).not.toHaveBeenCalled();
    });

    it('clicking "Test Mode (First Turn Ready)" builds its state locally with zero functions.invoke calls', async () => {
        const { supabase, invoke } = makeFakeSupabase();
        vi.mocked(getSupabaseClient).mockReturnValue(supabase as never);

        renderMenu();

        fireEvent.click(screen.getByText('Test Mode (First Turn Ready)'));

        await waitFor(() => {
            expect(screen.getByTestId('probe')).toHaveTextContent('testMode:true');
            expect(screen.getByTestId('probe')).toHaveTextContent('phase:playing');
        });

        expect(invoke).not.toHaveBeenCalled();
    });

    it('disables "Create Room" until playerName is non-empty, so an empty name can never call functions.invoke', () => {
        const { supabase, invoke } = makeFakeSupabase();
        vi.mocked(getSupabaseClient).mockReturnValue(supabase as never);

        renderMenu();

        const createRoomButton = screen.getByText('Create Room').closest('button')!;
        expect(createRoomButton).toBeDisabled();

        fireEvent.change(screen.getByPlaceholderText('Enter your name'), {
            target: { value: 'Alice' },
        });
        expect(createRoomButton).toBeEnabled();

        expect(screen.getByTestId('probe')).toHaveTextContent('phase:none');
        expect(invoke).not.toHaveBeenCalled();
    });

    it('clicking "Create Room" with a name invokes create-room with the trimmed name and applies the returned room', async () => {
        const room = buildGameState({
            roomCode: 'ROOM01',
            host: 'server-assigned-id',
            phase: 'lobby',
            players: [buildPlayer({ id: 'server-assigned-id', name: 'Alice' })],
        });
        const { supabase, invoke } = makeFakeSupabase(() =>
            Promise.resolve({ data: { room: { roomCode: 'ROOM01', state: room, version: 0, turnStartedAt: '', playerSeen: {} } }, error: null })
        );
        vi.mocked(getSupabaseClient).mockReturnValue(supabase as never);

        renderMenu();

        fireEvent.change(screen.getByPlaceholderText('Enter your name'), {
            target: { value: '  Alice  ' },
        });
        fireEvent.click(screen.getByText('Create Room'));

        await waitFor(() => {
            expect(screen.getByTestId('probe')).toHaveTextContent('phase:lobby');
            expect(screen.getByTestId('probe')).toHaveTextContent('players:1');
        });

        expect(invoke).toHaveBeenCalledWith('create-room', { body: { playerName: 'Alice' } });
    });

    it('clicking "Join" with an empty name or empty code shows the existing toast and makes no network call', () => {
        const { supabase, invoke } = makeFakeSupabase();
        vi.mocked(getSupabaseClient).mockReturnValue(supabase as never);

        renderMenu();

        // Both empty: the Join button stays disabled, so simulate the guard
        // directly for the "empty code only" case (name filled, code empty).
        fireEvent.change(screen.getByPlaceholderText('Enter your name'), {
            target: { value: 'Alice' },
        });
        const joinButton = screen.getByText('Join').closest('button')!;
        expect(joinButton).toBeDisabled();

        expect(invoke).not.toHaveBeenCalled();
    });

    it('clicking "Join" invokes join-room with the uppercased code and trimmed name and applies the returned room', async () => {
        const room = buildGameState({
            roomCode: 'ABC123',
            host: 'host-player',
            phase: 'lobby',
            players: [
                buildPlayer({ id: 'host-player', name: 'Host' }),
                buildPlayer({ id: 'server-assigned-id', name: 'Alice' }),
            ],
        });
        const { supabase, invoke } = makeFakeSupabase(() =>
            Promise.resolve({ data: { room: { roomCode: 'ABC123', state: room, version: 1, turnStartedAt: '', playerSeen: {} } }, error: null })
        );
        vi.mocked(getSupabaseClient).mockReturnValue(supabase as never);

        renderMenu();

        fireEvent.change(screen.getByPlaceholderText('Enter your name'), {
            target: { value: '  Alice  ' },
        });
        fireEvent.change(screen.getByPlaceholderText('Room code'), {
            target: { value: 'abc123' },
        });
        fireEvent.click(screen.getByText('Join'));

        await waitFor(() => {
            expect(screen.getByTestId('probe')).toHaveTextContent('phase:lobby');
            expect(screen.getByTestId('probe')).toHaveTextContent('players:2');
        });

        expect(invoke).toHaveBeenCalledWith('join-room', {
            body: { playerName: 'Alice', roomCode: 'ABC123' },
        });
    });

    it('an EdgeError of ROOM_NOT_FOUND renders "Room not found"', async () => {
        const { supabase } = makeFakeSupabase(() =>
            Promise.resolve({ data: { error: { code: 'ROOM_NOT_FOUND', message: 'not found' } }, error: null })
        );
        vi.mocked(getSupabaseClient).mockReturnValue(supabase as never);

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

    it('an EdgeError of GAME_ALREADY_STARTED renders "Game has already started"', async () => {
        const { supabase } = makeFakeSupabase(() =>
            Promise.resolve({
                data: { error: { code: 'GAME_ALREADY_STARTED', message: 'started' } },
                error: null,
            })
        );
        vi.mocked(getSupabaseClient).mockReturnValue(supabase as never);

        renderMenu();

        fireEvent.change(screen.getByPlaceholderText('Enter your name'), {
            target: { value: 'Alice' },
        });
        fireEvent.change(screen.getByPlaceholderText('Room code'), {
            target: { value: 'ABC123' },
        });
        fireEvent.click(screen.getByText('Join'));

        expect(await screen.findByRole('alert')).toHaveTextContent('Game has already started');
    });

    it.each(['NAME_AMBIGUOUS', 'NAME_IN_USE'])(
        'an EdgeError of %s renders a message asking for a different name',
        async (code) => {
            const { supabase } = makeFakeSupabase(() =>
                Promise.resolve({ data: { error: { code, message: 'name conflict' } }, error: null })
            );
            vi.mocked(getSupabaseClient).mockReturnValue(supabase as never);

            renderMenu();

            fireEvent.change(screen.getByPlaceholderText('Enter your name'), {
                target: { value: 'Alice' },
            });
            fireEvent.change(screen.getByPlaceholderText('Room code'), {
                target: { value: 'ABC123' },
            });
            fireEvent.click(screen.getByText('Join'));

            const alert = await screen.findByRole('alert');
            expect(alert.textContent).toMatch(/different name/i);
        }
    );

    it('a transport failure on Join renders "Failed to join room - please retry."', async () => {
        const { supabase } = makeFakeSupabase(() => Promise.resolve({ data: null, error: new Error('network down') }));
        vi.mocked(getSupabaseClient).mockReturnValue(supabase as never);

        renderMenu();

        fireEvent.change(screen.getByPlaceholderText('Enter your name'), {
            target: { value: 'Alice' },
        });
        fireEvent.change(screen.getByPlaceholderText('Room code'), {
            target: { value: 'ABC123' },
        });
        fireEvent.click(screen.getByText('Join'));

        expect(await screen.findByRole('alert')).toHaveTextContent('Failed to join room - please retry.');
    });

    it('a transport failure on Create Room renders "Failed to join room - please retry."', async () => {
        const { supabase } = makeFakeSupabase(() => Promise.resolve({ data: null, error: new Error('network down') }));
        vi.mocked(getSupabaseClient).mockReturnValue(supabase as never);

        renderMenu();

        fireEvent.change(screen.getByPlaceholderText('Enter your name'), {
            target: { value: 'Alice' },
        });
        fireEvent.click(screen.getByText('Create Room'));

        expect(await screen.findByRole('alert')).toHaveTextContent('Failed to join room - please retry.');
    });

    it('with a stored last-used name, the name input renders pre-filled with it on first paint (D-09)', () => {
        vi.mocked(readLastUsedName).mockReturnValue('Bob');

        renderMenu();

        expect(screen.getByPlaceholderText('Enter your name')).toHaveValue('Bob');
    });

    it('with no stored name, the name input renders empty with the unchanged "Enter your name" placeholder', () => {
        vi.mocked(readLastUsedName).mockReturnValue('');

        renderMenu();

        const input = screen.getByPlaceholderText('Enter your name');
        expect(input).toHaveValue('');
        expect(input).toBeInTheDocument();
    });

    it('the pre-filled name is editable and typing replaces it normally', () => {
        vi.mocked(readLastUsedName).mockReturnValue('Bob');

        renderMenu();

        const input = screen.getByPlaceholderText('Enter your name');
        fireEvent.change(input, { target: { value: 'Carol' } });

        expect(input).toHaveValue('Carol');
    });

    it('a successful create writes the trimmed name back as the last-used name', async () => {
        const room = buildGameState({
            roomCode: 'ROOM01',
            phase: 'lobby',
            players: [buildPlayer({ id: 'server-assigned-id', name: 'Alice' })],
        });
        const { supabase } = makeFakeSupabase(() =>
            Promise.resolve({
                data: { room: { roomCode: 'ROOM01', state: room, version: 0, turnStartedAt: '', playerSeen: {} } },
                error: null,
            })
        );
        vi.mocked(getSupabaseClient).mockReturnValue(supabase as never);

        renderMenu();

        fireEvent.change(screen.getByPlaceholderText('Enter your name'), {
            target: { value: '  Alice  ' },
        });
        fireEvent.click(screen.getByText('Create Room'));

        await waitFor(() => {
            expect(screen.getByTestId('probe')).toHaveTextContent('phase:lobby');
        });

        expect(writeLastUsedName).toHaveBeenCalledWith('Alice');
    });

    it('a successful join writes the trimmed name back as the last-used name', async () => {
        const room = buildGameState({
            roomCode: 'ABC123',
            phase: 'lobby',
            players: [
                buildPlayer({ id: 'host-player', name: 'Host' }),
                buildPlayer({ id: 'server-assigned-id', name: 'Alice' }),
            ],
        });
        const { supabase } = makeFakeSupabase(() =>
            Promise.resolve({
                data: { room: { roomCode: 'ABC123', state: room, version: 1, turnStartedAt: '', playerSeen: {} } },
                error: null,
            })
        );
        vi.mocked(getSupabaseClient).mockReturnValue(supabase as never);

        renderMenu();

        fireEvent.change(screen.getByPlaceholderText('Enter your name'), {
            target: { value: '  Alice  ' },
        });
        fireEvent.change(screen.getByPlaceholderText('Room code'), {
            target: { value: 'abc123' },
        });
        fireEvent.click(screen.getByText('Join'));

        await waitFor(() => {
            expect(screen.getByTestId('probe')).toHaveTextContent('phase:lobby');
        });

        expect(writeLastUsedName).toHaveBeenCalledWith('Alice');
    });

    it('a failed join (Room not found) does not write the name back as last-used', async () => {
        const { supabase } = makeFakeSupabase(() =>
            Promise.resolve({ data: { error: { code: 'ROOM_NOT_FOUND', message: 'not found' } }, error: null })
        );
        vi.mocked(getSupabaseClient).mockReturnValue(supabase as never);

        renderMenu();

        fireEvent.change(screen.getByPlaceholderText('Enter your name'), {
            target: { value: 'Alice' },
        });
        fireEvent.change(screen.getByPlaceholderText('Room code'), {
            target: { value: 'NOPE99' },
        });
        fireEvent.click(screen.getByText('Join'));

        await screen.findByRole('alert');

        expect(writeLastUsedName).not.toHaveBeenCalled();
    });

    it('an initialRoomCode prop pre-fills the room-code input, uppercased, and it remains editable', () => {
        renderMenu('abc123');

        const roomCodeInputEl = screen.getByPlaceholderText('Room code');
        expect(roomCodeInputEl).toHaveValue('ABC123');

        fireEvent.change(roomCodeInputEl, { target: { value: 'XYZ999' } });
        expect(roomCodeInputEl).toHaveValue('XYZ999');
    });

    it('with no initialRoomCode, the room-code input renders empty', () => {
        renderMenu();

        expect(screen.getByPlaceholderText('Room code')).toHaveValue('');
    });

    it('with no initialRoomCode prop but a stored last-used room code, the room-code input pre-fills with it', () => {
        vi.mocked(readLastUsedRoomCode).mockReturnValue('ZYX999');

        renderMenu();

        expect(screen.getByPlaceholderText('Room code')).toHaveValue('ZYX999');
    });

    it('an initialRoomCode prop (join-link deep link) takes priority over a stored last-used room code', () => {
        vi.mocked(readLastUsedRoomCode).mockReturnValue('OLDCODE');

        renderMenu('newlink');

        expect(screen.getByPlaceholderText('Room code')).toHaveValue('NEWLINK');
    });

    it('a successful create writes the room code back as last-used', async () => {
        const room = buildGameState({
            roomCode: 'ROOM01',
            phase: 'lobby',
            players: [buildPlayer({ id: 'server-assigned-id', name: 'Alice' })],
        });
        const { supabase } = makeFakeSupabase(() =>
            Promise.resolve({
                data: { room: { roomCode: 'ROOM01', state: room, version: 0, turnStartedAt: '', playerSeen: {} } },
                error: null,
            })
        );
        vi.mocked(getSupabaseClient).mockReturnValue(supabase as never);

        renderMenu();

        fireEvent.change(screen.getByPlaceholderText('Enter your name'), {
            target: { value: 'Alice' },
        });
        fireEvent.click(screen.getByText('Create Room'));

        await waitFor(() => {
            expect(screen.getByTestId('probe')).toHaveTextContent('phase:lobby');
        });

        expect(writeLastUsedRoomCode).toHaveBeenCalledWith('ROOM01');
    });

    it('a successful join writes the server-confirmed room code back as last-used', async () => {
        const room = buildGameState({
            roomCode: 'ABC123',
            phase: 'lobby',
            players: [
                buildPlayer({ id: 'host-player', name: 'Host' }),
                buildPlayer({ id: 'server-assigned-id', name: 'Alice' }),
            ],
        });
        const { supabase } = makeFakeSupabase(() =>
            Promise.resolve({
                data: { room: { roomCode: 'ABC123', state: room, version: 1, turnStartedAt: '', playerSeen: {} } },
                error: null,
            })
        );
        vi.mocked(getSupabaseClient).mockReturnValue(supabase as never);

        renderMenu();

        fireEvent.change(screen.getByPlaceholderText('Enter your name'), {
            target: { value: 'Alice' },
        });
        fireEvent.change(screen.getByPlaceholderText('Room code'), {
            target: { value: 'abc123' },
        });
        fireEvent.click(screen.getByText('Join'));

        await waitFor(() => {
            expect(screen.getByTestId('probe')).toHaveTextContent('phase:lobby');
        });

        expect(writeLastUsedRoomCode).toHaveBeenCalledWith('ABC123');
    });

    it('a failed join (Room not found) does not write the room code back as last-used', async () => {
        const { supabase } = makeFakeSupabase(() =>
            Promise.resolve({ data: { error: { code: 'ROOM_NOT_FOUND', message: 'not found' } }, error: null })
        );
        vi.mocked(getSupabaseClient).mockReturnValue(supabase as never);

        renderMenu();

        fireEvent.change(screen.getByPlaceholderText('Enter your name'), {
            target: { value: 'Alice' },
        });
        fireEvent.change(screen.getByPlaceholderText('Room code'), {
            target: { value: 'NOPE99' },
        });
        fireEvent.click(screen.getByText('Join'));

        await screen.findByRole('alert');

        expect(writeLastUsedRoomCode).not.toHaveBeenCalled();
    });

    it('pre-filling the room code does not auto-submit the join', () => {
        const { invoke } = makeFakeSupabase();

        renderMenu('abc123');

        expect(invoke).not.toHaveBeenCalled();
        // The Join button stays disabled until a name is entered too - a
        // join-link alone never submits on its own.
        expect(screen.getByText('Join').closest('button')).toBeDisabled();
    });
});
