import { describe, it, expect, beforeEach } from 'vitest';
import { useEffect } from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import '../../storage';
import { GameProvider, useGameContext } from '../../context/GameContext';
import { GameScreen } from '../../screens/GameScreen';
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

function renderGame(playerId: string, state: ReturnType<typeof buildGameState>) {
    return render(
        <GameProvider playerId={playerId}>
            <SeedGameState state={state} />
            <GameScreen />
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
});
