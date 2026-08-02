import { describe, it, expect } from 'vitest';
import { useState } from 'react';
import { render, screen, within, fireEvent } from '@testing-library/react';
import { GameProvider } from '../../context/GameContext';
import Table from '../../components/Table';
import { buildGameState, buildPlayer, buildCard } from '../testUtils/buildGameState';
import type { Card, CardSelection, Player } from '../../types';

interface RevealedFaceDown {
    card: Card;
    index: number;
}

interface TableHarnessProps {
    currentPlayer: Player;
    isSetupPhase?: boolean;
    isMyTurn?: boolean;
}

/** Stateful wrapper owning selectedCards/revealedFaceDown, mirroring
 * GameScreen's ownership of both - Table itself is a pure props-in
 * component with no internal selection state. */
function TableHarness({ currentPlayer, isSetupPhase = false, isMyTurn = true }: TableHarnessProps) {
    const [selectedCards, setSelectedCards] = useState<CardSelection[]>([]);
    const [revealedFaceDown, setRevealedFaceDown] = useState<RevealedFaceDown | null>(null);
    const gameState = buildGameState({ players: [currentPlayer] });

    return (
        <>
            <Table
                gameState={gameState}
                currentPlayer={currentPlayer}
                isSetupPhase={isSetupPhase}
                isMyTurn={isMyTurn}
                selectedCards={selectedCards}
                setSelectedCards={setSelectedCards}
                revealedFaceDown={revealedFaceDown}
                setRevealedFaceDown={setRevealedFaceDown}
            />
            <div data-testid="selection-readout">{JSON.stringify(selectedCards)}</div>
            <div data-testid="revealed-readout">{JSON.stringify(revealedFaceDown)}</div>
        </>
    );
}

function renderTable(props: TableHarnessProps) {
    return render(
        <GameProvider playerId={props.currentPlayer.id}>
            <TableHarness {...props} />
        </GameProvider>
    );
}

function readSelection(container: HTMLElement): CardSelection[] {
    const el = container.querySelector('[data-testid="selection-readout"]');
    return el ? JSON.parse(el.textContent || '[]') : [];
}

function readRevealed(container: HTMLElement): RevealedFaceDown | null {
    const el = container.querySelector('[data-testid="revealed-readout"]');
    return el ? JSON.parse(el.textContent || 'null') : null;
}

