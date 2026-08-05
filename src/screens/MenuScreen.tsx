import { useState } from 'react';
import { Users, Plus, ArrowRight } from 'lucide-react';
import * as GameLogic from '../gameLogic';
import type { GameState } from '../types';
import { useGameContext } from '../context/GameContext';
import { getSupabaseClient } from '../supabase/client';
import { EDGE_ERROR_CODES, TURN_GRACE_MS, type EdgeErrorCode, type EdgeResult } from '../supabase/roomTypes';
import {
    readLastUsedName,
    writeLastUsedName,
    readLastUsedRoomCode,
    writeLastUsedRoomCode,
} from '../supabase/session';

const GENERIC_RETRY_COPY = 'Failed to join room - please retry.';

/**
 * Maps an `EdgeError` code to the pre-existing copy those failures already
 * used client-side, so this rewire onto the create-room/join-room Edge
 * Functions does not regress any user-facing message (D-06). Any code not
 * covered by a specific case - including a raw transport failure, which has
 * no `EdgeErrorCode` at all - falls through to the generic retry copy.
 */
function mapEdgeErrorCode(code: EdgeErrorCode): string {
    switch (code) {
        case EDGE_ERROR_CODES.ROOM_NOT_FOUND:
            return 'Room not found';
        case EDGE_ERROR_CODES.GAME_ALREADY_STARTED:
            return 'Game has already started';
        case EDGE_ERROR_CODES.NAME_IN_USE:
        case EDGE_ERROR_CODES.NAME_AMBIGUOUS:
            return 'That name is already taken in this room - please use a different name';
        default:
            return GENERIC_RETRY_COPY;
    }
}

export interface MenuScreenProps {
    /** D-15: uppercased room code parsed from a `/join/:code` deep link by
     * App.tsx, or '' when the app was opened normally. Seeds the room-code
     * input's initial value only - never auto-submits (see Plan 02-10 Task 3). */
    initialRoomCode?: string;
}

/**
 * Room creation/joining/test-mode entry, extracted from App.tsx:929-997
 * (pre-refactor line numbers). All blocking browser alerts converted to
 * showToast() calls per ENGINE-05/D-05/D-06/D-07.
 */
