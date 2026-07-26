/**
 * Deno-side re-export barrel for the browser's engine modules.
 *
 * Pure re-exports only - no logic lives here. Reimplementing any rule in Deno
 * or SQL is forbidden; this file is the only sanctioned bridge between the
 * Edge Functions and the browser's rules engine (MPLAY-04).
 *
 * Every specifier is extension-qualified because Deno's module resolution
 * requires it for anything that survives to a runtime import; `../../../src`
 * climbs from this directory back to the repo root's `src/`.
 */
export { applyMove } from '../../../src/engine/applyMove.ts';
export type { Move, MoveError, ApplyMoveResult } from '../../../src/engine/moves.ts';
export { ERROR_CODES } from '../../../src/engine/errors.ts';
export type { ErrorCode } from '../../../src/engine/errors.ts';
export * as GameLogic from '../../../src/gameLogic.ts';
export type { GameState, Player, Card } from '../../../src/types.ts';