describe('Table - face-up pile listbox (RESP-04)', () => {
    const cardA = buildCard({ id: 'fu-a', rank: '5', suit: '♠' });
    const cardB = buildCard({ id: 'fu-b', rank: '5', suit: '♥' });
    const cardC = buildCard({ id: 'fu-c', rank: '9', suit: '♣' });

    function buildFaceUpPlayer(overrides: Partial<Player> = {}): Player {
        return buildPlayer({
            id: 'p0',
            hand: [],
            faceUp: [cardA, null, cardB, cardC],
            faceDown: [],
            ...overrides,
        });
    }

    it('Test 1: face-up container is a multi-selectable listbox', () => {
        renderTable({ currentPlayer: buildFaceUpPlayer() });
        const listbox = screen.getByRole('listbox', { name: 'Your face-up cards' });
        expect(listbox).toHaveAttribute('aria-multiselectable', 'true');
    });

    it('Test 2: each non-null face-up card is an option; exactly one is the tab stop', () => {
        renderTable({ currentPlayer: buildFaceUpPlayer() });
        const listbox = screen.getByRole('listbox', { name: 'Your face-up cards' });
        const options = within(listbox).getAllByRole('option');
        expect(options).toHaveLength(3);
        const tabStops = options.filter((o) => o.getAttribute('tabindex') === '0');
        expect(tabStops).toHaveLength(1);
    });

    it('Test 3: ArrowRight moves focus to the next face-up card without changing selection', () => {
        const { container } = renderTable({ currentPlayer: buildFaceUpPlayer() });
        const cardAEl = container.querySelector('[data-faceup-index="0"]')!.firstElementChild as HTMLElement;
        const cardBEl = container.querySelector('[data-faceup-index="2"]')!.firstElementChild as HTMLElement;
        fireEvent.keyDown(cardAEl, { key: 'ArrowRight' });
        expect(document.activeElement).toBe(cardBEl);
        expect(readSelection(container)).toEqual([]);
    });

    it('Test 4: Space on a playable face-up card selects it', () => {
        const { container } = renderTable({ currentPlayer: buildFaceUpPlayer() });
        const cardAEl = container.querySelector('[data-faceup-index="0"]')!.firstElementChild as HTMLElement;
        fireEvent.keyDown(cardAEl, { key: ' ' });
        expect(readSelection(container)).toEqual([{ type: 'faceUp', index: 0 }]);
        expect(cardAEl).toHaveAttribute('aria-selected', 'true');
    });

    it('Test 5: Space on a second same-rank face-up card adds it too (D-03 multi-select)', () => {
        const { container } = renderTable({ currentPlayer: buildFaceUpPlayer() });
        const cardAEl = container.querySelector('[data-faceup-index="0"]')!.firstElementChild as HTMLElement;
        const cardBEl = container.querySelector('[data-faceup-index="2"]')!.firstElementChild as HTMLElement;
        fireEvent.keyDown(cardAEl, { key: ' ' });
        fireEvent.keyDown(cardBEl, { key: ' ' });
        expect(readSelection(container)).toEqual([
            { type: 'faceUp', index: 0 },
            { type: 'faceUp', index: 2 },
        ]);
        expect(cardBEl).toHaveAttribute('aria-selected', 'true');
    });

    it('Test 6: Space on a mismatched-rank face-up card leaves the selection unchanged', () => {
        const { container } = renderTable({ currentPlayer: buildFaceUpPlayer() });
        const cardAEl = container.querySelector('[data-faceup-index="0"]')!.firstElementChild as HTMLElement;
        const cardCEl = container.querySelector('[data-faceup-index="3"]')!.firstElementChild as HTMLElement;
        fireEvent.keyDown(cardAEl, { key: ' ' });
        fireEvent.keyDown(cardCEl, { key: ' ' });
        expect(readSelection(container)).toEqual([{ type: 'faceUp', index: 0 }]);
    });

    it('Test 7: an empty face-up slot renders no option', () => {
        const { container } = renderTable({ currentPlayer: buildFaceUpPlayer() });
        const emptySlot = container.querySelector('[data-faceup-index="1"]');
        expect(emptySlot).toBeNull();
        const listbox = screen.getByRole('listbox', { name: 'Your face-up cards' });
        expect(within(listbox).queryAllByRole('option')).toHaveLength(3);
    });

    it('Test 8: a face-up card exposes its tooltip text as its accessible name', () => {
        const { container } = renderTable({ currentPlayer: buildFaceUpPlayer(), isMyTurn: false });
        const cardAEl = container.querySelector('[data-faceup-index="0"]')!.firstElementChild as HTMLElement;
        expect(cardAEl).toHaveAttribute('aria-label', 'Not your turn');
    });
});

