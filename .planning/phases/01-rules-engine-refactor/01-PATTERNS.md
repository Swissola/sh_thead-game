# Phase 1: Rules Engine Refactor - Pattern Map

**Mapped:** 2026-07-25
**Files analyzed:** 20 (10 new, 10 modified)
**Analogs found:** 17 / 20

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|--------------------|------|-----------|-----------------|----------------|
| `src/engine/moves.ts` (new) | model | transform | `src/types.ts` | role-match |
| `src/engine/errors.ts` (new) | config | transform | `src/gameLogic.ts` (`RANK_VALUES` const) | partial-match |
| `src/engine/applyMove.ts` (new) | service | CRUD (state transition) | `src/App.tsx` move handlers (`swapCards`, `setReady`, `playCards`, `pickUpPile`, `confirmPickUpPile`) + `src/gameLogic.ts` predicates | exact (structural rebuild of existing logic) |
| `src/context/GameContext.tsx` (new) | provider | event-driven | `src/hooks/useGameState.ts` (`useGameStateUpdater`) | partial-match (no Context precedent exists in this codebase) |
| `src/hooks/useToast.ts` (new) | hook | event-driven | `src/hooks/useSelection.ts` / `src/hooks/useHandSorting.ts` | role-match |
| `src/components/Toast.tsx` (new) | component | request-response | `src/App.tsx` pick-up confirmation modal (lines 1421-1454) | role-match |
| `src/screens/MenuScreen.tsx` (new) | component | request-response | `src/App.tsx` menu branch (lines 929-997) | exact (direct extraction) |
| `src/screens/LobbyScreen.tsx` (new) | component | request-response | `src/App.tsx` lobby branch (lines 999-1063) | exact (direct extraction) |
| `src/screens/GameScreen.tsx` (new) | component | request-response | `src/App.tsx` game branch (lines 1065-1498) + `Table.tsx`/`Hand.tsx` composition | exact (direct extraction) |
| `src/App.tsx` (modified → orchestrator) | component | request-response | itself (current file, pre-refactor) | exact |
| `src/gameLogic.ts` (modified — add `sortHand`, `canAddToSelection`, `createDeck`, `shuffleDeck`) | utility | transform | existing predicates in same file (`canPlayCard`, `canPlayMultipleCards`) | exact |
| `src/components/Hand.tsx` (modified) | component | event-driven | itself (current file) | exact |
| `src/components/Table.tsx` (modified) | component | event-driven | itself (current file) | exact |
| `src/main.tsx` (modified — one-line CSS import) | config | — | itself | exact |
| `src/__tests__/engine/applyMove.test.ts` (new) | test | — | `src/__tests__/gameLogic/core.test.ts` | role-match |
| `src/__tests__/testUtils/buildGameState.ts` (new) | test-utility | — | inline `Player`/`GameState` literals in `core.test.ts` | partial-match |
| `src/__tests__/screens/MenuScreen.test.tsx`, `LobbyScreen.test.tsx`, `GameScreen.test.tsx` (new) | test | — | none — first RTL usage in this codebase | no analog |
| `src/__tests__/hooks/useToast.test.ts` (new) | test | — | vitest `describe/it/expect` convention from `src/__tests__/gameLogic/*.test.ts` | partial-match |
| `src/__tests__/utils/deck.test.ts` (modified — import real `createDeck`/`shuffleDeck`) | test | — | itself (current file) | exact |
| `vitest.config.ts` (modified — add `setupFiles`) | config | — | itself | exact |

## Pattern Assignments

### `src/engine/applyMove.ts` (service, CRUD/state-transition)

**Analog:** `src/App.tsx` — five existing move handlers, plus `src/gameLogic.ts`'s predicate set they must delegate to.

