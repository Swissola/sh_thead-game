import { useState } from 'react';
import { Users, Plus, ArrowRight } from 'lucide-react';
import * as GameLogic from '../gameLogic';
import type { GameState } from '../types';
import { useGameContext } from '../context/GameContext';

/**
 * Room creation/joining/test-mode entry, extracted from App.tsx:929-997
 * (pre-refactor line numbers). All blocking browser alerts converted to
 * showToast() calls per ENGINE-05/D-05/D-06/D-07.
 */
export function MenuScreen() {
    const [playerName, setPlayerName] = useState('');
    // Not named `roomCode` - the room's actual code lives on gameState.roomCode
    // once one exists; this local field is only the join-room text input.
    const [roomCodeInput, setRoomCodeInput] = useState('');
    const { setGameState, setTestMode, playerId, setControllingPlayer, showToast } = useGameContext();

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
        };

        setGameState(newGameState);
        setControllingPlayer(startingPlayerIndex);
    };

    const createRoom = async () => {
        if (!playerName.trim()) {
            showToast('Please enter your name');
            return;
        }

        const code = Math.random().toString(36).substr(2, 6).toUpperCase();
        const newGameState: GameState = {
            roomCode: code,
            host: playerId,
            players: [
                { id: playerId, name: playerName, hand: [], faceUp: [], faceDown: [], isReady: false },
            ],
            phase: 'lobby' as const,
            currentTurn: 0,
            deck: [],
            discardPile: [],
            burnPile: [],
            lastAction: `${playerName} created the room`,
            isFirstTurn: true,
        };

        try {
            await setGameState(newGameState);
        } catch {
            showToast('Failed to create room');
        }
    };

    const joinRoom = async () => {
        if (!playerName.trim() || !roomCodeInput.trim()) {
            showToast('Please enter your name and room code');
            return;
        }

        try {
            const result = await window.storage.get(`game:${roomCodeInput.toUpperCase()}`, true);
            if (!result) {
                showToast('Room not found');
                return;
            }

            const state = JSON.parse(result.value);
            if (state.phase !== 'lobby') {
                showToast('Game has already started');
                return;
            }

            state.players.push({
                id: playerId,
                name: playerName,
                hand: [],
                faceUp: [],
                faceDown: [],
                isReady: false,
            });
            state.lastAction = `${playerName} joined the room`;

            await setGameState(state);
        } catch {
            showToast('Failed to join room');
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

                    <div className="flex gap-2">
                        <input
                            type="text"
                            placeholder="Room code"
                            value={roomCodeInput}
                            onChange={(e) => setRoomCodeInput(e.target.value.toUpperCase())}
                            className="flex-1 px-4 py-3 bg-slate-700 border-2 border-slate-600 rounded-lg text-white placeholder-slate-400 focus:outline-none focus:border-purple-500"
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
