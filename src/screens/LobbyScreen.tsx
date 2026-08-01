import { useState } from 'react';
import { Users, Copy, Check, Crown, Link2, WifiOff, UserX } from 'lucide-react';
import { useGameContext } from '../context/GameContext';
import { getSupabaseClient } from '../supabase/client';
import { MIN_TURN_TIMEOUT_MS, MAX_TURN_TIMEOUT_MS, type EdgeResult } from '../supabase/roomTypes';

/**
 * MPLAY-07 (plan 02-19): a UI-presentation-only preset list of auto-pickup
 * timeout choices, not a new shared contract - deliberately bounded at both
 * ends by the imported MIN_TURN_TIMEOUT_MS/MAX_TURN_TIMEOUT_MS constants
 * rather than duplicating the literal 30000/300000 values a second time, so
 * it can never silently drift out of sync with 02-18's own bounds if they
 * are ever retuned.
 */
const TURN_TIMEOUT_OPTIONS_MS = [
    MIN_TURN_TIMEOUT_MS,
    45000,
    60000,
    90000,
    120000,
    150000,
    180000,
    240000,
    MAX_TURN_TIMEOUT_MS,
];

/**
 * Room code display, player list, host-only start button, extracted from
 * App.tsx:999-1063 (pre-refactor line numbers).
 *
 * Plan 02-11 (MPLAY-04): dealing moved server-side into the `start-game` Edge
 * Function - this screen no longer computes or writes game state itself, it
 * only invokes the function and applies whatever `ServerRoom` comes back via
 * `applyServerRoom`.
 *
 * `isPlayerOffline` is threaded down from Router's single `usePresence` call
 * (plan 02-10) rather than called here - a second call would open a second
 * Presence channel for the same room and double the heartbeat rate.
 */
