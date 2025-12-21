import { useState, useEffect, useCallback } from 'react';
import { createPortal, flushSync } from 'react-dom';
import { Users, Plus, Copy, Check, Crown, ArrowRight, HelpCircle, X } from 'lucide-react';
import * as GameLogic from './gameLogic';
import { RANK_VALUES } from './gameLogic';
import type { GameState, Card as CardType, CardSelection } from './types';
import { Card } from './components/Card';
import DiscardPile from './components/piles/DiscardPile';
import DrawPile from './components/piles/DrawPile';
import BurnPile from './components/piles/BurnPile';
import Table from './components/Table';
import Hand from './components/Hand';
import { useSelection } from './hooks/useSelection';
import { useHandSorting } from './hooks/useHandSorting';
import { useGameStateUpdater } from './hooks/useGameState';

const SUITS = ['♠', '♥', '♣', '♦'];
const RANKS = ['2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K', 'A'];

const createDeck = (numDecks = 1) => {
  const deck = [];
  const deckColors = ['red', 'blue', 'green', 'purple', 'orange', 'teal'];
  for (let d = 0; d < numDecks; d++) {
    for (const suit of SUITS) {
      for (const rank of RANKS) {
        deck.push({
          suit,
          rank,
          id: `${rank}${suit}-${d}`,
          deckColor: deckColors[d % deckColors.length],
        });
      }
    }
  }
  return deck;
};

const shuffleDeck = (deck: CardType[]): CardType[] => {
  const shuffled = [...deck];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled;
};

// Card component extracted to components/Card

