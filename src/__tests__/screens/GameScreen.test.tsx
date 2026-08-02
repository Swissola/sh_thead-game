import { describe, it, expect, vi, beforeEach } from 'vitest';
import { useCallback, useEffect, useRef, useState } from 'react';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import '../../storage';
import { GameProvider, useGameContext } from '../../context/GameContext';
import { GameScreen } from '../../screens/GameScreen';
import { Toast } from '../../components/Toast';
import * as supabaseClientModule from '../../supabase/client';
import { buildGameState, buildPlayer, buildCard } from '../testUtils/buildGameState';
import { TURN_GRACE_MS } from '../../supabase/roomTypes';

// The hook's own timing/invocation behaviour is covered exhaustively by
// useTurnTimeoutSweep.test.ts - mocking it here keeps these assertions about
// GameScreen's rendering, not re-testing interval arithmetic (plan 02-12).
vi.mock('../../hooks/useTurnTimeoutSweep', () => ({
  useTurnTimeoutSweep: vi.fn(() => ({ graceExpired: false })),
}));
import { useTurnTimeoutSweep } from '../../hooks/useTurnTimeoutSweep';

/** Seeds gameState via the context's setGameState in an effect on mount. */
function SeedGameState({ state }: { state: ReturnType<typeof buildGameState> }) {
  const { setGameState } = useGameContext();
  useEffect(() => {
    setGameState(state);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return null;
}

/** Flips the context's testMode flag on mount - used to exercise Test Mode's
 * "no offline badges" behaviour without going through MenuScreen's UI. */
function SetTestMode({ value }: { value: boolean }) {
  const { setTestMode } = useGameContext();
  useEffect(() => {
    setTestMode(value);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return null;
}

/** Renders the real Toast component wired to context state, so reconnect-toast
 * assertions prove an actual showToast call rather than mocking it. */
function ToastProbe() {
  const { toast, dismissToast } = useGameContext();
  return <Toast toast={toast} onDismiss={dismissToast} />;
}

/**
 * Exposes context state as text so assertions can observe the result of
 * GameScreen's dispatched moves without mocking dispatchMove itself - every
 * assertion in this file proves a real applyMove round-trip, per D-12.
 */
function Probe() {
  const { gameState } = useGameContext();
  if (!gameState) return <div data-testid="probe">phase:none</div>;
  const top = gameState.discardPile[gameState.discardPile.length - 1];
  return (
    <div data-testid="probe">
      phase:{gameState.phase} discardCount:{gameState.discardPile.length} discardTop:
      {top ? `${top.rank}${top.suit}` : 'none'} players:
      {gameState.players
        .map((p) => `${p.name}(ready:${p.isReady},hand:${p.hand.filter((c) => c !== null).length})`)
        .join(',')}
    </div>
  );
}

function renderGame(
  playerId: string,
  state: ReturnType<typeof buildGameState>,
  options: {
    isPlayerOffline?: (id: string) => boolean;
    consumeJustReconnected?: () => boolean;
    testMode?: boolean;
  } = {}
) {
  return render(
    <GameProvider playerId={playerId}>
      <SeedGameState state={state} />
      {options.testMode && <SetTestMode value />}
      <GameScreen
        isPlayerOffline={options.isPlayerOffline}
        consumeJustReconnected={options.consumeJustReconnected}
      />
      <ToastProbe />
      <Probe />
    </GameProvider>
  );
}

describe('GameScreen', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('renders the board (Table and Hand) for the current player', async () => {
    const state = buildGameState({
      phase: 'setup',
      players: [
        buildPlayer({
          id: 'test-player',
          name: 'Alice',
          hand: [buildCard({ id: 'hand-0', rank: '5', suit: '♠' })],
          faceUp: [buildCard({ id: 'faceup-0', rank: '6', suit: '♥' })],
          faceDown: [buildCard({ id: 'facedown-0', rank: '7', suit: '♦' })],
        }),
        buildPlayer({ id: 'p1', name: 'Bob' }),
      ],
    });

    const { container } = renderGame('test-player', state);

    expect(await screen.findByText('Table')).toBeInTheDocument();
    expect(screen.getByText('Hand')).toBeInTheDocument();
    expect(container.querySelector('[data-card-key="hand-0"]')).toBeInTheDocument();
  });

  it('clicking a selectable hand card during setup phase results in a selection-state DOM change (D-12)', async () => {
    const state = buildGameState({
      phase: 'setup',
      players: [
        buildPlayer({
          id: 'test-player',
          name: 'Alice',
          hand: [
            buildCard({ id: 'hand-0', rank: '5', suit: '♠' }),
            buildCard({ id: 'hand-1', rank: '6', suit: '♥' }),
          ],
        }),
        buildPlayer({ id: 'p1', name: 'Bob' }),
      ],
    });

    const { container } = renderGame('test-player', state);
    await screen.findByText('Hand');

    const cardEl = container.querySelector('[data-card-key="hand-0"]')
      ?.firstElementChild as HTMLElement;
    expect(cardEl.className).not.toContain('ring-yellow-400');

    fireEvent.click(cardEl);

    await waitFor(() => {
      expect(cardEl.className).toContain('ring-yellow-400');
    });
  });

  it('clicking "Play" with a valid selection dispatches PLAY_CARDS and updates the discard pile', async () => {
    const state = buildGameState({
      phase: 'playing',
      isFirstTurn: false,
      currentTurn: 0,
      deck: [],
      discardPile: [buildCard({ id: 'discard-0', rank: '4', suit: '♣' })],
      players: [
        buildPlayer({
          id: 'test-player',
          name: 'Alice',
          hand: [
            buildCard({ id: 'hand-0', rank: '5', suit: '♠' }),
            buildCard({ id: 'hand-1', rank: '6', suit: '♥' }),
          ],
        }),
        buildPlayer({
          id: 'p1',
          name: 'Bob',
          hand: [buildCard({ id: 'bob-0', rank: '9', suit: '♦' })],
        }),
      ],
    });

    const { container } = renderGame('test-player', state);
    await screen.findByText('Hand');

    const cardEl = container.querySelector('[data-card-key="hand-0"]')
      ?.firstElementChild as HTMLElement;
    fireEvent.click(cardEl);
    await waitFor(() => expect(cardEl.className).toContain('ring-yellow-400'));

    fireEvent.click(screen.getByRole('button', { name: /^Play/ }));

    await waitFor(() => {
      expect(screen.getByTestId('probe')).toHaveTextContent('discardCount:2');
      expect(screen.getByTestId('probe')).toHaveTextContent('discardTop:5♠');
    });
  });

  it('clicking "Ready" in setup phase for a not-yet-ready player dispatches READY_UP', async () => {
    const state = buildGameState({
      phase: 'setup',
      players: [
        buildPlayer({ id: 'test-player', name: 'Alice' }),
        buildPlayer({ id: 'p1', name: 'Bob' }),
      ],
    });

    renderGame('test-player', state);

    const readyButton = await screen.findByText('Ready to Play');
    fireEvent.click(readyButton);

    await waitFor(() => {
      expect(screen.getByTestId('probe')).toHaveTextContent('Alice(ready:true');
    });
    expect(await screen.findByText('Ready! Waiting for others...')).toBeInTheDocument();
  });

  it('clicking "Pick Up Pile" dispatches PICK_UP_PILE directly when no confirmation is needed', async () => {
    const state = buildGameState({
      phase: 'playing',
      isFirstTurn: false,
      currentTurn: 0,
      deck: [],
      discardPile: [buildCard({ id: 'discard-0', rank: 'K', suit: '♣' })],
      players: [
        buildPlayer({
          id: 'test-player',
          name: 'Alice',
          hand: [buildCard({ id: 'hand-0', rank: '4', suit: '♠' })],
        }),
        buildPlayer({
          id: 'p1',
          name: 'Bob',
          hand: [buildCard({ id: 'bob-0', rank: '9', suit: '♦' })],
        }),
      ],
    });

    renderGame('test-player', state);

    const pickUpButton = await screen.findByRole('button', { name: /Pick Up Pile/ });
    fireEvent.click(pickUpButton);

    expect(screen.queryByText('Confirm Pick Up')).not.toBeInTheDocument();
    await waitFor(() => {
      expect(screen.getByTestId('probe')).toHaveTextContent('discardCount:0');
    });
  });

  it('clicking "Pick Up Pile" opens the confirmation modal when a valid play exists, and "Pick Up Anyway" dispatches PICK_UP_PILE', async () => {
    const state = buildGameState({
      phase: 'playing',
      isFirstTurn: false,
      currentTurn: 0,
      deck: [],
      discardPile: [buildCard({ id: 'discard-0', rank: '5', suit: '♣' })],
      players: [
        buildPlayer({
          id: 'test-player',
          name: 'Alice',
          hand: [buildCard({ id: 'hand-0', rank: '6', suit: '♠' })],
        }),
        buildPlayer({
          id: 'p1',
          name: 'Bob',
          hand: [buildCard({ id: 'bob-0', rank: '9', suit: '♦' })],
        }),
      ],
    });

    renderGame('test-player', state);

    const pickUpButton = await screen.findByRole('button', { name: /Pick Up Pile/ });
    fireEvent.click(pickUpButton);

    expect(await screen.findByText('Confirm Pick Up')).toBeInTheDocument();

    fireEvent.click(screen.getByText('Pick Up Anyway'));

    await waitFor(() => {
      expect(screen.queryByText('Confirm Pick Up')).not.toBeInTheDocument();
      expect(screen.getByTestId('probe')).toHaveTextContent('discardCount:0');
    });
  });

  it('playing two same-rank hand cards refills the hand to 3 and shows a ghost card per drawn card (regression: e3f30b3, ab02f0b)', async () => {
    const state = buildGameState({
      phase: 'playing',
      isFirstTurn: false,
      currentTurn: 0,
      deck: [
        buildCard({ id: 'deck-0', rank: '9', suit: '♣' }),
        buildCard({ id: 'deck-1', rank: '10', suit: '♣' }),
      ],
      discardPile: [],
      players: [
        buildPlayer({
          id: 'test-player',
          name: 'Alice',
          hand: [
            buildCard({ id: 'hand-0', rank: '7', suit: '♠' }),
            buildCard({ id: 'hand-1', rank: '7', suit: '♥' }),
            buildCard({ id: 'hand-2', rank: '3', suit: '♣' }),
          ],
        }),
        buildPlayer({
          id: 'p1',
          name: 'Bob',
          hand: [buildCard({ id: 'bob-0', rank: '9', suit: '♦' })],
        }),
      ],
    });

    const { container } = renderGame('test-player', state);
    await screen.findByText('Hand');

    fireEvent.click(
      container.querySelector('[data-card-key="hand-0"]')?.firstElementChild as HTMLElement
    );
    fireEvent.click(
      container.querySelector('[data-card-key="hand-1"]')?.firstElementChild as HTMLElement
    );
    await waitFor(() => {
      const selected = container.querySelectorAll(
        '[data-card-key="hand-0"] .ring-yellow-400, [data-card-key="hand-1"] .ring-yellow-400'
      );
      expect(selected).toHaveLength(2);
    });

    fireEvent.click(screen.getByRole('button', { name: /^Play/ }));

    // Ghost portal reflects the draw prediction synchronously, before the
    // 700ms setTimeout that clears it - checked immediately, no waitFor,
    // to avoid racing the real-timer clear.
    expect(container.ownerDocument.querySelectorAll('.draw-card-ghost')).toHaveLength(2);

    await waitFor(() => {
      expect(screen.getByTestId('probe')).toHaveTextContent('Alice(ready:false,hand:3)');
    });
  });

  it("does not reveal a selected face-down card's rank/suit before Play is clicked (regression: 9f4f0fa)", async () => {
    const state = buildGameState({
      phase: 'playing',
      isFirstTurn: false,
      currentTurn: 0,
      deck: [],
      discardPile: [],
      players: [
        buildPlayer({
          id: 'test-player',
          name: 'Alice',
          hand: [],
          faceUp: [],
          faceDown: [buildCard({ id: 'facedown-0', rank: 'Q', suit: '♦' })],
        }),
        buildPlayer({
          id: 'p1',
          name: 'Bob',
          hand: [buildCard({ id: 'bob-0', rank: '9', suit: '♣' })],
        }),
      ],
    });

    const { container } = renderGame('test-player', state);
    await screen.findByText('Table');

    expect(screen.queryByText('Q')).not.toBeInTheDocument();

    fireEvent.click(
      container.querySelector('[data-facedown-index="0"]')?.firstElementChild as HTMLElement
    );

    await waitFor(() => {
      expect(screen.getByText(/played blind/i)).toBeInTheDocument();
    });
    // The face-down card is selected (Play is enabled) but its identity
    // must still not appear anywhere in the DOM.
    expect(screen.queryByText('Q')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: /^Play/ })).not.toBeDisabled();
  });

  it('clicking two hand cards in setup phase swaps their positions via SWAP_CARDS (D-12)', async () => {
    const state = buildGameState({
      phase: 'setup',
      players: [
        buildPlayer({
          id: 'test-player',
          name: 'Alice',
          hand: [
            buildCard({ id: 'hand-0', rank: '5', suit: '♠' }),
            buildCard({ id: 'hand-1', rank: '6', suit: '♥' }),
          ],
        }),
        buildPlayer({ id: 'p1', name: 'Bob' }),
      ],
    });

    const { container } = renderGame('test-player', state);
    await screen.findByText('Hand');

    const firstCard = container.querySelector('[data-card-key="hand-0"]')
      ?.firstElementChild as HTMLElement;
    const secondCard = container.querySelector('[data-card-key="hand-1"]')
      ?.firstElementChild as HTMLElement;

    fireEvent.click(firstCard);
    await waitFor(() => expect(firstCard.className).toContain('ring-yellow-400'));
    fireEvent.click(secondCard);

    await waitFor(() => {
      const keysInOrder = Array.from(container.querySelectorAll('[data-card-key]')).map((el) =>
        el.getAttribute('data-card-key')
      );
      expect(keysInOrder).toEqual(['hand-1', 'hand-0']);
    });
  });

  it('clicking a hand card then a face-up card in setup phase swaps them via SWAP_CARDS (D-12)', async () => {
    const state = buildGameState({
      phase: 'setup',
      players: [
        buildPlayer({
          id: 'test-player',
          name: 'Alice',
          hand: [buildCard({ id: 'hand-0', rank: '5', suit: '♠' })],
          faceUp: [buildCard({ id: 'faceup-0', rank: '6', suit: '♥' })],
        }),
        buildPlayer({ id: 'p1', name: 'Bob' }),
      ],
    });

    const { container } = renderGame('test-player', state);
    await screen.findByText('Hand');

    const handCard = container.querySelector('[data-card-key="hand-0"]')
      ?.firstElementChild as HTMLElement;
    const faceUpCard = container.querySelector('[data-faceup-index="0"]')
      ?.firstElementChild as HTMLElement;

    fireEvent.click(handCard);
    await waitFor(() => expect(handCard.className).toContain('ring-yellow-400'));
    fireEvent.click(faceUpCard);

    await waitFor(() => {
      expect(container.querySelector('[data-card-key="faceup-0"]')).toBeInTheDocument();
      expect(container.querySelector('[data-faceup-index="0"]')?.textContent).toContain('5');
      expect(container.querySelector('[data-faceup-index="0"]')?.textContent).toContain('♠');
    });
  });

  it('clicking two face-up cards in setup phase swaps them via SWAP_CARDS (D-12)', async () => {
    const state = buildGameState({
      phase: 'setup',
      players: [
        buildPlayer({
          id: 'test-player',
          name: 'Alice',
          faceUp: [
            buildCard({ id: 'faceup-0', rank: '6', suit: '♥' }),
            buildCard({ id: 'faceup-1', rank: '7', suit: '♦' }),
          ],
        }),
        buildPlayer({ id: 'p1', name: 'Bob' }),
      ],
    });

    const { container } = renderGame('test-player', state);
    await screen.findByText('Table');

    const firstFaceUp = container.querySelector('[data-faceup-index="0"]')
      ?.firstElementChild as HTMLElement;
    const secondFaceUp = container.querySelector('[data-faceup-index="1"]')
      ?.firstElementChild as HTMLElement;

    fireEvent.click(firstFaceUp);
    await waitFor(() => expect(firstFaceUp.className).toContain('ring-yellow-400'));
    fireEvent.click(secondFaceUp);

    await waitFor(() => {
      expect(container.querySelector('[data-faceup-index="0"]')?.textContent).toContain('7');
      expect(container.querySelector('[data-faceup-index="0"]')?.textContent).toContain('♦');
      expect(container.querySelector('[data-faceup-index="1"]')?.textContent).toContain('6');
      expect(container.querySelector('[data-faceup-index="1"]')?.textContent).toContain('♥');
    });
  });

  describe('presence-driven offline badge and reconnect toast (D-10, plan 02-12)', () => {
    it('greys out an offline opponent tile with an Offline badge; a connected opponent renders normally', async () => {
      const state = buildGameState({
        phase: 'playing',
        players: [
          buildPlayer({ id: 'test-player', name: 'Alice' }),
          buildPlayer({ id: 'p1', name: 'Bob' }),
          buildPlayer({ id: 'p2', name: 'Charlie' }),
        ],
      });
      const isPlayerOffline = (id: string) => id === 'p1';

      renderGame('test-player', state, { isPlayerOffline });

      const bobTile = (await screen.findByText('Bob')).closest('div.rounded-lg') as HTMLElement;
      expect(bobTile.className).toContain('opacity-60');
      expect(bobTile.className).toContain('border-slate-600');
      expect(within(bobTile).getByText('Offline')).toBeInTheDocument();

      const charlieTile = screen.getByText('Charlie').closest('div.rounded-lg') as HTMLElement;
      expect(charlieTile.className).not.toContain('opacity-60');
      expect(within(charlieTile).queryByText('Offline')).not.toBeInTheDocument();
    });

    it("never shows the offline badge on the local player's own tile, whatever presence reports", async () => {
      const state = buildGameState({
        phase: 'playing',
        players: [
          buildPlayer({ id: 'test-player', name: 'Alice' }),
          buildPlayer({ id: 'p1', name: 'Bob' }),
        ],
      });
      const isPlayerOffline = () => true;

      renderGame('test-player', state, { isPlayerOffline });

      const aliceTile = (await screen.findByText('Alice')).closest('div.rounded-lg') as HTMLElement;
      expect(within(aliceTile).queryByText('Offline')).not.toBeInTheDocument();
    });

    it('shows no offline badge for any tile in Test Mode, even when isPlayerOffline reports true', async () => {
      const state = buildGameState({
        phase: 'playing',
        players: [
          buildPlayer({ id: 'test-player', name: 'Alice' }),
          buildPlayer({ id: 'p1', name: 'Bob' }),
        ],
      });
      const isPlayerOffline = () => true;

      renderGame('test-player', state, { isPlayerOffline, testMode: true });

      // Test Mode's "CONTROL PLAYER" <select> also lists each player's name
      // as an option, so "Bob" is not unique here - wait on that instead.
      await screen.findAllByText('Bob');
      expect(screen.queryByText('Offline')).not.toBeInTheDocument();
    });

    it('does not raise a reconnect toast for a player who is already online at mount', async () => {
      const state = buildGameState({
        phase: 'playing',
        players: [
          buildPlayer({ id: 'test-player', name: 'Alice' }),
          buildPlayer({ id: 'p1', name: 'Bob' }),
        ],
      });
      const isPlayerOffline = () => false;

      renderGame('test-player', state, { isPlayerOffline });

      await screen.findByText('Bob');
      expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    });

    it('raises a "{name} reconnected" toast exactly once when a player transitions from offline to online', async () => {
      const state = buildGameState({
        phase: 'playing',
        players: [
          buildPlayer({ id: 'test-player', name: 'Alice' }),
          buildPlayer({ id: 'p1', name: 'Bob' }),
        ],
      });

      // Mirrors usePresence's real isPlayerOffline (a useCallback keyed on
      // onlinePlayerIds) - a new function reference each time the online
      // set changes, so GameScreen's reconnect effect actually re-runs.
      function Harness() {
        const [offlineIds, setOfflineIds] = useState<string[]>(['p1']);
        const isPlayerOffline = useCallback((id: string) => offlineIds.includes(id), [offlineIds]);
        return (
          <>
            <GameScreen isPlayerOffline={isPlayerOffline} />
            <button onClick={() => setOfflineIds([])}>Clear offline</button>
          </>
        );
      }

      render(
        <GameProvider playerId="test-player">
          <SeedGameState state={state} />
          <Harness />
          <ToastProbe />
          <Probe />
        </GameProvider>
      );

      await screen.findByText('Bob');
      expect(screen.queryByRole('alert')).not.toBeInTheDocument();

      fireEvent.click(screen.getByText('Clear offline'));

      await waitFor(() => {
        expect(screen.getByRole('alert')).toHaveTextContent('Bob reconnected');
      });
      expect(screen.getAllByRole('alert')).toHaveLength(1);
    });

    it("suppresses the reconnect toast when this client's own presence connection just recovered (02-UAT.md test 10), but still reseeds so a later genuine reconnect fires normally", async () => {
      const state = buildGameState({
        phase: 'playing',
        players: [
          buildPlayer({ id: 'test-player', name: 'Alice' }),
          buildPlayer({ id: 'p1', name: 'Bob' }),
        ],
      });

      // Mirrors usePresence's real consumeJustReconnected: a ref-based
      // read-and-clear signal, set true by a "Simulate self-recovery" click
      // (standing in for usePresence's sync-handler flag) and consumed
      // (returned true once, then false) exactly like the real hook.
      function Harness() {
        const [offlineIds, setOfflineIds] = useState<string[]>(['p1']);
        const justReconnectedRef = useRef(false);
        const isPlayerOffline = useCallback((id: string) => offlineIds.includes(id), [offlineIds]);
        const consumeJustReconnected = useCallback(() => {
          if (justReconnectedRef.current) {
            justReconnectedRef.current = false;
            return true;
          }
          return false;
        }, []);
        return (
          <>
            <GameScreen isPlayerOffline={isPlayerOffline} consumeJustReconnected={consumeJustReconnected} />
            <button
              onClick={() => {
                // This client's own presence channel just batch-caught-up
                // Bob's state as a side effect of ITS OWN recovery, not a
                // genuine reconnect by Bob.
                justReconnectedRef.current = true;
                setOfflineIds([]);
              }}
            >
              Simulate self-recovery batch catch-up
            </button>
            <button onClick={() => setOfflineIds(['p1'])}>Bob goes offline</button>
            <button onClick={() => setOfflineIds([])}>Bob genuinely reconnects</button>
          </>
        );
      }

      render(
        <GameProvider playerId="test-player">
          <SeedGameState state={state} />
          <Harness />
          <ToastProbe />
          <Probe />
        </GameProvider>
      );

      await screen.findByText('Bob');
      expect(screen.queryByRole('alert')).not.toBeInTheDocument();

      fireEvent.click(screen.getByText('Simulate self-recovery batch catch-up'));

      // No toast for the suppressed self-recovery pass, even though Bob's
      // tracked offline state genuinely flipped true -> false this render.
      await waitFor(() => {
        expect(screen.queryByRole('alert')).not.toBeInTheDocument();
      });

      // A later, genuine transition (this client's own connection is now
      // stable) must still raise the toast as normal - the suppression must
      // not have permanently disabled the effect.
      fireEvent.click(screen.getByText('Bob goes offline'));
      fireEvent.click(screen.getByText('Bob genuinely reconnects'));

      await waitFor(() => {
        expect(screen.getByRole('alert')).toHaveTextContent('Bob reconnected');
      });
      expect(screen.getAllByRole('alert')).toHaveLength(1);
    });

    it('renders correctly when no isPlayerOffline prop is supplied', async () => {
      const state = buildGameState({
        phase: 'playing',
        players: [
          buildPlayer({ id: 'test-player', name: 'Alice' }),
          buildPlayer({ id: 'p1', name: 'Bob' }),
        ],
      });

      render(
        <GameProvider playerId="test-player">
          <SeedGameState state={state} />
          <GameScreen />
          <Probe />
        </GameProvider>
      );

      await screen.findByText('Bob');
      expect(screen.queryByText('Offline')).not.toBeInTheDocument();
    });
  });

  it('forwards the room configured turnTimeoutMs into useTurnTimeoutSweep (MPLAY-07, plan 02-19)', async () => {
    vi.mocked(useTurnTimeoutSweep).mockReturnValue({ graceExpired: false });
    const state = buildGameState({
      phase: 'playing',
      turnTimeoutMs: 90000,
      players: [
        buildPlayer({ id: 'test-player', name: 'Alice' }),
        buildPlayer({ id: 'p1', name: 'Bob' }),
      ],
    });

    renderGame('test-player', state);

    await screen.findByText('Bob');
    expect(vi.mocked(useTurnTimeoutSweep)).toHaveBeenCalledWith(
      expect.objectContaining({ turnTimeoutMs: 90000 })
    );
  });

  it('forwards TURN_GRACE_MS (the default) when the seeded gameState carries no override', async () => {
    vi.mocked(useTurnTimeoutSweep).mockReturnValue({ graceExpired: false });
    const state = buildGameState({
      phase: 'playing',
      players: [
        buildPlayer({ id: 'test-player', name: 'Alice' }),
        buildPlayer({ id: 'p1', name: 'Bob' }),
      ],
    });

    renderGame('test-player', state);

    await screen.findByText('Bob');
    expect(vi.mocked(useTurnTimeoutSweep)).toHaveBeenCalledWith(
      expect.objectContaining({ turnTimeoutMs: TURN_GRACE_MS })
    );
  });

  describe('grace-period auto-pickup badge state (D-10 state 2, D-05, plan 02-12)', () => {
    beforeEach(() => {
      vi.mocked(useTurnTimeoutSweep).mockReturnValue({ graceExpired: false });
    });

    it('shows the base Offline badge (state 1) when offline but the grace period has not expired', async () => {
      const state = buildGameState({
        phase: 'playing',
        currentTurn: 1,
        players: [
          buildPlayer({ id: 'test-player', name: 'Alice' }),
          buildPlayer({ id: 'p1', name: 'Bob' }),
        ],
      });
      const isPlayerOffline = (id: string) => id === 'p1';

      renderGame('test-player', state, { isPlayerOffline });

      const bobTile = (await screen.findByText('Bob')).closest('div.rounded-lg') as HTMLElement;
      expect(within(bobTile).getByText('Offline')).toBeInTheDocument();
      expect(within(bobTile).queryByText('Offline - auto-picking up')).not.toBeInTheDocument();
    });

    it('replaces the badge in place with "Offline - auto-picking up" once offline, their turn, and grace expired', async () => {
      vi.mocked(useTurnTimeoutSweep).mockReturnValue({ graceExpired: true });
      const state = buildGameState({
        phase: 'playing',
        currentTurn: 1,
        players: [
          buildPlayer({ id: 'test-player', name: 'Alice' }),
          buildPlayer({ id: 'p1', name: 'Bob' }),
        ],
      });
      const isPlayerOffline = (id: string) => id === 'p1';

      renderGame('test-player', state, { isPlayerOffline });

      const bobTile = (await screen.findByText('Bob')).closest('div.rounded-lg') as HTMLElement;
      // Single badge element, replaced in place - not a second badge
      // rendered alongside the first.
      expect(within(bobTile).getAllByText(/Offline/)).toHaveLength(1);
      expect(within(bobTile).getByText('Offline - auto-picking up')).toBeInTheDocument();
      expect(within(bobTile).queryByText('Offline', { exact: true })).not.toBeInTheDocument();
    });

    it('does not upgrade the badge to state 2 when grace has expired but it is not their turn', async () => {
      vi.mocked(useTurnTimeoutSweep).mockReturnValue({ graceExpired: true });
      const state = buildGameState({
        phase: 'playing',
        currentTurn: 0, // Alice's turn, not Bob's
        players: [
          buildPlayer({ id: 'test-player', name: 'Alice' }),
          buildPlayer({ id: 'p1', name: 'Bob' }),
        ],
      });
      const isPlayerOffline = (id: string) => id === 'p1';

      renderGame('test-player', state, { isPlayerOffline });

      const bobTile = (await screen.findByText('Bob')).closest('div.rounded-lg') as HTMLElement;
      expect(within(bobTile).getByText('Offline', { exact: true })).toBeInTheDocument();
      expect(within(bobTile).queryByText('Offline - auto-picking up')).not.toBeInTheDocument();
    });
  });

  describe('Leave Game button and confirm dialog (D-14, plan 02-12)', () => {
    it('renders a Leave Game button in the header for every phase GameScreen renders', async () => {
      for (const phase of ['setup', 'playing', 'finished'] as const) {
        const state = buildGameState({
          phase,
          players: [
            buildPlayer({ id: 'test-player', name: 'Alice' }),
            buildPlayer({ id: 'p1', name: 'Bob' }),
          ],
        });
        const { unmount } = renderGame('test-player', state);

        expect(await screen.findByRole('button', { name: 'Leave Game' })).toBeInTheDocument();

        unmount();
      }
    });

    it('clicking Leave Game opens a confirm dialog titled "Leave game?" with Keep Playing / Leave Game buttons', async () => {
      const state = buildGameState({
        phase: 'playing',
        players: [
          buildPlayer({ id: 'test-player', name: 'Alice' }),
          buildPlayer({ id: 'p1', name: 'Bob' }),
        ],
      });
      renderGame('test-player', state);

      fireEvent.click(await screen.findByRole('button', { name: 'Leave Game' }));

      expect(await screen.findByText('Leave game?')).toBeInTheDocument();
      expect(
        screen.getByText(
          'You can rejoin any time with the same room code - your seat will be waiting.'
        )
      ).toBeInTheDocument();
      expect(screen.getByText('Keep Playing')).toBeInTheDocument();
      // The dialog's confirm button carries literal text "Leave Game" (same
      // copy as the header icon button, which only has an aria-label) -
      // getByText resolves to the dialog button unambiguously.
      expect(screen.getByText('Leave Game')).toBeInTheDocument();
    });

    it('"Keep Playing" closes the dialog and leaves gameState untouched', async () => {
      const state = buildGameState({
        phase: 'playing',
        players: [
          buildPlayer({ id: 'test-player', name: 'Alice' }),
          buildPlayer({ id: 'p1', name: 'Bob' }),
        ],
      });
      renderGame('test-player', state);

      fireEvent.click(await screen.findByRole('button', { name: 'Leave Game' }));
      await screen.findByText('Leave game?');

      fireEvent.click(screen.getByText('Keep Playing'));

      await waitFor(() => {
        expect(screen.queryByText('Leave game?')).not.toBeInTheDocument();
      });
      expect(screen.getByTestId('probe')).toHaveTextContent('phase:playing');
    });

    it('"Leave Game" clears gameState (so the menu can render) and makes zero Edge Function calls', async () => {
      const getClientSpy = vi.spyOn(supabaseClientModule, 'getSupabaseClient');
      const state = buildGameState({
        phase: 'playing',
        players: [
          buildPlayer({ id: 'test-player', name: 'Alice' }),
          buildPlayer({ id: 'p1', name: 'Bob' }),
        ],
      });
      renderGame('test-player', state);

      fireEvent.click(await screen.findByRole('button', { name: 'Leave Game' }));
      await screen.findByText('Leave game?');

      fireEvent.click(screen.getByText('Leave Game'));

      await waitFor(() => {
        expect(screen.getByTestId('probe')).toHaveTextContent('phase:none');
      });
      expect(getClientSpy).not.toHaveBeenCalled();

      getClientSpy.mockRestore();
    });

    it('works identically in Test Mode', async () => {
      const state = buildGameState({
        phase: 'playing',
        players: [
          buildPlayer({ id: 'test-player', name: 'Alice' }),
          buildPlayer({ id: 'p1', name: 'Bob' }),
        ],
      });
      renderGame('test-player', state, { testMode: true });

      fireEvent.click(await screen.findByRole('button', { name: 'Leave Game' }));
      await screen.findByText('Leave game?');
      fireEvent.click(screen.getByText('Leave Game'));

      await waitFor(() => {
        expect(screen.getByTestId('probe')).toHaveTextContent('phase:none');
      });
    });

    it('leaves the pre-existing pick-up confirmation dialog unaffected, keeping its own "Cancel" label', async () => {
      const state = buildGameState({
        phase: 'playing',
        isFirstTurn: false,
        currentTurn: 0,
        deck: [],
        discardPile: [buildCard({ id: 'discard-0', rank: '5', suit: '♣' })],
        players: [
          buildPlayer({
            id: 'test-player',
            name: 'Alice',
            hand: [buildCard({ id: 'hand-0', rank: '6', suit: '♠' })],
          }),
          buildPlayer({
            id: 'p1',
            name: 'Bob',
            hand: [buildCard({ id: 'bob-0', rank: '9', suit: '♦' })],
          }),
        ],
      });

      renderGame('test-player', state);

      const pickUpButton = await screen.findByRole('button', { name: /Pick Up Pile/ });
      fireEvent.click(pickUpButton);

      expect(await screen.findByText('Confirm Pick Up')).toBeInTheDocument();
      expect(screen.getByText('Cancel')).toBeInTheDocument();
    });
  });

  describe('turn announcer live region (RESP-05, D-05)', () => {
    it('is present with role="status" and aria-live="polite" during the playing phase, even before any turn change', async () => {
      const state = buildGameState({
        phase: 'playing',
        currentTurn: 0,
        players: [
          buildPlayer({ id: 'test-player', name: 'Alice' }),
          buildPlayer({ id: 'p1', name: 'Bob' }),
        ],
      });

      renderGame('test-player', state);

      const region = await screen.findByRole('status');
      expect(region).toHaveAttribute('aria-live', 'polite');
    });

    it('is present with empty text during the setup phase - never conditionally unmounted', async () => {
      const state = buildGameState({
        phase: 'setup',
        players: [
          buildPlayer({ id: 'test-player', name: 'Alice' }),
          buildPlayer({ id: 'p1', name: 'Bob' }),
        ],
      });

      renderGame('test-player', state);

      const region = await screen.findByRole('status');
      expect(region).toHaveTextContent('');
    });

    it('announces "Your turn" when currentTurn points at the local player', async () => {
      const state = buildGameState({
        phase: 'playing',
        currentTurn: 0,
        players: [
          buildPlayer({ id: 'test-player', name: 'Alice' }),
          buildPlayer({ id: 'p1', name: 'Bob' }),
        ],
      });

      renderGame('test-player', state);

      await waitFor(() => {
        expect(screen.getByRole('status')).toHaveTextContent('Your turn');
      });
    });

    it("announces \"Bob's turn\" when currentTurn points at another player named Bob", async () => {
      const state = buildGameState({
        phase: 'playing',
        currentTurn: 1,
        players: [
          buildPlayer({ id: 'test-player', name: 'Alice' }),
          buildPlayer({ id: 'p1', name: 'Bob' }),
        ],
      });

      renderGame('test-player', state);

      await waitFor(() => {
        expect(screen.getByRole('status')).toHaveTextContent("Bob's turn");
      });
    });

    it('does not rewrite the announcement text on a re-render that does not change currentTurn', async () => {
      const state = buildGameState({
        phase: 'playing',
        currentTurn: 0,
        lastAction: 'initial',
        players: [
          buildPlayer({ id: 'test-player', name: 'Alice' }),
          buildPlayer({ id: 'p1', name: 'Bob' }),
        ],
      });

      function Harness() {
        const { gameState, setGameState } = useGameContext();
        return (
          <button
            onClick={() => {
              if (!gameState) return;
              void setGameState({ ...gameState, lastAction: 'unrelated update' });
            }}
          >
            Trigger unrelated re-render
          </button>
        );
      }

      render(
        <GameProvider playerId="test-player">
          <SeedGameState state={state} />
          <GameScreen />
          <Harness />
          <Probe />
        </GameProvider>
      );

      await waitFor(() => {
        expect(screen.getByRole('status')).toHaveTextContent('Your turn');
      });

      fireEvent.click(screen.getByText('Trigger unrelated re-render'));

      await waitFor(() => {
        expect(screen.getByTestId('probe')).toHaveTextContent('phase:playing');
      });
      expect(screen.getByText('unrelated update')).toBeInTheDocument();
      expect(screen.getByRole('status')).toHaveTextContent('Your turn');
    });

    it('replaces the announcement text on a real turn transition from index 0 to index 1', async () => {
      const state = buildGameState({
        phase: 'playing',
        currentTurn: 0,
        players: [
          buildPlayer({ id: 'test-player', name: 'Alice' }),
          buildPlayer({ id: 'p1', name: 'Bob' }),
        ],
      });

      function Harness() {
        const { gameState, setGameState } = useGameContext();
        return (
          <button
            onClick={() => {
              if (!gameState) return;
              void setGameState({ ...gameState, currentTurn: 1 });
            }}
          >
            Advance turn
          </button>
        );
      }

      render(
        <GameProvider playerId="test-player">
          <SeedGameState state={state} />
          <GameScreen />
          <Harness />
          <Probe />
        </GameProvider>
      );

      await waitFor(() => {
        expect(screen.getByRole('status')).toHaveTextContent('Your turn');
      });

      fireEvent.click(screen.getByText('Advance turn'));

      await waitFor(() => {
        expect(screen.getByRole('status')).toHaveTextContent("Bob's turn");
      });
    });
  });

  describe('phone-width board reflow (RESP-01, D-09, D-10, D-12, plan 03-07)', () => {
    /** jsdom does not apply Tailwind, so these assert class membership on the
     * reflow-bearing elements rather than real overflow - real overflow
     * verification is plan 03-08's manual checkpoint. */
    function reflowState() {
      return buildGameState({
        phase: 'playing',
        isFirstTurn: false,
        currentTurn: 0,
        deck: [buildCard({ id: 'deck-0', rank: '2', suit: '♣' })],
        discardPile: [buildCard({ id: 'discard-0', rank: '4', suit: '♣' })],
        players: [
          buildPlayer({
            id: 'test-player',
            name: 'Alice',
            hand: [buildCard({ id: 'hand-0', rank: '5', suit: '♠' })],
          }),
          buildPlayer({
            id: 'p1',
            name: 'Bob',
            hand: [buildCard({ id: 'bob-0', rank: '9', suit: '♦' })],
          }),
        ],
      });
    }

    it('stacks Table over the pile cluster below sm via max-sm:grid-cols-1', async () => {
      const { container } = renderGame('test-player', reflowState());
      await screen.findByText('Table');

      const boardGrid = container.querySelector('.grid.grid-cols-\\[auto_1fr\\]');
      expect(boardGrid?.className).toContain('max-sm:grid-cols-1');
      expect(boardGrid?.className).toContain('max-sm:gap-4');
    });

    it('wraps the pile cluster into a flex layout below sm instead of a fixed three-column track', async () => {
      const { container } = renderGame('test-player', reflowState());
      await screen.findByText('Table');

      const pileCluster = container.querySelector('.grid.grid-cols-\\[160px_100px_1fr\\]');
      expect(pileCluster?.className).toContain('max-sm:flex');
      expect(pileCluster?.className).toContain('max-sm:flex-wrap');
      expect(pileCluster?.className).toContain('max-sm:justify-center');
    });

    it('gives each player tile a full row below sm via max-sm:grid-cols-1 on the grid-cols-3 track', async () => {
      const { container } = renderGame('test-player', reflowState());
      await screen.findByText('Bob');

      const tileGrid = container.querySelector('.grid.grid-cols-3');
      expect(tileGrid?.className).toContain('max-sm:grid-cols-1');
    });

    it('stacks the Play / Pick Up Pile buttons full-width below sm via max-sm:flex-col', async () => {
      renderGame('test-player', reflowState());
      await screen.findByText('Table');

      const playButton = screen.getByRole('button', { name: /^Play/ });
      const buttonRow = playButton.closest('.flex.gap-3');
      expect(buttonRow?.className).toContain('max-sm:flex-col');
    });

    it("replaces the discard pile's fixed 160px inline width with responsive w-40/max-sm:w-32 classes, keeping the draw-animation selectors", async () => {
      const { container } = renderGame('test-player', reflowState());
      await screen.findByText('Table');

      const discardCards = container.querySelector('.discard-pile-cards');
      expect(discardCards).not.toHaveStyle({ width: '160px' });
      expect(discardCards?.className).toContain('w-40');
      expect(discardCards?.className).toContain('max-sm:w-32');
      expect(container.querySelector('.discard-pile-area')).toBeInTheDocument();
      expect(container.querySelector('.draw-pile-card')).toBeInTheDocument();
    });

    it('recovers horizontal room at phone width via p-3 sm:p-6 / p-3 sm:p-4 on the header and board containers', async () => {
      const { container } = renderGame('test-player', reflowState());
      await screen.findByText('Table');

      const boardContainer = screen.getByText("Alice's Cards").closest('.bg-slate-800.rounded-xl');
      expect(boardContainer?.className).toContain('p-3');
      expect(boardContainer?.className).toContain('sm:p-6');

      const headerContainer = container.querySelector('.border-purple-500.p-3.sm\\:p-4');
      expect(headerContainer).toBeInTheDocument();
    });
  });

  describe('44px control sizing on the game screen (RESP-03, plan 03-07 Task 2)', () => {
    it('Test 1: the Rules and Leave Game header buttons both carry min-h-11 and min-w-11', async () => {
      const state = buildGameState({
        phase: 'playing',
        players: [
          buildPlayer({ id: 'test-player', name: 'Alice' }),
          buildPlayer({ id: 'p1', name: 'Bob' }),
        ],
      });
      renderGame('test-player', state);

      const rulesButton = await screen.findByTitle('Rules');
      const leaveButton = screen.getByRole('button', { name: 'Leave Game' });
      expect(rulesButton.className).toContain('min-h-11');
      expect(rulesButton.className).toContain('min-w-11');
      expect(leaveButton.className).toContain('min-h-11');
      expect(leaveButton.className).toContain('min-w-11');
    });

    it("Test 2: the celebration modal's aria-label=\"Dismiss\" button carries min-h-11 and min-w-11", async () => {
      const state = buildGameState({
        phase: 'playing',
        currentTurn: 0,
        deck: [],
        discardPile: [],
        players: [
          buildPlayer({
            id: 'test-player',
            name: 'Alice',
            hand: [buildCard({ id: 'hand-0', rank: '5', suit: '♠' })],
          }),
          buildPlayer({
            id: 'p1',
            name: 'Bob',
            hand: [buildCard({ id: 'bob-0', rank: '9', suit: '♦' })],
          }),
        ],
      });

      function TriggerHarness() {
        const { gameState, setGameState } = useGameContext();
        return (
          <button
            onClick={() => {
              if (!gameState) return;
              const players = gameState.players.map((p, i) =>
                i === 1 ? { ...p, hand: [], faceUp: [], faceDown: [] } : p
              );
              void setGameState({ ...gameState, players });
            }}
          >
            Finish player 1
          </button>
        );
      }

      render(
        <GameProvider playerId="test-player">
          <SeedGameState state={state} />
          <GameScreen />
          <TriggerHarness />
          <Probe />
        </GameProvider>
      );

      await screen.findByText('Hand');
      fireEvent.click(screen.getByRole('button', { name: 'Finish player 1' }));

      const dismissButton = await screen.findByRole('button', { name: 'Dismiss' });
      expect(dismissButton.className).toContain('min-h-11');
      expect(dismissButton.className).toContain('min-w-11');
    });

    it("Test 3: the celebration modal's Dismiss button is still the element that receives focus when the dialog opens - the resize did not change the focusable order", async () => {
      const state = buildGameState({
        phase: 'playing',
        currentTurn: 0,
        deck: [],
        discardPile: [],
        players: [
          buildPlayer({
            id: 'test-player',
            name: 'Alice',
            hand: [buildCard({ id: 'hand-0', rank: '5', suit: '♠' })],
          }),
          buildPlayer({
            id: 'p1',
            name: 'Bob',
            hand: [buildCard({ id: 'bob-0', rank: '9', suit: '♦' })],
          }),
        ],
      });

      function TriggerHarness() {
        const { gameState, setGameState } = useGameContext();
        return (
          <button
            onClick={() => {
              if (!gameState) return;
              const players = gameState.players.map((p, i) =>
                i === 1 ? { ...p, hand: [], faceUp: [], faceDown: [] } : p
              );
              void setGameState({ ...gameState, players });
            }}
          >
            Finish player 1
          </button>
        );
      }

      render(
        <GameProvider playerId="test-player">
          <SeedGameState state={state} />
          <GameScreen />
          <TriggerHarness />
          <Probe />
        </GameProvider>
      );

      await screen.findByText('Hand');
      fireEvent.click(screen.getByRole('button', { name: 'Finish player 1' }));

      await waitFor(() => {
        expect(document.activeElement).toHaveAttribute('aria-label', 'Dismiss');
      });
    });

    it('Test 4: the leave-game confirmation\'s "Keep Playing" and "Leave Game" buttons both carry min-h-11', async () => {
      const state = buildGameState({
        phase: 'playing',
        players: [
          buildPlayer({ id: 'test-player', name: 'Alice' }),
          buildPlayer({ id: 'p1', name: 'Bob' }),
        ],
      });
      renderGame('test-player', state);

      fireEvent.click(await screen.findByRole('button', { name: 'Leave Game' }));
      await screen.findByText('Leave game?');

      expect(screen.getByText('Keep Playing').className).toContain('min-h-11');
      // The dialog's confirm button carries the literal text "Leave Game"
      // (same copy as the header icon button) - getByText resolves to the
      // dialog button unambiguously.
      expect(screen.getByText('Leave Game').className).toContain('min-h-11');
    });

    it('Test 5: the pick-up confirmation\'s "Cancel" and "Pick Up Anyway" buttons both carry min-h-11', async () => {
      const state = buildGameState({
        phase: 'playing',
        isFirstTurn: false,
        currentTurn: 0,
        deck: [],
        discardPile: [buildCard({ id: 'discard-0', rank: '5', suit: '♣' })],
        players: [
          buildPlayer({
            id: 'test-player',
            name: 'Alice',
            hand: [buildCard({ id: 'hand-0', rank: '6', suit: '♠' })],
          }),
          buildPlayer({
            id: 'p1',
            name: 'Bob',
            hand: [buildCard({ id: 'bob-0', rank: '9', suit: '♦' })],
          }),
        ],
      });

      renderGame('test-player', state);

      const pickUpButton = await screen.findByRole('button', { name: /Pick Up Pile/ });
      fireEvent.click(pickUpButton);

      await screen.findByText('Confirm Pick Up');
      expect(screen.getByText('Cancel').className).toContain('min-h-11');
      expect(screen.getByText('Pick Up Anyway').className).toContain('min-h-11');
    });

    it('Test 6: the Play and Pick Up Pile buttons carry min-h-11 (already >= 44px via py-3) and their disabled expressions are unchanged', async () => {
      const state = buildGameState({
        phase: 'playing',
        isFirstTurn: false,
        currentTurn: 0,
        deck: [],
        discardPile: [buildCard({ id: 'discard-0', rank: '4', suit: '♣' })],
        players: [
          buildPlayer({
            id: 'test-player',
            name: 'Alice',
            hand: [buildCard({ id: 'hand-0', rank: '5', suit: '♠' })],
          }),
          buildPlayer({
            id: 'p1',
            name: 'Bob',
            hand: [buildCard({ id: 'bob-0', rank: '9', suit: '♦' })],
          }),
        ],
      });

      renderGame('test-player', state);
      await screen.findByText('Hand');

      const playButton = screen.getByRole('button', { name: /^Play/ });
      const pickUpButton = screen.getByRole('button', { name: /Pick Up Pile/ });
      expect(playButton.className).toContain('min-h-11');
      expect(pickUpButton.className).toContain('min-h-11');
      // Unchanged disabled expressions: Play starts disabled (nothing
      // selected yet), Pick Up Pile is enabled while the discard pile has
      // cards and it's this player's turn.
      expect(playButton).toBeDisabled();
      expect(pickUpButton).not.toBeDisabled();
    });

    it('Test 7: the Test Mode control-player select carries min-h-11', async () => {
      const state = buildGameState({
        phase: 'playing',
        players: [
          buildPlayer({ id: 'test-player', name: 'Alice' }),
          buildPlayer({ id: 'p1', name: 'Bob' }),
        ],
      });

      renderGame('test-player', state, { testMode: true });

      await screen.findAllByText('Bob');
      const select = screen.getByDisplayValue('Alice') as HTMLSelectElement;
      expect(select.className).toContain('min-h-11');
    });

    it('Test 8: the offline / auto-picking-up badges and player-tile stat lines are unchanged - status text, not controls', async () => {
      vi.mocked(useTurnTimeoutSweep).mockReturnValue({ graceExpired: false });
      const state = buildGameState({
        phase: 'playing',
        players: [
          buildPlayer({ id: 'test-player', name: 'Alice' }),
          buildPlayer({ id: 'p1', name: 'Bob' }),
        ],
      });
      const isPlayerOffline = (id: string) => id === 'p1';

      renderGame('test-player', state, { isPlayerOffline });

      const bobTile = (await screen.findByText('Bob')).closest('div.rounded-lg') as HTMLElement;
      const badge = within(bobTile).getByText('Offline');
      expect(badge.className).toContain('text-xs');
      expect(badge.className).toContain('px-2');
      expect(badge.className).toContain('py-1');
      expect(badge.className).not.toContain('min-h-11');
      expect(within(bobTile).getByText(/^Hand:/).className).not.toContain('min-h-11');
    });
  });

  describe('celebration modal as a focus-trapped dialog (RESP-05, D-06, D-07)', () => {
    /** Two players, both with cards - finishing player at `playerIndex` via
     * the harness button triggers isGameOver (only one player left with
     * cards), which opens the SH!THEAD! (loser) celebration variant. */
    function twoPlayerState() {
      return buildGameState({
        phase: 'playing',
        currentTurn: 0,
        deck: [],
        discardPile: [],
        players: [
          buildPlayer({
            id: 'test-player',
            name: 'Alice',
            hand: [buildCard({ id: 'hand-0', rank: '5', suit: '♠' })],
          }),
          buildPlayer({
            id: 'p1',
            name: 'Bob',
            hand: [buildCard({ id: 'bob-0', rank: '9', suit: '♦' })],
          }),
        ],
      });
    }

    /** Three players, all with cards - finishing player at `playerIndex`
     * leaves two players still holding cards, so isGameOver stays false and
     * the SAFE! (finished, not last) celebration variant opens instead. */
    function threePlayerState() {
      return buildGameState({
        phase: 'playing',
        currentTurn: 0,
        deck: [],
        discardPile: [],
        players: [
          buildPlayer({
            id: 'test-player',
            name: 'Alice',
            hand: [buildCard({ id: 'hand-0', rank: '5', suit: '♠' })],
          }),
          buildPlayer({
            id: 'p1',
            name: 'Bob',
            hand: [buildCard({ id: 'bob-0', rank: '9', suit: '♦' })],
          }),
          buildPlayer({
            id: 'p2',
            name: 'Charlie',
            hand: [buildCard({ id: 'charlie-0', rank: 'K', suit: '♣' })],
          }),
        ],
      });
    }

    /** Renders GameScreen plus a trigger button that clears one player's
     * hand/faceUp/faceDown, driving the pre-existing celebration effect
     * (App.tsx:103-143's port) without going through a real PLAY_CARDS
     * dispatch. `focusTriggerFirst` optionally focuses the trigger button
     * before it's clicked, so tests can assert focus-return to it later. */
    function renderWithCelebrationTrigger(
      playerId: string,
      state: ReturnType<typeof buildGameState>,
      finishPlayerIndex: number
    ) {
      function TriggerHarness() {
        const { gameState, setGameState } = useGameContext();
        return (
          <button
            onClick={() => {
              if (!gameState) return;
              const players = gameState.players.map((p, i) =>
                i === finishPlayerIndex ? { ...p, hand: [], faceUp: [], faceDown: [] } : p
              );
              void setGameState({ ...gameState, players });
            }}
          >
            Finish player {finishPlayerIndex}
          </button>
        );
      }

      const { unmount } = render(
        <GameProvider playerId={playerId}>
          <SeedGameState state={state} />
          <GameScreen />
          <TriggerHarness />
          <Probe />
        </GameProvider>
      );

      return {
        triggerButton: screen.getByRole('button', { name: `Finish player ${finishPlayerIndex}` }),
        unmount,
      };
    }

    it('is a role="dialog" with aria-modal="true" and no role="alert"/aria-live="assertive" when open', async () => {
      const state = twoPlayerState();
      const { triggerButton } = renderWithCelebrationTrigger('test-player', state, 1);
      await screen.findByText('Hand');

      fireEvent.click(triggerButton);

      const dialog = await screen.findByRole('dialog');
      expect(dialog).toHaveAttribute('aria-modal', 'true');
      expect(dialog).not.toHaveAttribute('role', 'alert');
      expect(dialog).not.toHaveAttribute('aria-live', 'assertive');
    });

    it("resolves the dialog's accessible name via aria-labelledby to the visible heading - SH!THEAD! for the loser variant, SAFE! for the finished variant", async () => {
      const loserState = twoPlayerState();
      const { triggerButton: loserTrigger, unmount } = renderWithCelebrationTrigger(
        'test-player',
        loserState,
        1
      );
      await screen.findByText('Hand');
      fireEvent.click(loserTrigger);
      const loserDialog = await screen.findByRole('dialog', { name: 'SH!THEAD!' });
      expect(loserDialog).toBeInTheDocument();
      unmount();

      const safeState = threePlayerState();
      const { triggerButton: safeTrigger } = renderWithCelebrationTrigger(
        'test-player',
        safeState,
        1
      );
      await screen.findAllByText('Hand');
      fireEvent.click(safeTrigger);
      const safeDialog = await screen.findByRole('dialog', { name: 'SAFE!' });
      expect(safeDialog).toBeInTheDocument();
    });

    it('moves focus to the Dismiss button on open', async () => {
      const state = twoPlayerState();
      const { triggerButton } = renderWithCelebrationTrigger('test-player', state, 1);
      await screen.findByText('Hand');

      fireEvent.click(triggerButton);

      await waitFor(() => {
        expect(document.activeElement).toHaveAttribute('aria-label', 'Dismiss');
      });
    });

    it('dismisses on Escape - the modal leaves the DOM', async () => {
      const state = twoPlayerState();
      const { triggerButton } = renderWithCelebrationTrigger('test-player', state, 1);
      await screen.findByText('Hand');

      fireEvent.click(triggerButton);
      await screen.findByRole('dialog');

      fireEvent.keyDown(document, { key: 'Escape' });

      await waitFor(() => {
        expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
      });
    });

    it('keeps Tab focus inside the dialog - it never lands on a board element behind it', async () => {
      const state = twoPlayerState();
      const { triggerButton } = renderWithCelebrationTrigger('test-player', state, 1);
      await screen.findByText('Hand');

      fireEvent.click(triggerButton);
      await waitFor(() => {
        expect(document.activeElement).toHaveAttribute('aria-label', 'Dismiss');
      });

      fireEvent.keyDown(document, { key: 'Tab' });

      expect(document.activeElement).toHaveAttribute('aria-label', 'Dismiss');
      expect(document.activeElement).not.toBe(triggerButton);
    });

    it('returns focus to the pre-open element after the dialog closes', async () => {
      const state = twoPlayerState();
      const { triggerButton } = renderWithCelebrationTrigger('test-player', state, 1);
      await screen.findByText('Hand');

      triggerButton.focus();
      fireEvent.click(triggerButton);
      await waitFor(() => {
        expect(document.activeElement).toHaveAttribute('aria-label', 'Dismiss');
      });

      fireEvent.keyDown(document, { key: 'Escape' });

      await waitFor(() => {
        expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
        expect(document.activeElement).toBe(triggerButton);
      });
    });

    it('still dismisses on a click of the Dismiss button - the existing mouse path is unregressed', async () => {
      const state = twoPlayerState();
      const { triggerButton } = renderWithCelebrationTrigger('test-player', state, 1);
      await screen.findByText('Hand');

      fireEvent.click(triggerButton);
      const dismissButton = await screen.findByRole('button', { name: 'Dismiss' });

      fireEvent.click(dismissButton);

      await waitFor(() => {
        expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
      });
    });
  });
});
