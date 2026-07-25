import * as GameLogic from './gameLogic';
import { RANK_VALUES } from './gameLogic';
import type { Card } from './types';

export interface CardPlayability {
    isPlayable: boolean;
    tooltip: string | undefined;
}

/**
 * WR-04: shared "does this card conform to the current pile, and (if other
 * cards from the same source are already selected) does it match their rank"
 * check. This is the literal duplicated logic that used to live separately in
 * Hand.tsx's hand-card tooltip/selectable branching and Table.tsx's
 * face-up-card tooltip/selectable branching - same canPlayMultipleCards /
 * canAddToSelection calls, same isLimiter/isBurn tooltip text
 * ("10 cannot be played on a 7", "Limiter (7): only 7 or lower allowed",
 * "Can't be played on the current pile", "Select same rank to play
 * together"). Extracted so a future rule change (e.g. a new special card)
 * only needs updating here, not in both components independently.
 *
 * Callers remain responsible for gating that genuinely differs between them
 * (turn/phase, getAvailableCardSource, first-turn rank matching,
 * revealedFaceDown, the hand+faceUp combine case) - folding those in here
 * would obscure more than it shares.
 */
export function getCardPlayability(card: Card, discardPile: Card[], selectedCards: Card[]): CardPlayability {
    const canPlay = GameLogic.canPlayMultipleCards([card], discardPile);
    if (!canPlay) {
        const top = GameLogic.getEffectiveTopCard(discardPile);
        let tooltip = "Can't be played on the current pile";
        if (top && GameLogic.isLimiter(top)) {
            if (GameLogic.isBurn(card)) {
                tooltip = '10 cannot be played on a 7';
            } else if ((RANK_VALUES[card.rank] || 0) > 7) {
                tooltip = 'Limiter (7): only 7 or lower allowed';
            }
        }
        return { isPlayable: false, tooltip };
    }
    if (selectedCards.length > 0 && !GameLogic.canAddToSelection(card, selectedCards)) {
        return { isPlayable: false, tooltip: 'Select same rank to play together' };
    }
    return { isPlayable: true, tooltip: undefined };
}
