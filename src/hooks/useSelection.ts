import { useState } from 'react';
import type { CardSelection, Card as CardType } from '../types';

export function useSelection() {
    const [selectedCards, setSelectedCards] = useState<CardSelection[]>([]);
    const [revealedFaceDown, setRevealedFaceDown] = useState<{ card: CardType; index: number } | null>(null);

    return { selectedCards, setSelectedCards, revealedFaceDown, setRevealedFaceDown };
}
