import React from 'react';
import type { Card as CardType } from '../../types';
import { Card as CardComponent } from '../Card';

interface DiscardPileProps {
    discardPile: CardType[];
}

const DiscardPile: React.FC<DiscardPileProps> = ({ discardPile }) => {
    const hasCards = discardPile.length > 0;

    // Show last 7 cards - centered with newest card in middle
    const recent = discardPile.slice(-7);

    return (
        <div className="text-center discard-pile-area">
            <p className="text-slate-400 text-sm mb-2 font-bold">Discard Pile</p>
            {hasCards ? (
                <div className="discard-pile-cards relative h-28 w-40 mx-auto max-sm:w-32">
                    {recent.map((card, index, array) => {
                        const centerOffset = 48; // Half of (160-64) to center a 64px card
                        const pileOffset = (array.length - 1) * 8; // Shift pile left by half the spacing
                        return (
                            <div
                                key={card.id}
                                className="absolute"
                                style={{
                                    left: `${centerOffset - pileOffset + index * 16}px`,
                                    top: `${index * 1}px`,
                                    zIndex: index,
                                }}
                            >
                                <CardComponent card={card} small />
                            </div>
                        );
                    })}
                </div>
            ) : (
                <div className="discard-pile-cards w-16 h-24 border-2 border-dashed border-slate-600 rounded-lg flex items-center justify-center text-slate-600 text-sm mx-auto">
                    Empty
                </div>
            )}
            <p className="text-base text-white font-bold mt-2">{discardPile.length} cards</p>
        </div>
    );
};

export default DiscardPile;
