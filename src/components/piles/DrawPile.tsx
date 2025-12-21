import React from 'react';
import type { Card as CardType } from '../../types';
import { Card as CardComponent } from '../Card';

interface DrawPileProps {
    deck: CardType[];
}

const DrawPile: React.FC<DrawPileProps> = ({ deck }) => {
    const hasCards = deck.length > 0;

    return (
        <div className="text-center">
            <p className="text-slate-400 text-sm mb-2 font-bold">Draw Pile</p>
            {hasCards ? (
                <div className="draw-pile-card w-16 h-24 mx-auto">
                    {/* Show the top card face-down for aesthetics */}
                    <CardComponent card={deck[0]} faceDown small />
                </div>
            ) : (
                <div className="w-16 h-24 border-2 border-dashed border-slate-600 rounded-lg flex items-center justify-center text-slate-600 text-sm mx-auto">
                    Empty
                </div>
            )}
            <p className="text-base text-white font-bold mt-2">{deck.length} cards</p>
        </div>
    );
};

export default DrawPile;