**Imports pattern** (from `src/App.tsx:1-15`, trim to what a framework-free module needs):
```typescript
import * as GameLogic from '../gameLogic';
import { RANK_VALUES } from '../gameLogic';
import type { GameState, Card as CardType, CardSelection } from '../types';
```
`applyMove.ts` must NOT import React, `flushSync`, `document`, or `lucide-react` — those are DOM/UI-only imports in the current `App.tsx` that must stay behind in `GameScreen.tsx` (see Pitfall 4 in RESEARCH.md).

**Current move-handler shape to rebuild as pure cases** (`src/App.tsx:388-420`, `swapCards`):
```typescript
const swapCards = (handIndex: number, faceUpIndex: number): void => {
  if (!gameState) return;
  const currentPlayerId = testMode ? gameState.players[controllingPlayer].id : playerId;
  const player = gameState.players.find((p) => p.id === currentPlayerId);
  if (!player || gameState.phase !== 'setup') return;

  const newHand = [...player.hand];
  const newFaceUp = [...player.faceUp];
  const handCard = newHand[handIndex];
  const faceUpCard = newFaceUp[faceUpIndex];
  if (!handCard || !faceUpCard) { return; }
  newHand[handIndex] = faceUpCard;
  newFaceUp[faceUpIndex] = handCard;

  const updatedPlayers = gameState.players.map((p) =>
    p.id === currentPlayerId ? { ...p, hand: newHand, faceUp: newFaceUp } : p
  );

  const updatedState = { ...gameState, players: updatedPlayers, lastAction: `${player.name} swapped cards` };
  // ... persistence branch (testMode vs storage) — this part moves to useGameStateUpdater, not applyMove
};
```
This is the cleanest of the five handlers (already immutable) — use its `[...array]`-before-index-assign shape as the baseline for every new `applyXxx` case. Note it does NOT check `playerId === currentTurn` (setup-phase moves aren't gated on turn order) — `applyMove`'s `SWAP_CARDS`/`READY_UP` cases should mirror that (only `PLAY_CARDS`/`PICK_UP_PILE` need the D-03 turn check).

**`setReady` — phase-transition-on-condition pattern** (`src/App.tsx:422-452`):
```typescript
const setReady = () => {
  // ...
  const updatedPlayers = gameState.players.map((p) =>
    p.id === currentPlayerId ? { ...p, isReady: true } : p
  );
  let updatedState = { ...gameState, players: updatedPlayers, lastAction: `${player.name} is ready` };
  if (updatedPlayers.every((p) => p.isReady)) {
    const startPlayer = GameLogic.getStartingPlayer(updatedPlayers);
    updatedState = { ...updatedState, phase: 'playing', currentTurn: startPlayer, lastAction: `${updatedPlayers[startPlayer].name} starts!`, isFirstTurn: true };
  }
  updateGameState(updatedState);
};
```
Use this exact "compute updatedPlayers, conditionally re-derive phase/currentTurn" shape for `READY_UP`.

**`pickUpPile`/`confirmPickUpPile` — the two-step confirm flow** (`src/App.tsx:836-924`): keep as two concerns per RESEARCH.md Open Question 2 — `GameLogic.shouldConfirmPickUp` stays a UI-side pre-check called directly by `GameScreen.tsx`, while `applyMove`'s `PICK_UP_PILE` case does the unconditional pickup (mirrors today's `confirmPickUpPile`, `src/App.tsx:871-924`):
```typescript
const confirmPickUpPile = (playerIndex: number) => {
  const player = gameState.players[playerIndex];
  const updatedHand = [...player.hand];
  const cardsToAdd = [...gameState.discardPile];
  let newFaceDown = [...player.faceDown];
  if (revealedFaceDown) {
    cardsToAdd.unshift(revealedFaceDown.card);
    if (revealedFaceDown.index >= 0 && revealedFaceDown.index < newFaceDown.length) {
      newFaceDown[revealedFaceDown.index] = null;
    }
  }
  let addIndex = 0;
  for (let i = 0; i < updatedHand.length && addIndex < cardsToAdd.length; i++) {
    if (updatedHand[i] === null) { updatedHand[i] = cardsToAdd[addIndex]; addIndex++; }
  }
  while (addIndex < cardsToAdd.length) { updatedHand.push(cardsToAdd[addIndex]); addIndex++; }
  const updatedPlayer = { ...player, hand: updatedHand, faceDown: newFaceDown };
  const updatedPlayers = gameState.players.map((p, i) => (i === playerIndex ? updatedPlayer : p));
  const nextTurn = GameLogic.getNextPlayer(playerIndex, updatedPlayers);
  const updatedState = { ...gameState, players: updatedPlayers, discardPile: [], currentTurn: nextTurn, lastAction: `${player.name} picked up ${gameState.discardPile.length} cards from the pile` };
};
```
Note the `revealedFaceDown` here comes from local component state today (`useSelection`), not `GameState` — `applyMove`'s `PICK_UP_PILE` move payload must carry `revealedFaceDownIndex` explicitly (per RESEARCH.md's `Move` type) rather than reaching into UI state, since the reducer must stay framework-free.

