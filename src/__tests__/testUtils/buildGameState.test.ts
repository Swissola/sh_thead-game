import { describe, it, expect } from 'vitest';
import { buildGameState, buildPlayer } from './buildGameState';
import { TURN_GRACE_MS } from '../../supabase/roomTypes';

describe('buildGameState', () => {
    it('returns an object with all GameState keys populated', () => {
        const state = buildGameState();
        expect(state.roomCode).toBe('TEST');
        expect(state.host).toBe('p0');
        expect(state.players).toHaveLength(2);
        expect(state.phase).toBe('playing');
        expect(state.currentTurn).toBe(0);
        expect(state.deck).toEqual([]);
        expect(state.discardPile).toEqual([]);
        expect(state.burnPile).toEqual([]);
        expect(state.lastAction).toBe('');
        expect(state.isFirstTurn).toBe(false);
        expect(state.turnTimeoutMs).toBe(TURN_GRACE_MS);
    });

    it('overrides only phase, other defaults intact', () => {
        const state = buildGameState({ phase: 'setup' });
        expect(state.phase).toBe('setup');
        expect(state.roomCode).toBe('TEST');
        expect(state.host).toBe('p0');
        expect(state.players).toHaveLength(2);
        expect(state.currentTurn).toBe(0);
    });
});

describe('buildPlayer', () => {
    it('overrides only isReady', () => {
        const player = buildPlayer({ isReady: true });
        expect(player.isReady).toBe(true);
        expect(player.id).toBe('p0');
        expect(player.name).toBe('Player 0');
        expect(player.hand).toHaveLength(1);
        expect(player.faceUp).toEqual([]);
        expect(player.faceDown).toEqual([]);
    });
});
