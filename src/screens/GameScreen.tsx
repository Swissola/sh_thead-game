import { useGameContext } from '../context/GameContext';

/**
 * Placeholder only in this plan (01-05) — reads gameState.phase and renders a
 * minimal stand-in so Router's routing and this plan's own tests are
 * self-contained. Plan 01-06 replaces this file's entire contents with the
 * full game screen extraction from App.tsx.
 */
export function GameScreen() {
    const { gameState } = useGameContext();
    return <div className="text-white p-8">Game screen placeholder — phase: {gameState?.phase}</div>;
}
