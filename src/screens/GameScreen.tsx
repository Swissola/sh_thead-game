import { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { HelpCircle, LogOut, RotateCw, WifiOff, X } from 'lucide-react';
import * as GameLogic from '../gameLogic';
import type { Card as CardType, CardSelection, CardSource, GameState, Player } from '../types';
import { Card } from '../components/Card';
import DiscardPile from '../components/piles/DiscardPile';
import DrawPile from '../components/piles/DrawPile';
import BurnPile from '../components/piles/BurnPile';
import Table from '../components/Table';
import Hand from '../components/Hand';
import { useGameContext } from '../context/GameContext';
import { useSelection } from '../hooks/useSelection';
import { useHandSorting } from '../hooks/useHandSorting';
import type { HandSortMode } from '../hooks/useHandSorting';
import { useTurnTimeoutSweep } from '../hooks/useTurnTimeoutSweep';
import { useFocusTrap } from '../hooks/useFocusTrap';
import { TURN_GRACE_MS } from '../supabase/roomTypes';

const getOrdinalLabel = (n: number): string => {
  if (n === 1) return '1st';
  if (n === 2) return '2nd';
  if (n === 3) return '3rd';
  return `${n}th`;
};

const stringifyLogArg = (arg: unknown): string => {
  if (typeof arg !== 'object' || arg === null) {
    return String(arg);
  }
  return JSON.stringify(arg, null, 2);
};

type DrawingCard = {
  card: CardType;
  id: string;
  targetPos: { x: number; y: number };
  startPos?: { x: number; y: number };
};

// Reorders selections to match the visual sort order before dispatch
// (App.tsx:553-602 behavior, ported verbatim) - the sorted view becomes the
// new "original" baseline. Only applies to hand-sourced plays.
function reorderHandForPlay(
  player: Player,
  cardSource: CardSource,
  handSortMode: HandSortMode,
  selections: CardSelection[]
): {
  reorderedHand: (CardType | null)[] | undefined;
  selections: CardSelection[];
  didReorder: boolean;
} {
  if (cardSource !== 'hand' || handSortMode === 'original') {
    return { reorderedHand: undefined, selections, didReorder: false };
  }
  const sorted = GameLogic.sortHand(player.hand, handSortMode);
  const reorderedHand = sorted.map((s) => s.card);
  const remapped = selections.map((sel) =>
    sel.type === 'hand'
      ? { ...sel, index: sorted.findIndex((s) => s.arrayIndex === sel.index) }
      : sel
  );
  return { reorderedHand, selections: remapped, didReorder: true };
}

// Client-side mixed hand+faceUp pre-check, purely to decide whether it's
// worth predicting a draw-animation - applyMove re-validates this
// authoritatively regardless and rejects with INVALID_COMBINATION (surfaced
// as a toast) if this pre-check was somehow wrong.
function shouldSkipAnimationPrediction(
  selections: CardSelection[],
  effectiveHand: (CardType | null)[],
  player: Player,
  cardSource: CardSource,
  deckLength: number,
  discardPile: CardType[]
): boolean {
  const hasMixedSelection =
    selections.some((s) => s.type === 'hand') && selections.some((s) => s.type === 'faceUp');
  if (!hasMixedSelection) return false;

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
    GameLogic.canPlayMixedSources(deckLength, handSelected, faceUpSelected, discardPile);
  return !ok;
}

// getCardsToDrawCount needs the hand as it will be AFTER this play (cards.ts's
// applyMove does the same via preDrawPlayer) - passing the still-full
// pre-play hand under-counts by however many hand cards are being played,
// since the function only asks "how many more do I need to reach 3" from
// whatever hand it's given. Returns null when nothing should animate.
function computeDrawAnimation(
  player: Player,
  cardSource: CardSource,
  effectiveHandForDraw: (CardType | null)[],
  selections: CardSelection[],
  deck: CardType[]
): DrawingCard[] | null {
  const postPlayHand =
    cardSource === 'hand'
      ? effectiveHandForDraw.map((c, idx) =>
          selections.some((s) => s.type === 'hand' && s.index === idx) ? null : c
        )
      : player.hand;
  const cardsToDraw = GameLogic.getCardsToDrawCount({ ...player, hand: postPlayHand }, deck.length);
  if (cardsToDraw <= 0) return null;

  const drawnCards = deck.slice(0, cardsToDraw);
  const deckElement = document.querySelector('.draw-pile-card');
  let deckPos = { x: window.innerWidth / 2, y: 100 };
  if (deckElement) {
    const deckRect = deckElement.getBoundingClientRect();
    deckPos = { x: deckRect.left + deckRect.width / 2, y: deckRect.top + deckRect.height / 2 };
  }

  // Target the screen position of the hand slot each drawn card lands in,
  // read BEFORE dispatch while the about-to-be-played cards are still
  // rendered at their real positions. applyMove fills vacated hand slots in
  // ascending index order (see applyMove.ts's PLAY_CARDS case), so the Nth
  // played hand card's position is the Nth drawn card's landing spot. Falls
  // back to the hand-area container, then a fixed point, when no hand card
  // was played (faceUp/faceDown-only plays).
  const playedHandCards =
    cardSource === 'hand'
      ? selections
          .filter((s) => s.type === 'hand')
          .map((s) => effectiveHandForDraw[s.index])
          .filter((c): c is CardType => c !== null && c !== undefined)
      : [];
  const handSlotPositions = playedHandCards
    .map((card) => document.querySelector(`[data-card-key="${card.id}"]`))
    .filter((el): el is Element => el !== null)
    .map((el) => {
      const rect = el.getBoundingClientRect();
      return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
    });
  const handAreaElement = document.querySelector('.hand-area');
  let handAreaPos = { x: window.innerWidth / 2, y: window.innerHeight - 200 };
  if (handAreaElement) {
    const areaRect = handAreaElement.getBoundingClientRect();
    handAreaPos = { x: areaRect.left + areaRect.width / 2, y: areaRect.top + areaRect.height / 2 };
  }

  return drawnCards.map((card, i) => ({
    card,
    id: `draw-${card.id}-${Date.now()}-${i}`,
    targetPos: handSlotPositions[i] ?? handAreaPos,
    startPos: deckPos,
  }));
}

// Extracted purely to keep GameScreen's own cognitive complexity under the
// S3776 threshold - a pure computation of "should the turn announcer update,
// and to what", with the actual setState calls left in the component body.
function computeTurnAnnouncement(
  gameState: GameState,
  currentPlayerId: string,
  lastAnnouncedTurn: number | null
): { turnIndex: number; text: string } | null {
  if (gameState.phase !== 'playing' || lastAnnouncedTurn === gameState.currentTurn) return null;
  const activePlayer = gameState.players[gameState.currentTurn];
  if (!activePlayer) return null;
  return {
    turnIndex: gameState.currentTurn,
    text: activePlayer.id === currentPlayerId ? 'Your turn' : `${activePlayer.name}'s turn`,
  };
}

function computePlayCardCount(
  revealedFaceDown: { card: CardType; index: number } | null,
  selectedCards: CardSelection[]
): number {
  if (revealedFaceDown && selectedCards.length === 0) return 1;
  return selectedCards.length;
}

function computePlayButtonLabel(playCardCount: number): string {
  if (playCardCount === 0) return 'Cards';
  return `${playCardCount} Card${playCardCount > 1 ? 's' : ''}`;
}

/**
 * Full game screen, extracted from pre-refactor App.tsx:1065-1498. Every
 * gameplay control - including Table/Hand's setup-phase swaps as of Plan
 * 01-07 - dispatches through GameContext's dispatchMove (D-08) rather than
 * mutating gameState directly.
 */
export function GameScreen({
  isPlayerOffline = () => false,
  consumeJustReconnected = () => false,
}: {
  isPlayerOffline?: (id: string) => boolean;
  consumeJustReconnected?: () => boolean;
} = {}) {
  const {
    gameState,
    dispatchMove,
    currentPlayerId,
    playerId,
    testMode,
    controllingPlayer,
    setControllingPlayer,
    showToast,
    turnStartedAt,
    setGameState,
  } = useGameContext();

  const { selectedCards, setSelectedCards, revealedFaceDown, setRevealedFaceDown } = useSelection();
  const { handSortMode, setHandSortMode } = useHandSorting('original');
  const [showRules, setShowRules] = useState(false);
  const [drawingCards, setDrawingCards] = useState<DrawingCard[]>([]);
  const [consoleLogs, setConsoleLogs] = useState<Array<{ id: number; text: string }>>([]);
  const logIdCounterRef = useRef(0);
  const [pickUpConfirmation, setPickUpConfirmation] = useState<{
    show: boolean;
    playerIndex: number;
  } | null>(null);
  const [showLeaveConfirm, setShowLeaveConfirm] = useState(false);
  const [turnAnnouncement, setTurnAnnouncement] = useState('');
  // Tracks the last-announced turn index as state, not a ref (plan 02-12's
  // established pattern) - this project's react-hooks/refs lint rule
  // forbids reading/writing a ref's .current during render, which the
  // render-body "adjusting state" pattern below requires.
  const [lastAnnouncedTurn, setLastAnnouncedTurn] = useState<number | null>(null);
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

  // useCallback keeps this a stable reference across renders - the focus
  // trap hook's effect depends on [active, onEscape] (Task 2's read_first
  // note), and an unstable callback would re-run that effect (and re-focus
  // the dialog's first element) on every unrelated GameScreen render.
  const dismissCelebration = useCallback(() => {
    if (celebrationTimeoutRef.current) {
      clearTimeout(celebrationTimeoutRef.current);
      celebrationTimeoutRef.current = null;
    }
    setCelebrationModal(null);
  }, []);

  // D-06/D-07: vanilla focus trap for the celebration modal - Tab/Shift+Tab
  // wraps within it, Escape calls dismissCelebration, and focus returns to
  // the pre-open element on close.
  const celebrationDialogRef = useFocusTrap(celebrationModal?.show === true, dismissCelebration);

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

  // D-10: tracks each player's last-known offline value so only a genuine
  // true->false transition raises a reconnect toast - not a re-render, and
  // not the initial mount (every player who is already online at mount
  // would otherwise raise a spurious toast). Seeded once on first run.
  const lastOfflineRef = useRef<Record<string, boolean>>({});
  const offlineSeededRef = useRef(false);

  useEffect(() => {
    if (!gameState) return;

    const nextOffline: Record<string, boolean> = {};
    for (const player of gameState.players) {
      nextOffline[player.id] = !testMode && player.id !== playerId && isPlayerOffline(player.id);
    }

    if (!offlineSeededRef.current) {
      offlineSeededRef.current = true;
      lastOfflineRef.current = nextOffline;
      return;
    }

    // 02-UAT.md test 10 (D-10): this client's own Presence channel just
    // dropped and recovered, and usePresence's onlinePlayerIds view of every
    // OTHER player just caught up in a single batch as a result (see
    // usePresence.ts's sync handler) - not a genuine reconnect by any of
    // them. Treat this pass exactly like the initial-mount seed above:
    // adopt the caught-up values silently, fire no toasts, so the batch
    // catch-up doesn't get misattributed to whichever other player happened
    // to look stale during this client's own outage. Every other pass (this
    // client's own connection never dropped) falls through to the ordinary
    // per-player transition check below unchanged.
    if (consumeJustReconnected()) {
      lastOfflineRef.current = nextOffline;
      return;
    }

    for (const player of gameState.players) {
      if (lastOfflineRef.current[player.id] && !nextOffline[player.id]) {
        showToast(`${player.name} reconnected`, 'RECONNECTED', 'reconnect');
      }
    }
    lastOfflineRef.current = nextOffline;
  }, [gameState, testMode, playerId, isPlayerOffline, showToast, consumeJustReconnected]);

  // D-05: the client-side trigger that makes check-turn-timeout reachable
  // at all - see useTurnTimeoutSweep.ts. graceExpired, combined with
  // isOffline and isTheirTurn below, drives D-10's state 2 badge upgrade.
  const { graceExpired } = useTurnTimeoutSweep({
    roomCode: gameState?.roomCode ?? '',
    testMode,
    phase: gameState?.phase ?? '',
    turnStartedAt,
    currentTurnPlayerId: gameState?.players[gameState.currentTurn]?.id,
    playerId,
    turnTimeoutMs: gameState?.turnTimeoutMs ?? TURN_GRACE_MS,
  });

  // Intercept console.log in test mode, ported from App.tsx:356-386.
  useEffect(() => {
    if (!testMode) return;

    const originalLog = console.log;
    let updateScheduled = false;
    const pendingLogs: string[] = [];

    const flushPendingLogs = () => {
      const newEntries = pendingLogs.map((text) => ({ id: logIdCounterRef.current++, text }));
      setConsoleLogs((prev) => [...prev.slice(-Math.max(0, 50 - pendingLogs.length)), ...newEntries]);
      pendingLogs.length = 0;
      updateScheduled = false;
    };

    console.log = (...args: unknown[]) => {
      originalLog(...args);
      pendingLogs.push(args.map(stringifyLogArg).join(' '));

      if (!updateScheduled) {
        updateScheduled = true;
        setTimeout(flushPendingLogs, 0);
      }
    };

    return () => {
      console.log = originalLog;
    };
  }, [testMode]);

  if (!gameState) return null;

  // D-05: always-mounted aria-live="polite" turn announcer (RESEARCH.md
  // Pattern 3). Adjusted during render, not inside a useEffect - this
  // project's react-hooks/set-state-in-effect lint rule (plan 02-12)
  // requires state derived from a gameState change to be set here; React
  // re-runs the render body immediately without committing/painting the
  // stale output first. lastAnnouncedTurn guards against re-announcing on
  // re-renders that don't change gameState.currentTurn (Pitfall 3).
  const turnAnnouncementUpdate = computeTurnAnnouncement(gameState, currentPlayerId, lastAnnouncedTurn);
  if (turnAnnouncementUpdate) {
    setLastAnnouncedTurn(turnAnnouncementUpdate.turnIndex);
    setTurnAnnouncement(turnAnnouncementUpdate.text);
  }

  const currentPlayer = gameState.players.find((p) => p.id === currentPlayerId);
  const isMyTurn =
    gameState.phase === 'playing' &&
    gameState.players[gameState.currentTurn]?.id === currentPlayerId;
  const isSetupPhase = gameState.phase === 'setup';

  const setReady = () => {
    dispatchMove({ type: 'READY_UP', playerId: currentPlayerId });
  };

  // Pickup wiring per RESEARCH.md Open Question 2: shouldConfirmPickUp is a
  // UI-side pre-check only (advisory, not authoritative - see this plan's
  // threat model T-01-11). applyMove's PICK_UP_PILE performs the pickup
  // unconditionally once dispatched.
  //
  // Face-down cards are always played blind - the player never learns a
  // selected face-down card's identity before committing (see playCards'
  // faceDown handling below), so shouldConfirmPickUp can never be told
  // what that card is either. Passing it here would be the same
  // information leak as showing it in the UI: the mere presence/absence
  // of the "are you sure" dialog would reveal whether the hidden card was
  // playable.
  const pickUpPile = () => {
    const player = gameState.players.find((p) => p.id === currentPlayerId);
    const playerIndex = gameState.players.findIndex((p) => p.id === currentPlayerId);
    if (!player) return;

    if (GameLogic.shouldConfirmPickUp(player, gameState.discardPile, null)) {
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

  // D-14: leaving is a purely local "stop looking at this room" - no Edge
  // Function call, no server write. D-04 guarantees the seat is never freed,
  // so the player's cards/seat/turn position stay in the room's state and
  // D-01 auto-rejoin puts them straight back. Clearing gameState also drops
  // the room code useRoomSubscription/usePresence are keyed on, so both
  // channels tear themselves down through their existing cleanup.
  const confirmLeaveGame = () => {
    setSelectedCards([]);
    setRevealedFaceDown(null);
    setShowLeaveConfirm(false);
    void setGameState(null);
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

    const initialSelections: CardSelection[] =
      revealedFaceDown && selectedCards.length === 0
        ? [{ type: 'faceDown', index: revealedFaceDown.index }]
        : [...selectedCards];

    const { reorderedHand, selections, didReorder } = reorderHandForPlay(
      player,
      cardSource,
      handSortMode,
      initialSelections
    );
    if (didReorder) setHandSortMode('original');

    const effectiveHand = reorderedHand ?? player.hand;
    const skipAnimationPrediction = shouldSkipAnimationPrediction(
      selections,
      effectiveHand,
      player,
      cardSource,
      gameState.deck.length,
      gameState.discardPile
    );

    if (!skipAnimationPrediction) {
      const drawingCardsResult = computeDrawAnimation(
        player,
        cardSource,
        effectiveHand,
        selections,
        gameState.deck
      );
      if (drawingCardsResult) {
        setDrawingCards(drawingCardsResult);
        setTimeout(() => setDrawingCards([]), 700);
      }
    }

    dispatchMove({
      type: 'PLAY_CARDS',
      playerId: currentPlayerId,
      cards: selections,
      reorderedHand,
    });
    setSelectedCards([]);
    setRevealedFaceDown(null);
  };

  const playCardCount = computePlayCardCount(revealedFaceDown, selectedCards);
  const playButtonLabel = computePlayButtonLabel(playCardCount);

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
        onKeyDown={(e) => {
          if (isSetupPhase && e.key === 'Escape') {
            setSelectedCards([]);
          }
        }}
      >
        <div className="max-w-6xl mx-auto">
          <div aria-live="polite" role="status" className="sr-only">
            {turnAnnouncement}
          </div>
          <div className="bg-slate-800 rounded-xl p-3 sm:p-4 mb-4 border-2 border-purple-500">
            <div className="flex items-center justify-between mb-2 max-sm:flex-wrap max-sm:gap-2">
              <div>
                <h1 className="text-2xl font-black text-transparent bg-clip-text bg-gradient-to-r from-pink-500 to-purple-500">
                  SH!THEAD {testMode && <span className="text-sm text-green-400">[TEST MODE]</span>}
                </h1>
                <p className="text-sm text-slate-400">
                  Room: {testMode ? 'TEST' : gameState.roomCode}
                </p>
              </div>
              <div className="flex items-center gap-3 max-sm:flex-wrap max-sm:gap-2">
                <button
                  onClick={() => setShowRules(!showRules)}
                  className="min-h-11 min-w-11 inline-flex items-center justify-center p-2 bg-purple-600 hover:bg-purple-700 rounded-lg transition-colors"
                  title="Rules"
                >
                  <HelpCircle size={24} className="text-white" />
                </button>
                <button
                  onClick={() => setShowLeaveConfirm(true)}
                  className="min-h-11 min-w-11 inline-flex items-center justify-center p-2 bg-slate-700 hover:bg-slate-600 rounded-lg transition-colors"
                  title="Leave Game"
                  aria-label="Leave Game"
                >
                  <LogOut size={24} className="text-white" />
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

            <div className="mt-2 text-sm text-purple-300 bg-slate-700 rounded p-2">
              {gameState.lastAction}
            </div>

            {testMode && (
              <div className="mt-3 bg-green-900 border-2 border-green-500 rounded p-4">
                <label
                  htmlFor="control-player-select"
                  className="text-white text-base font-bold mr-3 block mb-2"
                >
                  🎮 CONTROL PLAYER:
                </label>
                <select
                  id="control-player-select"
                  value={controllingPlayer}
                  onChange={(e) => {
                    setControllingPlayer(Number(e.target.value));
                    setSelectedCards([]);
                  }}
                  className="min-h-11 w-full bg-slate-600 text-white px-4 py-3 rounded border-2 border-green-400 font-bold text-lg"
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
              onClick={(e) => {
                if (e.target === e.currentTarget) setShowRules(false);
              }}
              onKeyDown={(e) => {
                if (e.key === 'Escape') setShowRules(false);
              }}
            >
              <div className="bg-slate-800 rounded-xl p-6 w-full max-w-2xl my-8 border-2 border-purple-500">
                <div className="flex items-center justify-between mb-4">
                  <h2 className="text-2xl font-black text-transparent bg-clip-text bg-gradient-to-r from-pink-500 to-purple-500">
                    SH!THEAD RULES
                  </h2>
                  <button
                    onClick={() => setShowRules(false)}
                    className="p-2 hover:bg-slate-700 rounded-lg"
                  >
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
            className="bg-slate-800 rounded-xl p-3 sm:p-6 mb-4 border-2 border-purple-500"
            onClick={(e) => {
              // Deselect cards when clicking anywhere on the board background (not on cards/buttons)
              if (
                isSetupPhase &&
                (e.target === e.currentTarget ||
                  (e.target instanceof HTMLElement &&
                    e.target.classList.contains('text-slate-400')) ||
                  (e.target instanceof HTMLElement && e.target.classList.contains('text-white')))
              ) {
                setSelectedCards([]);
              }
            }}
            onKeyDown={(e) => {
              if (isSetupPhase && e.key === 'Escape') {
                setSelectedCards([]);
              }
            }}
          >
            {currentPlayer && (
              <div className="border-t-2 border-slate-700 pt-6">
                <h3 className="text-white font-bold mb-3">{currentPlayer.name}'s Cards</h3>

                <div className="grid grid-cols-[auto_1fr] gap-8 mb-4 max-sm:grid-cols-1 max-sm:gap-4">
                  <div className="max-sm:order-2">
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
                  </div>

                  <div className="grid grid-cols-[160px_100px_1fr] gap-12 items-start max-sm:order-1 max-sm:flex max-sm:flex-wrap max-sm:justify-center max-sm:gap-4">
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
                        <span className="text-slate-300 text-sm">
                          Face-down card selected - played blind, revealed after you commit.
                        </span>
                      </div>
                    )}
                    <div className="flex gap-3 max-sm:flex-col">
                      <button
                        onClick={playCards}
                        disabled={(!revealedFaceDown && selectedCards.length === 0) || !isMyTurn}
                        className="min-h-11 flex-1 bg-gradient-to-r from-green-500 to-emerald-500 text-white font-bold py-3 px-6 rounded-lg hover:from-green-600 hover:to-emerald-600 transition-all disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:from-green-500 disabled:hover:to-emerald-500"
                      >
                        Play {playButtonLabel}
                      </button>
                      <button
                        onClick={pickUpPile}
                        disabled={gameState.discardPile.length === 0 || !isMyTurn}
                        className="min-h-11 flex-1 bg-gradient-to-r from-red-500 to-pink-500 text-white font-bold py-3 px-6 rounded-lg hover:from-red-600 hover:to-pink-600 transition-all disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:from-red-500 disabled:hover:to-pink-500"
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

        <div className="grid grid-cols-3 gap-4 max-sm:grid-cols-1">
          {gameState.players.map((player, index) => {
            const isTheirTurn =
              gameState.phase === 'playing' &&
              gameState.players[gameState.currentTurn]?.id === player.id;
            const isControlling = testMode && index === controllingPlayer;
            const isClickable = testMode;
            // !testMode guard matters: usePresence reports an empty online
            // set in Test Mode (CLAUDE.md - Test Mode never touches the
            // network), so without it every tile would render offline.
            // Compared against playerId, not currentPlayerId, so the local
            // player's own tile never greys out, even in Test Mode where
            // currentPlayerId follows whichever player is being controlled.
            const isOffline = !testMode && player.id !== playerId && isPlayerOffline(player.id);
            // D-10 state 2: upgrades in place once the offline player's own
            // turn has stalled past the grace period - the same badge
            // element swaps text/icon/colour, it never renders a second badge.
            const isAutoPickingUp = isOffline && isTheirTurn && graceExpired;

            return (
              <div
                key={player.id}
                onClick={() => {
                  if (testMode) {
                    setControllingPlayer(index);
                    setSelectedCards([]);
                  }
                }}
                onKeyDown={(e) => {
                  if (testMode && (e.key === 'Enter' || e.key === ' ')) {
                    e.preventDefault();
                    setControllingPlayer(index);
                    setSelectedCards([]);
                  }
                }}
                role={testMode ? 'button' : undefined}
                tabIndex={testMode ? 0 : undefined}
                aria-pressed={testMode ? isControlling : undefined}
                className={`rounded-lg p-3 border-2 transition-all ${
                  isControlling
                    ? 'bg-green-900 border-green-500 shadow-lg ring-2 ring-green-400'
                    : 'bg-slate-800 border-slate-700'
                } ${isTheirTurn ? 'border-yellow-500 shadow-lg' : ''} ${
                  isClickable ? 'cursor-pointer hover:border-green-400' : ''
                } ${isOffline ? 'opacity-60 border-slate-600' : ''}`}
              >
                <div className="flex items-center justify-between mb-2">
                  <p className="text-white font-semibold truncate">
                    {player.name}
                    {isControlling && <span className="ml-2 text-xs text-green-400">(You)</span>}
                  </p>
                  <div className="flex items-center gap-2">
                    {isOffline &&
                      (isAutoPickingUp ? (
                        <span className="text-xs px-2 py-1 rounded bg-amber-600 text-amber-100 flex items-center gap-1">
                          <RotateCw size={12} />
                          Offline - auto-picking up
                        </span>
                      ) : (
                        <span className="text-xs px-2 py-1 rounded bg-slate-600 text-slate-300 flex items-center gap-1">
                          <WifiOff size={12} />
                          Offline
                        </span>
                      ))}
                    {isTheirTurn && (
                      <div className="w-2 h-2 bg-yellow-500 rounded-full animate-pulse" />
                    )}
                  </div>
                </div>
                <div className="text-xs text-slate-400 space-y-1">
                  <div>Hand: {player.hand.filter((c): c is CardType => c !== null).length}</div>
                  <div>
                    Face Up: {player.faceUp.filter((c): c is CardType => c !== null).length}
                  </div>
                  <div>
                    Face Down: {player.faceDown.filter((c): c is CardType => c !== null).length}
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        {testMode && consoleLogs.length > 0 && (
          <div className="mt-6 bg-slate-950 border-2 border-slate-700 rounded-lg p-4">
            <h3 className="text-sm font-semibold text-slate-400 mb-2">Console Output</h3>
            <div className="bg-black text-slate-300 text-xs font-mono rounded p-3 max-h-40 overflow-y-auto space-y-1">
              {consoleLogs.map((log) => (
                <div key={log.id} className="text-cyan-400">
                  &gt; {log.text}
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
              <div
                key={id}
                className="draw-card-ghost"
                style={{ left: targetPos.x, top: targetPos.y }}
              >
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
                  className="min-h-11 flex-1 px-4 py-2 bg-slate-700 hover:bg-slate-600 text-white rounded-lg font-semibold transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={confirmPickUpAnyway}
                  className="min-h-11 flex-1 px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg font-semibold transition-colors"
                >
                  Pick Up Anyway
                </button>
              </div>
            </div>
          </div>,
          document.body
        )}

      {showLeaveConfirm &&
        createPortal(
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
            <div className="bg-slate-800 border-2 border-purple-500 rounded-lg p-6 max-w-md shadow-2xl">
              <h2 className="text-xl font-bold text-white mb-4">Leave game?</h2>
              <p className="text-slate-300 mb-6">
                You can rejoin any time with the same room code - your seat will be waiting.
              </p>
              <div className="flex gap-4">
                <button
                  onClick={() => setShowLeaveConfirm(false)}
                  className="min-h-11 flex-1 px-4 py-2 bg-slate-700 hover:bg-slate-600 text-white rounded-lg font-semibold transition-colors"
                >
                  Keep Playing
                </button>
                <button
                  onClick={confirmLeaveGame}
                  className="min-h-11 flex-1 px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg font-semibold transition-colors"
                >
                  Leave Game
                </button>
              </div>
            </div>
          </div>,
          document.body
        )}

      {celebrationModal?.show &&
        createPortal(
          <div
            ref={celebrationDialogRef}
            className="fixed inset-0 bg-black/60 flex items-center justify-center z-50"
            role="dialog"
            aria-modal="true"
            aria-labelledby="celebration-heading"
          >
            {celebrationModal.isShithead ? (
              <div className="celebration-modal relative bg-gradient-to-br from-red-600 to-pink-600 text-white px-12 py-8 rounded-2xl shadow-2xl border-4 border-slate-800 text-center max-w-md">
                <button
                  onClick={dismissCelebration}
                  aria-label="Dismiss"
                  className="min-h-11 min-w-11 inline-flex items-center justify-center absolute top-3 right-3 text-white/80 hover:text-white"
                >
                  <X size={24} />
                </button>
                <div className="text-7xl mb-4 celebration-emoji-pulse">💩</div>
                <div id="celebration-heading" className="text-5xl font-black mb-3">
                  SH!THEAD!
                </div>
                <div className="text-2xl opacity-90">
                  {celebrationModal.playerName} is the loser!
                </div>
                <div className="text-lg opacity-90 mt-2">
                  {getOrdinalLabel(celebrationModal.placement)} place
                </div>
              </div>
            ) : (
              <div className="celebration-modal relative bg-gradient-to-br from-purple-600 to-pink-600 text-white px-12 py-8 rounded-2xl shadow-2xl border-4 border-yellow-400 text-center max-w-md">
                <button
                  onClick={dismissCelebration}
                  aria-label="Dismiss"
                  className="min-h-11 min-w-11 inline-flex items-center justify-center absolute top-3 right-3 text-white/80 hover:text-white"
                >
                  <X size={24} />
                </button>
                <div className="text-7xl mb-4 celebration-emoji">👑</div>
                <div id="celebration-heading" className="text-4xl font-black mb-3">
                  SAFE!
                </div>
                <div className="text-2xl mb-2">{celebrationModal.playerName} finished!</div>
                <div className="text-lg opacity-90">
                  {getOrdinalLabel(celebrationModal.placement)} place
                </div>
              </div>
            )}
          </div>,
          document.body
        )}
    </>
  );
}
