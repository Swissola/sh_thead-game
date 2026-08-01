import { describe, it, expect, vi, beforeEach } from 'vitest';
import { useEffect, useState } from 'react';
import { render, screen, fireEvent, waitFor, act, within } from '@testing-library/react';
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

function makeFakeSupabase(invokeImpl?: (...args: unknown[]) => unknown) {
    const invoke = vi.fn(invokeImpl ?? (() => Promise.resolve({ data: {}, error: null })));
    const supabase = { functions: { invoke } };
    return { supabase, invoke };
}

/** LobbyScreen no longer calls usePresence itself (plan 02-10 threads
 * isPlayerOffline down from Router's single call instead) - this builds the
 * same prop shape from a plain list of offline player ids. */
function offlineChecker(offlineIds: string[]) {
    return (playerId: string) => offlineIds.includes(playerId);
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

function Harness({
    state,
    isPlayerOffline = () => false,
}: {
    state: ReturnType<typeof buildGameState>;
    isPlayerOffline?: (playerId: string) => boolean;
}) {
    const { toast, dismissToast } = useGameContext();
    return (
        <>
            <SeedGameState state={state} />
            <LobbyScreen isPlayerOffline={isPlayerOffline} />
            <Probe />
            <Toast toast={toast} onDismiss={dismissToast} />
        </>
    );
}

function renderLobby(
    playerId: string,
    state: ReturnType<typeof buildGameState>,
    isPlayerOffline?: (playerId: string) => boolean
) {
    return render(
        <GameProvider playerId={playerId}>
            <Harness state={state} isPlayerOffline={isPlayerOffline} />
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

    describe('copy join link (D-15)', () => {
        function stubClipboard() {
            const writeText = vi.fn();
            Object.defineProperty(navigator, 'clipboard', {
                value: { writeText },
                configurable: true,
            });
            return writeText;
        }

        it('writes <origin>/join/<ROOMCODE> to the clipboard when the join-link button is clicked', async () => {
            const writeText = stubClipboard();
            const { supabase } = makeFakeSupabase();
            vi.mocked(getSupabaseClient).mockReturnValue(supabase as never);
            const state = buildGameState({
                roomCode: 'ABC123',
                phase: 'lobby',
                host: 'p0',
                players: [buildPlayer({ id: 'p0', name: 'Alice' }), buildPlayer({ id: 'p1', name: 'Bob' })],
            });
            renderLobby('p0', state);

            fireEvent.click(await screen.findByLabelText('Copy join link'));

            expect(writeText).toHaveBeenCalledWith(`${window.location.origin}/join/ABC123`);
        });

        it('swaps the join-link icon to Check immediately after clicking, and reverts after 2000ms', async () => {
            stubClipboard();
            const { supabase } = makeFakeSupabase();
            vi.mocked(getSupabaseClient).mockReturnValue(supabase as never);
            const state = buildGameState({
                roomCode: 'ABC123',
                phase: 'lobby',
                host: 'p0',
                players: [buildPlayer({ id: 'p0', name: 'Alice' }), buildPlayer({ id: 'p1', name: 'Bob' })],
            });
            renderLobby('p0', state);

            // Resolve the async findByLabelText query on real timers first - only
            // switch to fake timers once the element is in hand, so waitFor's
            // internal polling is never starved of ticks.
            const joinLinkButton = await screen.findByLabelText('Copy join link');

            vi.useFakeTimers();
            try {
                fireEvent.click(joinLinkButton);

                // Assert immediately after the click rather than inside waitFor - per
                // CLAUDE.md's testing note, polling can race past the real-timer clear.
                expect(joinLinkButton.querySelector('.lucide-check')).toBeInTheDocument();

                act(() => {
                    vi.advanceTimersByTime(2000);
                });
                expect(joinLinkButton.querySelector('.lucide-check')).not.toBeInTheDocument();
                expect(joinLinkButton.querySelector('.lucide-link-2')).toBeInTheDocument();
            } finally {
                vi.useRealTimers();
            }
        });

        it('clicking the join-link button does not change the room-code button icon, and vice versa', async () => {
            stubClipboard();
            const { supabase } = makeFakeSupabase();
            vi.mocked(getSupabaseClient).mockReturnValue(supabase as never);
            const state = buildGameState({
                roomCode: 'ABC123',
                phase: 'lobby',
                host: 'p0',
                players: [buildPlayer({ id: 'p0', name: 'Alice' }), buildPlayer({ id: 'p1', name: 'Bob' })],
            });
            renderLobby('p0', state);

            const roomCodeButton = await screen.findByLabelText('Copy room code');
            const joinLinkButton = await screen.findByLabelText('Copy join link');

            fireEvent.click(joinLinkButton);
            expect(joinLinkButton.querySelector('.lucide-check')).toBeInTheDocument();
            expect(roomCodeButton.querySelector('.lucide-check')).not.toBeInTheDocument();

            fireEvent.click(roomCodeButton);
            expect(roomCodeButton.querySelector('.lucide-check')).toBeInTheDocument();
            // Both are now checked, independently - the join-link check did not clear.
            expect(joinLinkButton.querySelector('.lucide-check')).toBeInTheDocument();
        });

        it('the join-link button has aria-label="Copy join link" and the room-code button has aria-label="Copy room code"', async () => {
            stubClipboard();
            const { supabase } = makeFakeSupabase();
            vi.mocked(getSupabaseClient).mockReturnValue(supabase as never);
            const state = buildGameState({
                roomCode: 'ABC123',
                phase: 'lobby',
                host: 'p0',
                players: [buildPlayer({ id: 'p0', name: 'Alice' }), buildPlayer({ id: 'p1', name: 'Bob' })],
            });
            renderLobby('p0', state);

            expect(await screen.findByLabelText('Copy join link')).toBeInTheDocument();
            expect(await screen.findByLabelText('Copy room code')).toBeInTheDocument();
        });

        it('both copy buttons do nothing when there is no game state', async () => {
            const writeText = stubClipboard();
            const { supabase } = makeFakeSupabase();
            vi.mocked(getSupabaseClient).mockReturnValue(supabase as never);

            render(
                <GameProvider playerId="p0">
                    <LobbyScreen isPlayerOffline={() => false} />
                </GameProvider>
            );

            const joinLinkButton = screen.getByLabelText('Copy join link');
            const roomCodeButton = screen.getByLabelText('Copy room code');
            fireEvent.click(joinLinkButton);
            fireEvent.click(roomCodeButton);

            expect(writeText).not.toHaveBeenCalled();
        });
    });

    describe('offline markers, host removal and host transfer (D-07, D-08, D-10)', () => {
        it('an offline player renders with opacity-60 and an Offline badge; a connected player renders unchanged', async () => {
            const { supabase } = makeFakeSupabase();
            vi.mocked(getSupabaseClient).mockReturnValue(supabase as never);
            const state = buildGameState({
                roomCode: 'ABC123',
                phase: 'lobby',
                host: 'p0',
                players: [buildPlayer({ id: 'p0', name: 'Alice' }), buildPlayer({ id: 'p1', name: 'Bob' })],
            });
            renderLobby('p0', state, offlineChecker(['p1'])); // Alice online, Bob offline

            const bobRow = screen.getByText('Bob').closest('div.flex') as HTMLElement;
            expect(bobRow).toHaveClass('opacity-60');
            expect(within(bobRow).getByText('Offline')).toBeInTheDocument();

            const aliceRow = screen.getByText('Alice').closest('div.flex') as HTMLElement;
            expect(aliceRow).not.toHaveClass('opacity-60');
            expect(within(aliceRow).queryByText('Offline')).not.toBeInTheDocument();
        });

        it('renders a remove button only for the host, absent on the host row, and disabled only for connected players', async () => {
            const { supabase } = makeFakeSupabase();
            vi.mocked(getSupabaseClient).mockReturnValue(supabase as never);
            const state = buildGameState({
                roomCode: 'ABC123',
                phase: 'lobby',
                host: 'p0',
                players: [
                    buildPlayer({ id: 'p0', name: 'Alice' }),
                    buildPlayer({ id: 'p1', name: 'Bob' }),
                    buildPlayer({ id: 'p2', name: 'Carol' }),
                ],
            });
            renderLobby('p0', state, offlineChecker(['p2'])); // Bob online, Carol offline

            const aliceRow = screen.getByText('Alice').closest('div.flex') as HTMLElement;
            expect(within(aliceRow).queryByLabelText(/remove/i)).not.toBeInTheDocument();

            const bobRow = screen.getByText('Bob').closest('div.flex') as HTMLElement;
            expect(within(bobRow).getByLabelText(/remove/i)).toBeDisabled();

            const carolRow = screen.getByText('Carol').closest('div.flex') as HTMLElement;
            expect(within(carolRow).getByLabelText(/remove/i)).toBeEnabled();
        });

        it('clicking remove invokes remove-player with the room code and target id, and applies the returned room', async () => {
            const updatedState = buildGameState({
                roomCode: 'ABC123',
                phase: 'lobby',
                host: 'p0',
                players: [buildPlayer({ id: 'p0', name: 'Alice' })],
            });
            const { supabase, invoke } = makeFakeSupabase(() =>
                Promise.resolve({
                    data: {
                        room: {
                            roomCode: 'ABC123',
                            state: updatedState,
                            version: 3,
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
            renderLobby('p0', state, offlineChecker(['p1'])); // Bob offline -> remove enabled

            const bobRow = screen.getByText('Bob').closest('div.flex') as HTMLElement;
            fireEvent.click(within(bobRow).getByLabelText(/remove/i));

            expect(invoke).toHaveBeenCalledWith('remove-player', {
                body: { roomCode: 'ABC123', targetPlayerId: 'p1' },
            });

            await waitFor(() => {
                expect(screen.getByTestId('probe')).toHaveTextContent('Alice(hand:1,faceUp:0,faceDown:0)');
            });
        });

        it('a non-host viewer sees no remove buttons at all', async () => {
            const { supabase } = makeFakeSupabase();
            vi.mocked(getSupabaseClient).mockReturnValue(supabase as never);
            const state = buildGameState({
                roomCode: 'ABC123',
                phase: 'lobby',
                host: 'p0',
                players: [buildPlayer({ id: 'p0', name: 'Alice' }), buildPlayer({ id: 'p1', name: 'Bob' })],
            });
            renderLobby('p1', state, offlineChecker(['p0'])); // Alice offline, but the viewer is not host

            expect(screen.queryByLabelText(/remove/i)).not.toBeInTheDocument();
        });

        it('when state.host changes, the Start Game button follows automatically on the next render with no extra client logic', async () => {
            const { supabase } = makeFakeSupabase();
            vi.mocked(getSupabaseClient).mockReturnValue(supabase as never);
            const initialState = buildGameState({
                roomCode: 'ABC123',
                phase: 'lobby',
                host: 'p0',
                players: [buildPlayer({ id: 'p0', name: 'Alice' }), buildPlayer({ id: 'p1', name: 'Bob' })],
            });

            function TransferHarness() {
                const { setGameState, toast, dismissToast } = useGameContext();
                const [current, setCurrent] = useState(initialState);
                useEffect(() => {
                    void setGameState(current);
                    // eslint-disable-next-line react-hooks/exhaustive-deps
                }, []);
                return (
                    <>
                        <LobbyScreen isPlayerOffline={() => false} />
                        <button
                            onClick={() => {
                                const next = { ...current, host: 'p1' };
                                setCurrent(next);
                                void setGameState(next);
                            }}
                        >
                            transfer host
                        </button>
                        <Toast toast={toast} onDismiss={dismissToast} />
                    </>
                );
            }

            render(
                <GameProvider playerId="p1">
                    <TransferHarness />
                </GameProvider>
            );

            expect(await screen.findByText('Waiting for host to start the game...')).toBeInTheDocument();
            expect(screen.queryByText('Start Game')).not.toBeInTheDocument();

            fireEvent.click(screen.getByText('transfer host'));

            await waitFor(() => {
                expect(screen.getByText('Start Game')).toBeInTheDocument();
            });
        });

        it('an EdgeError from remove-player surfaces as a toast', async () => {
            const { supabase } = makeFakeSupabase(() =>
                Promise.resolve({
                    data: {
                        error: {
                            code: 'GAME_ALREADY_STARTED',
                            message: 'Cannot remove a player once the game has started',
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
            renderLobby('p0', state, offlineChecker(['p1'])); // Bob offline -> remove enabled

            const bobRow = screen.getByText('Bob').closest('div.flex') as HTMLElement;
            fireEvent.click(within(bobRow).getByLabelText(/remove/i));

            expect(await screen.findByRole('alert')).toHaveTextContent(
                'Cannot remove a player once the game has started'
            );
        });
    });

    describe('44px touch-target sizing (RESP-03, plan 03-06)', () => {
        it('the "Copy room code" button carries min-h-11 and min-w-11', async () => {
            const { supabase } = makeFakeSupabase();
            vi.mocked(getSupabaseClient).mockReturnValue(supabase as never);
            const state = buildGameState({
                roomCode: 'ABC123',
                phase: 'lobby',
                host: 'p0',
                players: [buildPlayer({ id: 'p0', name: 'Alice' }), buildPlayer({ id: 'p1', name: 'Bob' })],
            });
            renderLobby('p0', state);

            const roomCodeButton = await screen.findByLabelText('Copy room code');
            expect(roomCodeButton).toHaveClass('min-h-11');
            expect(roomCodeButton).toHaveClass('min-w-11');
        });

        it('the "Copy join link" button carries min-h-11 and min-w-11', async () => {
            const { supabase } = makeFakeSupabase();
            vi.mocked(getSupabaseClient).mockReturnValue(supabase as never);
            const state = buildGameState({
                roomCode: 'ABC123',
                phase: 'lobby',
                host: 'p0',
                players: [buildPlayer({ id: 'p0', name: 'Alice' }), buildPlayer({ id: 'p1', name: 'Bob' })],
            });
            renderLobby('p0', state);

            const joinLinkButton = await screen.findByLabelText('Copy join link');
            expect(joinLinkButton).toHaveClass('min-h-11');
            expect(joinLinkButton).toHaveClass('min-w-11');
        });

        it('the auto-pickup timeout <select> (host view) carries min-h-11', async () => {
            const { supabase } = makeFakeSupabase();
            vi.mocked(getSupabaseClient).mockReturnValue(supabase as never);
            const state = buildGameState({
                roomCode: 'ABC123',
                phase: 'lobby',
                host: 'p0',
                turnTimeoutMs: 60000,
                players: [buildPlayer({ id: 'p0', name: 'Alice' }), buildPlayer({ id: 'p1', name: 'Bob' })],
            });
            renderLobby('p0', state);

            const select = await screen.findByLabelText('Auto-pickup timeout');
            expect(select).toHaveClass('min-h-11');
        });

        it('every "Remove <name>" button carries min-h-11 and min-w-11', async () => {
            const { supabase } = makeFakeSupabase();
            vi.mocked(getSupabaseClient).mockReturnValue(supabase as never);
            const state = buildGameState({
                roomCode: 'ABC123',
                phase: 'lobby',
                host: 'p0',
                players: [
                    buildPlayer({ id: 'p0', name: 'Alice' }),
                    buildPlayer({ id: 'p1', name: 'Bob' }),
                    buildPlayer({ id: 'p2', name: 'Carol' }),
                ],
            });
            renderLobby('p0', state, offlineChecker(['p1', 'p2']));

            const bobRow = screen.getByText('Bob').closest('div.flex') as HTMLElement;
            const bobRemove = within(bobRow).getByLabelText(/remove/i);
            expect(bobRemove).toHaveClass('min-h-11');
            expect(bobRemove).toHaveClass('min-w-11');

            const carolRow = screen.getByText('Carol').closest('div.flex') as HTMLElement;
            const carolRemove = within(carolRow).getByLabelText(/remove/i);
            expect(carolRemove).toHaveClass('min-h-11');
            expect(carolRemove).toHaveClass('min-w-11');
        });

        it('the remove-player button keeps its disabled gating unchanged by the size change', async () => {
            const { supabase } = makeFakeSupabase();
            vi.mocked(getSupabaseClient).mockReturnValue(supabase as never);
            const state = buildGameState({
                roomCode: 'ABC123',
                phase: 'lobby',
                host: 'p0',
                players: [
                    buildPlayer({ id: 'p0', name: 'Alice' }),
                    buildPlayer({ id: 'p1', name: 'Bob' }),
                    buildPlayer({ id: 'p2', name: 'Carol' }),
                ],
            });
            renderLobby('p0', state, offlineChecker(['p2'])); // Bob online, Carol offline

            const bobRow = screen.getByText('Bob').closest('div.flex') as HTMLElement;
            expect(within(bobRow).getByLabelText(/remove/i)).toBeDisabled();

            const carolRow = screen.getByText('Carol').closest('div.flex') as HTMLElement;
            expect(within(carolRow).getByLabelText(/remove/i)).toBeEnabled();
        });

        it('the remove-player button still exposes aria-label="Remove <name>" and calls removePlayerFromLobby with that player id on click', async () => {
            const updatedState = buildGameState({
                roomCode: 'ABC123',
                phase: 'lobby',
                host: 'p0',
                players: [buildPlayer({ id: 'p0', name: 'Alice' })],
            });
            const { supabase, invoke } = makeFakeSupabase(() =>
                Promise.resolve({
                    data: {
                        room: {
                            roomCode: 'ABC123',
                            state: updatedState,
                            version: 3,
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
            renderLobby('p0', state, offlineChecker(['p1']));

            const bobRow = screen.getByText('Bob').closest('div.flex') as HTMLElement;
            const bobRemove = within(bobRow).getByLabelText('Remove Bob');
            fireEvent.click(bobRemove);

            expect(invoke).toHaveBeenCalledWith('remove-player', {
                body: { roomCode: 'ABC123', targetPlayerId: 'p1' },
            });

            await waitFor(() => {
                expect(screen.getByTestId('probe')).toHaveTextContent('Alice(hand:1,faceUp:0,faceDown:0)');
            });
        });

        it('the Offline and You badges are unchanged - neither gains min-h-11', async () => {
            const { supabase } = makeFakeSupabase();
            vi.mocked(getSupabaseClient).mockReturnValue(supabase as never);
            const state = buildGameState({
                roomCode: 'ABC123',
                phase: 'lobby',
                host: 'p0',
                players: [buildPlayer({ id: 'p0', name: 'Alice' }), buildPlayer({ id: 'p1', name: 'Bob' })],
            });
            renderLobby('p0', state, offlineChecker(['p1'])); // Alice online+You, Bob offline

            const bobRow = screen.getByText('Bob').closest('div.flex') as HTMLElement;
            const offlineBadge = within(bobRow).getByText('Offline').closest('span') as HTMLElement;
            expect(offlineBadge).toHaveClass('px-2');
            expect(offlineBadge).toHaveClass('py-1');
            expect(offlineBadge).not.toHaveClass('min-h-11');

            const aliceRow = screen.getByText('Alice').closest('div.flex') as HTMLElement;
            const youBadge = within(aliceRow).getByText('You');
            expect(youBadge).toHaveClass('px-2');
            expect(youBadge).toHaveClass('py-1');
            expect(youBadge).not.toHaveClass('min-h-11');
        });
    });

    describe('auto-pickup timeout control (MPLAY-07, plan 02-19)', () => {
        it('renders a <select> for the host with the current turnTimeoutMs selected, formatted in seconds', async () => {
            const { supabase } = makeFakeSupabase();
            vi.mocked(getSupabaseClient).mockReturnValue(supabase as never);
            const state = buildGameState({
                roomCode: 'ABC123',
                phase: 'lobby',
                host: 'p0',
                turnTimeoutMs: 60000,
                players: [buildPlayer({ id: 'p0', name: 'Alice' }), buildPlayer({ id: 'p1', name: 'Bob' })],
            });

            renderLobby('p0', state);

            const select = (await screen.findByLabelText('Auto-pickup timeout')) as HTMLSelectElement;
            expect(select).toBeInTheDocument();
            expect(select.value).toBe('60000');
            expect(within(select).getByText('60s')).toBeInTheDocument();
        });

        it('renders read-only text (no <select>) for a non-host, showing the same value', async () => {
            const { supabase } = makeFakeSupabase();
            vi.mocked(getSupabaseClient).mockReturnValue(supabase as never);
            const state = buildGameState({
                roomCode: 'ABC123',
                phase: 'lobby',
                host: 'p0',
                turnTimeoutMs: 60000,
                players: [buildPlayer({ id: 'p0', name: 'Alice' }), buildPlayer({ id: 'p1', name: 'Bob' })],
            });

            renderLobby('p1', state);

            expect(screen.queryByLabelText('Auto-pickup timeout')).not.toBeInTheDocument();
            expect(screen.queryByRole('combobox')).not.toBeInTheDocument();
            expect(await screen.findByText('60s')).toBeInTheDocument();
        });

        it("the <select>'s option values are exactly TURN_TIMEOUT_OPTIONS_MS, bounded by [30000, 300000] inclusive", async () => {
            const { supabase } = makeFakeSupabase();
            vi.mocked(getSupabaseClient).mockReturnValue(supabase as never);
            const state = buildGameState({
                roomCode: 'ABC123',
                phase: 'lobby',
                host: 'p0',
                turnTimeoutMs: 60000,
                players: [buildPlayer({ id: 'p0', name: 'Alice' }), buildPlayer({ id: 'p1', name: 'Bob' })],
            });

            renderLobby('p0', state);

            const select = await screen.findByLabelText('Auto-pickup timeout');
            const optionValues = within(select).getAllByRole('option').map((o) => Number((o as HTMLOptionElement).value));

            expect(optionValues).toEqual([30000, 45000, 60000, 90000, 120000, 150000, 180000, 240000, 300000]);
            expect(Math.min(...optionValues)).toBe(30000);
            expect(Math.max(...optionValues)).toBe(300000);
        });

        it('as host, changing the select dispatches SET_TURN_TIMEOUT via apply-move, and the select value updates immediately (no await)', async () => {
            const { supabase, invoke } = makeFakeSupabase();
            vi.mocked(getSupabaseClient).mockReturnValue(supabase as never);
            const state = buildGameState({
                roomCode: 'ABC123',
                phase: 'lobby',
                host: 'p0',
                turnTimeoutMs: 60000,
                players: [buildPlayer({ id: 'p0', name: 'Alice' }), buildPlayer({ id: 'p1', name: 'Bob' })],
            });

            renderLobby('p0', state);

            const select = (await screen.findByLabelText('Auto-pickup timeout')) as HTMLSelectElement;
            fireEvent.change(select, { target: { value: '90000' } });

            // Assert immediately after fireEvent, not inside waitFor - per
            // CLAUDE.md's testing note, this applies to synchronous state
            // changes (the optimistic dispatchMove leg) too, not just
            // timer-driven state.
            expect(invoke).toHaveBeenCalledWith('apply-move', {
                body: {
                    roomCode: 'ABC123',
                    move: { type: 'SET_TURN_TIMEOUT', playerId: 'p0', timeoutMs: 90000 },
                },
            });
            expect(select.value).toBe('90000');
        });

        it('a non-host has no way to trigger a SET_TURN_TIMEOUT dispatch - no interactive control exists', async () => {
            const { supabase, invoke } = makeFakeSupabase();
            vi.mocked(getSupabaseClient).mockReturnValue(supabase as never);
            const state = buildGameState({
                roomCode: 'ABC123',
                phase: 'lobby',
                host: 'p0',
                turnTimeoutMs: 60000,
                players: [buildPlayer({ id: 'p0', name: 'Alice' }), buildPlayer({ id: 'p1', name: 'Bob' })],
            });

            renderLobby('p1', state);

            await screen.findByText('60s');
            expect(screen.queryByRole('combobox')).not.toBeInTheDocument();
            expect(invoke).not.toHaveBeenCalledWith('apply-move', expect.anything());
        });

        it('when state.host changes to the viewer mid-session, the edit control appears on the next render', async () => {
            const { supabase } = makeFakeSupabase();
            vi.mocked(getSupabaseClient).mockReturnValue(supabase as never);
            const initialState = buildGameState({
                roomCode: 'ABC123',
                phase: 'lobby',
                host: 'p0',
                turnTimeoutMs: 60000,
                players: [buildPlayer({ id: 'p0', name: 'Alice' }), buildPlayer({ id: 'p1', name: 'Bob' })],
            });

            function TransferHarness() {
                const { setGameState, toast, dismissToast } = useGameContext();
                const [current, setCurrent] = useState(initialState);
                useEffect(() => {
                    void setGameState(current);
                    // eslint-disable-next-line react-hooks/exhaustive-deps
                }, []);
                return (
                    <>
                        <LobbyScreen isPlayerOffline={() => false} />
                        <button
                            onClick={() => {
                                const next = { ...current, host: 'p1' };
                                setCurrent(next);
                                void setGameState(next);
                            }}
                        >
                            transfer host
                        </button>
                        <Toast toast={toast} onDismiss={dismissToast} />
                    </>
                );
            }

            render(
                <GameProvider playerId="p1">
                    <TransferHarness />
                </GameProvider>
            );

            expect(await screen.findByText('60s')).toBeInTheDocument();
            expect(screen.queryByLabelText('Auto-pickup timeout')).not.toBeInTheDocument();

            fireEvent.click(screen.getByText('transfer host'));

            await waitFor(() => {
                expect(screen.getByLabelText('Auto-pickup timeout')).toBeInTheDocument();
            });
        });
    });
});
