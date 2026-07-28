import { describe, it, expect, beforeEach } from 'vitest';
import { useCallback, useEffect, useState } from 'react';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import '../../storage';
import { GameProvider, useGameContext } from '../../context/GameContext';
import { GameScreen } from '../../screens/GameScreen';
import { Toast } from '../../components/Toast';
import { buildGameState, buildPlayer, buildCard } from '../testUtils/buildGameState';

/** Seeds gameState via the context's setGameState in an effect on mount. */
function SeedGameState({ state }: { state: ReturnType<typeof buildGameState> }) {
    const { setGameState } = useGameContext();
    useEffect(() => {
        setGameState(state);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);
    return null;
}

/** Flips the context's testMode flag on mount - used to exercise Test Mode's
 * "no offline badges" behaviour without going through MenuScreen's UI. */
function SetTestMode({ value }: { value: boolean }) {
    const { setTestMode } = useGameContext();
    useEffect(() => {
        setTestMode(value);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);
    return null;
}

/** Renders the real Toast component wired to context state, so reconnect-toast
 * assertions prove an actual showToast call rather than mocking it. */
function ToastProbe() {
    const { toast, dismissToast } = useGameContext();
    return <Toast toast={toast} onDismiss={dismissToast} />;
}

/**
 * Exposes context state as text so assertions can observe the result of
 * GameScreen's dispatched moves without mocking dispatchMove itself - every
 * assertion in this file proves a real applyMove round-trip, per D-12.
 */
function Probe() {
    const { gameState } = useGameContext();
    if (!gameState) return <div data-testid="probe">phase:none</div>;
    const top = gameState.discardPile[gameState.discardPile.length - 1];
    return (
        <div data-testid="probe">
            phase:{gameState.phase} discardCount:{gameState.discardPile.length} discardTop:
            {top ? `${top.rank}${top.suit}` : 'none'} players:
            {gameState.players
                .map((p) => `${p.name}(ready:${p.isReady},hand:${p.hand.filter((c) => c !== null).length})`)
                .join(',')}
        </div>
    );
}

function renderGame(
    playerId: string,
    state: ReturnType<typeof buildGameState>,
    options: { isPlayerOffline?: (id: string) => boolean; testMode?: boolean } = {}
) {
    return render(
        <GameProvider playerId={playerId}>
            <SeedGameState state={state} />
            {options.testMode && <SetTestMode value />}
            <GameScreen isPlayerOffline={options.isPlayerOffline} />
            <ToastProbe />
            <Probe />
        </GameProvider>
    );
}

describe('GameScreen', () => {
    beforeEach(() => {
        localStorage.clear();
    });

    it('renders the board (Table and Hand) for the current player', async () => {
        const state = buildGameState({
            phase: 'setup',
            players: [
                buildPlayer({
                    id: 'test-player',
                    name: 'Alice',
                    hand: [buildCard({ id: 'hand-0', rank: '5', suit: '♠' })],
                    faceUp: [buildCard({ id: 'faceup-0', rank: '6', suit: '♥' })],
                    faceDown: [buildCard({ id: 'facedown-0', rank: '7', suit: '♦' })],
                }),
                buildPlayer({ id: 'p1', name: 'Bob' }),
            ],
        });

        const { container } = renderGame('test-player', state);

        expect(await screen.findByText('Table')).toBeInTheDocument();
        expect(screen.getByText('Hand')).toBeInTheDocument();
        expect(container.querySelector('[data-card-key="hand-0"]')).toBeInTheDocument();
    });

    it('clicking a selectable hand card during setup phase results in a selection-state DOM change (D-12)', async () => {
        const state = buildGameState({
            phase: 'setup',
            players: [
                buildPlayer({
                    id: 'test-player',
                    name: 'Alice',
                    hand: [
                        buildCard({ id: 'hand-0', rank: '5', suit: '♠' }),
                        buildCard({ id: 'hand-1', rank: '6', suit: '♥' }),
                    ],
                }),
                buildPlayer({ id: 'p1', name: 'Bob' }),
            ],
        });

        const { container } = renderGame('test-player', state);
        await screen.findByText('Hand');

        const cardEl = container.querySelector('[data-card-key="hand-0"]')?.firstElementChild as HTMLElement;
        expect(cardEl.className).not.toContain('ring-yellow-400');

        fireEvent.click(cardEl);

        await waitFor(() => {
            expect(cardEl.className).toContain('ring-yellow-400');
        });
    });

    it('clicking "Play" with a valid selection dispatches PLAY_CARDS and updates the discard pile', async () => {
        const state = buildGameState({
            phase: 'playing',
            isFirstTurn: false,
            currentTurn: 0,
            deck: [],
            discardPile: [buildCard({ id: 'discard-0', rank: '4', suit: '♣' })],
            players: [
                buildPlayer({
                    id: 'test-player',
                    name: 'Alice',
                    hand: [
                        buildCard({ id: 'hand-0', rank: '5', suit: '♠' }),
                        buildCard({ id: 'hand-1', rank: '6', suit: '♥' }),
                    ],
                }),
                buildPlayer({ id: 'p1', name: 'Bob', hand: [buildCard({ id: 'bob-0', rank: '9', suit: '♦' })] }),
            ],
        });

        const { container } = renderGame('test-player', state);
        await screen.findByText('Hand');

        const cardEl = container.querySelector('[data-card-key="hand-0"]')?.firstElementChild as HTMLElement;
        fireEvent.click(cardEl);
        await waitFor(() => expect(cardEl.className).toContain('ring-yellow-400'));

        fireEvent.click(screen.getByRole('button', { name: /^Play/ }));

        await waitFor(() => {
            expect(screen.getByTestId('probe')).toHaveTextContent('discardCount:2');
            expect(screen.getByTestId('probe')).toHaveTextContent('discardTop:5♠');
        });
    });

    it('clicking "Ready" in setup phase for a not-yet-ready player dispatches READY_UP', async () => {
        const state = buildGameState({
            phase: 'setup',
            players: [buildPlayer({ id: 'test-player', name: 'Alice' }), buildPlayer({ id: 'p1', name: 'Bob' })],
        });

        renderGame('test-player', state);

        const readyButton = await screen.findByText('Ready to Play');
        fireEvent.click(readyButton);

        await waitFor(() => {
            expect(screen.getByTestId('probe')).toHaveTextContent('Alice(ready:true');
        });
        expect(await screen.findByText('Ready! Waiting for others...')).toBeInTheDocument();
    });

    it('clicking "Pick Up Pile" dispatches PICK_UP_PILE directly when no confirmation is needed', async () => {
        const state = buildGameState({
            phase: 'playing',
            isFirstTurn: false,
            currentTurn: 0,
            deck: [],
            discardPile: [buildCard({ id: 'discard-0', rank: 'K', suit: '♣' })],
            players: [
                buildPlayer({
                    id: 'test-player',
                    name: 'Alice',
                    hand: [buildCard({ id: 'hand-0', rank: '4', suit: '♠' })],
                }),
                buildPlayer({ id: 'p1', name: 'Bob', hand: [buildCard({ id: 'bob-0', rank: '9', suit: '♦' })] }),
            ],
        });

        renderGame('test-player', state);

        const pickUpButton = await screen.findByRole('button', { name: /Pick Up Pile/ });
        fireEvent.click(pickUpButton);

        expect(screen.queryByText('Confirm Pick Up')).not.toBeInTheDocument();
        await waitFor(() => {
            expect(screen.getByTestId('probe')).toHaveTextContent('discardCount:0');
        });
    });

    it('clicking "Pick Up Pile" opens the confirmation modal when a valid play exists, and "Pick Up Anyway" dispatches PICK_UP_PILE', async () => {
        const state = buildGameState({
            phase: 'playing',
            isFirstTurn: false,
            currentTurn: 0,
            deck: [],
            discardPile: [buildCard({ id: 'discard-0', rank: '5', suit: '♣' })],
            players: [
                buildPlayer({
                    id: 'test-player',
                    name: 'Alice',
                    hand: [buildCard({ id: 'hand-0', rank: '6', suit: '♠' })],
                }),
                buildPlayer({ id: 'p1', name: 'Bob', hand: [buildCard({ id: 'bob-0', rank: '9', suit: '♦' })] }),
            ],
        });

        renderGame('test-player', state);

        const pickUpButton = await screen.findByRole('button', { name: /Pick Up Pile/ });
        fireEvent.click(pickUpButton);

        expect(await screen.findByText('Confirm Pick Up')).toBeInTheDocument();

        fireEvent.click(screen.getByText('Pick Up Anyway'));

        await waitFor(() => {
            expect(screen.queryByText('Confirm Pick Up')).not.toBeInTheDocument();
            expect(screen.getByTestId('probe')).toHaveTextContent('discardCount:0');
        });
    });

    it('playing two same-rank hand cards refills the hand to 3 and shows a ghost card per drawn card (regression: e3f30b3, ab02f0b)', async () => {
        const state = buildGameState({
            phase: 'playing',
            isFirstTurn: false,
            currentTurn: 0,
            deck: [
                buildCard({ id: 'deck-0', rank: '9', suit: '♣' }),
                buildCard({ id: 'deck-1', rank: '10', suit: '♣' }),
            ],
            discardPile: [],
            players: [
                buildPlayer({
                    id: 'test-player',
                    name: 'Alice',
                    hand: [
                        buildCard({ id: 'hand-0', rank: '7', suit: '♠' }),
                        buildCard({ id: 'hand-1', rank: '7', suit: '♥' }),
                        buildCard({ id: 'hand-2', rank: '3', suit: '♣' }),
                    ],
                }),
                buildPlayer({ id: 'p1', name: 'Bob', hand: [buildCard({ id: 'bob-0', rank: '9', suit: '♦' })] }),
            ],
        });

        const { container } = renderGame('test-player', state);
        await screen.findByText('Hand');

        fireEvent.click(container.querySelector('[data-card-key="hand-0"]')?.firstElementChild as HTMLElement);
        fireEvent.click(container.querySelector('[data-card-key="hand-1"]')?.firstElementChild as HTMLElement);
        await waitFor(() => {
            const selected = container.querySelectorAll('[data-card-key="hand-0"] .ring-yellow-400, [data-card-key="hand-1"] .ring-yellow-400');
            expect(selected.length).toBe(2);
        });

        fireEvent.click(screen.getByRole('button', { name: /^Play/ }));

        // Ghost portal reflects the draw prediction synchronously, before the
        // 700ms setTimeout that clears it - checked immediately, no waitFor,
        // to avoid racing the real-timer clear.
        expect(container.ownerDocument.querySelectorAll('.draw-card-ghost').length).toBe(2);

        await waitFor(() => {
            expect(screen.getByTestId('probe')).toHaveTextContent('Alice(ready:false,hand:3)');
        });
    });

    it('does not reveal a selected face-down card\'s rank/suit before Play is clicked (regression: 9f4f0fa)', async () => {
        const state = buildGameState({
            phase: 'playing',
            isFirstTurn: false,
            currentTurn: 0,
            deck: [],
            discardPile: [],
            players: [
                buildPlayer({
                    id: 'test-player',
                    name: 'Alice',
                    hand: [],
                    faceUp: [],
                    faceDown: [buildCard({ id: 'facedown-0', rank: 'Q', suit: '♦' })],
                }),
                buildPlayer({ id: 'p1', name: 'Bob', hand: [buildCard({ id: 'bob-0', rank: '9', suit: '♣' })] }),
            ],
        });

        const { container } = renderGame('test-player', state);
        await screen.findByText('Table');

        expect(screen.queryByText('Q')).not.toBeInTheDocument();

        fireEvent.click(container.querySelector('[data-facedown-index="0"]')?.firstElementChild as HTMLElement);

        await waitFor(() => {
            expect(screen.getByText(/played blind/i)).toBeInTheDocument();
        });
        // The face-down card is selected (Play is enabled) but its identity
        // must still not appear anywhere in the DOM.
        expect(screen.queryByText('Q')).not.toBeInTheDocument();
        expect(screen.getByRole('button', { name: /^Play/ })).not.toBeDisabled();
    });

    it('clicking two hand cards in setup phase swaps their positions via SWAP_CARDS (D-12)', async () => {
        const state = buildGameState({
            phase: 'setup',
            players: [
                buildPlayer({
                    id: 'test-player',
                    name: 'Alice',
                    hand: [
                        buildCard({ id: 'hand-0', rank: '5', suit: '♠' }),
                        buildCard({ id: 'hand-1', rank: '6', suit: '♥' }),
                    ],
                }),
                buildPlayer({ id: 'p1', name: 'Bob' }),
            ],
        });

        const { container } = renderGame('test-player', state);
        await screen.findByText('Hand');

        const firstCard = container.querySelector('[data-card-key="hand-0"]')?.firstElementChild as HTMLElement;
        const secondCard = container.querySelector('[data-card-key="hand-1"]')?.firstElementChild as HTMLElement;

        fireEvent.click(firstCard);
        await waitFor(() => expect(firstCard.className).toContain('ring-yellow-400'));
        fireEvent.click(secondCard);

        await waitFor(() => {
            const keysInOrder = Array.from(container.querySelectorAll('[data-card-key]')).map((el) =>
                el.getAttribute('data-card-key')
            );
            expect(keysInOrder).toEqual(['hand-1', 'hand-0']);
        });
    });

    it('clicking a hand card then a face-up card in setup phase swaps them via SWAP_CARDS (D-12)', async () => {
        const state = buildGameState({
            phase: 'setup',
            players: [
                buildPlayer({
                    id: 'test-player',
                    name: 'Alice',
                    hand: [buildCard({ id: 'hand-0', rank: '5', suit: '♠' })],
                    faceUp: [buildCard({ id: 'faceup-0', rank: '6', suit: '♥' })],
                }),
                buildPlayer({ id: 'p1', name: 'Bob' }),
            ],
        });

        const { container } = renderGame('test-player', state);
        await screen.findByText('Hand');

        const handCard = container.querySelector('[data-card-key="hand-0"]')?.firstElementChild as HTMLElement;
        const faceUpCard = container.querySelector('[data-faceup-index="0"]')?.firstElementChild as HTMLElement;

        fireEvent.click(handCard);
        await waitFor(() => expect(handCard.className).toContain('ring-yellow-400'));
        fireEvent.click(faceUpCard);

        await waitFor(() => {
            expect(container.querySelector('[data-card-key="faceup-0"]')).toBeInTheDocument();
            expect(container.querySelector('[data-faceup-index="0"]')?.textContent).toContain('5');
            expect(container.querySelector('[data-faceup-index="0"]')?.textContent).toContain('♠');
        });
    });

    it('clicking two face-up cards in setup phase swaps them via SWAP_CARDS (D-12)', async () => {
        const state = buildGameState({
            phase: 'setup',
            players: [
                buildPlayer({
                    id: 'test-player',
                    name: 'Alice',
                    faceUp: [
                        buildCard({ id: 'faceup-0', rank: '6', suit: '♥' }),
                        buildCard({ id: 'faceup-1', rank: '7', suit: '♦' }),
                    ],
                }),
                buildPlayer({ id: 'p1', name: 'Bob' }),
            ],
        });

        const { container } = renderGame('test-player', state);
        await screen.findByText('Table');

        const firstFaceUp = container.querySelector('[data-faceup-index="0"]')?.firstElementChild as HTMLElement;
        const secondFaceUp = container.querySelector('[data-faceup-index="1"]')?.firstElementChild as HTMLElement;

        fireEvent.click(firstFaceUp);
        await waitFor(() => expect(firstFaceUp.className).toContain('ring-yellow-400'));
        fireEvent.click(secondFaceUp);

        await waitFor(() => {
            expect(container.querySelector('[data-faceup-index="0"]')?.textContent).toContain('7');
            expect(container.querySelector('[data-faceup-index="0"]')?.textContent).toContain('♦');
            expect(container.querySelector('[data-faceup-index="1"]')?.textContent).toContain('6');
            expect(container.querySelector('[data-faceup-index="1"]')?.textContent).toContain('♥');
        });
    });

    describe('presence-driven offline badge and reconnect toast (D-10, plan 02-12)', () => {
        it('greys out an offline opponent tile with an Offline badge; a connected opponent renders normally', async () => {
            const state = buildGameState({
                phase: 'playing',
                players: [
                    buildPlayer({ id: 'test-player', name: 'Alice' }),
                    buildPlayer({ id: 'p1', name: 'Bob' }),
                    buildPlayer({ id: 'p2', name: 'Charlie' }),
                ],
            });
            const isPlayerOffline = (id: string) => id === 'p1';

            renderGame('test-player', state, { isPlayerOffline });

            const bobTile = (await screen.findByText('Bob')).closest('div.rounded-lg') as HTMLElement;
            expect(bobTile.className).toContain('opacity-60');
            expect(bobTile.className).toContain('border-slate-600');
            expect(within(bobTile).getByText('Offline')).toBeInTheDocument();

            const charlieTile = screen.getByText('Charlie').closest('div.rounded-lg') as HTMLElement;
            expect(charlieTile.className).not.toContain('opacity-60');
            expect(within(charlieTile).queryByText('Offline')).not.toBeInTheDocument();
        });

        it("never shows the offline badge on the local player's own tile, whatever presence reports", async () => {
            const state = buildGameState({
                phase: 'playing',
                players: [buildPlayer({ id: 'test-player', name: 'Alice' }), buildPlayer({ id: 'p1', name: 'Bob' })],
            });
            const isPlayerOffline = () => true;

            renderGame('test-player', state, { isPlayerOffline });

            const aliceTile = (await screen.findByText('Alice')).closest('div.rounded-lg') as HTMLElement;
            expect(within(aliceTile).queryByText('Offline')).not.toBeInTheDocument();
        });

        it('shows no offline badge for any tile in Test Mode, even when isPlayerOffline reports true', async () => {
            const state = buildGameState({
                phase: 'playing',
                players: [buildPlayer({ id: 'test-player', name: 'Alice' }), buildPlayer({ id: 'p1', name: 'Bob' })],
            });
            const isPlayerOffline = () => true;

            renderGame('test-player', state, { isPlayerOffline, testMode: true });

            // Test Mode's "CONTROL PLAYER" <select> also lists each player's name
            // as an option, so "Bob" is not unique here - wait on that instead.
            await screen.findAllByText('Bob');
            expect(screen.queryByText('Offline')).not.toBeInTheDocument();
        });

        it('does not raise a reconnect toast for a player who is already online at mount', async () => {
            const state = buildGameState({
                phase: 'playing',
                players: [buildPlayer({ id: 'test-player', name: 'Alice' }), buildPlayer({ id: 'p1', name: 'Bob' })],
            });
            const isPlayerOffline = () => false;

            renderGame('test-player', state, { isPlayerOffline });

            await screen.findByText('Bob');
            expect(screen.queryByRole('alert')).not.toBeInTheDocument();
        });

        it('raises a "{name} reconnected" toast exactly once when a player transitions from offline to online', async () => {
            const state = buildGameState({
                phase: 'playing',
                players: [buildPlayer({ id: 'test-player', name: 'Alice' }), buildPlayer({ id: 'p1', name: 'Bob' })],
            });

            // Mirrors usePresence's real isPlayerOffline (a useCallback keyed on
            // onlinePlayerIds) - a new function reference each time the online
            // set changes, so GameScreen's reconnect effect actually re-runs.
            function Harness() {
                const [offlineIds, setOfflineIds] = useState<string[]>(['p1']);
                const isPlayerOffline = useCallback((id: string) => offlineIds.includes(id), [offlineIds]);
                return (
                    <>
                        <GameScreen isPlayerOffline={isPlayerOffline} />
                        <button onClick={() => setOfflineIds([])}>Clear offline</button>
                    </>
                );
            }

            render(
                <GameProvider playerId="test-player">
                    <SeedGameState state={state} />
                    <Harness />
                    <ToastProbe />
                    <Probe />
                </GameProvider>
            );

            await screen.findByText('Bob');
            expect(screen.queryByRole('alert')).not.toBeInTheDocument();

            fireEvent.click(screen.getByText('Clear offline'));

            await waitFor(() => {
                expect(screen.getByRole('alert')).toHaveTextContent('Bob reconnected');
            });
            expect(screen.getAllByRole('alert')).toHaveLength(1);
        });

        it('renders correctly when no isPlayerOffline prop is supplied', async () => {
            const state = buildGameState({
                phase: 'playing',
                players: [buildPlayer({ id: 'test-player', name: 'Alice' }), buildPlayer({ id: 'p1', name: 'Bob' })],
            });

            render(
                <GameProvider playerId="test-player">
                    <SeedGameState state={state} />
                    <GameScreen />
                    <Probe />
                </GameProvider>
            );

            await screen.findByText('Bob');
            expect(screen.queryByText('Offline')).not.toBeInTheDocument();
        });
    });
});
