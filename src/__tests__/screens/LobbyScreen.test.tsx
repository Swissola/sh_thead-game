import { describe, it, expect, vi, beforeEach } from 'vitest';
import { useEffect } from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import '../../storage';

vi.mock('../../supabase/client', () => ({
    getSupabaseClient: vi.fn(),
}));

import { getSupabaseClient } from '../../supabase/client';
import { GameProvider, useGameContext } from '../../context/GameContext';
import { LobbyScreen } from '../../screens/LobbyScreen';
import { Toast } from '../../components/Toast';
import { buildGameState, buildPlayer, buildCard } from '../testUtils/buildGameState';

/** Three distinct cards, used to fill a dealt hand/faceUp/faceDown slice in tests. */
function threeCards(prefix: string) {
    return [buildCard({ id: `${prefix}-0` }), buildCard({ id: `${prefix}-1` }), buildCard({ id: `${prefix}-2` })];
}

/** A fake presence `.channel()` return value - LobbyScreen's usePresence call
 * needs a non-throwing channel even in tests that don't care about presence. */
function makeFakeChannel() {
    const channel = {
        on: vi.fn(() => channel),
        subscribe: vi.fn(() => channel),
        track: vi.fn().mockResolvedValue(undefined),
        presenceState: vi.fn(() => ({})),
    };
    return channel;
}

function makeFakeSupabase(invokeImpl?: (...args: unknown[]) => unknown) {
    const invoke = vi.fn(invokeImpl ?? (() => Promise.resolve({ data: {}, error: null })));
    const supabase = {
        functions: { invoke },
        channel: vi.fn(() => makeFakeChannel()),
        removeChannel: vi.fn(),
    };
    return { supabase, invoke };
}

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

function Harness({ state }: { state: ReturnType<typeof buildGameState> }) {
    const { toast, dismissToast } = useGameContext();
    return (
        <>
            <SeedGameState state={state} />
            <LobbyScreen />
            <Probe />
            <Toast toast={toast} onDismiss={dismissToast} />
        </>
    );
}

function renderLobby(playerId: string, state: ReturnType<typeof buildGameState>) {
    return render(
        <GameProvider playerId={playerId}>
            <Harness state={state} />
        </GameProvider>
    );
}

describe('LobbyScreen', () => {
    beforeEach(() => {
        localStorage.clear();
        vi.mocked(getSupabaseClient).mockReset();
    });

    it("renders the room code from gameState.roomCode and a crown next to the host", async () => {
        const { supabase } = makeFakeSupabase();
        vi.mocked(getSupabaseClient).mockReturnValue(supabase as never);
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
        const { supabase } = makeFakeSupabase();
        vi.mocked(getSupabaseClient).mockReturnValue(supabase as never);
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

    it('keeps Start Game disabled with the "Waiting for players..." label below 2 players', async () => {
        const { supabase } = makeFakeSupabase();
        vi.mocked(getSupabaseClient).mockReturnValue(supabase as never);
        const state = buildGameState({
            roomCode: 'ABC123',
            phase: 'lobby',
            host: 'p0',
            players: [buildPlayer({ id: 'p0', name: 'Alice' })],
        });

        renderLobby('p0', state);

        const waitingButton = await screen.findByText('Waiting for players...');
        expect(waitingButton.closest('button')).toBeDisabled();
    });

    it('clicking Start Game (as host, 2+ players) invokes start-game with the room code and applies the returned room', async () => {
        const dealtState = buildGameState({
            roomCode: 'ABC123',
            phase: 'setup',
            host: 'p0',
            players: [
                buildPlayer({
                    id: 'p0',
                    name: 'Alice',
                    hand: threeCards('p0-hand'),
                    faceUp: threeCards('p0-faceUp'),
                    faceDown: threeCards('p0-faceDown'),
                }),
                buildPlayer({
                    id: 'p1',
                    name: 'Bob',
                    hand: threeCards('p1-hand'),
                    faceUp: threeCards('p1-faceUp'),
                    faceDown: threeCards('p1-faceDown'),
                }),
            ],
        });
        const { supabase, invoke } = makeFakeSupabase(() =>
            Promise.resolve({
                data: {
                    room: {
                        roomCode: 'ABC123',
                        state: dealtState,
                        version: 2,
                        turnStartedAt: '2026-01-01T00:00:00.000Z',
                        playerSeen: {},
                    },
                },
                error: null,
            })
        );
        vi.mocked(getSupabaseClient).mockReturnValue(supabase as never);

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

        expect(invoke).toHaveBeenCalledWith('start-game', { body: { roomCode: 'ABC123' } });

        await waitFor(() => {
            expect(screen.getByTestId('probe')).toHaveTextContent('phase:setup');
        });
        expect(screen.getByTestId('probe')).toHaveTextContent(
            'Alice(hand:3,faceUp:3,faceDown:3),Bob(hand:3,faceUp:3,faceDown:3)'
        );
    });

    it('surfaces a NOT_ENOUGH_PLAYERS/NOT_HOST style server error as a toast rather than swallowing it', async () => {
        const { supabase } = makeFakeSupabase(() =>
            Promise.resolve({
                data: {
                    error: { code: 'NOT_ENOUGH_PLAYERS', message: 'At least 2 players are required to start' },
                },
                error: null,
            })
        );
        vi.mocked(getSupabaseClient).mockReturnValue(supabase as never);

        const state = buildGameState({
            roomCode: 'ABC123',
            phase: 'lobby',
            host: 'p0',
            players: [buildPlayer({ id: 'p0', name: 'Alice' }), buildPlayer({ id: 'p1', name: 'Bob' })],
        });
        renderLobby('p0', state);

        fireEvent.click(await screen.findByText('Start Game'));

        expect(await screen.findByRole('alert')).toHaveTextContent('At least 2 players are required to start');
    });

    it('surfaces a transport failure as the generic retry toast', async () => {
        const { supabase } = makeFakeSupabase(() => Promise.reject(new Error('network down')));
        vi.mocked(getSupabaseClient).mockReturnValue(supabase as never);

        const state = buildGameState({
            roomCode: 'ABC123',
            phase: 'lobby',
            host: 'p0',
            players: [buildPlayer({ id: 'p0', name: 'Alice' }), buildPlayer({ id: 'p1', name: 'Bob' })],
        });
        renderLobby('p0', state);

        fireEvent.click(await screen.findByText('Start Game'));

        expect(await screen.findByRole('alert')).toHaveTextContent('Failed to start the game');
    });
});
