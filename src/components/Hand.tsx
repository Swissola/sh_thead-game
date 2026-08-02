import React from 'react';
import * as GameLogic from '../gameLogic';
import type { Card as CardType, CardSelection, CardSource, GameState, Player } from '../types';
import { Card as CardComponent } from './Card';
import { useGameContext } from '../context/GameContext';
import { useRovingTabindex } from '../hooks/useRovingTabindex';
import { getCardPlayability } from '../uiLogic';

type SortedHandItem = ReturnType<typeof GameLogic.sortHand>[number];

function computeSameGroup(
    item: SortedHandItem,
    nextItem: SortedHandItem | undefined,
    handSortMode: 'original' | 'rank' | 'suit'
): boolean {
    if (!nextItem) return false;
    if (handSortMode === 'rank') return item.card.rank === nextItem.card.rank;
    if (handSortMode === 'suit') return item.card.suit === nextItem.card.suit;
    return false;
}

function computeHandTooltip(
    item: SortedHandItem,
    isSetupPhase: boolean,
    isMyTurn: boolean,
    currentSource: CardSource,
    gameState: GameState,
    player: Player,
    resolvedHandSelection: CardType[]
): string | undefined {
    if (isSetupPhase) return undefined;
    if (!isMyTurn) return 'Not your turn';
    if (currentSource !== 'hand') return 'Play from face-up or face-down first';
    if (gameState.isFirstTurn) {
        const startingCard = GameLogic.getStartingCard(player);
        if (startingCard && item.card.rank !== startingCard.rank) {
            return `First turn: only ${startingCard.rank}s allowed`;
        }
        return undefined;
    }
    // WR-04: shared with Table.tsx's face-up branch - see uiLogic.ts.
    return getCardPlayability(item.card, gameState.discardPile, resolvedHandSelection).tooltip;
}

function computeHandSelectable(
    item: SortedHandItem,
    isSetupPhase: boolean,
    isMyTurn: boolean,
    currentSource: CardSource,
    gameState: GameState,
    player: Player,
    selectedCards: CardSelection[],
    resolvedHandSelection: CardType[]
): boolean {
    if (isSetupPhase) return true;
    if (!isMyTurn || currentSource !== 'hand') return false;

    if (gameState.isFirstTurn) {
        const startingCard = GameLogic.getStartingCard(player);
        let isPlayable = startingCard ? item.card.rank === startingCard.rank : true;
        if (selectedCards.length > 0 && !GameLogic.canAddToSelection(item.card, resolvedHandSelection)) {
            isPlayable = false;
        }
        return isPlayable;
    }
    // WR-04: shared with Table.tsx's face-up branch - see uiLogic.ts.
    return getCardPlayability(item.card, gameState.discardPile, resolvedHandSelection).isPlayable;
}

function handleHandCardClick(
    item: SortedHandItem,
    isSetupPhase: boolean,
    isMyTurn: boolean,
    currentSource: CardSource,
    player: Player,
    selectedCards: CardSelection[],
    resolvedHandSelection: CardType[],
    setSelectedCards: (sel: CardSelection[]) => void,
    dispatchMove: ReturnType<typeof useGameContext>['dispatchMove'],
    currentPlayerId: string
): void {
    if (isSetupPhase) {
        const alreadySelected = selectedCards.findIndex((s) => s.type === 'hand' && s.index === item.arrayIndex);

        if (alreadySelected >= 0) {
            setSelectedCards([]);
        } else if (selectedCards.length === 1 && selectedCards[0].type === 'faceUp') {
            dispatchMove({
                type: 'SWAP_CARDS',
                playerId: currentPlayerId,
                sourceA: 'hand',
                indexA: item.arrayIndex,
                sourceB: 'faceUp',
                indexB: selectedCards[0].index,
            });
            setSelectedCards([]);
        } else if (selectedCards.length === 1 && selectedCards[0].type === 'hand') {
            dispatchMove({
                type: 'SWAP_CARDS',
                playerId: currentPlayerId,
                sourceA: 'hand',
                indexA: selectedCards[0].index,
                sourceB: 'hand',
                indexB: item.arrayIndex,
            });
            setSelectedCards([]);
        } else {
            setSelectedCards([{ type: 'hand', index: item.arrayIndex }]);
        }
    } else if (isMyTurn && currentSource === 'hand') {
        const alreadySelected = selectedCards.findIndex((s) => s.type === 'hand' && s.index === item.arrayIndex);
        if (alreadySelected >= 0) {
            setSelectedCards(selectedCards.filter((_, idx) => idx !== alreadySelected));
        } else {
            const clickedCard = player.hand[item.arrayIndex];
            if (clickedCard && GameLogic.canAddToSelection(clickedCard, resolvedHandSelection)) {
                setSelectedCards([...selectedCards, { type: 'hand', index: item.arrayIndex }]);
            }
        }
    }
}

interface HandProps {
    player: Player;
    isSetupPhase: boolean;
    isMyTurn: boolean;
    handSortMode: 'original' | 'rank' | 'suit';
    setHandSortMode: (mode: 'original' | 'rank' | 'suit') => void;
    selectedCards: CardSelection[];
    setSelectedCards: (sel: CardSelection[]) => void;
    gameState: GameState;
    drawingCards: Array<{ card: CardType; id: string; targetPos: { x: number; y: number }; startPos?: { x: number; y: number } }>;
}

