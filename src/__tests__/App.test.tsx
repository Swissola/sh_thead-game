import { describe, it, expect, vi, beforeEach } from 'vitest';
import { useEffect } from 'react';
import { render, screen, waitFor, act } from '@testing-library/react';
import '../storage';

vi.mock('../supabase/client', () => ({
    getSupabaseClient: vi.fn(),
}));

vi.mock('../supabase/session', () => ({
    ensurePlayerIdentity: vi.fn(),
    // MenuScreen (rendered by Router when there is no gameState) also reads
    // from this module for its D-09 name pre-fill - not under test here.
    readLastUsedName: vi.fn(() => ''),
    writeLastUsedName: vi.fn(),
}));

import { GameProvider, useGameContext } from '../context/GameContext';
import ShitheadGame, { Router } from '../App';
import { getSupabaseClient } from '../supabase/client';
import { ensurePlayerIdentity } from '../supabase/session';
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

/**
 * Fake Supabase client sufficient for useRoomSubscription/usePresence's
 * mount-time calls (channel/removeChannel/functions.invoke) - Router calls
 * both hooks unconditionally now that the poll is gone.
 */
function makeFakeSupabase() {
    const channel = {
        on: vi.fn(function (this: unknown) {
            return this;
        }),
        subscribe: vi.fn(function (this: unknown) {
            return this;
        }),
        track: vi.fn().mockResolvedValue(undefined),
        presenceState: vi.fn(() => ({})),
    };
    return {
        channel: vi.fn(() => channel),
        removeChannel: vi.fn(),
        functions: { invoke: vi.fn().mockResolvedValue({ data: {}, error: null }) },
    };
}

/**
 * Like makeFakeSupabase, but each named channel keeps its own registered
 * presence handlers and a `_fireSubscribed`/`_fireSync` pair, so a test can
 * drive usePresence's real subscribe->sync flow and prove isPlayerOffline
 * actually reaches whichever screen Router passes it into (plan 02-12).
 */
function makeControllableFakeSupabase() {
    const channels: Record<string, ReturnType<typeof makeChannel>> = {};

    function makeChannel() {
        const handlers: Record<string, (arg?: { key: string }) => void> = {};
        let subscribeCb: ((status: string) => void) | null = null;
        const channel = {
            on: vi.fn(function (
                this: unknown,
                _type: string,
                config: { event: string },
                handler: (arg?: { key: string }) => void
            ) {
                handlers[config.event] = handler;
                return this;
            }),
            subscribe: vi.fn(function (this: unknown, cb?: (status: string) => void) {
                subscribeCb = cb ?? null;
                return this;
            }),
            track: vi.fn().mockResolvedValue(undefined),
            presenceState: vi.fn(() => ({})),
            _fireSubscribed() {
                subscribeCb?.('SUBSCRIBED');
            },
            _fireSync(keys: string[]) {
                channel.presenceState = vi.fn(() => Object.fromEntries(keys.map((k) => [k, [{}]])));
                handlers['sync']?.();
            },
        };
        return channel;
    }

    const invoke = vi.fn().mockResolvedValue({ data: {}, error: null });
    const supabase = {
        channel: vi.fn((name: string) => {
            const ch = makeChannel();
            channels[name] = ch;
            return ch;
        }),
        removeChannel: vi.fn(),
        functions: { invoke },
    };
    return { supabase, channels };
}