**Direct-mutation bug — what NOT to copy** (`src/App.tsx:611-673`, the `playCards` handler): `const updatedPlayer = { ...player };` is a shallow copy — the subsequent lines `updatedPlayer.hand[index] = null` (628-630, 651-673, 811-817) mutate the array that `player.hand`/`gameState.players[playerIndex].hand` still reference. Every rewritten `applyMove` handler must instead do:
```typescript
const newHand = [...player.hand];
newHand[index] = null; // safe — newHand is a fresh array
const updatedPlayer = { ...player, hand: newHand };
```
at every single index-assignment site, not just the two originally flagged.

**Validation-then-reject pattern for `PLAY_CARDS`** (`src/App.tsx:606-608`, `846-848`):
```typescript
if (!GameLogic.canPlayMultipleCards(cardsToPlay, gameState.discardPile)) {
  return alert('Those cards cannot be played on the current pile');
}
```
Becomes, in `applyMove`:
```typescript
if (!GameLogic.canPlayMultipleCards(cardsToPlay, state.discardPile)) {
  return { state, error: { code: 'INVALID_PLAY', message: 'Those cards cannot be played on the current pile' } };
}
```
Every one of the 14 `alert()` call sites listed in RESEARCH.md's Grep output (`App.tsx:234, 259, 265, 269, 272, 289, 472, 493, 496, 513, 535, 546, 607, 847`) is a candidate `{code, message}` rejection — the gameplay ones (472, 493, 496, 513, 535, 546, 607, 847) move into `applyMove`'s error returns; the menu/lobby ones (234, 259, 265, 269, 272, 289) stay in `MenuScreen`/`LobbyScreen` as local toast calls since room creation/joining isn't a `Move` in this phase's scope.

**Burn/draw/win sequencing to preserve exactly** (`src/App.tsx:696-761`, the non-animated core of `playCards`):
```typescript
let newDiscardPile = [...gameState.discardPile, ...cardsToPlay];
let newBurnPile = [...gameState.burnPile];
const burned = GameLogic.shouldBurnPile(newDiscardPile);
const playResult = GameLogic.getPlayResult(cardsToPlay, newDiscardPile);
if (burned) { newBurnPile = [...newBurnPile, ...newDiscardPile]; newDiscardPile = []; }
const cardsToDraw = GameLogic.getCardsToDrawCount(updatedPlayer, gameState.deck.length);
const drawnCards = cardsToDraw > 0 ? gameState.deck.slice(0, cardsToDraw) : [];
// ... fill drawnCards into updatedPlayer.hand's null slots (immutably)
const playerWon = GameLogic.hasPlayerWon(updatedPlayer);
const nextTurn = burned ? playerIndex : GameLogic.getNextPlayer(playerIndex, updatedPlayers);
const gameOver = GameLogic.isGameOver(updatedPlayers);
```
`applyMove`'s `PLAY_CARDS` case should reproduce this sequencing verbatim (it's already correct rules logic — RESEARCH.md's "Don't Hand-Roll" table), just without the `flushSync`/`setTimeout`/`document.querySelector` animation wrapper (`App.tsx:763-825`), which stays in `GameScreen.tsx` reading the same `drawnCards`/`emptyIndices` shape from the move result.

