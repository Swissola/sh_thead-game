import { describe, it, expect } from 'vitest';
import { useState } from 'react';
import { render, fireEvent, screen } from '@testing-library/react';
import Hand from '../../components/Hand';
import { GameProvider } from '../../context/GameContext';
import { buildGameState, buildPlayer, buildCard } from '../testUtils/buildGameState';
import type { CardSelection, GameState, Player } from '../../types';

/**
 * Hand is a default export that calls useGameContext(), so it must be
 * rendered inside a GameProvider. This harness owns selectedCards/
 * setHandSortMode itself (rather than a spy) so assertions observe real
 * state transitions through the same setSelectedCards path the component
 * calls, mirroring GameScreen.test.tsx's renderGame/Probe approach but
 * mounting Hand directly with explicit props.
 */
function Harness({
    player,
    gameState,
    isSetupPhase = false,
    isMyTurn = true,
}: {
    player: Player;
    gameState: GameState;
    isSetupPhase?: boolean;
    isMyTurn?: boolean;
}) {
    const [handSortMode, setHandSortMode] = useState<'original' | 'rank' | 'suit'>('original');
    const [selectedCards, setSelectedCards] = useState<CardSelection[]>([]);

    return (
        <GameProvider playerId={player.id}>
            <Hand
                player={player}
                isSetupPhase={isSetupPhase}
                isMyTurn={isMyTurn}
                handSortMode={handSortMode}
                setHandSortMode={setHandSortMode}
                selectedCards={selectedCards}
                setSelectedCards={setSelectedCards}
                gameState={gameState}
                drawingCards={[]}
            />
        </GameProvider>
    );
}

function getOptions() {
    return screen.getAllByRole('option');
}

