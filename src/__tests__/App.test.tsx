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
    // from this module for its D-09 name pre-fill and last-used room code -
    // not under test here.
    readLastUsedName: vi.fn(() => ''),
    writeLastUsedName: vi.fn(),
    readLastUsedRoomCode: vi.fn(() => ''),
    writeLastUsedRoomCode: vi.fn(),
}));

import { GameProvider, useGameContext } from '../context/GameContext';
import ShitheadGame, { Router } from '../App';
import { getSupabaseClient } from '../supabase/client';
import { ensurePlayerIdentity } from '../supabase/session';
import { buildGameState, buildPlayer } from './testUtils/buildGameState';
import type { RoomRow } from '../supabase/roomTypes';
import type { Move } from '../engine/moves';

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
 * Plan 02-16 (MPLAY-05, UAT test 7 / T-02-59): a test-only button that calls
 * the real dispatchMove -> submitMove -> beginPendingMove cycle, so a test
 * can drive a genuine outstanding-move scenario without depending on
 * GameScreen's actual button markup.
 */
function DispatchMove({ move }: { move: Move }) {
    const { dispatchMove } = useGameContext();
    return (
        <button type="button" onClick={() => dispatchMove(move)}>
            Dispatch Move
        </button>
    );
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

type RoomPostgresHandler = (payload: { new: RoomRow }) => void;

/**
 * Plan 02-16 (MPLAY-05, UAT test 7 / T-02-59): like makeFakeSupabase, but the
 * room's own postgres_changes channel keeps its registered UPDATE handler
 * and exposes _fire(payload), mirroring useRoomSubscription.test.ts's
 * makeFakeChannel - neither of the two helpers above supports firing a
 * room-table broadcast. The presence channel (a differently-named channel -
 * `room-<code>-presence`) is left inert, matching makeFakeSupabase's own
 * presence shape, since this fake is only used to drive a Realtime room
 * broadcast, not presence.
 */
function makeFakeSupabaseWithRoomChannel() {
    const roomHandlers: Record<string, RoomPostgresHandler> = {};
    const roomChannel = {
        on: vi.fn(function (this: unknown, _type: string, config: { event: string }, handler: RoomPostgresHandler) {
            roomHandlers[config.event] = handler;
            return this;
        }),
        subscribe: vi.fn(function (this: unknown) {
            return this;
        }),
        _fire(payload: { new: RoomRow }) {
            roomHandlers['UPDATE']?.(payload);
        },
    };
    const presenceChannel = {
        on: vi.fn(function (this: unknown) {
            return this;
        }),
        subscribe: vi.fn(function (this: unknown) {
            return this;
        }),
        track: vi.fn().mockResolvedValue(undefined),
        presenceState: vi.fn(() => ({})),
    };
    const invoke = vi.fn().mockResolvedValue({ data: {}, error: null });
    const supabase = {
        channel: vi.fn((name: string) => (name.endsWith('-presence') ? presenceChannel : roomChannel)),
        removeChannel: vi.fn(),
        functions: { invoke },
    };
    return { supabase, roomChannel, invoke };
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

    // Plan 02-16 (MPLAY-05, UAT test 7 / T-02-59): this test documents - it
    // does NOT fix - the second accepted residual from the plan's objective
    // scope note. hasPendingMove() cannot distinguish "my own setup-phase
    // move's resolution" from "an unrelated concurrent player's own
    // setup-phase move", because READY_UP/SWAP_CARDS (applyMove.ts's
    // applyReadyUp/applySwapCards) are gated only on phase, not turn - unlike
    // PLAY_CARDS/PICK_UP_PILE in the playing phase. A future attempt to "fix"
    // this by weakening the gate further should read this comment and the
    // plan's objective first: a fuller fix needs a server-side
    // broadcast-to-submission correlation mechanism, outside this plan's
    // client-only-fix boundary.
    it('documents the cross-player setup-phase residual (T-02-59): an unrelated player\'s READY_UP broadcast still fires the reconciliation toast while this client\'s own READY_UP is genuinely outstanding', async () => {
        const { supabase, roomChannel } = makeFakeSupabaseWithRoomChannel();
        vi.mocked(getSupabaseClient).mockReturnValue(supabase as never);

        const setupState = buildGameState({
            roomCode: 'ROOM99',
            phase: 'setup',
            host: 'test-player',
            players: [
                buildPlayer({ id: 'test-player', name: 'Alice', isReady: false }),
                buildPlayer({ id: 'p1', name: 'Bob', isReady: false }),
            ],
        });

        render(
            <GameProvider playerId="test-player">
                <SeedGameState state={setupState} />
                <DispatchMove move={{ type: 'READY_UP', playerId: 'test-player' }} />
                <Router />
            </GameProvider>
        );

        // Render is complete once GameScreen's setup-phase "Ready to Play"
        // button for this not-yet-ready player appears.
        await screen.findByText('Ready to Play');

        // Dispatch this client's OWN READY_UP. The fake invoke resolves
        // successfully by default, so hasPendingMove() becomes and stays
        // true - nothing clears it yet (only a subsequent applyServerRoom
        // broadcast, via resolveOldestPendingMove, would).
        await act(async () => {
            screen.getByText('Dispatch Move').click();
            await Promise.resolve();
        });

        // A broadcast reflecting a DIFFERENT, unrelated player's (p1's) own
        // independent READY_UP - content this client's own pending move had
        // nothing to do with.
        const unrelatedPlayerReadyRow: RoomRow = {
            room_code: 'ROOM99',
            state: buildGameState({
                roomCode: 'ROOM99',
                phase: 'setup',
                host: 'test-player',
                players: [
                    buildPlayer({ id: 'test-player', name: 'Alice', isReady: false }),
                    buildPlayer({ id: 'p1', name: 'Bob', isReady: true }),
                ],
            }),
            version: 2,
            turn_started_at: '2026-01-01T00:00:00.000Z',
            player_seen: {},
            created_at: '2026-01-01T00:00:00.000Z',
            updated_at: '2026-01-01T00:00:00.000Z',
        };

        act(() => {
            roomChannel._fire({ new: unrelatedPlayerReadyRow });
        });

        // The accepted residual: this client's own move hasn't failed - it
        // simply hasn't resolved yet - but the toast still appears, because
        // hasPendingMove() cannot tell "my move resolving" apart from
        // "someone else's unrelated concurrent setup-phase move".
        expect(
            await screen.findByText("Your move didn't stick - synced with the latest game state.")
        ).toBeInTheDocument();
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