---

### `src/engine/moves.ts` (model, transform)

**Analog:** `src/types.ts`

**Existing type-definition convention** (`src/types.ts:36-39`):
```typescript
export type CardSource = 'hand' | 'faceUp' | 'faceDown';

export interface CardSelection {
    type: CardSource;
    index: number;
}
```
Reuse `CardSelection` directly in `Move`'s `PLAY_CARDS` payload per D-01 rather than inventing a parallel shape. Follow the same 4-space-indent, `interface` (not `type`) convention this file already uses for object shapes, and `type` (not `interface`) for unions — matches `types.ts`'s own `CardSource`/`GameState.phase` union style.

---

### `src/context/GameContext.tsx` (provider, event-driven)

**No direct analog** — this is the first `createContext` usage in the codebase. Closest structural precedent is the persistence-hook pattern in `src/hooks/useGameState.ts`:
```typescript
// src/hooks/useGameState.ts:8-19
export function useGameStateUpdater(testMode: boolean, roomCode: string, setGameState: (s: GameState) => void) {
    const updateGameState = useCallback((newState: GameState) => {
        if (testMode) {
            setGameState(newState);
        } else {
            window.storage.set(`game:${roomCode}`, JSON.stringify(newState), true);
            setGameState(newState);
        }
    }, [testMode, roomCode, setGameState]);
    return updateGameState;
}
```
`GameProvider` should call this same hook internally to persist state after `applyMove` succeeds — don't bypass it. Use RESEARCH.md's Pattern 2/Pattern 4 code examples (Approach A or B) as the structural template since no in-repo Context precedent exists to copy from instead.

---

### `src/hooks/useToast.ts` (hook, event-driven)

**Analog:** `src/hooks/useSelection.ts` (full file, 9 lines) and `src/hooks/useHandSorting.ts` (full file, 8 lines)