describe('Table - face-down pile listbox (RESP-04, D-03, D-08)', () => {
    const faceDownA = buildCard({ id: 'fd-a', rank: 'K', suit: '♠' });
    const faceDownB = buildCard({ id: 'fd-b', rank: 'Q', suit: '♥' });

    function buildFaceDownPlayer(overrides: Partial<Player> = {}): Player {
        return buildPlayer({
            id: 'p0',
            hand: [],
            faceUp: [],
            faceDown: [faceDownA, null, faceDownB],
            ...overrides,
        });
    }

    it('Test 1: face-down container is a single-select listbox', () => {
        renderTable({ currentPlayer: buildFaceDownPlayer() });
        const listbox = screen.getByRole('listbox', { name: 'Your face-down cards' });
        expect(listbox).not.toHaveAttribute('aria-multiselectable');
    });

    it('Test 2: each non-null face-down card is an option; exactly one is the tab stop', () => {
        renderTable({ currentPlayer: buildFaceDownPlayer() });
        const listbox = screen.getByRole('listbox', { name: 'Your face-down cards' });
        const options = within(listbox).getAllByRole('option');
        expect(options).toHaveLength(2);
        const tabStops = options.filter((o) => o.getAttribute('tabindex') === '0');
        expect(tabStops).toHaveLength(1);
    });

    it('Test 3: ArrowRight on the face-down listbox moves focus without revealing or selecting', () => {
        const { container } = renderTable({ currentPlayer: buildFaceDownPlayer() });
        const cardAEl = container.querySelector('[data-facedown-index="0"]')!.firstElementChild as HTMLElement;
        const cardBEl = container.querySelector('[data-facedown-index="2"]')!.firstElementChild as HTMLElement;
        fireEvent.keyDown(cardAEl, { key: 'ArrowRight' });
        expect(document.activeElement).toBe(cardBEl);
        expect(readRevealed(container)).toBeNull();
    });

    it('Test 4: Space on a face-down card reveals it and marks it selected', () => {
        const { container } = renderTable({ currentPlayer: buildFaceDownPlayer() });
        const cardAEl = container.querySelector('[data-facedown-index="0"]')!.firstElementChild as HTMLElement;
        fireEvent.keyDown(cardAEl, { key: ' ' });
        expect(readRevealed(container)).toEqual({ card: faceDownA, index: 0 });
        expect(cardAEl).toHaveAttribute('aria-selected', 'true');
    });

    it('Test 5 (D-03 core): Space on a second face-down card leaves exactly one selected', () => {
        const { container } = renderTable({ currentPlayer: buildFaceDownPlayer() });
        const cardAEl = container.querySelector('[data-facedown-index="0"]')!.firstElementChild as HTMLElement;
        const cardBEl = container.querySelector('[data-facedown-index="2"]')!.firstElementChild as HTMLElement;
        fireEvent.keyDown(cardAEl, { key: ' ' });
        fireEvent.keyDown(cardBEl, { key: ' ' });
        expect(readRevealed(container)).toEqual({ card: faceDownB, index: 2 });
        expect(cardBEl).toHaveAttribute('aria-selected', 'true');
        expect(cardAEl).toHaveAttribute('aria-selected', 'false');
    });

    it('Test 6 (blind-play invariant): every face-down card exposes only "Face-down card"', () => {
        renderTable({ currentPlayer: buildFaceDownPlayer() });
        const listbox = screen.getByRole('listbox', { name: 'Your face-down cards' });
        const options = within(listbox).getAllByRole('option');
        options.forEach((option) => {
            expect(option).toHaveAttribute('aria-label', 'Face-down card');
        });
        expect(listbox.innerHTML).not.toContain('K');
        expect(listbox.innerHTML).not.toContain('Q');
        expect(listbox.innerHTML).not.toContain('♠');
        expect(listbox.innerHTML).not.toContain('♥');
    });

    it('Test 7: face-down and face-up containers are two separate listboxes, never merged', () => {
        const player = buildPlayer({
            id: 'p0',
            hand: [],
            faceUp: [buildCard({ id: 'fu-x', rank: '5', suit: '♠' })],
            faceDown: [buildCard({ id: 'fd-x', rank: 'K', suit: '♣' })],
        });
        const { container } = renderTable({ currentPlayer: player });
        const listboxes = within(container).getAllByRole('listbox');
        expect(listboxes).toHaveLength(2);
        expect(listboxes[0]).not.toBe(listboxes[1]);
    });

    it('Test 8: an empty face-down slot renders no option', () => {
        const { container } = renderTable({ currentPlayer: buildFaceDownPlayer() });
        const emptySlot = container.querySelector('[data-facedown-index="1"]');
        expect(emptySlot).toBeNull();
        const listbox = screen.getByRole('listbox', { name: 'Your face-down cards' });
        expect(within(listbox).queryAllByRole('option')).toHaveLength(2);
    });
});