describe('Hand', () => {
    // Two same-rank cards (5s) plus one different rank (7) - covers both the
    // multi-select-same-rank case and the "different rank rejected" case.
    const cardA = buildCard({ id: 'card-a', rank: '5', suit: '♠' });
    const cardB = buildCard({ id: 'card-b', rank: '5', suit: '♥' });
    const cardC = buildCard({ id: 'card-c', rank: '7', suit: '♣' });

    function buildFixture(overrides: { hand?: (typeof cardA | null)[] } = {}) {
        const player = buildPlayer({ id: 'p0', hand: overrides.hand ?? [cardA, cardB, cardC] });
        const gameState = buildGameState({
            players: [player, buildPlayer({ id: 'p1' })],
            discardPile: [],
        });
        return { player, gameState };
    }

    it('Test 1: the hand card container renders with role="listbox", aria-multiselectable="true" and aria-label="Your hand"', () => {
        const { player, gameState } = buildFixture();
        render(<Harness player={player} gameState={gameState} />);

        const listbox = screen.getByRole('listbox', { name: 'Your hand' });
        expect(listbox).toHaveAttribute('aria-multiselectable', 'true');
    });

    it('Test 2: each rendered hand card carries role="option"; exactly one carries tabindex="0" and the rest tabindex="-1"', () => {
        const { player, gameState } = buildFixture();
        render(<Harness player={player} gameState={gameState} />);

        const options = getOptions();
        expect(options).toHaveLength(3);

        const zeroTabIndex = options.filter((o) => o.getAttribute('tabindex') === '0');
        const negativeTabIndex = options.filter((o) => o.getAttribute('tabindex') === '-1');
        expect(zeroTabIndex).toHaveLength(1);
        expect(negativeTabIndex).toHaveLength(2);
    });

    it("Test 3: ArrowRight moves document.activeElement to the next card and leaves selectedCards unchanged - selection does not follow focus", () => {
        const { player, gameState } = buildFixture();
        render(<Harness player={player} gameState={gameState} />);

        const listbox = screen.getByRole('listbox');
        fireEvent.keyDown(listbox, { key: 'ArrowRight' });

        const options = getOptions();
        expect(document.activeElement).toBe(options[1]);
        expect(options.every((o) => o.getAttribute('aria-selected') === 'false')).toBe(true);
    });

    it('Test 4: Space on a focused, playable hand card adds it to the selection and flips its aria-selected to "true"', () => {
        const { player, gameState } = buildFixture();
        render(<Harness player={player} gameState={gameState} />);

        const options = getOptions();
        fireEvent.keyDown(options[0], { key: ' ' });

        expect(options[0]).toHaveAttribute('aria-selected', 'true');
    });

    it('Test 5: a second Space on the same card removes it from the selection and aria-selected returns to "false"', () => {
        const { player, gameState } = buildFixture();
        render(<Harness player={player} gameState={gameState} />);

        const options = getOptions();
        fireEvent.keyDown(options[0], { key: ' ' });
        fireEvent.keyDown(options[0], { key: ' ' });

        expect(options[0]).toHaveAttribute('aria-selected', 'false');
    });

    it('Test 6: with one card of rank 5 selected, Space on a second rank-5 card adds it too (multi-select), while Space on a rank-7 card does not', () => {
        const { player, gameState } = buildFixture();
        render(<Harness player={player} gameState={gameState} />);

        const options = getOptions();
        fireEvent.keyDown(options[0], { key: ' ' }); // cardA, rank 5
        fireEvent.keyDown(options[1], { key: ' ' }); // cardB, rank 5 - same rank, should add
        fireEvent.keyDown(options[2], { key: ' ' }); // cardC, rank 7 - different rank, should not add

        expect(options[0]).toHaveAttribute('aria-selected', 'true');
        expect(options[1]).toHaveAttribute('aria-selected', 'true');
        expect(options[2]).toHaveAttribute('aria-selected', 'false');
    });

    it('Test 7: an unplayable card (not the player\'s turn) exposes its tooltip string as its aria-label', () => {
        const { player, gameState } = buildFixture();
        render(<Harness player={player} gameState={gameState} isMyTurn={false} />);

        const options = getOptions();
        expect(options[0]).toHaveAttribute('aria-label', 'Not your turn');
    });

    it('Test 8: when the hand shrinks from N to N-1 cards, exactly one card still carries tabindex="0" (Pitfall 1)', () => {
        const { player, gameState } = buildFixture();
        const { rerender } = render(<Harness player={player} gameState={gameState} />);

        const listbox = screen.getByRole('listbox');
        fireEvent.keyDown(listbox, { key: 'End' });
        expect(document.activeElement).toBe(getOptions()[2]);

        const shrunkPlayer = { ...player, hand: [cardA, cardB] };
        rerender(<Harness player={shrunkPlayer} gameState={gameState} />);

        const options = getOptions();
        expect(options).toHaveLength(2);
        const zeroTabIndex = options.filter((o) => o.getAttribute('tabindex') === '0');
        expect(zeroTabIndex).toHaveLength(1);
    });

    it('Test 9: the sort buttons carry the min-h-11 44px touch-target class', () => {
        const { player, gameState } = buildFixture();
        render(<Harness player={player} gameState={gameState} />);

        const originalButton = screen.getByRole('button', { name: 'Original' });
        expect(originalButton.className).toContain('min-h-11');
    });

    it('Test 10: the hand-area container carries the phone-width scroll-strip classes', () => {
        const { player, gameState } = buildFixture();
        render(<Harness player={player} gameState={gameState} />);

        const listbox = screen.getByRole('listbox');
        expect(listbox.className).toContain('max-sm:overflow-x-auto');
        expect(listbox.className).toContain('max-sm:flex-nowrap');
        expect(listbox.className).toContain('max-sm:snap-x');
        expect(listbox.className).toContain('max-sm:snap-mandatory');
    });

    it('Test 11: a same-rank card wrapper class list contains mr-2 and an sm:-prefixed -mr-12, not an unqualified overlap', () => {
        const { player, gameState } = buildFixture();
        render(<Harness player={player} gameState={gameState} />);

        // cardA and cardB are both rank 5 (adjacent in 'original' order), so
        // cardA's wrapper is the "sameGroup" case only under rank/suit sort -
        // sort by rank to exercise the sameGroup branch.
        const rankButton = screen.getByRole('button', { name: 'Rank' });
        fireEvent.click(rankButton);

        const wrapper = document.querySelector('[data-card-key="card-a"]') as HTMLElement;
        expect(wrapper.className).toContain('mr-2');
        expect(wrapper.className).toContain('sm:-mr-12');
        expect(wrapper.className).toContain('max-sm:shrink-0');
        expect(wrapper.className).toContain('max-sm:snap-start');
    });
});
