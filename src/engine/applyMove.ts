import type { GameState } from '../types';
import type { Move, ApplyMoveResult } from './moves';

// RED-phase stub (Task 1): exists solely so applyMove.test.ts can resolve/parse.
// Task 2 replaces this with the real READY_UP/SWAP_CARDS/PICK_UP_PILE implementation.
export function applyMove(_state: GameState, _move: Move): ApplyMoveResult {
    throw new Error('applyMove not yet implemented');
}