export default function ShitheadGame() {
  const [screen, setScreen] = useState<'menu' | 'lobby' | 'game'>('menu');
  const [roomCode, setRoomCode] = useState('');
  const [playerName, setPlayerName] = useState('');
  // @ts-expect-error - used in non-test mode
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const [playerId, setPlayerId] = useState('');
  const [gameState, setGameState] = useState<GameState | null>(null);
  const { selectedCards, setSelectedCards, revealedFaceDown, setRevealedFaceDown } = useSelection();
  const [copied, setCopied] = useState(false);
  const [testMode, setTestMode] = useState(false);
  const [controllingPlayer, setControllingPlayer] = useState(0);
  const [showRules, setShowRules] = useState(false);
  const [drawingCards, setDrawingCards] = useState<Array<{ card: CardType; id: string; targetPos: { x: number; y: number }; startPos?: { x: number; y: number } }>>([]);
  const { handSortMode, setHandSortMode } = useHandSorting('original');
  const [consoleLogs, setConsoleLogs] = useState<string[]>([]);
  const [pickUpConfirmation, setPickUpConfirmation] = useState<{ show: boolean; playerIndex: number } | null>(null);
  const [celebrationModal, setCelebrationModal] = useState<{ show: boolean; playerName: string; isShithead: boolean; placement: number } | null>(null);
  // moved to useSelection hook

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
    const deck = shuffleDeck(createDeck(numDecks));

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
    setScreen('game');
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
    const deck = shuffleDeck(createDeck(numDecks));

    const dealtPlayers = testPlayers.map((player) => ({
      ...player,
      hand: deck.splice(0, 3),
      faceUp: deck.splice(0, 3),
      faceDown: deck.splice(0, 3),
    }));

    // Determine the actual starting player based on cards
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
    setControllingPlayer(startingPlayerIndex); // Set to starting player
    setScreen('game');
  };

  const createRoom = async () => {
    if (!playerName.trim()) return alert('Please enter your name');

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
      await window.storage.set(`game:${code}`, JSON.stringify(newGameState), true);
      setRoomCode(code);
      setGameState(newGameState);
      setScreen('lobby');
    } catch {
      alert('Failed to create room');
    }
  };

  const joinRoom = async () => {
    if (!playerName.trim() || !roomCode.trim())
      return alert('Please enter your name and room code');

    try {
      const result = await window.storage.get(`game:${roomCode.toUpperCase()}`, true);
      if (!result) return alert('Room not found');

      const state = JSON.parse(result.value);
      if (state.phase !== 'lobby') return alert('Game has already started');

      state.players.push({
        id: playerId,
        name: playerName,
        hand: [],
        faceUp: [],
        faceDown: [],
        isReady: false,
      });
      state.lastAction = `${playerName} joined the room`;

      await window.storage.set(`game:${roomCode.toUpperCase()}`, JSON.stringify(state), true);
      setGameState(state);
      setScreen('lobby');
    } catch {
      alert('Failed to join room');
    }
  };

  const startGame = async () => {
    if (!gameState || gameState.host !== playerId || gameState.players.length < 2) return;

    const numDecks = Math.ceil(gameState.players.length / 4);
    const deck = shuffleDeck(createDeck(numDecks));

    const updatedPlayers = gameState.players.map((player) => ({
      ...player,
      hand: deck.splice(0, 3),
      faceUp: deck.splice(0, 3),
      faceDown: deck.splice(0, 3),
      isReady: false,
    }));

    const updatedState: GameState = {
      roomCode,
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

    await window.storage.set(`game:${roomCode}`, JSON.stringify(updatedState), true);
    setGameState(updatedState);
  };

  const copyRoomCode = () => {
    navigator.clipboard.writeText(roomCode);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const pollGameState = useCallback(async () => {
    if (!roomCode) return;
    try {
      const result = await window.storage.get(`game:${roomCode}`, true);
      if (result) {
        const state = JSON.parse(result.value);
        setGameState(state);
        if (state.phase === 'lobby' && screen !== 'lobby') setScreen('lobby');
        else if ((state.phase === 'setup' || state.phase === 'playing') && screen !== 'game')
          setScreen('game');
      }
    } catch (error) {
      console.error('Poll error:', error);
    }
  }, [roomCode, screen]);

  useEffect(() => {
    if (screen === 'lobby' || screen === 'game') {
      if (testMode) return;
      const interval = setInterval(pollGameState, 2000);
      return () => clearInterval(interval);
    }
  }, [screen, roomCode, testMode, pollGameState]);

  // Intercept console.log in test mode
  useEffect(() => {
    if (!testMode) return;

    const originalLog = console.log;
    let updateScheduled = false;
    const pendingLogs: string[] = [];

    console.log = (...args: any[]) => {
      originalLog(...args);
      const message = args
        .map((arg) =>
          typeof arg === 'object' ? JSON.stringify(arg, null, 2) : String(arg)
        )
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

  const swapCards = (handIndex: number, faceUpIndex: number): void => {
    if (!gameState) return;
    const currentPlayerId = testMode ? gameState.players[controllingPlayer].id : playerId;
    const player = gameState.players.find((p) => p.id === currentPlayerId);
    if (!player || gameState.phase !== 'setup') return;

    const newHand = [...player.hand];
    const newFaceUp = [...player.faceUp];
    const handCard = newHand[handIndex];
    const faceUpCard = newFaceUp[faceUpIndex];
    if (!handCard || !faceUpCard) {
      return;
    }
    newHand[handIndex] = faceUpCard;
    newFaceUp[faceUpIndex] = handCard;

    const updatedPlayers = gameState.players.map((p) =>
      p.id === currentPlayerId ? { ...p, hand: newHand, faceUp: newFaceUp } : p
    );

    const updatedState = {
      ...gameState,
      players: updatedPlayers,
      lastAction: `${player.name} swapped cards`,
    };

    if (testMode) {
      setGameState(updatedState);
    } else {
      window.storage.set(`game:${roomCode}`, JSON.stringify(updatedState), true);
      setGameState(updatedState);
    }
  };

  const setReady = () => {
    if (!gameState) return;
    const currentPlayerId = testMode ? gameState.players[controllingPlayer].id : playerId;
    const player = gameState.players.find((p) => p.id === currentPlayerId);
    if (!player || gameState.phase !== 'setup') return;

    const updatedPlayers = gameState.players.map((p) =>
      p.id === currentPlayerId ? { ...p, isReady: true } : p
    );

    let updatedState = {
      ...gameState,
      players: updatedPlayers,
      lastAction: `${player.name} is ready`,
    };

    if (updatedPlayers.every((p) => p.isReady)) {
      // Use game logic to determine starting player
      const startPlayer = GameLogic.getStartingPlayer(updatedPlayers);

      updatedState = {
        ...updatedState,
        phase: 'playing',
        currentTurn: startPlayer,
        lastAction: `${updatedPlayers[startPlayer].name} starts!`,
        isFirstTurn: true,
      };
    }

    updateGameState(updatedState);
  };

  // ============================================================================
  // GAMEPLAY ACTIONS
  // ============================================================================

  /**
   * Play selected cards from the current player's hand/face-up/face-down
   */
  const playCards = () => {
    if (!gameState) return;
    const currentPlayerId = testMode ? gameState.players[controllingPlayer].id : playerId;
    const playerIndex = gameState.players.findIndex((p) => p.id === currentPlayerId);
    const player = gameState.players[playerIndex];

    if (!player || gameState.phase !== 'playing' || gameState.currentTurn !== playerIndex) {
      return;
    }

    if (selectedCards.length === 0 && !revealedFaceDown) {
      return alert('Please select a card to play');
    }

    // Determine which source we're playing from
    const cardSource = GameLogic.getAvailableCardSource(player);

    // Use revealed face-down as the selection if none selected
    let selections: CardSelection[] = revealedFaceDown && selectedCards.length === 0
      ? [{ type: 'faceDown', index: revealedFaceDown.index }]
      : [...selectedCards];

    // Discard animations removed: no DOM position capture needed

    // Check if this is a mixed hand+face-up play (final hand cards with matching face-up)
    const hasMixedSelection =
      selections.some((s) => s.type === 'hand') &&
      selections.some((s) => s.type === 'faceUp');

    // Validate mixed plays only happen when deck is empty and emptying hand
    if (hasMixedSelection) {
      if (gameState.deck.length > 0) {
        return alert('You can only combine hand and face-up cards when the deck is empty');
      }
      if (cardSource !== 'hand') {
        return alert('You can only combine hand and face-up cards when playing from your hand');
      }
      const handSelected = selections
        .filter((s) => s.type === 'hand')
        .map((s) => player.hand[s.index])
        .filter((c): c is CardType => c !== null);
      const faceUpSelected = selections
        .filter((s) => s.type === 'faceUp')
        .map((s) => player.faceUp[s.index])
        .filter((c): c is CardType => c !== null);
      const ok = GameLogic.canPlayMixedSources(
        gameState.deck.length,
        handSelected,
        faceUpSelected,
        gameState.discardPile
      );
      if (!ok) {
        return alert('You can only combine hand and face-up cards with matching ranks when the deck is empty');
      }
    }

    // Get the actual card objects based on selection
    const cardsToPlay = selections
      .map((selection) => {
        if (selection.type === 'hand') return player.hand[selection.index];
        if (selection.type === 'faceUp') return player.faceUp[selection.index];
        if (selection.type === 'faceDown') return player.faceDown[selection.index];
        return null;
      })
      .filter((card): card is CardType => card !== null);

    // First turn validation - pile is empty AND this is the very start of the game
    // (not just empty because someone picked up)
    const isVeryFirstTurn = gameState.isFirstTurn;
    if (isVeryFirstTurn) {
      // Determine what the valid starting card should be
      const startingCard = GameLogic.getStartingCard(player);
      if (!startingCard) {
        console.log('Player hand:', player.hand);
        return alert('You must have the starting card to play first. Check console for your hand.');
      }

      console.log('Starting card:', startingCard);
      console.log('Cards to play:', cardsToPlay);

      // All cards played must match the starting card rank (any color allowed)
      const allCardsMatch = cardsToPlay.every((card) => card.rank === startingCard.rank);

      if (!allCardsMatch) {
        console.log('Cards do not match. Starting card:', startingCard, 'Cards to play:', cardsToPlay);
        return alert(`First turn: you can only play ${startingCard.rank}s`);
      }
    }

    // For face-down cards, we play blind
    const isBlindPlay = selections[0].type === 'faceDown' && !revealedFaceDown;

    // CRITICAL: Reorder hand array to match current visual sort order
    // This makes the current sorted view the new "original" for stable positions
    if (cardSource === 'hand' && handSortMode !== 'original') {
      const compactHand = player.hand
        .map((card, arrayIndex) => ({ card, arrayIndex }))
        .filter((item): item is { card: CardType; arrayIndex: number } => item.card !== null);

      let sortedHand = [...compactHand];

      if (handSortMode === 'rank') {
        sortedHand.sort((a, b) => {
          const rankA = RANK_VALUES[a.card.rank] || 0;
          const rankB = RANK_VALUES[b.card.rank] || 0;
          const rankDiff = rankA - rankB;
          if (rankDiff !== 0) return rankDiff;
          return a.card.suit.localeCompare(b.card.suit);
        });
      } else if (handSortMode === 'suit') {
        sortedHand.sort((a, b) => {
          const suitOrder = { '♠': 0, '♥': 1, '♣': 2, '♦': 3 };
          const suitDiff = suitOrder[a.card.suit as keyof typeof suitOrder] - suitOrder[b.card.suit as keyof typeof suitOrder];
          if (suitDiff !== 0) return suitDiff;
          const rankA = RANK_VALUES[a.card.rank] || 0;
          const rankB = RANK_VALUES[b.card.rank] || 0;
          return rankA - rankB;
        });
      }

      // Rebuild hand array in sorted order
      player.hand = sortedHand.map(item => item.card);

      // Update selected card indices to match new positions
      selectedCards.forEach(sel => {
        if (sel.type === 'hand') {
          // Find new position of this card in sorted array
          const newIndex = sortedHand.findIndex(item => item.arrayIndex === sel.index);
          if (newIndex >= 0) {
            sel.index = newIndex;
          }
        }
      });

      // Switch to original mode since we just made this the new baseline
      setHandSortMode('original');

      // Rebuild selections after reordering indices
      selections = revealedFaceDown && selectedCards.length === 0
        ? [{ type: 'faceDown', index: revealedFaceDown.index }]
        : [...selectedCards];
    }


    // Validate the play (unless it's blind)
    if (!isBlindPlay && !GameLogic.canPlayMultipleCards(cardsToPlay, gameState.discardPile)) {
      return alert('Those cards cannot be played on the current pile');
    }

    // Remove cards from player's sources
    const updatedPlayer = { ...player };

    // Separate hand and face-up indices for proper removal
    const handIndices = selections
      .filter((s) => s.type === 'hand')
      .map((s) => s.index)
      .sort((a, b) => b - a);
    const faceUpIndices = selections
      .filter((s) => s.type === 'faceUp')
      .map((s) => s.index)
      .sort((a, b) => b - a);
    const faceDownIndices = selections
      .filter((s) => s.type === 'faceDown')
      .map((s) => s.index)
      .sort((a, b) => b - a);

    // Remove from hand - set to null instead of splicing
    for (const index of handIndices) {
      updatedPlayer.hand[index] = null;
    }

    // Remove from face-up - set to null to preserve positions
    for (const index of faceUpIndices) {
      updatedPlayer.faceUp[index] = null;
    }

    // Remove from face-down - set to null to preserve positions
    for (const index of faceDownIndices) {
      updatedPlayer.faceDown[index] = null;
    }

    // For blind plays, check if valid after revealing
    if (isBlindPlay) {
      if (!GameLogic.canPlayMultipleCards(cardsToPlay, gameState.discardPile)) {
        // Invalid blind play - pick up the pile plus the cards played
        // Fill hand from left with cards
        const newCards = [...cardsToPlay, ...gameState.discardPile];
        let handIndex = 0;
        for (const card of newCards) {
          if (handIndex < updatedPlayer.hand.length) {
            if (updatedPlayer.hand[handIndex] === null) {
              updatedPlayer.hand[handIndex] = card;
              handIndex++;
            } else {
              handIndex++;
              // Find next null slot
              while (handIndex < updatedPlayer.hand.length && updatedPlayer.hand[handIndex] !== null) {
                handIndex++;
              }
              if (handIndex < updatedPlayer.hand.length) {
                updatedPlayer.hand[handIndex] = card;
                handIndex++;
              } else {
                // Extend array if needed
                updatedPlayer.hand.push(card);
                handIndex++;
              }
            }
          } else {
            updatedPlayer.hand.push(card);
            handIndex++;
          }
        }

        const updatedPlayers = gameState.players.map((p, i) =>
          i === playerIndex ? updatedPlayer : p
        );

        const nextTurn = GameLogic.getNextPlayer(playerIndex, updatedPlayers);

        const updatedState = {
          ...gameState,
          players: updatedPlayers,
          discardPile: [],
          currentTurn: nextTurn,
          lastAction: `${player.name} played ${cardsToPlay[0].rank} blind - invalid! Picked up pile.`,
        };

        updateGameState(updatedState);
        setSelectedCards([]);
        setRevealedFaceDown(null);
        return;
      }
    }

    // Valid play - add cards to discard pile immediately (no animation)

    let newDiscardPile = [...gameState.discardPile, ...cardsToPlay];
    let newBurnPile = [...gameState.burnPile];

    // Check if pile should burn
    const burned = GameLogic.shouldBurnPile(newDiscardPile);
    const playResult = GameLogic.getPlayResult(cardsToPlay, newDiscardPile);

    // If burned, move entire pile to burn pile
    if (burned) {
      newBurnPile = [...newBurnPile, ...newDiscardPile];
      newDiscardPile = [];
    }

    // Draw cards if needed (before checking win condition)
    const cardsToDraw = GameLogic.getCardsToDrawCount(updatedPlayer, gameState.deck.length);
    const drawnCards = cardsToDraw > 0 ? gameState.deck.slice(0, cardsToDraw) : [];

    // Track which indices in the hand array are null (empty slots)
    const emptyIndices: number[] = [];
    for (let i = 0; i < updatedPlayer.hand.length; i++) {
      if (updatedPlayer.hand[i] === null) {
        emptyIndices.push(i);
      }
    }

    // Check if player won
    const playerWon = GameLogic.hasPlayerWon(updatedPlayer);

    // Update players array
    const updatedPlayers = gameState.players.map((p, i) => (i === playerIndex ? updatedPlayer : p));

    // Determine next turn (same player if burned, otherwise next)
    const nextTurn = burned ? playerIndex : GameLogic.getNextPlayer(playerIndex, updatedPlayers);
    console.log('Turn change:', { from: playerIndex, to: nextTurn, burned, playerCount: updatedPlayers.length });

    // Check if game is over
    const gameOver = GameLogic.isGameOver(updatedPlayers);

    let lastAction = `${player.name}: ${playResult.message}`;
    if (cardsToDraw > 0) {
      lastAction += ` Drew ${cardsToDraw} card${cardsToDraw > 1 ? 's' : ''}.`;
    }
    if (playerWon) {
      lastAction += ` ${player.name} has finished!`;
      
      // Calculate placement (how many players have finished before this one)
      const finishedPlayers = updatedPlayers.filter(p => GameLogic.hasPlayerWon(p));
      const placement = finishedPlayers.length;
      
      // Show celebration modal for this player
      setCelebrationModal({
        show: true,
        playerName: player.name,
        isShithead: false,
        placement
      });
      
      // Auto-hide after 3 seconds
      setTimeout(() => setCelebrationModal(null), 3000);
    }
    if (gameOver) {
      const losers = updatedPlayers.filter((p) => !GameLogic.hasPlayerWon(p));
      lastAction = `Game Over! ${losers[0].name} is the Sh!thead! 💩`;
      
      // Show Sh!thead modal for the loser
      const totalPlayers = updatedPlayers.length;
      setCelebrationModal({
        show: true,
        playerName: losers[0].name,
        isShithead: true,
        placement: totalPlayers
      });
      
      // Auto-hide after 4 seconds (give them time to feel the shame 😄)
      setTimeout(() => setCelebrationModal(null), 4000);
    }

    const updatedState: GameState = {
      ...gameState,
      players: updatedPlayers,
      discardPile: newDiscardPile,
      burnPile: newBurnPile,
      deck: gameState.deck.slice(cardsToDraw),
      currentTurn: nextTurn,
      phase: gameOver ? 'finished' : 'playing',
      lastAction,
      isFirstTurn: false,
    };

    // If drawing cards, trigger draw animation
    if (drawnCards.length > 0) {
      // Get deck position
      const deckElement = document.querySelector('.draw-pile-card');
      let deckPos = { x: window.innerWidth / 2, y: 100 };
      if (deckElement) {
        const deckRect = deckElement.getBoundingClientRect();
        deckPos = { x: deckRect.left + deckRect.width / 2, y: deckRect.top + deckRect.height / 2 };
      }

      // Set drawing cards to trigger empty slot rendering
      setDrawingCards(drawnCards.map((card, i) => ({
        card,
        id: `draw-${card.id}-${Date.now()}-${i}`,
        targetPos: { x: 0, y: 0 },
        startPos: deckPos
      })));

      // Update state WITHOUT filling cards yet
      flushSync(() => {
        updateGameState(updatedState);
      });

      // Query slot positions after render
      setTimeout(() => {
        const handContainer = document.querySelector('.hand-area');
        const slots = handContainer?.querySelectorAll('[data-empty-slot]');

        const drawnCardsWithPositions = drawnCards.map((card, index) => {
          let targetPos = { x: window.innerWidth / 2, y: window.innerHeight - 200 };

          if (slots && index < slots.length) {
            const slotRect = (slots[index] as HTMLElement).getBoundingClientRect();
            targetPos = { x: slotRect.left + slotRect.width / 2, y: slotRect.top + slotRect.height / 2 };
          }

          return {
            card,
            id: `draw-${card.id}-${Date.now()}-${index}`,
            targetPos,
            startPos: deckPos
          };
        });

        setDrawingCards(drawnCardsWithPositions);

        // After animation completes, fill cards
        setTimeout(() => {
          for (let i = 0; i < drawnCards.length && i < emptyIndices.length; i++) {
            const arrayIndex = emptyIndices[i];
            updatedPlayer.hand[arrayIndex] = drawnCards[i];
          }
          for (let i = emptyIndices.length; i < drawnCards.length; i++) {
            updatedPlayer.hand.push(drawnCards[i]);
          }

          const finalPlayers = gameState.players.map((p, i) => (i === playerIndex ? updatedPlayer : p));
          const finalState = { ...updatedState, players: finalPlayers };

          updateGameState(finalState);
          setDrawingCards([]);
        }, 700);
      }, 10);

      setSelectedCards([]);
      setRevealedFaceDown(null);
    } else {
      updateGameState(updatedState);
      setSelectedCards([]);
      setRevealedFaceDown(null);
    }
  };

  const pickUpPile = () => {
    if (!gameState) return;
    const currentPlayerId = testMode ? gameState.players[controllingPlayer].id : playerId;
    const playerIndex = gameState.players.findIndex((p) => p.id === currentPlayerId);
    const player = gameState.players[playerIndex];

    if (!player || gameState.phase !== 'playing' || gameState.currentTurn !== playerIndex) {
      return;
    }

    if (gameState.discardPile.length === 0) {
      return alert('The pile is empty - you must play a card');
    }

    // Determine if pickup should be confirmed based on available plays
    let effectiveRevealed: CardType | null = null;
    if (revealedFaceDown) {
      if (gameState.isFirstTurn) {
        const startingCard = GameLogic.getStartingCard(player);
        effectiveRevealed = startingCard && revealedFaceDown.card.rank === startingCard.rank ? revealedFaceDown.card : null;
      } else {
        effectiveRevealed = revealedFaceDown.card;
      }
    }

    if (GameLogic.shouldConfirmPickUp(player, gameState.discardPile, effectiveRevealed)) {
      // Player has valid cards - ask for confirmation
      setPickUpConfirmation({ show: true, playerIndex });
      return;
    }

    // Player has no valid cards - proceed with pickup
    confirmPickUpPile(playerIndex);
  };

  const confirmPickUpPile = (playerIndex: number) => {
    if (!gameState) return;
    const player = gameState.players[playerIndex];

    // Add all discard pile cards to player's hand
    // Fill null slots first, then extend array
    const updatedHand = [...player.hand];
    const cardsToAdd = [...gameState.discardPile];

    // If a face-down card was revealed, add it to hand and remove from face-down
    let newFaceDown = [...player.faceDown];
    if (revealedFaceDown) {
      cardsToAdd.unshift(revealedFaceDown.card);
      if (revealedFaceDown.index >= 0 && revealedFaceDown.index < newFaceDown.length) {
        newFaceDown[revealedFaceDown.index] = null; // Set to null to preserve positions
      }
    }

    let addIndex = 0;
    // Fill null slots
    for (let i = 0; i < updatedHand.length && addIndex < cardsToAdd.length; i++) {
      if (updatedHand[i] === null) {
        updatedHand[i] = cardsToAdd[addIndex];
        addIndex++;
      }
    }
    // Extend array with remaining cards
    while (addIndex < cardsToAdd.length) {
      updatedHand.push(cardsToAdd[addIndex]);
      addIndex++;
    }

    const updatedPlayer = {
      ...player,
      hand: updatedHand,
      faceDown: newFaceDown,
    };

    const updatedPlayers = gameState.players.map((p, i) => (i === playerIndex ? updatedPlayer : p));

    const nextTurn = GameLogic.getNextPlayer(playerIndex, updatedPlayers);

    const updatedState = {
      ...gameState,
      players: updatedPlayers,
      discardPile: [],
      currentTurn: nextTurn,
      lastAction: `${player.name} picked up ${gameState.discardPile.length} cards from the pile`,
    };

    updateGameState(updatedState);
    setSelectedCards([]);
    setRevealedFaceDown(null);
  };

  // Stable updater via hook (respects test mode and storage persistence)
  const updateGameState = useGameStateUpdater(testMode, roomCode, setGameState);

  if (screen === 'menu') {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900 flex items-center justify-center p-4">
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
                value={roomCode}
                onChange={(e) => setRoomCode(e.target.value.toUpperCase())}
                className="flex-1 px-4 py-3 bg-slate-700 border-2 border-slate-600 rounded-lg text-white placeholder-slate-400 focus:outline-none focus:border-purple-500"
              />
              <button
                onClick={joinRoom}
                disabled={!playerName.trim() || !roomCode.trim()}
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

  if (screen === 'lobby') {
    const isHost = gameState?.host === playerId;

    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900 flex items-center justify-center p-4">
        <div className="max-w-2xl w-full bg-slate-800 rounded-2xl shadow-2xl p-8 border-2 border-purple-500">
          <div className="text-center mb-6">
            <h1 className="text-4xl font-black text-transparent bg-clip-text bg-gradient-to-r from-pink-500 to-purple-500 mb-4">
              Game Lobby
            </h1>
            <div className="flex items-center justify-center gap-2 mb-2">
              <span className="text-slate-400">Room Code:</span>
              <span className="text-2xl font-mono font-bold text-purple-400">{roomCode}</span>
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
                  {player.id === gameState.host && <Crown size={20} className="text-yellow-400" />}
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
              disabled={gameState?.players.length < 2}
              className="w-full bg-gradient-to-r from-pink-500 to-purple-500 text-white font-bold py-4 rounded-lg hover:from-pink-600 hover:to-purple-600 transition-all disabled:opacity-50 disabled:cursor-not-allowed text-lg"
            >
              {gameState?.players.length < 2 ? 'Waiting for players...' : 'Start Game'}
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

  if (screen === 'game' && gameState) {
    const currentPlayerId = testMode ? gameState.players[controllingPlayer].id : playerId;
    const currentPlayer = gameState.players.find((p) => p.id === currentPlayerId);
    const isMyTurn =
      gameState.phase === 'playing' &&
      gameState.players[gameState.currentTurn]?.id === currentPlayerId;
    const isSetupPhase = gameState.phase === 'setup';

    return (
      <>
        <div
          className="min-h-screen bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900 p-4"
          onClick={(e) => {
            // Deselect cards when clicking anywhere outside of cards during setup phase
            if (isSetupPhase) {
              const target = e.target as HTMLElement;
              // Check if click is NOT on a card (cards have specific class names or are inside card containers)
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
                  <p className="text-sm text-slate-400">Room: {testMode ? 'TEST' : roomCode}</p>
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

              <div className="mt-2 text-sm text-purple-300 bg-slate-700 rounded p-2">
                {gameState.lastAction}
              </div>

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

                  {/* Two column layout: Table on left, Piles on right */}
                  <div className="grid grid-cols-[auto_1fr] gap-8 mb-4">
                    {/* Left column: Table (Face Down underneath Face Up) */}
                    <Table
                      gameState={gameState}
                      currentPlayerId={currentPlayerId}
                      currentPlayer={currentPlayer}
                      isSetupPhase={isSetupPhase}
                      isMyTurn={isMyTurn}
                      selectedCards={selectedCards}
                      setSelectedCards={setSelectedCards}
                      revealedFaceDown={revealedFaceDown}
                      setRevealedFaceDown={setRevealedFaceDown}
                      swapCards={swapCards}
                      updateGameState={updateGameState}
                    />

                    {/* Right column: Piles - Fixed grid layout to prevent shifting */}
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
                      currentPlayerId={currentPlayerId}
                      swapCards={swapCards}
                      drawingCards={drawingCards}
                      updateGameState={updateGameState}
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
                            const count = revealedFaceDown && selectedCards.length === 0 ? 1 : selectedCards.length;
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
                gameState.phase === 'playing' &&
                gameState.players[gameState.currentTurn]?.id === player.id;
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
                    {isTheirTurn && (
                      <div className="w-2 h-2 bg-yellow-500 rounded-full animate-pulse" />
                    )}
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
          )
        }

        {/* Discard animations removed */}

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
                    onClick={() => {
                      if (pickUpConfirmation) {
                        confirmPickUpPile(pickUpConfirmation.playerIndex);
                        setPickUpConfirmation(null);
                      }
                    }}
                    className="flex-1 px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg font-semibold transition-colors"
                  >
                    Pick Up Anyway
                  </button>
                </div>
              </div>
            </div>,
            document.body
          )
        }

        {celebrationModal?.show &&
          createPortal(
            <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50">
              {celebrationModal.isShithead ? (
                <div className="celebration-modal bg-gradient-to-br from-red-600 to-pink-600 text-white px-12 py-8 rounded-2xl shadow-2xl border-4 border-slate-800 text-center max-w-md">
                  <div className="text-7xl mb-4 celebration-emoji-pulse">💩</div>
                  <div className="text-5xl font-black mb-3">SH!THEAD!</div>
                  <div className="text-2xl opacity-90">{celebrationModal.playerName} is the loser!</div>
                </div>
              ) : (
                <div className="celebration-modal bg-gradient-to-br from-purple-600 to-pink-600 text-white px-12 py-8 rounded-2xl shadow-2xl border-4 border-yellow-400 text-center max-w-md">
                  <div className="text-7xl mb-4 celebration-emoji">👑</div>
                  <div className="text-4xl font-black mb-3">SAFE!</div>
                  <div className="text-2xl mb-2">{celebrationModal.playerName} finished!</div>
                  <div className="text-lg opacity-90">
                    {celebrationModal.placement === 1 ? '1st' : celebrationModal.placement === 2 ? '2nd' : celebrationModal.placement === 3 ? '3rd' : `${celebrationModal.placement}th`} place
                  </div>
                </div>
              )}
            </div>,
            document.body
          )
        }
      </>
    );
  }

  return null;
}
