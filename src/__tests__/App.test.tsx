import { describe, it, expect, beforeEach, vi } from 'vitest';
import { useEffect } from 'react';
import { render, screen } from '@testing-library/react';
import '../storage';

// LobbyScreen (plan 02-11) now calls usePresence, which lazily requests the
// Supabase client - without this mock, rendering the lobby branch below
// throws on missing VITE_SUPABASE_* env vars, same pattern as
// LobbyScreen.test.tsx/useGameState.test.ts.
vi.mock('../supabase/client', () => ({
    getSupabaseClient: vi.fn(() => ({
        functions: { invoke: vi.fn().mockResolvedValue({ data: {}, error: null }) },
        channel: vi.fn(() => ({
            on: vi.fn(function (this: unknown) {
                return this;
            }),
            subscribe: vi.fn(function (this: unknown) {
                return this;
            }),
            track: vi.fn().mockResolvedValue(undefined),
            presenceState: vi.fn(() => ({})),
        })),
        removeChannel: vi.fn(),
    })),
}));

import { GameProvider, useGameContext } from '../context/GameContext';
import { Router } from '../App';
import { buildGameState, buildPlayer } from './testUtils/buildGameState';

/**
 * Seeds gameState via the context's setGameState in an effect on mount, so
 * Router's lobby/game routing branches can be exercised without going
 * through MenuScreen/LobbyScreen's own UI flows.
 */
function SeedGameState({ state }: { state: ReturnType<typeof buildGameState> }) {
    const { setGameState } = useGameContext();
    useEffect(() => {
        setGameState(state);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);
    return null;
}

describe('Router', () => {
    beforeEach(() => {
        localStorage.clear();
    });

    it('renders MenuScreen content and not Lobby/Game content when there is no gameState', () => {
        render(
            <GameProvider playerId="test-player">
                <Router />
            </GameProvider>
        );

        expect(screen.getByText('Create Room')).toBeInTheDocument();
        expect(screen.queryByText('Game Lobby')).not.toBeInTheDocument();
        expect(screen.queryByText(/Game screen placeholder/)).not.toBeInTheDocument();
    });

    it("renders LobbyScreen content and not MenuScreen content when gameState.phase is 'lobby'", async () => {
        const lobbyState = buildGameState({
            phase: 'lobby',
            host: 'test-player',
            players: [buildPlayer({ id: 'test-player', name: 'Alice' })],
        });

        render(
            <GameProvider playerId="test-player">
                <SeedGameState state={lobbyState} />
                <Router />
            </GameProvider>
        );

        expect(await screen.findByText('Game Lobby')).toBeInTheDocument();
        expect(screen.queryByText('Create Room')).not.toBeInTheDocument();
    });

    it("renders GameScreen content and not Menu/Lobby content when gameState.phase is a non-'lobby' value", async () => {
        const playingState = buildGameState({
            phase: 'playing',
            players: [buildPlayer({ id: 'test-player', name: 'Alice' }), buildPlayer({ id: 'p1', name: 'Bob' })],
        });

        render(
            <GameProvider playerId="test-player">
                <SeedGameState state={playingState} />
                <Router />
            </GameProvider>
        );

        // Plan 01-06 replaced GameScreen's placeholder with the full extraction -
        // assert on board content unique to GameScreen (MenuScreen's own title is
        // also "SH!THEAD", so that text isn't a safe disambiguator here).
        expect(await screen.findByText(/Pick Up Pile/)).toBeInTheDocument();
        expect(screen.queryByText('Create Room')).not.toBeInTheDocument();
        expect(screen.queryByText('Game Lobby')).not.toBeInTheDocument();
    });
});