```typescript
// src/hooks/useSelection.ts
import { useState } from 'react';
import type { CardSelection, Card as CardType } from '../types';

export function useSelection() {
    const [selectedCards, setSelectedCards] = useState<CardSelection[]>([]);
    const [revealedFaceDown, setRevealedFaceDown] = useState<{ card: CardType; index: number } | null>(null);
    return { selectedCards, setSelectedCards, revealedFaceDown, setRevealedFaceDown };
}
```
Established convention: small hooks in `src/hooks/` are plain functions returning a flat object of state + setters, no default export, named export matching the filename. `useToast` should follow this exactly (per RESEARCH.md's code example) — `{ toast, show, dismiss }`, not a class or a reducer-based hook.

---

### `src/components/Toast.tsx` (component, request-response/presentational)

**Analog:** `src/App.tsx` pick-up confirmation modal (lines 1421-1454)

```typescript
// src/App.tsx:1421-1454
{pickUpConfirmation?.show &&
  createPortal(
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-slate-800 border-2 border-purple-500 rounded-lg p-6 max-w-md shadow-2xl">
        <h2 className="text-xl font-bold text-white mb-4">Confirm Pick Up</h2>
        <p className="text-slate-300 mb-6">...</p>
        <div className="flex gap-4">
          <button onClick={() => setPickUpConfirmation(null)} className="flex-1 px-4 py-2 bg-slate-700 hover:bg-slate-600 text-white rounded-lg font-semibold transition-colors">Cancel</button>
          <button onClick={() => { /* ... */ }} className="flex-1 px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg font-semibold transition-colors">Pick Up Anyway</button>
        </div>
      </div>
    </div>,
    document.body
  )
}
```
And the celebration modal's `role="alert" aria-live="assertive"` pattern (`src/App.tsx:1460-1461`) is the existing precedent for accessible interruption UI — `Toast.tsx` should use `role="alert" aria-live="polite"` (per RESEARCH.md's code example; `polite` not `assertive` since a toast, unlike the celebration modal, shouldn't interrupt screen-reader flow). Palette: `bg-slate-800`/`border-red-500` (error) matches the existing `border-purple-500` (info-modal) / `border-yellow-400` (celebration-safe) / no-red-yet convention — red border for the toast is a reasonable new addition consistent with the existing 2px-border-plus-rounded-lg-plus-shadow-2xl card language.

---

### `src/screens/MenuScreen.tsx`, `LobbyScreen.tsx`, `GameScreen.tsx` (component, request-response)

**Analog:** `src/App.tsx`'s three `if (screen === '...')` JSX return blocks — direct extraction, not a rewrite.

| Screen | Source lines in `src/App.tsx` | Notes |
|--------|-------------------------------|-------|
| `MenuScreen.tsx` | 929-997 | Self-contained; needs `playerName`, `roomCode`, `createRoom`, `createTestGame`, `createTestGameStarted`, `joinRoom` — all become props or context-derived per D-09 |
| `LobbyScreen.tsx` | 999-1063 | Needs `gameState`, `playerId`, `roomCode`, `copied`, `copyRoomCode`, `startGame` |
| `GameScreen.tsx` | 1065-1498 | Largest; composes `Table`/`Hand`/pile components, owns `showRules`, `drawingCards`, `pickUpConfirmation`, `celebrationModal` as **local state** per the Anti-Pattern in RESEARCH.md ("don't let Context own DOM/animation state") |

Header/toast chrome (`src/App.tsx`'s repeated `min-h-screen bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900` wrapper div, appearing identically in all three screen blocks — lines 931, 1003, 1076) should be **hoisted into the orchestrator per D-09**, not duplicated three times in the split screens — this is exactly the "shared chrome" D-09 describes.

---

### `src/gameLogic.ts` (modified — add dedup targets)

**Analog:** existing predicates in the same file (style/signature convention to match)

```typescript
// src/gameLogic.ts:74-114 — existing predicate style: pure function, typed params,
// early returns, no side effects, JSDoc-free (file uses section-header comments instead)
export function canPlayCard(card: Card, discardPile: Card[]): boolean { /* ... */ }
export function canPlayMultipleCards(cards: Card[], discardPile: Card[]): boolean {
  if (cards.length === 0) return false;
  if (cards.length === 1) return canPlayCard(cards[0], discardPile);
  const firstRank = cards[0].rank;
  const allSameRank = cards.every((card) => card.rank === firstRank);
  if (!allSameRank) return false;
  return canPlayCard(cards[0], discardPile);
}
```
New functions to add, matching this exact style (section-header comment block, exported top-level function, no class):
1. `sortHand(hand, mode)` — dedupes `App.tsx:562-579` and `Hand.tsx:91-108`'s byte-for-byte duplicate rank/suit comparators.
2. `canAddToSelection(candidate, selected)` — dedupes `Hand.tsx:150-155`/`182-187` and `Table.tsx:103-108`/`131-136`'s inline "shares a rank" checks; should internally call `canPlayMultipleCards` rather than reimplement.
3. `createDeck`/`shuffleDeck` — relocate verbatim from `App.tsx:20-45` (Fisher-Yates is already correct per RESEARCH.md's "Don't Hand-Roll" table — move, don't rewrite).

---

### `src/components/Hand.tsx` / `src/components/Table.tsx` (modified)

**Pattern to remove — the "unnamed fourth duplication site"** (`Hand.tsx:203-220`, hand↔hand swap bypassing `swapCards`):
```typescript
// Hand.tsx:203-220 — current bypass, to be replaced with a dispatchMove(SWAP_CARDS-or-REORDER) call
const temp = player.hand[selectedCards[0].index];
const newHand = [...player.hand];
newHand[selectedCards[0].index] = player.hand[item.arrayIndex];
newHand[item.arrayIndex] = temp;
const updatedPlayers = gameState.players.map((p) =>
  p.id === currentPlayerId ? { ...p, hand: newHand } : p
);
const updatedState = { ...gameState, players: updatedPlayers, lastAction: `${player.name} swapped hand cards` };
updateGameState(updatedState); // <-- calls updateGameState directly, never goes through swapCards or applyMove
```
`Table.tsx:168-185` has the identical pattern for `faceUp`↔`faceUp`. Both call sites must be rewired to `dispatchMove(...)` once `applyMove`'s `SWAP_CARDS` (or a new `REORDER` move type — see RESEARCH.md Open Question 1) covers same-source swaps — this is a locked requirement of ENGINE-01, not optional cleanup.

**Tooltip/selectability duplication to replace** (`Hand.tsx:150-155`, `182-187`; `Table.tsx:103-108`, `131-136`) — currently reimplements "does this card share a rank with the first selected card" inline; replace with the new `GameLogic.canAddToSelection` helper described above.

---

### `src/__tests__/engine/applyMove.test.ts` (test)

**Analog:** `src/__tests__/gameLogic/core.test.ts` (full file read, 312 lines — excerpt below)

```typescript
// src/__tests__/gameLogic/core.test.ts:1-29
import { describe, it, expect } from 'vitest';
import * as GameLogic from '../../gameLogic';
import type { Card, Player } from '../../types';

describe('GameLogic - Card Validation', () => {
    it('should validate that two cards have the same rank', () => {
        const card1: Card = { suit: '♥', rank: '5', id: '5h', deckColor: 'red' };
        const card2: Card = { suit: '♠', rank: '5', id: '5s', deckColor: 'red' };
        expect(GameLogic.canPlayCard(card2, [card1])).toBe(true);
    });
    // ...
});
```
Established convention: plain-object `Card`/`Player` literals built inline per test (no factory yet — this is exactly the gap `buildGameState.ts` fills per RESEARCH.md's Wave 0 Gaps), `describe` blocks grouped by capability (`'GameLogic - Card Validation'`, `'GameLogic - Starting Player'`), one behaviour per `it`. Mirror this grouping as `describe('applyMove - PLAY_CARDS', ...)` etc. per move type, and add the two D-11-mandated assertions to every test (reference-inequality `.not.toBe()` and `structuredClone`-based input-unchanged check) — see RESEARCH.md's Code Examples section for the exact assertion pair.

---

### `src/__tests__/utils/deck.test.ts` (modified)

**Analog:** itself (currently a private, verbatim-duplicate copy of `createDeck`/`shuffleDeck` — `src/__tests__/utils/deck.test.ts:7-32`)

```typescript
// current file — private copy, NOT importing the real implementation
const createDeck = (numDecks = 1) => { /* byte-for-byte copy of App.tsx:20-36 */ };
const shuffleDeck = (deck: Card[]): Card[] => { /* byte-for-byte copy of App.tsx:38-45 */ };
```
Fix: delete the private copies, `import { createDeck, shuffleDeck } from '../../gameLogic'` (once relocated there per the `gameLogic.ts` dedup entry above), keep all five existing `it(...)` blocks (lines 35-87) unchanged — they test behaviour, not implementation location.

---

## Shared Patterns

### Immutable array update (ENGINE-02's core requirement)
**Source:** `src/App.tsx:394-402` (`swapCards` — the one handler that already does this correctly)
**Apply to:** Every `applyMove` case, and the rewired `Hand.tsx`/`Table.tsx` swap sites
```typescript
const newHand = [...player.hand];
const newFaceUp = [...player.faceUp];
newHand[handIndex] = faceUpCard;
newFaceUp[faceUpIndex] = handCard;
const updatedPlayers = gameState.players.map((p) =>
  p.id === currentPlayerId ? { ...p, hand: newHand, faceUp: newFaceUp } : p
);
```
Never spread a player (`{ ...player }`) and then index-assign into `.hand`/`.faceUp`/`.faceDown` on the result — those arrays are still shared references (this is exactly `App.tsx:611-673`'s bug).

### Rules delegation to `gameLogic.ts` (ENGINE-01/04)
**Source:** `src/gameLogic.ts` (whole file, all 356 lines already read — `canPlayCard`, `canPlayMultipleCards`, `shouldBurnPile`, `getNextPlayer`, `hasPlayerWon`, `getStartingPlayer`, `shouldConfirmPickUp`, `getCardsToDrawCount`, `canPlayMixedSources`, etc.)
**Apply to:** `applyMove.ts` exclusively for rule decisions; `Hand.tsx`/`Table.tsx` for tooltip/selectability checks (via the new `canAddToSelection` helper) — no component or engine file should reimplement a rank comparison, burn check, or turn-order check inline.

### `{code, message}` error shape (D-04, ENGINE-05)
**Source:** RESEARCH.md's `MoveError` interface (no in-repo precedent — first structured-error type in the codebase; the 14 existing `alert()` calls in `src/App.tsx` are un-typed strings)
**Apply to:** Every rejection branch in `applyMove.ts`; consumed by `useToast.ts`'s `show(message, code?)`.

### Vitest test file convention
**Source:** `src/__tests__/gameLogic/core.test.ts` (and 5 sibling files: `faceDown.test.ts`, `playResult.test.ts`, `edges.test.ts`, `mixedAndPickup.test.ts`, `coverage.test.ts`)
**Apply to:** All new test files — `describe/it/expect` from `vitest`, no `beforeEach` boilerplate currently in use, inline literal fixtures (until `buildGameState.ts` exists).

## No Analog Found

| File | Role | Data Flow | Reason |
|------|------|-----------|--------|
| `src/context/GameContext.tsx` | provider | event-driven | No `createContext`/`useReducer` usage exists anywhere in the current codebase — this is genuinely new infrastructure. Use RESEARCH.md's Pattern 2/Pattern 4 code examples as the template instead of a codebase analog. |
| `src/__tests__/screens/MenuScreen.test.tsx`, `LobbyScreen.test.tsx`, `GameScreen.test.tsx` | test | — | `@testing-library/react` is an installed-but-unused devDependency (per RESEARCH.md) — no existing RTL test to copy render/interaction patterns from. Use RESEARCH.md's Screen smoke test code example as the template. |
| `src/engine/errors.ts` | config | transform | No existing error-code-constants module in this codebase (errors today are inline `alert()` strings, not typed codes) — closest structural precedent is `RANK_VALUES` as a plain `Record<string, X>` module-level constant in `gameLogic.ts:10-24`, but the *content* pattern (error codes) has no analog. |

## Metadata

**Analog search scope:** `src/` (entire codebase — 20 source files, 6 test files; no `node_modules` or build-output search needed given repo size)
**Files scanned:** `src/App.tsx`, `src/gameLogic.ts`, `src/types.ts`, `src/main.tsx`, `src/storage.ts`, `src/components/Card.tsx`, `src/components/Hand.tsx`, `src/components/Table.tsx`, `src/hooks/useGameState.ts`, `src/hooks/useSelection.ts`, `src/hooks/useHandSorting.ts`, `src/__tests__/gameLogic/core.test.ts`, `src/__tests__/utils/deck.test.ts`, `src/App.css` (grep only), `vitest.config.ts`, `package.json`
**Pattern extraction date:** 2026-07-25