export function MenuScreen({ initialRoomCode = '' }: MenuScreenProps = {}) {
    // D-09: pre-fills the returning player's name from the last successful
    // create/join on this device - still an ordinary controlled input, fully
    // editable, same placeholder. Lazy initialiser so the read happens once.
    const [playerName, setPlayerName] = useState(() => readLastUsedName());
    // Not named `roomCode` - the room's actual code lives on gameState.roomCode
    // once one exists; this local field is only the join-room text input.
    // A join-link deep link (initialRoomCode) always wins over a stored
    // last-used code - it reflects the user's current intent, not a stale
    // device preference.
    const [roomCodeInput, setRoomCodeInput] = useState(() =>
        initialRoomCode ? initialRoomCode.toUpperCase() : readLastUsedRoomCode()
    );
    const { setGameState, setTestMode, setControllingPlayer, showToast } = useGameContext();

    const createTestGame = () => {
        setTestMode(true);
        const testPlayers = ['Alice', 'Bob', 'Charlie'].map((name, i) => ({
            id: `test_player_${i}`,
            name,
            hand: [],
            faceUp: [],
            faceDown: [],
            isReady: false,
        }));

        const numDecks = Math.ceil(testPlayers.length / 4);
        const deck = GameLogic.shuffleDeck(GameLogic.createDeck(numDecks));

        const dealtPlayers = testPlayers.map((player) => ({
            ...player,
            hand: deck.splice(0, 3),
            faceUp: deck.splice(0, 3),
            faceDown: deck.splice(0, 3),
        }));

        const newGameState: GameState = {
            roomCode: 'TEST',
            host: 'test_player_0',
            players: dealtPlayers,
            phase: 'setup' as const,
            currentTurn: 0,
            deck,
            discardPile: [],
            burnPile: [],
            lastAction: 'Test game created! Use the green dropdown to switch players.',
            isFirstTurn: true,
            turnTimeoutMs: TURN_GRACE_MS,
        };

        setGameState(newGameState);
    };

    const createTestGameStarted = () => {
        setTestMode(true);
        const testPlayers = ['Alice', 'Bob', 'Charlie'].map((name, i) => ({
            id: `test_player_${i}`,
            name,
            hand: [],
            faceUp: [],
            faceDown: [],
            isReady: true,
        }));

        const numDecks = Math.ceil(testPlayers.length / 4);
        const deck = GameLogic.shuffleDeck(GameLogic.createDeck(numDecks));

        const dealtPlayers = testPlayers.map((player) => ({
            ...player,
            hand: deck.splice(0, 3),
            faceUp: deck.splice(0, 3),
            faceDown: deck.splice(0, 3),
        }));

        const startingPlayerIndex = GameLogic.getStartingPlayer(dealtPlayers);

        const newGameState: GameState = {
            roomCode: 'TEST-STARTED',
            host: 'test_player_0',
            players: dealtPlayers,
            phase: 'playing' as const,
            currentTurn: startingPlayerIndex,
            deck,
            discardPile: [],
            burnPile: [],
            lastAction: `Ready to play! ${dealtPlayers[startingPlayerIndex].name} starts.`,
            isFirstTurn: true,
            turnTimeoutMs: TURN_GRACE_MS,
        };

        setGameState(newGameState);
        setControllingPlayer(startingPlayerIndex);
    };

    const createRoom = async () => {
        if (!playerName.trim()) {
            showToast('Please enter your name');
            return;
        }

        // WR-03/Pitfall 3: code generation and collision-checking are now the
        // server's job (create-room's own bounded generate-and-retry loop) -
        // the client only supplies the trimmed name.
        try {
            const { data, error } = await getSupabaseClient().functions.invoke('create-room', {
                body: { playerName: playerName.trim() },
            });
            if (error) {
                showToast(GENERIC_RETRY_COPY);
                return;
            }
            const result = data as EdgeResult | undefined;
            if (result?.error) {
                showToast(mapEdgeErrorCode(result.error.code));
                return;
            }
            if (result?.room) {
                await setGameState(result.room.state);
                writeLastUsedName(playerName.trim());
                writeLastUsedRoomCode(result.room.roomCode);
            }
        } catch {
            showToast(GENERIC_RETRY_COPY);
        }
    };

    const joinRoom = async () => {
        if (!playerName.trim() || !roomCodeInput.trim()) {
            showToast('Please enter your name and room code');
            return;
        }

        // WR-02: the read-modify-write race this loop used to work around is
        // eliminated server-side by join-room's version-conditional update
        // (withVersionRetry) - no client-side re-read/verify step is needed.
        try {
            const { data, error } = await getSupabaseClient().functions.invoke('join-room', {
                body: { playerName: playerName.trim(), roomCode: roomCodeInput.trim().toUpperCase() },
            });
            if (error) {
                showToast(GENERIC_RETRY_COPY);
                return;
            }
            const result = data as EdgeResult | undefined;
            if (result?.error) {
                showToast(mapEdgeErrorCode(result.error.code));
                return;
            }
            if (result?.room) {
                await setGameState(result.room.state);
                writeLastUsedName(playerName.trim());
                writeLastUsedRoomCode(result.room.roomCode);
            }
        } catch {
            showToast(GENERIC_RETRY_COPY);
        }
    };

    return (
        <div className="flex items-center justify-center">
            <div className="max-w-md w-full bg-slate-800 rounded-2xl shadow-2xl p-8 border-2 border-purple-500">
                <div className="text-center mb-8">
                    <h1 className="text-5xl font-black text-transparent bg-clip-text bg-gradient-to-r from-pink-500 to-purple-500 mb-2">
                        SH!THEAD
                    </h1>
                    <p className="text-purple-300 text-sm font-semibold tracking-wide">
                        JUST DON'T COME LAST!
                    </p>
                </div>
                <div className="space-y-4 mb-6">
                    <input
                        type="text"
                        placeholder="Enter your name"
                        value={playerName}
                        onChange={(e) => setPlayerName(e.target.value)}
                        className="w-full px-4 py-3 bg-slate-700 border-2 border-slate-600 rounded-lg text-white placeholder-slate-400 focus:outline-none focus:border-purple-500"
                    />
                </div>
                <div className="space-y-3">
                    <button
                        onClick={createRoom}
                        disabled={!playerName.trim()}
                        className="w-full bg-gradient-to-r from-pink-500 to-purple-500 text-white font-bold py-3 rounded-lg hover:from-pink-600 hover:to-purple-600 transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                    >
                        <Plus size={20} />
                        Create Room
                    </button>

                    <button
                        onClick={createTestGame}
                        className="w-full bg-gradient-to-r from-green-500 to-emerald-500 text-white font-bold py-3 rounded-lg hover:from-green-600 hover:to-emerald-600 transition-all flex items-center justify-center gap-2"
                    >
                        <Users size={20} />
                        Test Mode (3 Players)
                    </button>

                    <button
                        onClick={createTestGameStarted}
                        className="w-full bg-gradient-to-r from-blue-500 to-cyan-500 text-white font-bold py-3 rounded-lg hover:from-blue-600 hover:to-cyan-600 transition-all flex items-center justify-center gap-2"
                    >
                        <Users size={20} />
                        Test Mode (First Turn Ready)
                    </button>

                    <div className="flex gap-2 max-sm:flex-wrap">
                        <input
                            type="text"
                            placeholder="Room code"
                            value={roomCodeInput}
                            onChange={(e) => setRoomCodeInput(e.target.value.toUpperCase())}
                            className="flex-1 min-w-0 px-4 py-3 bg-slate-700 border-2 border-slate-600 rounded-lg text-white placeholder-slate-400 focus:outline-none focus:border-purple-500"
                        />
                        <button
                            onClick={joinRoom}
                            disabled={!playerName.trim() || !roomCodeInput.trim()}
                            className="px-6 py-3 bg-purple-600 text-white font-bold rounded-lg hover:bg-purple-700 transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                        >
                            <ArrowRight size={20} />
                            Join
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
}