describe('Router', () => {
    beforeEach(() => {
        localStorage.clear();
        vi.mocked(getSupabaseClient).mockReturnValue(makeFakeSupabase() as never);
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

    it("threads Router's single usePresence call into GameScreen as isPlayerOffline (plan 02-12)", async () => {
        const { supabase, channels } = makeControllableFakeSupabase();
        vi.mocked(getSupabaseClient).mockReturnValue(supabase as never);

        const playingState = buildGameState({
            roomCode: 'ROOM99',
            phase: 'playing',
            players: [buildPlayer({ id: 'test-player', name: 'Alice' }), buildPlayer({ id: 'p1', name: 'Bob' })],
        });

        render(
            <GameProvider playerId="test-player">
                <SeedGameState state={playingState} />
                <Router />
            </GameProvider>
        );

        await screen.findByText(/Pick Up Pile/);

        const presenceChannel = channels['room-ROOM99-presence'];
        await act(async () => {
            presenceChannel._fireSubscribed();
            await Promise.resolve();
        });
        // Only 'test-player' (self) is present in the sync payload - p1/Bob is
        // absent, so GameScreen should render Bob's tile as offline.
        act(() => {
            presenceChannel._fireSync(['test-player']);
        });

        expect(await screen.findByText('Offline')).toBeInTheDocument();
    });

    it('never calls window.storage.get to poll for room updates (MPLAY-02) - the Realtime subscription replaces it', async () => {
        const storageGetSpy = vi.spyOn(window.storage, 'get');

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

        await screen.findByText('Game Lobby');

        expect(storageGetSpy).not.toHaveBeenCalled();

        storageGetSpy.mockRestore();
    });

    it('subscribes to the room via useRoomSubscription using gameState.roomCode and testMode', async () => {
        const supabase = makeFakeSupabase();
        vi.mocked(getSupabaseClient).mockReturnValue(supabase as never);

        const lobbyState = buildGameState({
            roomCode: 'ROOM99',
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

        await screen.findByText('Game Lobby');

        await waitFor(() => {
            expect(supabase.channel).toHaveBeenCalledWith('room-ROOM99');
        });
    });
});

describe('ShitheadGame', () => {
    beforeEach(() => {
        localStorage.clear();
        vi.mocked(getSupabaseClient).mockReturnValue(makeFakeSupabase() as never);
        vi.mocked(ensurePlayerIdentity).mockReset();
        window.history.replaceState(null, '', '/');
    });

    it('calls ensurePlayerIdentity exactly once on mount and renders a neutral placeholder until it resolves', async () => {
        let resolveIdentity!: (value: { playerId: string | null }) => void;
        const pending = new Promise<{ playerId: string | null }>((resolve) => {
            resolveIdentity = resolve;
        });
        vi.mocked(ensurePlayerIdentity).mockReturnValue(pending);

        render(<ShitheadGame />);

        // Neither MenuScreen (rendered once GameProvider mounts) nor any prior
        // screen content is present yet - only the neutral placeholder shell.
        expect(screen.queryByText('Create Room')).not.toBeInTheDocument();
        expect(ensurePlayerIdentity).toHaveBeenCalledTimes(1);

        resolveIdentity({ playerId: 'resolved-player-1' });

        await screen.findByText('Create Room');
        expect(ensurePlayerIdentity).toHaveBeenCalledTimes(1);
    });

    it('renders the menu with an empty identity when ensurePlayerIdentity resolves to a null playerId (D-02 fallback)', async () => {
        vi.mocked(ensurePlayerIdentity).mockResolvedValue({ playerId: null, error: 'rate limited' });

        render(<ShitheadGame />);

        expect(await screen.findByText('Create Room')).toBeInTheDocument();
    });

    it('a pathname of /join/ABC123 pre-fills the room-code input, uppercased, on the menu', async () => {
        window.history.replaceState(null, '', '/join/abc123');
        vi.mocked(ensurePlayerIdentity).mockResolvedValue({ playerId: 'p1' });

        render(<ShitheadGame />);

        await screen.findByText('Create Room');

        expect(screen.getByPlaceholderText('Room code')).toHaveValue('ABC123');
    });

    it('a pathname of /join/ABC123 replaces the URL back to / so a reload does not re-seed the code', async () => {
        window.history.replaceState(null, '', '/join/abc123');
        vi.mocked(ensurePlayerIdentity).mockResolvedValue({ playerId: 'p1' });

        render(<ShitheadGame />);

        await screen.findByText('Create Room');

        expect(window.location.pathname).toBe('/');
    });

    it('a non-join pathname yields an empty initial room code on the menu', async () => {
        window.history.replaceState(null, '', '/');
        vi.mocked(ensurePlayerIdentity).mockResolvedValue({ playerId: 'p1' });

        render(<ShitheadGame />);

        await screen.findByText('Create Room');

        expect(screen.getByPlaceholderText('Room code')).toHaveValue('');
    });
});
