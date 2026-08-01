import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
    rowToServerRoom,
    EDGE_ERROR_CODES,
    TURN_GRACE_MS,
    MIN_TURN_TIMEOUT_MS,
    MAX_TURN_TIMEOUT_MS,
    type RoomRow,
} from '../../supabase/roomTypes';
import { ERROR_CODES } from '../../engine/errors';
import type { GameState } from '../../types';

const baseState: GameState = {
    roomCode: 'ABC123',
    host: 'player-1',
    players: [],
    phase: 'lobby',
    currentTurn: 0,
    deck: [],
    discardPile: [],
    burnPile: [],
    lastAction: '',
    isFirstTurn: true,
    turnTimeoutMs: 60000,
};

function makeRow(overrides: Partial<RoomRow> = {}): RoomRow {
    return {
        room_code: 'ABC123',
        state: baseState,
        version: 1,
        turn_started_at: '2026-07-26T12:00:00.000Z',
        player_seen: { 'player-1': '2026-07-26T12:00:00.000Z' },
        created_at: '2026-07-26T11:00:00.000Z',
        updated_at: '2026-07-26T12:00:00.000Z',
        ...overrides,
    };
}

describe('rowToServerRoom', () => {
    it('maps a snake_case RoomRow to a camelCase ServerRoom, preserving state, coercing version to number, passing turn_started_at through as an ISO string', () => {
        const row = makeRow({ version: '3' as unknown as number });

        const room = rowToServerRoom(row);

        expect(room.roomCode).toBe('ABC123');
        expect(room.state).toEqual(baseState);
        expect(room.version).toBe(3);
        expect(typeof room.version).toBe('number');
        expect(room.turnStartedAt).toBe('2026-07-26T12:00:00.000Z');
    });

    it('defaults a null player_seen to an empty object rather than throwing', () => {
        const row = makeRow({ player_seen: null as unknown as Record<string, string> });

        expect(() => rowToServerRoom(row)).not.toThrow();
        expect(rowToServerRoom(row).playerSeen).toEqual({});
    });

    it('defaults an absent player_seen to an empty object rather than throwing', () => {
        const row = makeRow();
        delete (row as Partial<RoomRow>).player_seen;

        expect(() => rowToServerRoom(row)).not.toThrow();
        expect(rowToServerRoom(row).playerSeen).toEqual({});
    });
});

describe('EDGE_ERROR_CODES', () => {
    it('is a frozen closed set', () => {
        expect(Object.isFrozen(EDGE_ERROR_CODES)).toBe(true);
    });

    it('does not collide with any value in ERROR_CODES', () => {
        const edgeValues = Object.values(EDGE_ERROR_CODES);
        const engineValues = Object.values(ERROR_CODES) as string[];

        for (const value of edgeValues) {
            expect(engineValues).not.toContain(value);
        }
    });

    it('exposes the D-05 grace period constant at 60000ms', () => {
        expect(TURN_GRACE_MS).toBe(60000);
    });
});

describe('turn timeout bounds (MPLAY-07)', () => {
    it('MIN_TURN_TIMEOUT_MS is 30000', () => {
        expect(MIN_TURN_TIMEOUT_MS).toBe(30000);
    });

    it('MAX_TURN_TIMEOUT_MS is 300000', () => {
        expect(MAX_TURN_TIMEOUT_MS).toBe(300000);
    });
});

describe('getSupabaseClient', () => {
    beforeEach(() => {
        vi.resetModules();
        vi.stubEnv('VITE_SUPABASE_URL', 'http://127.0.0.1:54321');
        vi.stubEnv('VITE_SUPABASE_PUBLISHABLE_KEY', 'sb_publishable_test');
    });

    afterEach(() => {
        vi.unstubAllEnvs();
    });

    it('returns the same object instance on repeated calls', async () => {
        vi.doMock('@supabase/supabase-js', () => ({
            createClient: vi.fn(() => ({ marker: 'client-instance' })),
        }));

        const { getSupabaseClient } = await import('../../supabase/client');

        const first = getSupabaseClient();
        const second = getSupabaseClient();

        expect(first).toBe(second);
    });

    it('throws an Error naming both missing variables when VITE_SUPABASE_URL or VITE_SUPABASE_PUBLISHABLE_KEY is absent', async () => {
        vi.stubEnv('VITE_SUPABASE_URL', '');
        vi.stubEnv('VITE_SUPABASE_PUBLISHABLE_KEY', '');
        vi.doMock('@supabase/supabase-js', () => ({
            createClient: vi.fn(() => ({ marker: 'client-instance' })),
        }));

        const { getSupabaseClient } = await import('../../supabase/client');

        expect(() => getSupabaseClient()).toThrow(/VITE_SUPABASE_URL/);
        expect(() => getSupabaseClient()).toThrow(/VITE_SUPABASE_PUBLISHABLE_KEY/);
    });
});