export function LobbyScreen({ isPlayerOffline }: { isPlayerOffline: (playerId: string) => boolean }) {
    const { gameState, playerId, applyServerRoom, showToast, dispatchMove } = useGameContext();
    const [copied, setCopied] = useState(false);
    const [copiedLink, setCopiedLink] = useState(false);

    const copyRoomCode = () => {
        if (!gameState) return;
        navigator.clipboard.writeText(gameState.roomCode);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
    };

    // D-15: separate copiedLink state from copied so the two buttons don't
    // share one boolean and flicker each other's icon.
    const copyJoinLink = () => {
        if (!gameState) return;
        navigator.clipboard.writeText(`${window.location.origin}/join/${gameState.roomCode}`);
        setCopiedLink(true);
        setTimeout(() => setCopiedLink(false), 2000);
    };

    const startGame = async () => {
        if (!gameState || gameState.host !== playerId || gameState.players.length < 2) return;

        try {
            const { data, error } = await getSupabaseClient().functions.invoke('start-game', {
                body: { roomCode: gameState.roomCode },
            });
            if (error) {
                showToast('Failed to start the game - please retry.');
                return;
            }
            const result = data as EdgeResult | undefined;
            if (result?.error) {
                showToast(result.error.message, result.error.code);
                return;
            }
            if (result?.room) {
                applyServerRoom(result.room);
            }
        } catch {
            showToast('Failed to start the game - please retry.');
        }
    };

    // MPLAY-07 (plan 02-19): host-only, matching this file's own
    // Start Game/removePlayerFromLobby defense-in-depth convention even
    // though only the host ever sees the control that calls this. Unlike
    // those two, this does not call an Edge Function directly or need a
    // try/catch - dispatchMove already owns its own full
    // submit-and-toast-on-failure lifecycle (via useGameStateUpdater).
    const setTurnTimeout = (timeoutMs: number) => {
        if (!gameState || gameState.host !== playerId) return;
        dispatchMove({ type: 'SET_TURN_TIMEOUT', playerId, timeoutMs });
    };

    // D-07: the host removes an AFK player. The disabled-for-connected-players
    // state below is purely a UI affordance (T-02-38) - removePlayer itself
    // independently re-checks caller === state.host and the lobby phase.
    const removePlayerFromLobby = async (targetPlayerId: string) => {
        if (!gameState) return;
        try {
            const { data, error } = await getSupabaseClient().functions.invoke('remove-player', {
                body: { roomCode: gameState.roomCode, targetPlayerId },
            });
            if (error) {
                showToast('Failed to remove player - please retry.');
                return;
            }
            const result = data as EdgeResult | undefined;
            if (result?.error) {
                showToast(result.error.message, result.error.code);
                return;
            }
            if (result?.room) {
                applyServerRoom(result.room);
            }
        } catch {
            showToast('Failed to remove player - please retry.');
        }
    };

    // D-08: derived fresh from gameState on every render (not memoised or
    // cached) so a server-side host transfer moves the Crown/Start Game
    // button on the very next Realtime payload with no extra client logic.
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
                            aria-label="Copy room code"
                            className="p-2 min-h-11 min-w-11 hover:bg-slate-700 rounded-lg transition-colors"
                        >
                            {copied ? (
                                <Check size={20} className="text-green-400" />
                            ) : (
                                <Copy size={20} className="text-slate-400" />
                            )}
                        </button>
                        <button
                            onClick={copyJoinLink}
                            aria-label="Copy join link"
                            className="p-2 min-h-11 min-w-11 hover:bg-slate-700 rounded-lg transition-colors"
                        >
                            {copiedLink ? (
                                <Check size={20} className="text-green-400" />
                            ) : (
                                <Link2 size={20} className="text-slate-400" />
                            )}
                        </button>
                    </div>
                    <p className="text-slate-400 text-sm">Share this code with your friends!</p>
                </div>
                <div className="flex items-center justify-between bg-slate-700 rounded-lg p-3 mb-6">
                    <span className="text-slate-300">Auto-pickup timeout</span>
                    {isHost ? (
                        <select
                            aria-label="Auto-pickup timeout"
                            value={gameState?.turnTimeoutMs ?? MIN_TURN_TIMEOUT_MS}
                            onChange={(e) => setTurnTimeout(Number(e.target.value))}
                            className="bg-slate-600 text-white px-3 py-2 min-h-11 rounded border border-slate-500 font-semibold"
                        >
                            {TURN_TIMEOUT_OPTIONS_MS.map((ms) => (
                                <option key={ms} value={ms}>
                                    {ms / 1000}s
                                </option>
                            ))}
                        </select>
                    ) : (
                        <span className="text-white font-semibold">
                            {gameState ? gameState.turnTimeoutMs / 1000 : 0}s
                        </span>
                    )}
                </div>
                <div className="mb-6">
                    <div className="flex items-center gap-2 mb-3">
                        <Users size={20} className="text-purple-400" />
                        <h2 className="text-xl font-bold text-white">
                            Players ({gameState?.players.length})
                        </h2>
                    </div>
                    <div className="space-y-2">
                        {gameState?.players.map((player) => {
                            const offline = isPlayerOffline(player.id);
                            return (
                                <div
                                    key={player.id}
                                    className={`flex items-center gap-3 bg-slate-700 rounded-lg p-3 ${offline ? 'opacity-60 border-2 border-slate-600' : ''}`}
                                >
                                    {player.id === gameState.host && (
                                        <Crown size={20} className="text-yellow-400" />
                                    )}
                                    <span className="text-white font-semibold flex-1">{player.name}</span>
                                    {offline && (
                                        <span className="text-xs px-2 py-1 rounded bg-slate-600 text-slate-300 flex items-center gap-1">
                                            <WifiOff size={12} />
                                            Offline
                                        </span>
                                    )}
                                    {player.id === playerId && (
                                        <span className="text-xs bg-purple-600 px-2 py-1 rounded">You</span>
                                    )}
                                    {isHost && player.id !== gameState.host && (
                                        <button
                                            onClick={() => void removePlayerFromLobby(player.id)}
                                            disabled={!offline}
                                            aria-label={`Remove ${player.name}`}
                                            title={offline ? 'Remove player' : 'Player is connected'}
                                            className="p-1 min-h-11 min-w-11 inline-flex items-center justify-center hover:bg-slate-600 rounded transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
                                        >
                                            <UserX size={16} className="text-red-400" />
                                        </button>
                                    )}
                                </div>
                            );
                        })}
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
