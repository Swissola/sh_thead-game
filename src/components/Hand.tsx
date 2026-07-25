import React from 'react';
import * as GameLogic from '../gameLogic';
import { RANK_VALUES } from '../gameLogic';
import type { Card as CardType, CardSelection, GameState, Player } from '../types';
import { Card as CardComponent } from './Card';
import { useGameContext } from '../context/GameContext';

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
                            className={`px-2 py-1 text-xs rounded ${handSortMode === 'original' ? 'bg-purple-600 text-white' : 'bg-slate-700 text-slate-400 hover:bg-slate-600'}`}
                        >
                            Original
                        </button>
                        <button
                            onClick={() => setHandSortMode('rank')}
                            className={`px-2 py-1 text-xs rounded ${handSortMode === 'rank' ? 'bg-purple-600 text-white' : 'bg-slate-700 text-slate-400 hover:bg-slate-600'}`}
                        >
                            Rank
                        </button>
                        <button
                            onClick={() => setHandSortMode('suit')}
                            className={`px-2 py-1 text-xs rounded ${handSortMode === 'suit' ? 'bg-purple-600 text-white' : 'bg-slate-700 text-slate-400 hover:bg-slate-600'}`}
                        >
                            Suit
                        </button>
                    </div>
                )}
            </div>

            <div className="hand-area flex flex-wrap">
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

                    return sortedCards.map((item, index) => {
                        const nextItem = sortedCards[index + 1];
                        let sameGroup = false;
                        if (nextItem) {
                            if (handSortMode === 'rank') {
                                sameGroup = item.card.rank === nextItem.card.rank;
                            } else if (handSortMode === 'suit') {
                                sameGroup = item.card.suit === nextItem.card.suit;
                            }
                        }

                        const currentSource = GameLogic.getAvailableCardSource(player);
                        const top = GameLogic.getEffectiveTopCard(gameState.discardPile);
                        let tooltip: string | undefined;
                        if (!isSetupPhase) {
                            if (!isMyTurn) {
                                tooltip = 'Not your turn';
                            } else if (currentSource !== 'hand') {
                                tooltip = 'Play from face-up or face-down first';
                            } else {
                                const isVeryFirstTurn = gameState.isFirstTurn;
                                if (isVeryFirstTurn) {
                                    const startingCard = GameLogic.getStartingCard(player);
                                    if (startingCard && item.card.rank !== startingCard.rank) {
                                        tooltip = `First turn: only ${startingCard.rank}s allowed`;
                                    }
                                } else {
                                    const canPlay = GameLogic.canPlayMultipleCards([item.card], gameState.discardPile);
                                    if (!canPlay) {
                                        if (top && GameLogic.isLimiter(top)) {
                                            if (GameLogic.isBurn(item.card)) {
                                                tooltip = '10 cannot be played on a 7';
                                            } else if ((RANK_VALUES[item.card.rank] || 0) > 7) {
                                                tooltip = 'Limiter (7): only 7 or lower allowed';
                                            } else {
                                                tooltip = "Can't be played on the current pile";
                                            }
                                        } else {
                                            tooltip = "Can't be played on the current pile";
                                        }
                                    } else if (selectedCards.length > 0 && !GameLogic.canAddToSelection(item.card, resolvedHandSelection)) {
                                        tooltip = 'Select same rank to play together';
                                    }
                                }
                            }
                        }

                        return (
                            <div key={item.card.id} data-card-key={item.card.id} className={sameGroup ? '-mr-12' : 'mr-2'} style={{ zIndex: index }}>
                                <CardComponent
                                    card={item.card}
                                    selectable={
                                        (isSetupPhase) ||
                                        (!isSetupPhase &&
                                            isMyTurn &&
                                            GameLogic.getAvailableCardSource(player) === 'hand' &&
                                            (() => {
                                                let isPlayable = true;
                                                const isVeryFirstTurn = gameState.isFirstTurn;
                                                if (isVeryFirstTurn) {
                                                    const startingCard = GameLogic.getStartingCard(player);
                                                    if (startingCard) {
                                                        isPlayable = item.card.rank === startingCard.rank;
                                                    } else {
                                                        isPlayable = true;
                                                    }
                                                } else {
                                                    isPlayable = GameLogic.canPlayMultipleCards([item.card], gameState.discardPile);
                                                }
                                                if (selectedCards.length > 0 && !GameLogic.canAddToSelection(item.card, resolvedHandSelection)) {
                                                    isPlayable = false;
                                                }
                                                return isPlayable;
                                            })()
                                        )
                                    }
                                    selected={selectedCards.some((s) => s.type === 'hand' && s.index === item.arrayIndex)}
                                    title={tooltip}
                                    onClick={() => {
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
                                        } else if (!isSetupPhase && isMyTurn && GameLogic.getAvailableCardSource(player) === 'hand') {
                                            const alreadySelected = selectedCards.findIndex((s) => s.type === 'hand' && s.index === item.arrayIndex);
                                            if (alreadySelected >= 0) {
                                                setSelectedCards(selectedCards.filter((_, idx) => idx !== alreadySelected));
                                            } else {
                                                const clickedCard = player.hand[item.arrayIndex];
                                                if (
                                                    clickedCard &&
                                                    (selectedCards.length === 0 ||
                                                        selectedCards.every((s) => {
                                                            const existingCard = player.hand[s.index];
                                                            return existingCard && existingCard.rank === clickedCard.rank;
                                                        }))
                                                ) {
                                                    setSelectedCards([...selectedCards, { type: 'hand', index: item.arrayIndex }]);
                                                }
                                            }
                                        }
                                    }}
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