const Hand: React.FC<HandProps> = ({
    player,
    isSetupPhase,
    isMyTurn,
    handSortMode,
    setHandSortMode,
    selectedCards,
    setSelectedCards,
    gameState,
    drawingCards,
}) => {
    const { dispatchMove, currentPlayerId } = useGameContext();

    // Hooks cannot run after the early return below, and the card count is
    // not known until the sortHand IIFE runs inside JSX - so it's computed
    // here instead. sortHand filters out nulls, so this equals
    // sortedCards.length exactly.
    const handCardCount = player?.hand?.filter((c) => c !== null).length ?? 0;
    // Destructured to local bindings, not kept as a `roving.foo` property
    // access - the react-compiler ESLint rule (react-hooks/refs) cannot
    // prove a ref reached via object-property access on a hook's return
    // value is safe to pass as a JSX ref, and flags it as a false positive.
    // Direct bindings match the working useFocusTrap pattern elsewhere in
    // this codebase.
    const { containerRef: handContainerRef, onKeyDown: handOnKeyDown, getItemProps: getHandItemProps } = useRovingTabindex(handCardCount);

    if (!player || !player.hand) return null;

    const isDrawing = drawingCards.length > 0;

    return (
        <div className="mb-4">
            <div className="flex items-center justify-between mb-2">
                <p className="text-slate-400 text-sm">Hand</p>
                {!isSetupPhase && (
                    <div className="flex gap-1">
                        <button
                            onClick={() => setHandSortMode('original')}
                            className={`min-h-11 px-3 py-2 text-sm font-semibold rounded ${handSortMode === 'original' ? 'bg-purple-600 text-white' : 'bg-slate-700 text-slate-400 hover:bg-slate-600'}`}
                        >
                            Original
                        </button>
                        <button
                            onClick={() => setHandSortMode('rank')}
                            className={`min-h-11 px-3 py-2 text-sm font-semibold rounded ${handSortMode === 'rank' ? 'bg-purple-600 text-white' : 'bg-slate-700 text-slate-400 hover:bg-slate-600'}`}
                        >
                            Rank
                        </button>
                        <button
                            onClick={() => setHandSortMode('suit')}
                            className={`min-h-11 px-3 py-2 text-sm font-semibold rounded ${handSortMode === 'suit' ? 'bg-purple-600 text-white' : 'bg-slate-700 text-slate-400 hover:bg-slate-600'}`}
                        >
                            Suit
                        </button>
                    </div>
                )}
            </div>

            <div
                className="hand-area flex flex-wrap max-sm:flex-nowrap max-sm:overflow-x-auto max-sm:snap-x max-sm:snap-mandatory max-sm:py-4"
                ref={handContainerRef}
                onKeyDown={handOnKeyDown}
                role="listbox"
                aria-multiselectable="true"
                aria-label="Your hand"
            >
                {(() => {
                    if (isDrawing) {
                        return player.hand.map((card, arrayIndex) => {
                            if (!card) {
                                return (
                                    <div key={`slot-${arrayIndex}`} data-empty-slot className="w-20 h-28 mr-2 opacity-0" />
                                );
                            }
                            return (
                                <div key={card.id} className="mr-2">
                                    <CardComponent card={card} selectable={false} selected={false} onClick={() => { }} />
                                </div>
                            );
                        });
                    }

                    const sortedCards = GameLogic.sortHand(player.hand, handSortMode);

                    const resolvedHandSelection = selectedCards
                        .filter((s) => s.type === 'hand')
                        .map((s) => player.hand[s.index])
                        .filter((c): c is CardType => c !== null);

                    const currentSource = GameLogic.getAvailableCardSource(player);

                    return sortedCards.map((item, index) => {
                        const nextItem = sortedCards[index + 1];
                        const sameGroup = computeSameGroup(item, nextItem, handSortMode);
                        const tooltip = computeHandTooltip(item, isSetupPhase, isMyTurn, currentSource, gameState, player, resolvedHandSelection);
                        const selectable = computeHandSelectable(item, isSetupPhase, isMyTurn, currentSource, gameState, player, selectedCards, resolvedHandSelection);
                        const isSelected = selectedCards.some((s) => s.type === 'hand' && s.index === item.arrayIndex);

                        return (
                            <div key={item.card.id} data-card-key={item.card.id} className={`max-sm:shrink-0 max-sm:snap-start ${sameGroup ? 'mr-2 sm:mr-0 sm:-mr-12' : 'mr-2'}`} style={{ zIndex: index }}>
                                <CardComponent
                                    card={item.card}
                                    selectable={selectable}
                                    selected={isSelected}
                                    title={tooltip}
                                    role="option"
                                    ariaSelected={isSelected}
                                    ariaLabel={tooltip}
                                    {...getHandItemProps(index)}
                                    onClick={() => handleHandCardClick(item, isSetupPhase, isMyTurn, currentSource, player, selectedCards, resolvedHandSelection, setSelectedCards, dispatchMove, currentPlayerId)}
                                />
                            </div>
                        );
                    });
                })()}
            </div>
        </div>
    );
};

export default Hand;
