import { useState } from 'react';
import { Users, Copy, Check, Crown } from 'lucide-react';
import * as GameLogic from '../gameLogic';
import type { GameState } from '../types';
import { useGameContext } from '../context/GameContext';

/**
 * Room code display, player list, host-only start button, extracted from
 * App.tsx:999-1063 (pre-refactor line numbers).
 */
export function LobbyScreen() {
    const { gameState, playerId, setGameState } = useGameContext();
    const [copied, setCopied] = useState(false);

    const copyRoomCode = () => {
        if (!gameState) return;
        navigator.clipboard.writeText(gameState.roomCode);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
    };

    const startGame = async () => {
        if (!gameState || gameState.host !== playerId || gameState.players.length < 2) return;

        const numDecks = Math.ceil(gameState.players.length / 4);
        const deck = GameLogic.shuffleDeck(GameLogic.createDeck(numDecks));

        const updatedPlayers = gameState.players.map((player) => ({
            ...player,
            hand: deck.splice(0, 3),
            faceUp: deck.splice(0, 3),
            faceDown: deck.splice(0, 3),
            isReady: false,
        }));

        const updatedState: GameState = {
            roomCode: gameState.roomCode,
            host: gameState.host,
            players: updatedPlayers,
            deck,
            phase: 'setup',
            currentTurn: gameState.currentTurn,
            discardPile: gameState.discardPile,
            burnPile: gameState.burnPile,
            lastAction: `Game started with ${numDecks} deck${numDecks > 1 ? 's' : ''}! Swap cards then ready up.`,
            isFirstTurn: true,
        };

        await setGameState(updatedState);
    };

    const isHost = gameState?.host === playerId;

    return (
        <div className="flex items-center justify-center">
            <div className="max-w-2xl w-full bg-slate-800 rounded-2xl shadow-2xl p-8 border-2 border-purple-500">
                <div className="text-center mb-6">
                    <h1 className="text-4xl font-black text-transparent bg-clip-text bg-gradient-to-r from-pink-500 to-purple-500 mb-4">
                        Game Lobby
                    </h1>
                    <div className="flex items-center justify-center gap-2 mb-2">
                        <span className="text-slate-400">Room Code:</span>
                        <span className="text-2xl font-mono font-bold text-purple-400">
                            {gameState?.roomCode}
                        </span>
                        <button
                            onClick={copyRoomCode}
                            className="p-2 hover:bg-slate-700 rounded-lg transition-colors"
                        >
                            {copied ? (
                                <Check size={20} className="text-green-400" />
                            ) : (
                                <Copy size={20} className="text-slate-400" />
                            )}
                        </button>
                    </div>
                    <p className="text-slate-400 text-sm">Share this code with your friends!</p>
                </div>
                <div className="mb-6">
                    <div className="flex items-center gap-2 mb-3">
                        <Users size={20} className="text-purple-400" />
                        <h2 className="text-xl font-bold text-white">
                            Players ({gameState?.players.length})
                        </h2>
                    </div>
                    <div className="space-y-2">
                        {gameState?.players.map((player) => (
                            <div
                                key={player.id}
                                className="flex items-center gap-3 bg-slate-700 rounded-lg p-3"
                            >
                                {player.id === gameState.host && (
                                    <Crown size={20} className="text-yellow-400" />
                                )}
                                <span className="text-white font-semibold flex-1">{player.name}</span>
                                {player.id === playerId && (
                                    <span className="text-xs bg-purple-600 px-2 py-1 rounded">You</span>
                                )}
                            </div>
                        ))}
                    </div>
                </div>
                {isHost ? (
                    <button
                        onClick={startGame}
                        disabled={(gameState?.players.length ?? 0) < 2}
                        className="w-full bg-gradient-to-r from-pink-500 to-purple-500 text-white font-bold py-4 rounded-lg hover:from-pink-600 hover:to-purple-600 transition-all disabled:opacity-50 disabled:cursor-not-allowed text-lg"
                    >
                        {(gameState?.players.length ?? 0) < 2 ? 'Waiting for players...' : 'Start Game'}
                    </button>
                ) : (
                    <div className="text-center text-slate-400 py-4">
                        Waiting for host to start the game...
                    </div>
                )}
            </div>
        </div>
    );
}
