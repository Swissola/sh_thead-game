import React from 'react';
import type { Card as CardType } from '../../types';
import { Card as CardComponent } from '../Card';

interface BurnPileProps {
    burnPile: CardType[];
}

const BurnPile: React.FC<BurnPileProps> = ({ burnPile }) => {
    const hasCards = burnPile.length > 0;

    return (
        <div className="text-center">
            <p className="text-slate-400 text-sm mb-2 font-bold">Burn Pile</p>
            {hasCards ? (
                <div className="relative w-16 h-24 mx-auto">
                    {burnPile.slice(-8).map((card, index) => (
                        <div
                            key={card.id}
                            className="absolute"
                            style={{
                                left: `${index * 2}px`,
                                top: `${index * 1.5}px`,
                                transform: `rotate(${(index % 3 - 1) * 8}deg)`,
                                zIndex: index,
                            }}
                        >
                            <CardComponent card={card} small />
                        </div>
                    ))}
                </div>
            ) : (
                <div className="w-16 h-24 border-2 border-dashed border-slate-600 rounded-lg flex items-center justify-center text-slate-600 text-xs mx-auto">
                    Empty
                </div>
            )}
            <p className="text-base text-white font-bold mt-2">{burnPile.length} cards</p>
        </div>
    );
};

export default BurnPile;
