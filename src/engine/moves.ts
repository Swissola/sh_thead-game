/**
 * The applyMove contract: the discriminated Move union every move handler
 * (play cards, pick up pile, swap cards, ready up) goes through, plus the
 * ApplyMoveResult shape applyMove returns.
 */
import type { Card, CardSelection, CardSource, GameState } from '../types.ts';
import type { ErrorCode } from './errors.ts';

export type Move =
    | {
          type: 'PLAY_CARDS';
          playerId: string;
          cards: CardSelection[];
          // Optional pre-reordered hand supplied by the UI when a play happens while a
          // non-'original' handSortMode is active. handSortMode is a presentation-only
          // concern applyMove must never read; the UI resolves the sort order and hands
          // applyMove the resulting array so the reducer can adopt it as the new
          // baseline, reproducing today's App.tsx:553-602 behavior without leaking UI
          // state into the pure reducer.
          reorderedHand?: (Card | null)[];
      }
    | {
          type: 'PICK_UP_PILE';
          playerId: string;
          // Index of the face-down card revealed (if any) before picking up the pile,
          // matching today's revealedFaceDown confirm-pickup flow.
          revealedFaceDownIndex?: number;
      }
    | {
          type: 'SWAP_CARDS';
          playerId: string;
          // sourceA/indexA + sourceB/indexB (rather than the narrower handIndex/faceUpIndex
          // shape used today) so this single case also covers hand<->hand and
          // faceUp<->faceUp reordering, currently done by Hand.tsx:203-220/Table.tsx:168-185
          // outside any handler (RESEARCH.md Pattern 3 site 4, Open Question 1) - folding
          // that fourth duplication site into applyMove for ENGINE-01.
          sourceA: CardSource;
          indexA: number;
          sourceB: CardSource;
          indexB: number;
      }
    | {
          type: 'READY_UP';
          playerId: string;
      }
    | {
          // MPLAY-07's host-configurable auto-pickup grace period, bounds-checked
          // server-side inside applyMove against MIN_TURN_TIMEOUT_MS/MAX_TURN_TIMEOUT_MS -
          // not merely by a client-side control's range.
          type: 'SET_TURN_TIMEOUT';
          playerId: string;
          timeoutMs: number;
      };

export interface MoveError {
    code: ErrorCode;
    message: string;
}

export interface ApplyMoveResult {
    state: GameState;
    error?: MoveError;
}
