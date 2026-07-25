import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { HelpCircle, X } from 'lucide-react';
import * as GameLogic from '../gameLogic';
import type { Card as CardType, CardSelection } from '../types';
import { Card } from '../components/Card';
import DiscardPile from '../components/piles/DiscardPile';
import DrawPile from '../components/piles/DrawPile';
import BurnPile from '../components/piles/BurnPile';
import Table from '../components/Table';
import Hand from '../components/Hand';
import { useGameContext } from '../context/GameContext';
import { useSelection } from '../hooks/useSelection';
import { useHandSorting } from '../hooks/useHandSorting';

const getOrdinalLabel = (n: number): string => {
    if (n === 1) return '1st';
    if (n === 2) return '2nd';
    if (n === 3) return '3rd';
    return `${n}th`;
};

/**
 * Full game screen, extracted from pre-refactor App.tsx:1065-1498. Every
 * gameplay control - including Table/Hand's setup-phase swaps as of Plan
 * 01-07 - dispatches through GameContext's dispatchMove (D-08) rather than
 * mutating gameState directly.
 */
export function GameScreen() {
    const { gameState, dispatchMove, currentPlayerId, testMode, controllingPlayer, setControllingPlayer } =
        useGameContext();

    const { selectedCards, setSelectedCards, revealedFaceDown, setRevealedFaceDown } = useSelection();
    const { handSortMode, setHandSortMode } = useHandSorting('original');
    const [showRules, setShowRules] = useState(false);
    const [drawingCards, setDrawingCards] = useState<
        Array<{ card: CardType; id: string; targetPos: { x: number; y: number }; startPos?: { x: number; y: number } }>
    >([]);
    const [consoleLogs, setConsoleLogs] = useState<string[]>([]);
    const [pickUpConfirmation, setPickUpConfirmation] = useState<{ show: boolean; playerIndex: number } | null>(null);
    const [celebrationModal, setCelebrationModal] = useState<{
        show: boolean;
        playerName: string;
        isShithead: boolean;
        placement: number;
    } | null>(null);
    const celebrationTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const celebrationInitializedRef = useRef(false);
    const celebratedGameOverRef = useRef(false);
    const celebratedPlayerIdsRef = useRef<Set<string>>(new Set());

    const dismissCelebration = () => {
        if (celebrationTimeoutRef.current) {
            clearTimeout(celebrationTimeoutRef.current);
            celebrationTimeoutRef.current = null;
        }
        setCelebrationModal(null);
    };

    // Derived celebration state from gameState (ported verbatim from
    // App.tsx:103-143), reading gameState from context instead of local
    // state. GameScreen mounts fresh each time Router switches from
    // Menu/Lobby to Game (D-09 phase-based routing), so the refs' useRef
    // initial values already start "unset" on every fresh mount - no
    // externally-callable resetCelebration is needed any more.
    useEffect(() => {
        if (!gameState || gameState.phase === 'lobby') return;

        const isOver = GameLogic.isGameOver(gameState.players);
        const finishedPlayers = GameLogic.getFinishedPlayers(gameState.players);

        if (!celebrationInitializedRef.current) {
            celebrationInitializedRef.current = true;
            finishedPlayers.forEach((p) => celebratedPlayerIdsRef.current.add(p.id));
            celebratedGameOverRef.current = isOver;
            return;
        }

        if (isOver) {
            if (!celebratedGameOverRef.current) {
                celebratedGameOverRef.current = true;
                const losers = gameState.players.filter((p) => !GameLogic.hasPlayerWon(p));
                if (losers.length > 0) {
                    if (celebrationTimeoutRef.current) clearTimeout(celebrationTimeoutRef.current);
                    setCelebrationModal({
                        show: true,
                        playerName: losers[0].name,
                        isShithead: true,
                        placement: gameState.players.length,
                    });
                    celebrationTimeoutRef.current = setTimeout(() => setCelebrationModal(null), 4000);
                }
            }
            return;
        }

        const newlyFinished = finishedPlayers.filter((p) => !celebratedPlayerIdsRef.current.has(p.id));
        if (newlyFinished.length > 0) {
            const finisher = newlyFinished[0];
            celebratedPlayerIdsRef.current.add(finisher.id);
            const placement = celebratedPlayerIdsRef.current.size;
            if (celebrationTimeoutRef.current) clearTimeout(celebrationTimeoutRef.current);
            setCelebrationModal({ show: true, playerName: finisher.name, isShithead: false, placement });
            celebrationTimeoutRef.current = setTimeout(() => setCelebrationModal(null), 3000);
        }
    }, [gameState]);

    useEffect(() => {
        return () => {
            if (celebrationTimeoutRef.current) clearTimeout(celebrationTimeoutRef.current);
        };
    }, []);

    // Intercept console.log in test mode, ported from App.tsx:356-386.
    useEffect(() => {
        if (!testMode) return;

        const originalLog = console.log;
        let updateScheduled = false;
        const pendingLogs: string[] = [];

        console.log = (...args: unknown[]) => {
            originalLog(...args);
            const message = args
                .map((arg) => (typeof arg === 'object' ? JSON.stringify(arg, null, 2) : String(arg)))
                .join(' ');

            pendingLogs.push(message);

            if (!updateScheduled) {
                updateScheduled = true;
                setTimeout(() => {
                    setConsoleLogs((prev) => [...prev.slice(-(50 - pendingLogs.length)), ...pendingLogs]);
                    pendingLogs.length = 0;
                    updateScheduled = false;
                }, 0);
            }
        };

        return () => {
            console.log = originalLog;
        };
    }, [testMode]);

    if (!gameState) return null;

    const currentPlayer = gameState.players.find((p) => p.id === currentPlayerId);
    const isMyTurn = gameState.phase === 'playing' && gameState.players[gameState.currentTurn]?.id === currentPlayerId;
    const isSetupPhase = gameState.phase === 'setup';

    const setReady = () => {
        dispatchMove({ type: 'READY_UP', playerId: currentPlayerId });
    };

    // Pickup wiring per RESEARCH.md Open Question 2: shouldConfirmPickUp is a
    // UI-side pre-check only (advisory, not authoritative - see this plan's
    // threat model T-01-11). applyMove's PICK_UP_PILE performs the pickup
    // unconditionally once dispatched.
    const pickUpPile = () => {
        const player = gameState.players.find((p) => p.id === currentPlayerId);
        const playerIndex = gameState.players.findIndex((p) => p.id === currentPlayerId);
        if (!player) return;

        let effectiveRevealed: CardType | null = null;
        if (revealedFaceDown) {
            if (gameState.isFirstTurn) {
                const startingCard = GameLogic.getStartingCard(player);
                effectiveRevealed =
                    startingCard && revealedFaceDown.card.rank === startingCard.rank ? revealedFaceDown.card : null;
            } else {
                effectiveRevealed = revealedFaceDown.card;
            }
        }

        if (GameLogic.shouldConfirmPickUp(player, gameState.discardPile, effectiveRevealed)) {
            setPickUpConfirmation({ show: true, playerIndex });
            return;
        }

        dispatchMove({
            type: 'PICK_UP_PILE',
            playerId: currentPlayerId,
            revealedFaceDownIndex: revealedFaceDown?.index,
        });
        setSelectedCards([]);
        setRevealedFaceDown(null);
    };

    const confirmPickUpAnyway = () => {
        dispatchMove({
            type: 'PICK_UP_PILE',
            playerId: currentPlayerId,
            revealedFaceDownIndex: revealedFaceDown?.index,
        });
        setSelectedCards([]);
        setRevealedFaceDown(null);
        setPickUpConfirmation(null);
    };

    /**
     * Build the move object exactly as App.tsx:461-834 did, then dispatch it
     * through dispatchMove in one shot - applyMove computes the authoritative
     * final state (including drawn cards) itself, so there is no second
     * delayed commit like the original two-phase flushSync + setTimeout(...,
     * 700) updateGameState calls. The draw-count/ghost-portal prediction
     * below is purely cosmetic (RESEARCH.md Pitfall 4, accepted for Phase 1).
     */
    const playCards = () => {
        if (!gameState) return;
        const playerIndex = gameState.players.findIndex((p) => p.id === currentPlayerId);
        const player = gameState.players[playerIndex];

        if (!player || gameState.phase !== 'playing' || gameState.currentTurn !== playerIndex) {
            return;
        }
        if (selectedCards.length === 0 && !revealedFaceDown) {
            return;
        }

        const cardSource = GameLogic.getAvailableCardSource(player);

        let selections: CardSelection[] =
            revealedFaceDown && selectedCards.length === 0
                ? [{ type: 'faceDown', index: revealedFaceDown.index }]
                : [...selectedCards];

        // Reorder hand to match the current visual sort order before dispatch
        // (App.tsx:553-602) - the sorted view becomes the new "original"
        // baseline. applyMove adopts reorderedHand as-is rather than reading
        // handSortMode itself, which stays a presentation-only concern.
        let reorderedHand: (CardType | null)[] | undefined;
        if (cardSource === 'hand' && handSortMode !== 'original') {
            const sorted = GameLogic.sortHand(player.hand, handSortMode);
            reorderedHand = sorted.map((s) => s.card);
            selections = selections.map((sel) =>
                sel.type === 'hand' ? { ...sel, index: sorted.findIndex((s) => s.arrayIndex === sel.index) } : sel
            );
            setHandSortMode('original');
        }

        // Client-side mixed hand+faceUp pre-check, purely to decide whether it's
        // worth predicting a draw-animation - applyMove re-validates this
        // authoritatively regardless and rejects with INVALID_COMBINATION
        // (surfaced as a toast) if this pre-check was somehow wrong.
        const hasMixedSelection =
            selections.some((s) => s.type === 'hand') && selections.some((s) => s.type === 'faceUp');
        let skipAnimationPrediction = false;
        if (hasMixedSelection) {
            const effectiveHand = reorderedHand ?? player.hand;
            const handSelected = selections
                .filter((s) => s.type === 'hand')
                .map((s) => effectiveHand[s.index])
                .filter((c): c is CardType => c !== null && c !== undefined);
            const faceUpSelected = selections
                .filter((s) => s.type === 'faceUp')
                .map((s) => player.faceUp[s.index])
                .filter((c): c is CardType => c !== null && c !== undefined);
            const ok =
                cardSource === 'hand' &&
                GameLogic.canPlayMixedSources(gameState.deck.length, handSelected, faceUpSelected, gameState.discardPile);
            skipAnimationPrediction = !ok;
        }

        if (!skipAnimationPrediction) {
            const cardsToDraw = GameLogic.getCardsToDrawCount(player, gameState.deck.length);
            if (cardsToDraw > 0) {
                const drawnCards = gameState.deck.slice(0, cardsToDraw);
                const deckElement = document.querySelector('.draw-pile-card');
                let deckPos = { x: window.innerWidth / 2, y: 100 };
                if (deckElement) {
                    const deckRect = deckElement.getBoundingClientRect();
                    deckPos = { x: deckRect.left + deckRect.width / 2, y: deckRect.top + deckRect.height / 2 };
                }
                setDrawingCards(
                    drawnCards.map((card, i) => ({
                        card,
                        id: `draw-${card.id}-${Date.now()}-${i}`,
                        targetPos: { x: window.innerWidth / 2, y: window.innerHeight - 200 },
                        startPos: deckPos,
                    }))
                );
                setTimeout(() => setDrawingCards([]), 700);
            }
        }

        dispatchMove({ type: 'PLAY_CARDS', playerId: currentPlayerId, cards: selections, reorderedHand });
        setSelectedCards([]);
        setRevealedFaceDown(null);
    };

    return (
        <>
            <div
                onClick={(e) => {
                    // Deselect cards when clicking anywhere outside of cards during setup phase
                    if (isSetupPhase) {
                        const target = e.target as HTMLElement;
                        if (
                            !target.closest('.w-16, .w-20') &&
                            !target.classList.contains('font-bold') &&
                            !target.classList.contains('leading-none')
                        ) {
                            setSelectedCards([]);
                        }
                    }
                }}
            >
                <div className="max-w-6xl mx-auto">
                    <div className="bg-slate-800 rounded-xl p-4 mb-4 border-2 border-purple-500">
                        <div className="flex items-center justify-between mb-2">
                            <div>
                                <h1 className="text-2xl font-black text-transparent bg-clip-text bg-gradient-to-r from-pink-500 to-purple-500">
                                    SH!THEAD {testMode && <span className="text-sm text-green-400">[TEST MODE]</span>}
                                </h1>
                                <p className="text-sm text-slate-400">Room: {testMode ? 'TEST' : gameState.roomCode}</p>
                            </div>
                            <div className="flex items-center gap-3">
                                <button
                                    onClick={() => setShowRules(!showRules)}
                                    className="p-2 bg-purple-600 hover:bg-purple-700 rounded-lg transition-colors"
                                    title="Rules"
                                >
                                    <HelpCircle size={24} className="text-white" />
                                </button>
                                <div className="text-right">
                                    <p className="text-sm text-slate-400">
                                        {isSetupPhase
                                            ? 'Setup Phase'
                                            : `Turn: ${gameState.players[gameState.currentTurn]?.name}`}
                                    </p>
                                    {isMyTurn && <p className="text-green-400 font-bold">Your Turn!</p>}
                                </div>
                            </div>
                        </div>

                        <div className="mt-2 text-sm text-purple-300 bg-slate-700 rounded p-2">{gameState.lastAction}</div>

                        {testMode && (
                            <div className="mt-3 bg-green-900 border-2 border-green-500 rounded p-4">
                                <label className="text-white text-base font-bold mr-3 block mb-2">
                                    🎮 CONTROL PLAYER:
                                </label>
                                <select
                                    value={controllingPlayer}
                                    onChange={(e) => {
                                        setControllingPlayer(Number(e.target.value));
                                        setSelectedCards([]);
                                    }}
                                    className="w-full bg-slate-600 text-white px-4 py-3 rounded border-2 border-green-400 font-bold text-lg"
                                >
                                    {gameState.players.map((p, i) => (
                                        <option key={p.id} value={i}>
                                            {p.name}
                                        </option>
                                    ))}
                                </select>
                            </div>
                        )}
                    </div>

                    {/* Rules Panel */}
                    {showRules && (
                        <div
                            className="fixed inset-0 bg-black bg-opacity-75 flex items-start justify-center p-4 z-50 overflow-y-auto"
                            onClick={() => setShowRules(false)}
                        >
                            <div
                                className="bg-slate-800 rounded-xl p-6 w-full max-w-2xl my-8 border-2 border-purple-500"
                                onClick={(e) => e.stopPropagation()}
                            >
                                <div className="flex items-center justify-between mb-4">
                                    <h2 className="text-2xl font-black text-transparent bg-clip-text bg-gradient-to-r from-pink-500 to-purple-500">
                                        SH!THEAD RULES
                                    </h2>
                                    <button onClick={() => setShowRules(false)} className="p-2 hover:bg-slate-700 rounded-lg">
                                        <X size={24} className="text-white" />
                                    </button>
                                </div>

                                <div className="space-y-4 text-white">
                                    <div className="bg-slate-700 p-4 rounded-lg">
                                        <h3 className="text-lg font-bold text-pink-400 mb-3">BASIC RULES</h3>
                                        <ul className="space-y-2 text-sm">
                                            <li>
                                                <strong className="text-pink-400">SETUP:</strong> 3 face-down, 3 face-up on
                                                top, 3 in hand. You may swap any hand cards with face-up before play.
                                            </li>
                                            <li>
                                                <strong className="text-pink-400">WHO STARTS:</strong> Red 4, then black 4,
                                                then red 5, black 5, etc. Left of dealer takes preference.
                                            </li>
                                            <li>
                                                <strong className="text-pink-400">BASIC RULE:</strong> Play equal or higher.
                                            </li>
                                            <li>
                                                <strong className="text-pink-400">MULTIPLE CARDS:</strong> You can play 1 or
                                                more cards of the same rank in one turn.
                                            </li>
                                            <li>
                                                <strong className="text-pink-400">CAN'T PLAY?</strong> Pick up the pile.
                                            </li>
                                            <li>
                                                <strong className="text-pink-400">PLAYING ORDER:</strong> Hand → Face-up →
                                                Face-down.
                                            </li>
                                            <li>
                                                <strong className="text-pink-400">DRAW RULE:</strong> Draw back to 3 cards
                                                (while deck lasts).
                                            </li>
                                            <li>
                                                <strong className="text-pink-400">BURN BONUS:</strong> If you clear the pile
                                                (10s or four-of-a-kind), you play again.
                                            </li>
                                            <li>
                                                <strong className="text-pink-400">FACE-DOWN CARDS:</strong> Play blind. If
                                                valid, it plays. If not, pick up pile without revealing.
                                            </li>
                                        </ul>
                                    </div>

                                    <div className="bg-slate-700 p-4 rounded-lg">
                                        <h3 className="text-lg font-bold text-pink-400 mb-3">SPECIAL CARDS</h3>
                                        <ul className="space-y-2 text-sm">
                                            <li>
                                                <strong className="text-red-400">2 - RESET:</strong> Play on anything. Next
                                                player plays anything.
                                            </li>
                                            <li>
                                                <strong className="text-purple-400">3 - INVISIBLE:</strong> Play on
                                                anything. Doesn't change the pile. Can't mix with other cards.
                                            </li>
                                            <li>
                                                <strong className="text-yellow-400">7 - LIMITER:</strong> Only 7 or lower
                                                can be played on it. Blocks 10s from burning.
                                            </li>
                                            <li>
                                                <strong className="text-green-400">10 - BURN:</strong> Clears the pile (any
                                                number of 10s, including four). Can't play on 7s.
                                            </li>
                                            <li>
                                                <strong className="text-blue-400">FOUR OF A KIND:</strong> Four matching
                                                cards clears the pile. 3s are invisible and don't break chains.
                                            </li>
                                        </ul>
                                    </div>
                                </div>
                            </div>
                        </div>
                    )}

                    <div
                        className="bg-slate-800 rounded-xl p-6 mb-4 border-2 border-purple-500"
                        onClick={(e) => {
                            // Deselect cards when clicking anywhere on the board background (not on cards/buttons)
                            if (
                                isSetupPhase &&
                                (e.target === e.currentTarget ||
                                    (e.target instanceof HTMLElement && e.target.classList.contains('text-slate-400')) ||
                                    (e.target instanceof HTMLElement && e.target.classList.contains('text-white')))
                            ) {
                                setSelectedCards([]);
                            }
                        }}
                    >
                        {currentPlayer && (
                            <div className="border-t-2 border-slate-700 pt-6">
                                <h3 className="text-white font-bold mb-3">{currentPlayer.name}'s Cards</h3>

                                <div className="grid grid-cols-[auto_1fr] gap-8 mb-4">
                                    <Table
                                        gameState={gameState}
                                        currentPlayer={currentPlayer}
                                        isSetupPhase={isSetupPhase}
                                        isMyTurn={isMyTurn}
                                        selectedCards={selectedCards}
                                        setSelectedCards={setSelectedCards}
                                        revealedFaceDown={revealedFaceDown}
                                        setRevealedFaceDown={setRevealedFaceDown}
                                    />

                                    <div className="grid grid-cols-[160px_100px_1fr] gap-12 items-start">
                                        <DiscardPile discardPile={gameState.discardPile} />
                                        <DrawPile deck={gameState.deck} />
                                        <BurnPile burnPile={gameState.burnPile} />
                                    </div>
                                </div>

                                {currentPlayer.hand.length > 0 && (
                                    <Hand
                                        player={currentPlayer}
                                        isSetupPhase={isSetupPhase}
                                        isMyTurn={isMyTurn}
                                        handSortMode={handSortMode}
                                        setHandSortMode={setHandSortMode}
                                        selectedCards={selectedCards}
                                        setSelectedCards={setSelectedCards}
                                        gameState={gameState}
                                        drawingCards={drawingCards}
                                    />
                                )}

                                {isSetupPhase && (
                                    <button
                                        onClick={setReady}
                                        disabled={currentPlayer.isReady}
                                        className="bg-gradient-to-r from-pink-500 to-purple-500 text-white font-bold py-3 px-6 rounded-lg hover:from-pink-600 hover:to-purple-600 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                                    >
                                        {currentPlayer.isReady ? 'Ready! Waiting for others...' : 'Ready to Play'}
                                    </button>
                                )}

                                {!isSetupPhase && (
                                    <>
                                        {revealedFaceDown && (
                                            <div className="mb-2 flex items-center gap-2">
                                                <span className="text-slate-300 text-sm">Revealed:</span>
                                                <Card card={revealedFaceDown.card} small />
                                            </div>
                                        )}
                                        <div className="flex gap-3">
                                            <button
                                                onClick={playCards}
                                                disabled={(!revealedFaceDown && selectedCards.length === 0) || !isMyTurn}
                                                className="flex-1 bg-gradient-to-r from-green-500 to-emerald-500 text-white font-bold py-3 px-6 rounded-lg hover:from-green-600 hover:to-emerald-600 transition-all disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:from-green-500 disabled:hover:to-emerald-500"
                                            >
                                                Play{' '}
                                                {(() => {
                                                    const count =
                                                        revealedFaceDown && selectedCards.length === 0
                                                            ? 1
                                                            : selectedCards.length;
                                                    return count > 0 ? `${count} Card${count > 1 ? 's' : ''}` : 'Cards';
                                                })()}
                                            </button>
                                            <button
                                                onClick={pickUpPile}
                                                disabled={gameState.discardPile.length === 0 || !isMyTurn}
                                                className="flex-1 bg-gradient-to-r from-red-500 to-pink-500 text-white font-bold py-3 px-6 rounded-lg hover:from-red-600 hover:to-pink-600 transition-all disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:from-red-500 disabled:hover:to-pink-500"
                                            >
                                                Pick Up Pile ({gameState.discardPile.length})
                                            </button>
                                        </div>
                                    </>
                                )}
                            </div>
                        )}
                    </div>
                </div>

                <div className="grid grid-cols-3 gap-4">
                    {gameState.players.map((player, index) => {
                        const isTheirTurn =
                            gameState.phase === 'playing' && gameState.players[gameState.currentTurn]?.id === player.id;
                        const isControlling = testMode && index === controllingPlayer;
                        const isClickable = testMode;

                        return (
                            <div
                                key={player.id}
                                onClick={() => {
                                    if (testMode) {
                                        setControllingPlayer(index);
                                        setSelectedCards([]);
                                    }
                                }}
                                className={`rounded-lg p-3 border-2 transition-all ${isControlling
                                    ? 'bg-green-900 border-green-500 shadow-lg ring-2 ring-green-400'
                                    : 'bg-slate-800 border-slate-700'
                                    } ${isTheirTurn ? 'border-yellow-500 shadow-lg' : ''
                                    } ${isClickable ? 'cursor-pointer hover:border-green-400' : ''
                                    }`}
                            >
                                <div className="flex items-center justify-between mb-2">
                                    <p className="text-white font-semibold truncate">
                                        {player.name}
                                        {isControlling && <span className="ml-2 text-xs text-green-400">(You)</span>}
                                    </p>
                                    {isTheirTurn && <div className="w-2 h-2 bg-yellow-500 rounded-full animate-pulse" />}
                                </div>
                                <div className="text-xs text-slate-400 space-y-1">
                                    <div>Hand: {player.hand.filter((c): c is CardType => c !== null).length}</div>
                                    <div>Face Up: {player.faceUp.filter((c): c is CardType => c !== null).length}</div>
                                    <div>Face Down: {player.faceDown.filter((c): c is CardType => c !== null).length}</div>
                                </div>
                            </div>
                        );
                    })}
                </div>

                {testMode && consoleLogs.length > 0 && (
                    <div className="mt-6 bg-slate-950 border-2 border-slate-700 rounded-lg p-4">
                        <h3 className="text-sm font-semibold text-slate-400 mb-2">Console Output</h3>
                        <div className="bg-black text-slate-300 text-xs font-mono rounded p-3 max-h-40 overflow-y-auto space-y-1">
                            {consoleLogs.map((log, i) => (
                                <div key={i} className="text-cyan-400">
                                    &gt; {log}
                                </div>
                            ))}
                        </div>
                    </div>
                )}
            </div>

            {drawingCards.length > 0 &&
                createPortal(
                    <div className="pointer-events-none fixed inset-0 z-50">
                        {drawingCards.map(({ card, id, targetPos }) => (
                            <div key={id} className="draw-card-ghost" style={{ left: targetPos.x, top: targetPos.y }}>
                                <Card card={card} small />
                            </div>
                        ))}
                    </div>,
                    document.body
                )}

            {pickUpConfirmation?.show &&
                createPortal(
                    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
                        <div className="bg-slate-800 border-2 border-purple-500 rounded-lg p-6 max-w-md shadow-2xl">
                            <h2 className="text-xl font-bold text-white mb-4">Confirm Pick Up</h2>
                            <p className="text-slate-300 mb-6">
                                You have valid cards to play. Are you sure you want to pick up the pile?
                            </p>
                            <div className="flex gap-4">
                                <button
                                    onClick={() => {
                                        setPickUpConfirmation(null);
                                    }}
                                    className="flex-1 px-4 py-2 bg-slate-700 hover:bg-slate-600 text-white rounded-lg font-semibold transition-colors"
                                >
                                    Cancel
                                </button>
                                <button
                                    onClick={confirmPickUpAnyway}
                                    className="flex-1 px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg font-semibold transition-colors"
                                >
                                    Pick Up Anyway
                                </button>
                            </div>
                        </div>
                    </div>,
                    document.body
                )}

            {celebrationModal?.show &&
                createPortal(
                    <div
                        className="fixed inset-0 bg-black/60 flex items-center justify-center z-50"
                        role="alert"
                        aria-live="assertive"
                    >
                        {celebrationModal.isShithead ? (
                            <div className="celebration-modal relative bg-gradient-to-br from-red-600 to-pink-600 text-white px-12 py-8 rounded-2xl shadow-2xl border-4 border-slate-800 text-center max-w-md">
                                <button
                                    onClick={dismissCelebration}
                                    aria-label="Dismiss"
                                    className="absolute top-3 right-3 text-white/80 hover:text-white"
                                >
                                    <X size={24} />
                                </button>
                                <div className="text-7xl mb-4 celebration-emoji-pulse">💩</div>
                                <div className="text-5xl font-black mb-3">SH!THEAD!</div>
                                <div className="text-2xl opacity-90">{celebrationModal.playerName} is the loser!</div>
                                <div className="text-lg opacity-90 mt-2">{getOrdinalLabel(celebrationModal.placement)} place</div>
                            </div>
                        ) : (
                            <div className="celebration-modal relative bg-gradient-to-br from-purple-600 to-pink-600 text-white px-12 py-8 rounded-2xl shadow-2xl border-4 border-yellow-400 text-center max-w-md">
                                <button
                                    onClick={dismissCelebration}
                                    aria-label="Dismiss"
                                    className="absolute top-3 right-3 text-white/80 hover:text-white"
                                >
                                    <X size={24} />
                                </button>
                                <div className="text-7xl mb-4 celebration-emoji">👑</div>
                                <div className="text-4xl font-black mb-3">SAFE!</div>
                                <div className="text-2xl mb-2">{celebrationModal.playerName} finished!</div>
                                <div className="text-lg opacity-90">{getOrdinalLabel(celebrationModal.placement)} place</div>
                            </div>
                        )}
                    </div>,
                    document.body
                )}
        </>
    );
}
