import React from 'react';
import * as GameLogic from '../gameLogic';
import type { Card, CardSelection, GameState, Player } from '../types';
import { Card as CardComponent } from './Card';
import { useGameContext } from '../context/GameContext';

interface RevealedFaceDown {
    card: Card;
    index: number;
}

interface TableProps {
    gameState: GameState;
    currentPlayer: Player;
    isSetupPhase: boolean;
    isMyTurn: boolean;
    selectedCards: CardSelection[];
    setSelectedCards: (sel: CardSelection[]) => void;
    revealedFaceDown: RevealedFaceDown | null;
    setRevealedFaceDown: (val: RevealedFaceDown | null) => void;
}

const Table: React.FC<TableProps> = ({
    gameState,
    currentPlayer,
    isSetupPhase,
    isMyTurn,
    selectedCards,
    setSelectedCards,
    revealedFaceDown,
    setRevealedFaceDown,
}) => {
    const { dispatchMove, currentPlayerId } = useGameContext();

    if (!currentPlayer) return null;

    const resolvedFaceUpSelection = selectedCards
        .filter((s) => s.type === 'faceUp')
        .map((s) => currentPlayer.faceUp[s.index])
        .filter((c): c is Card => c !== null);

    return (
        <div className="space-y-4">
            <div>
                <p className="text-slate-400 text-sm mb-2">Table</p>
                <div className="relative">
                    {/* Face Down cards - laid out horizontally with preserved positions */}
                    <div className="flex gap-2">
                        {currentPlayer.faceDown.map((card, i) => {
                            if (card === null) {
                                return <div key={`faceDown-empty-${i}`} className="w-16 h-24" />;
                            }
                            return (
                                <div key={`faceDown-${i}`} data-facedown-index={i}>
                                    <CardComponent
                                        card={card}
                                        faceDown
                                        small
                                        selectable={
                                            !isSetupPhase &&
                                            isMyTurn &&
                                            !revealedFaceDown &&
                                            GameLogic.getAvailableCardSource(currentPlayer) === 'faceDown'
                                        }
                                        selected={revealedFaceDown?.index === i}
                                        onClick={() => {
                                            if (
                                                !isSetupPhase &&
                                                isMyTurn &&
                                                GameLogic.getAvailableCardSource(currentPlayer) === 'faceDown'
                                            ) {
                                                setRevealedFaceDown({ card, index: i });
                                                setSelectedCards([]);
                                            }
                                        }}
                                    />
                                </div>
                            );
                        })}
                    </div>

                    {/* Face Up cards - overlaid on top with margins and preserved positions */}
                    {currentPlayer.faceUp.some((c) => c !== null) && (
                        <div className="flex gap-2" style={{ marginTop: '-80px', marginLeft: '10px', position: 'relative', zIndex: 10 }}>
                            {currentPlayer.faceUp.map((card, i) => {
                                if (card === null) {
                                    return <div key={`faceUp-empty-${i}`} className="w-16 h-24" />;
                                }

                                const deckEmpty = gameState.deck.length === 0;
                                const currentSource = GameLogic.getAvailableCardSource(currentPlayer);
                                const selectedHandCards = selectedCards
                                    .filter((s) => s.type === 'hand')
                                    .map((s) => currentPlayer.hand[s.index])
                                    .filter((c): c is Card => c !== null);
                                const canCombineWithHand =
                                    deckEmpty &&
                                    currentSource === 'hand' &&
                                    selectedHandCards.length > 0 &&
                                    GameLogic.canPlayMixedSources(0, selectedHandCards as Card[], [card], gameState.discardPile);

                                let isPlayable = true;
                                if (!isSetupPhase && isMyTurn && currentSource === 'faceUp') {
                                    isPlayable = GameLogic.canPlayMultipleCards([card], gameState.discardPile);
                                    if (selectedCards.length > 0 && !GameLogic.canAddToSelection(card, resolvedFaceUpSelection)) {
                                        isPlayable = false;
                                    }
                                }

                                const top = GameLogic.getEffectiveTopCard(gameState.discardPile);
                                let tooltip: string | undefined;
                                if (!isSetupPhase) {
                                    if (!isMyTurn) {
                                        tooltip = 'Not your turn';
                                    } else if (revealedFaceDown) {
                                        tooltip = 'Revealing a face-down card';
                                    } else if (currentSource === 'faceUp') {
                                        if (!isPlayable) {
                                            if (top && GameLogic.isLimiter(top)) {
                                                if (GameLogic.isBurn(card)) {
                                                    tooltip = '10 cannot be played on a 7';
                                                } else if ((GameLogic.RANK_VALUES[card.rank] || 0) > 7) {
                                                    tooltip = 'Limiter (7): only 7 or lower allowed';
                                                } else {
                                                    tooltip = "Can't be played on the current pile";
                                                }
                                            } else {
                                                tooltip = "Can't be played on the current pile";
                                            }
                                        } else if (selectedCards.length > 0 && !GameLogic.canAddToSelection(card, resolvedFaceUpSelection)) {
                                            tooltip = 'Select same rank to play together';
                                        }
                                    } else if (!deckEmpty) {
                                        tooltip = 'Cannot combine while deck has cards';
                                    } else if (currentSource !== 'hand') {
                                        tooltip = 'Combine only when selecting from your hand';
                                    } else if (!canCombineWithHand) {
                                        tooltip = 'Combine requires matching ranks';
                                    }
                                }

                                const faceUpSelectable =
                                    (isSetupPhase && !revealedFaceDown) ||
                                    (!isSetupPhase && isMyTurn && !revealedFaceDown && currentSource === 'faceUp' && isPlayable) ||
                                    (!isSetupPhase && isMyTurn && !revealedFaceDown && canCombineWithHand);

                                return (
                                    <div key={card.id} data-faceup-index={i}>
                                        <CardComponent
                                            card={card}
                                            small
                                            selectable={faceUpSelectable}
                                            selected={selectedCards.some((s) => s.type === 'faceUp' && s.index === i)}
                                            title={tooltip}
                                            onClick={() => {
                                                if (isSetupPhase) {
                                                    const alreadySelected = selectedCards.findIndex((s) => s.type === 'faceUp' && s.index === i);

                                                    if (alreadySelected >= 0) {
                                                        setSelectedCards([]);
                                                    } else if (selectedCards.length === 1 && selectedCards[0].type === 'hand') {
                                                        dispatchMove({
                                                            type: 'SWAP_CARDS',
                                                            playerId: currentPlayerId,
                                                            sourceA: 'hand',
                                                            indexA: selectedCards[0].index,
                                                            sourceB: 'faceUp',
                                                            indexB: i,
                                                        });
                                                        setSelectedCards([]);
                                                    } else if (selectedCards.length === 1 && selectedCards[0].type === 'faceUp') {
                                                        dispatchMove({
                                                            type: 'SWAP_CARDS',
                                                            playerId: currentPlayerId,
                                                            sourceA: 'faceUp',
                                                            indexA: selectedCards[0].index,
                                                            sourceB: 'faceUp',
                                                            indexB: i,
                                                        });
                                                        setSelectedCards([]);
                                                    } else {
                                                        setSelectedCards([{ type: 'faceUp', index: i }]);
                                                    }
                                                } else if (!isSetupPhase && isMyTurn && currentSource === 'faceUp') {
                                                    const alreadySelected = selectedCards.findIndex((s) => s.type === 'faceUp' && s.index === i);
                                                    if (alreadySelected >= 0) {
                                                        setSelectedCards(selectedCards.filter((_, idx) => idx !== alreadySelected));
                                                    } else {
                                                        const clickedCard = currentPlayer.faceUp[i];
                                                        if (
                                                            clickedCard &&
                                                            (selectedCards.length === 0 ||
                                                                selectedCards.every((s) => {
                                                                    const existingCard = currentPlayer.faceUp[s.index];
                                                                    return existingCard && existingCard.rank === clickedCard.rank;
                                                                }))
                                                        ) {
                                                            setSelectedCards([...selectedCards, { type: 'faceUp', index: i }]);
                                                        }
                                                    }
                                                } else if (!isSetupPhase && isMyTurn && canCombineWithHand) {
                                                    const alreadySelected = selectedCards.findIndex((s) => s.type === 'faceUp' && s.index === i);
                                                    if (alreadySelected >= 0) {
                                                        setSelectedCards(selectedCards.filter((_, idx) => idx !== alreadySelected));
                                                    } else {
                                                        const clickedCard = currentPlayer.faceUp[i];
                                                        if (!clickedCard) return;
                                                        const handCards = selectedCards
                                                            .filter((s) => s.type === 'hand')
                                                            .map((s) => currentPlayer.hand[s.index])
                                                            .filter((c): c is Card => c !== null);
                                                        const faceUpCards = selectedCards
                                                            .filter((s) => s.type === 'faceUp')
                                                            .map((s) => currentPlayer.faceUp[s.index])
                                                            .filter((c): c is Card => c !== null);
                                                        const ok = GameLogic.canPlayMixedSources(0, handCards, [...faceUpCards, clickedCard], gameState.discardPile);
                                                        if (ok) {
                                                            setSelectedCards([...selectedCards, { type: 'faceUp', index: i }]);
                                                        }
                                                    }
                                                }
                                            }}
                                        />
                                    </div>
                                );
                            })}
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};

export default Table;
