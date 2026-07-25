# Phase 1: Rules Engine Refactor - Research

**Researched:** 2026-07-25
**Domain:** React 19 state-management refactor (pure reducer extraction, Context wiring, component decomposition, Vitest/RTL testing) — no new runtime dependencies
**Confidence:** HIGH

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

**applyMove contract shape**
- **D-01:** Every move carries an explicit `playerId` — e.g. `{type: 'PLAY_CARDS', playerId, cards: CardSelection[]}` — reusing the existing `CardSelection` type from `types.ts`. Chosen because Phase 2's server-side Edge Function will need to know who sent a move over the network; building this in now avoids reshaping the move type later.
- **D-02:** `applyMove` never throws. It returns `{state, error?}` — unchanged state plus an error on rejection, new state and no error on success. Validation inside `applyMove` is the actual Phase 2 security boundary (MPLAY-04: "a modified client cannot submit an illegal move"), not defensive programming against the UI. Today's UI already only ever offers legal plays, so the real client rarely hits the rejection path — but a request that bypasses the UI entirely (a future network caller) must still be rejected by the engine itself, independent of the caller.
- **D-03:** `applyMove` enforces "is it this player's turn" internally now (rejects any move where `playerId` doesn't match `state.currentTurn`'s player), even though today only one trusted client exists. This makes Phase 2's server-side call secure by construction rather than by remembering to add the check later.
- **D-04:** Errors carry a machine-readable code alongside the human message — `{code: 'NOT_YOUR_TURN', message: 'Wait for your turn'}` — so the UI and, later, the server can branch/log/rate-limit by error type without string-matching.

**In-app feedback for invalid moves (replaces ENGINE-05's 14 `alert()` calls)**
- **D-05:** Toast in a screen corner, auto-dismiss after a few seconds. Non-blocking, doesn't obscure the board.
- **D-06:** One generic visual style for all error codes — the codes exist for future server-side use (logging, rate-limiting), not for UI branching in this phase.
- **D-07:** A second invalid move while a toast is showing replaces the message and resets the dismiss timer. No message queue.

**Screen split & state ownership (ENGINE-03)**
- **D-08:** GameState lives in a React Context provider (`<GameProvider>`) wrapping all three screens, with a `useGameContext` hook for consumers — not prop-drilled from the orchestrator. Decided after weighing both: prop drilling is fine for today's shallow tree, but Phase 3 adds accessibility wrappers (dialog semantics, focus traps) and Phase 6 adds a shared `Modal` primitive — both add nesting layers on top of what exists today. Context insulates those later phases from having to rewire prop chains each time a layer is added. Re-render cost is a non-issue: a move already re-renders the whole board today.
- **D-09:** The orchestrator's job is routing + top-level layout: it decides which screen renders based on `GameState.phase`, wires up the `applyMove` dispatch, and owns shared chrome (header, toast container) so that isn't duplicated across Menu/Lobby/Game. It does not render board/hand UI itself.
- **D-10:** Structural refactor plus opportunistic small cleanups — fix obviously bad code encountered along the way (dead code, awkward naming) even where not strictly required by ENGINE-01..07, but no visual/UX changes (that stays Phase 3/5/6's scope).

**Test depth (ENGINE-07)**
- **D-11:** Engine tests are exhaustive per-move-type: every move type (play/pickup/swap/ready) tested for the valid case plus each distinct rejection reason (wrong turn, illegal rank, etc.), plus rules edge cases (burning the pile, four-of-a-kind, empty deck). Higher bar than golden-path-only because this reducer becomes Phase 2's security boundary.
- **D-12:** Screen smoke tests must do more than render-without-crashing — each screen's key interaction must be exercised (e.g. Game screen renders the board and clicking a card triggers a dispatch; Lobby's ready button calls the ready handler). Confirms the split didn't break wiring, not just that components mount.

### Claude's Discretion
- Exact toast component implementation/positioning within the existing layout.
- Where precisely the "opportunistic small cleanup" line sits — use judgement; anything beyond obviously-bad-code-encountered-in-passing belongs in its own phase, not this one.
- Internal reducer structure (single switch vs per-move-type functions composed together) — implementation detail, not a decision the user needs to weigh in on.

### Deferred Ideas (OUT OF SCOPE)
None — discussion stayed within phase scope. No scope-creep items came up; all four discussed areas were clarifications of how to implement what's already in ENGINE-01..07.
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| ENGINE-01 | Every move (play/pickup/swap/ready) processed by one pure `applyMove(state, move)` reducer built on `gameLogic.ts` | See Architecture Patterns → Pattern 1 (reducer skeleton); Common Pitfalls → hidden third move site in Hand.tsx/Table.tsx |
| ENGINE-02 | No move handler mutates existing state/player objects in place | See Common Pitfalls → Direct Mutation Bug (exact line refs), Code Examples → immutable slot-preserving helpers |
| ENGINE-03 | `App.tsx` split into Menu/Lobby/Game screens + slim orchestrator | See Architecture Patterns → Recommended Project Structure, Pattern 2 (Context + orchestrator) |
| ENGINE-04 | Dedupe hand-sort/rank-share/deck-creation logic into `gameLogic.ts` | See Don't Hand-Roll table, Architecture Patterns → Pattern 3 (dedup sites) |
| ENGINE-05 | Replace 14 `alert()` calls with in-app toast messages | See Code Examples → Toast component, Architecture Patterns → Pattern 4 |
| ENGINE-06 | Celebration animation actually plays | See Common Pitfalls → App.css never imported (one-line fix, already located) |
| ENGINE-07 | Automated test coverage for engine + screens | See Validation Architecture section |
</phase_requirements>

## Summary

This phase is a pure refactor of an already-working, single-file React 19 app (`App.tsx`, 1,501 lines) — no new runtime dependencies are needed. The target architecture is: a pure `applyMove(state, move) -> {state, error?}` reducer built on the existing `gameLogic.ts` predicates, wired into React via a `useReducer` + `createContext` pair (`GameProvider`/`useGameContext`), consumed by three screen components (Menu, Lobby, Game) under a slim orchestrator that owns routing and shared chrome (header, toast container).

The codebase audit already named the direct-mutation bug and three duplication sites (hand-sort, "shares a rank", deck creation) precisely, with line numbers — this research confirms them by reading the actual files and finds one **additional, unnamed duplication**: `Hand.tsx` and `Table.tsx` each contain their own inline hand-swap and face-up-swap logic during the setup phase, bypassing the `swapCards` handler entirely and calling `updateGameState` directly with hand-rolled immutable-array-splice code. This is a fourth move-handling site that must also be folded into `applyMove`'s `SWAP_CARDS` case for ENGINE-01 to genuinely hold ("every move... processed by one applyMove reducer... no duplicate rule logic left elsewhere").

No new npm packages are required: `React.createContext`/`useReducer` are built into React 19 (already a dependency), and a toast can be built with existing Tailwind + `lucide-react` (both already installed, `X` icon already imported in `App.tsx`). Vitest 4 and React Testing Library 16 are already devDependencies, installed and current, but **currently unused** — this phase is the first to write tests with them.

**Primary recommendation:** Build `applyMove` as a discriminated-union reducer in a new `src/engine/applyMove.ts` (or `src/reducer.ts`) that delegates all rule checks to `gameLogic.ts` and returns new object/array references at every level it touches (never mutate `player.hand[i] = x` on an existing array — always `[...arr]` first). Wire it into a `GameProvider` using `useReducer(gameReducer, initialState)` where `gameReducer` is a thin adapter calling `applyMove` and throwing away the error (UI reads error separately via a toast-dispatch side channel, since `useReducer` alone can't carry a "did this specific dispatch fail" signal back to the caller — see Pitfall 3).

## Architectural Responsibility Map

This is a single-tier client-only app today (React SPA, no backend yet — Phase 2 adds Supabase). All capabilities below currently live in the browser tier; Phase 2 will introduce an API/server tier that reuses the same `applyMove` module.

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Move validation & state transition (`applyMove`) | Browser (Client) — today | API/Backend — Phase 2 | Pure function with no I/O; must be import-portable to a future Supabase Edge Function unchanged, so it must not touch `window`, DOM, or React at all |
| Game state storage/persistence | Browser (Client) — `localStorage` via `window.storage`/`useGameStateUpdater` | Database — Phase 2 (Supabase Postgres) | Today's `useGameStateUpdater` hook already abstracts persistence from the reducer; keep that seam intact so Phase 2 can swap the storage backend without touching `applyMove` |
| Screen routing (menu/lobby/game) | Browser (Client) — orchestrator component | — | Client-only concern, no server involvement ever |
| Toast/error display | Browser (Client) — presentation layer | — | Pure UI concern; the `{code, message}` shape crossing from `applyMove` is what Phase 2 will also use for server-side logging, but the toast rendering itself never leaves the client |
| Celebration animation | Browser (Client) — CSS + derived-state effect | — | Purely presentational, already implemented, blocked only by a missing CSS import |
| Draw-card animation (`document.querySelector`/`flushSync`) | Browser (Client) — DOM-coupled, explicitly out of scope for rebuild this phase (POLISH-01 is Phase 6) | — | Keep working as-is; don't let `applyMove`'s wiring break the `flushSync` sequencing that this animation depends on (see Pitfall 4) |

## Standard Stack

### Core
No new packages required. All of the following are already installed and current as of this research date:

| Library | Installed | Latest (npm) | Purpose | Why Standard |
|---------|-----------|---------------|---------|--------------|
| react / react-dom | 19.2.0 | 19.2.8 `[VERIFIED: npm registry]` | UI runtime, `createContext`/`useReducer` | Already the app's framework; Context+reducer is React's own recommended pattern for "shared state accessed by many components below a common ancestor" [CITED: react.dev/learn/scaling-up-with-reducer-and-context] |
| vitest | 4.0.16 | 4.1.10 `[VERIFIED: npm registry]` | Test runner, already configured (`vitest.config.ts`, jsdom environment, globals on) | Already used for 6 existing `gameLogic` test files; zero-config for new test files in same project |
| @testing-library/react | 16.3.1 | 16.3.2 `[VERIFIED: npm registry]` | Component rendering/interaction tests | Already a devDependency per CONTEXT.md, currently unused; React 19 compatible |
| @testing-library/jest-dom | 6.9.1 | current `[VERIFIED: npm registry]` | DOM matchers (`toBeInTheDocument`, etc.) for RTL assertions | Already installed; needs `setupFiles` wiring (currently empty — see Wave 0 gap) |
| lucide-react | 0.562.0 | current | Icon set already in use (`X`, `Check`, `HelpCircle`, etc.) | Reuse `X`/`AlertCircle`/`CheckCircle` icons for the toast rather than adding a new icon package |
| tailwindcss | 3.4.19 | current | Utility CSS, already wired via `postcss.config.js` and `@tailwind` directives in `index.css` | Toast and screen split should use existing Tailwind conventions (`bg-slate-800`, `border-purple-500`, etc.) already established in `App.tsx` — no new styling system |

### Supporting
No supporting/optional libraries recommended for this phase. Specifically **do not** add a toast library (react-hot-toast, sonner, etc.) or a state library (zustand, jotai, redux) — see Alternatives Considered below and D-08.

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Hand-rolled `useReducer` + `createContext` | `zustand` (5.0.14 confirmed current on npm `[VERIFIED: npm registry]`, but selection was **not researched via official docs — do not install**) | Zustand would remove some Context boilerplate, but D-08 already locked "React Context provider... with a useGameContext hook" — installing a state library contradicts the locked decision. Not recommended. |
| Hand-rolled toast component | `sonner` / `react-hot-toast` | Both are well-regarded, but D-05/D-06/D-07 describe a *very* small feature (one message, one style, replace-not-queue, corner position) — implementing this in ~40 lines with existing Tailwind is less code and less dependency surface than wiring an external toast library's API into a `{code, message}` domain shape. A hand-rolled `useToast` hook plus one `<Toast>` component is the pragmatic choice given "minimal new dependencies" from the task brief. |
| `useReducer` for `applyMove` wiring | `useState` + manual `applyMove` calls in each handler | `useReducer` is a better fit because `applyMove(state, move)`'s shape *is* a reducer signature already (per D-01/D-02) — using `useReducer` makes the dispatch-based API idiomatic and testable without re-deriving it. `useState` would work but throws away the natural mapping. |

**Installation:** No installation needed — nothing new to add to `package.json`.

**Version verification:** Confirmed via `npm view <pkg> version` against the npm registry (see table above); all installed versions are within one minor/patch of latest as of this research date, no upgrades needed for this phase.

## Package Legitimacy Audit

**Not applicable — this phase installs no new external packages.** All libraries used (React, Vitest, RTL, lucide-react, Tailwind) are pre-existing dependencies already present in `package.json` and verified installed via `npm view`. If a later planning step decides a toast library or state library is warranted after all, run the full Package Legitimacy Gate protocol against that decision before installing.

## Architecture Patterns

### System Architecture Diagram

```
User interaction (click card / button)
        │
        ▼
Screen component (Menu | Lobby | Game)
  reads state via useGameContext()
  calls dispatchMove({ type, playerId, ...payload })  ──┐
        │                                                │
        ▼                                                │
GameProvider (Context + useReducer)                      │
  gameReducer(state, action):                            │
    result = applyMove(state, action)      ◄─────────────┘
    if (result.error) {
       notify toast side-channel with {code, message}
       return state   // unchanged, per D-02
    }
    return result.state
        │
        ▼
applyMove(state, move) -- pure, framework-free, in its own module
  ├─ enforces playerId === currentTurn player (D-03)
  ├─ dispatches to per-move-type handler (PLAY_CARDS / PICK_UP_PILE / SWAP_CARDS / READY_UP)
  ├─ each handler calls gameLogic.ts predicates only (canPlayMultipleCards,
  │    shouldBurnPile, getNextPlayer, hasPlayerWon, getStartingPlayer, ...)
  ├─ builds entirely new state/player/array objects (no mutation)
  └─ returns { state, error? } — never throws (D-02/D-04)
        │
        ▼
useGameStateUpdater(testMode, roomCode, setGameState)
  persists to localStorage (non-test mode) or just calls setGameState (test mode)
        │
        ▼
React re-render → screens read new state from Context, toast (if any) renders
```

Trace for "play cards, invalid move": click → Game screen calls `dispatchMove({type:'PLAY_CARDS', playerId, cards})` → reducer calls `applyMove` → `applyMove`'s `PLAY_CARDS` handler calls `gameLogic.canPlayMultipleCards` → false → returns `{state: unchangedState, error:{code:'INVALID_PLAY', message:'...'}}` → reducer notices `error`, feeds it to the toast side-channel, returns `state` unchanged → Context re-renders with same game state but new toast → `<Toast>` in orchestrator shows the message, auto-dismisses after N seconds (D-05/D-07).

### Recommended Project Structure

```
src/
├── engine/
│   ├── applyMove.ts          # pure reducer: applyMove(state, move) -> {state, error?}
│   ├── moves.ts               # Move discriminated union type + move-specific payload types
│   └── errors.ts              # error code constants ('NOT_YOUR_TURN', 'INVALID_PLAY', ...)
├── context/
│   └── GameContext.tsx        # GameProvider + useGameContext + useReducer wiring + toast side-channel
├── hooks/
│   ├── useGameState.ts        # existing — persistence integration point, keep as-is or adapt
│   ├── useHandSorting.ts      # existing — stays local UI state
│   ├── useSelection.ts        # existing — stays local UI state (not game state, per CONTEXT.md)
│   └── useToast.ts            # new — small hook: show(message, code?), current toast, dismiss timer
├── screens/
│   ├── MenuScreen.tsx          # extracted from App.tsx screen === 'menu' branch
│   ├── LobbyScreen.tsx         # extracted from App.tsx screen === 'lobby' branch
│   └── GameScreen.tsx          # extracted from App.tsx screen === 'game' branch (still composes Table/Hand/piles)
├── components/
│   ├── Toast.tsx               # new — single generic-style toast, corner-positioned
│   ├── Card.tsx, Hand.tsx, Table.tsx, piles/*   # existing, updated to dispatch moves not mutate state directly
├── App.tsx                     # becomes the slim orchestrator: routing by phase, GameProvider wiring, header, <Toast/>
├── gameLogic.ts                 # unchanged — existing pure predicates, single source of rules truth
└── types.ts                     # existing types + Move union types added (or co-located in engine/moves.ts)
```

### Pattern 1: `applyMove` as a discriminated-union pure reducer

**What:** A single exported function that takes the current `GameState` and a tagged `Move` object, and returns `{state, error?}`. Internally it's a switch (or dispatch table) over `move.type`, with each branch calling into `gameLogic.ts` predicates for all rule decisions — never reimplementing a rule inline.

**When to use:** For every one of the four move types (PLAY_CARDS, PICK_UP_PILE, SWAP_CARDS, READY_UP) plus the two setup-phase swap variants currently hidden in Hand.tsx/Table.tsx (hand↔hand reorder, faceUp↔faceUp reorder — see Common Pitfalls).

**Example (structure, not full implementation):**
```typescript
// src/engine/moves.ts
import type { CardSelection } from '../types';

export type Move =
  | { type: 'PLAY_CARDS'; playerId: string; cards: CardSelection[] }
  | { type: 'PICK_UP_PILE'; playerId: string; revealedFaceDownIndex?: number }
  | { type: 'SWAP_CARDS'; playerId: string; handIndex: number; faceUpIndex: number }
  | { type: 'READY_UP'; playerId: string };

export interface MoveError {
  code: 'NOT_YOUR_TURN' | 'INVALID_PLAY' | 'WRONG_PHASE' | 'NO_SELECTION' | 'PILE_EMPTY' | string;
  message: string;
}

export interface ApplyMoveResult {
  state: GameState;
  error?: MoveError;
}
```

```typescript
// src/engine/applyMove.ts
import * as GameLogic from '../gameLogic';
import type { GameState } from '../types';
import type { Move, ApplyMoveResult } from './moves';

export function applyMove(state: GameState, move: Move): ApplyMoveResult {
  const playerIndex = state.players.findIndex((p) => p.id === move.playerId);
  if (playerIndex === -1) {
    return { state, error: { code: 'UNKNOWN_PLAYER', message: 'Player not found' } };
  }

  // D-03: enforce turn ownership for gameplay moves (not lobby/setup moves like READY_UP/SWAP_CARDS,
  // which are allowed any time during 'setup' phase, not gated on currentTurn)
  switch (move.type) {
    case 'PLAY_CARDS':
      return applyPlayCards(state, move, playerIndex);
    case 'PICK_UP_PILE':
      return applyPickUpPile(state, move, playerIndex);
    case 'SWAP_CARDS':
      return applySwapCards(state, move, playerIndex);
    case 'READY_UP':
      return applyReadyUp(state, move, playerIndex);
  }
}
```

Each `applyXxx` helper builds new arrays/objects at every level (`{...state, players: state.players.map(...)}`), calls only `GameLogic.*` predicates for decisions, and returns `{state: newState}` on success or `{state, error}` (original `state` reference, unchanged) on rejection. Source: existing predicate set in `src/gameLogic.ts` (read directly, HIGH confidence — this is the project's own code, not an external library).

### Pattern 2: Context + `useReducer` wiring (React's own recommended pattern for this exact scenario)

**What:** `GameProvider` wraps `useReducer` around a thin adapter that calls `applyMove`, plus exposes `dispatchMove` and `gameState` via `useGameContext()`. This is React's documented pattern for "many components need to read the same state, and updates can come from deep in the tree" — see react.dev "Scaling Up with Reducer and Context" `[CITED: react.dev]`.

**When to use:** Exactly the D-08 scenario — GameState needs to reach Menu/Lobby/Game screens plus Table/Hand grandchildren without prop drilling, and future phases (3, 6) add nesting layers.

**Example:**
```typescript
// src/context/GameContext.tsx
import { createContext, useContext, useReducer, useCallback } from 'react';
import { applyMove } from '../engine/applyMove';
import type { Move, MoveError } from '../engine/moves';
import type { GameState } from '../types';

interface GameContextValue {
  gameState: GameState | null;
  dispatchMove: (move: Move) => void;
  lastError: MoveError | null;   // consumed by the toast, reset on next successful/failed dispatch
}

const GameContext = createContext<GameContextValue | null>(null);

function reducer(state: GameState | null, move: Move): GameState | null {
  if (!state) return state;
  const result = applyMove(state, move);
  return result.state; // errors surfaced via a side-channel, see below — useReducer can't return a tuple to the dispatcher
}

export function GameProvider({ initialState, children }: { initialState: GameState | null; children: React.ReactNode }) {
  const [gameState, dispatch] = useReducer(reducer, initialState);
  const [lastError, setLastError] = useState<MoveError | null>(null);

  const dispatchMove = useCallback((move: Move) => {
    if (!gameState) return;
    const result = applyMove(gameState, move); // compute once to inspect error before/alongside dispatch
    if (result.error) {
      setLastError(result.error);
      return; // D-02: do not dispatch a state change on error — state stays as-is
    }
    setLastError(null);
    dispatch(move); // reducer recomputes applyMove — see Pitfall 3 for why, and the alternative
  }, [gameState]);

  return (
    <GameContext.Provider value={{ gameState, dispatchMove, lastError }}>
      {children}
    </GameContext.Provider>
  );
}

export function useGameContext() {
  const ctx = useContext(GameContext);
  if (!ctx) throw new Error('useGameContext must be used within GameProvider');
  return ctx;
}
```

**Note on the double-invocation shown above:** calling `applyMove` once in `dispatchMove` to inspect the error, then letting `dispatch` call the reducer (which calls `applyMove` again) is intentionally shown as the naive approach so the planner can decide between two real options — see Pitfall 3, "useReducer can't report per-dispatch failure," for the tradeoff and the cleaner alternative (skip `useReducer` for the *error* path and just call `applyMove` once directly in `dispatchMove`, using `setState`-equivalent only when there's no error — this avoids running the reducer at all when rejected, and avoids double computation on success too).

### Pattern 3: Deduplication into `gameLogic.ts` — the four confirmed duplication sites

**What:** Move all rule logic and array-construction logic currently living in `App.tsx`/`Hand.tsx`/`Table.tsx` into `gameLogic.ts` (or the new `engine/` module, calling into `gameLogic.ts`), and have every consumer import the single implementation.

**Confirmed sites (read directly from source, HIGH confidence):**

1. **Hand-sort comparators** — `App.tsx:562-579` (inside `playCards`, re-sorts hand before playing) and `Hand.tsx:91-108` (sorts hand for display) contain **byte-for-byte duplicate** rank/suit comparator logic. Extract to `gameLogic.ts` as `sortHand(hand: (Card|null)[], mode: HandSortMode): {card: Card, arrayIndex: number}[]` and call it from both sites.
2. **"Cards share a rank" checks** — `Hand.tsx:150-155` and `:182-187`, plus `Table.tsx:103-108` and `:131-136`, each reimplement "does this card's rank match the first selected card's rank" inline instead of calling `GameLogic.canPlayMultipleCards`. These are tooltip/selectability checks, not the actual play validation, but they duplicate the *same rule* the reducer will enforce — extract a `canAddToSelection(candidate: Card, selected: Card[]): boolean` helper in `gameLogic.ts`.
3. **Deck creation/shuffling** — `App.tsx:20-45` (`createDeck`/`shuffleDeck`) is duplicated **verbatim** in `src/__tests__/utils/deck.test.ts:7-32` as a private copy rather than importing the real implementation. Move `createDeck`/`shuffleDeck` into `gameLogic.ts` (or a new `src/deck.ts` if kept separate for single-responsibility), have `App.tsx`'s room/test-game creation import it, and **rewrite `deck.test.ts` to import and test the real function** rather than testing a parallel copy — otherwise the "duplication" is preserved, just relocated.
4. **Unnamed fourth site — setup-phase swap logic bypassing `swapCards` entirely.** `Hand.tsx:203-220` reimplements hand↔hand card swapping (splice-free reorder via `[...player.hand]`, index swap, `updateGameState` call) independent of the `swapCards` prop/handler that `App.tsx` defines at line 388. `Table.tsx:168-185` does the same for faceUp↔faceUp swapping. Neither of these paths goes through `swapCards`, and after this refactor neither will go through `applyMove`'s `SWAP_CARDS` case unless explicitly folded in. **This directly contradicts ENGINE-01** ("every move... processed by one applyMove reducer... no duplicate rule logic... left elsewhere") unless addressed. Recommend extending the `SWAP_CARDS` move type to accept same-source swaps (hand↔hand, faceUp↔faceUp) in addition to the existing hand↔faceUp swap, or introducing `REORDER_HAND`/`REORDER_FACEUP` move types — a planning decision, not a research one, but the *existence* of this site must reach the planner.

### Pattern 4: Toast side-channel from a pure reducer

**What:** Because `applyMove` returns `{state, error?}` rather than throwing, and `useReducer`'s reducer function can only return the next state (not a tuple), the error needs a side-channel to reach the toast. Two standard approaches:

- **Approach A (shown in Pattern 2):** Skip `useReducer`'s built-in dispatch for the error path — call `applyMove` directly inside a `dispatchMove` callback that also owns `setState`/`setLastError`. Simpler, avoids reducer purity debates, avoids double-computation confusion. Recommended given D-02's contract is already `{state, error?}` rather than throw-based (which is what `useReducer` + error boundaries would assume).
- **Approach B:** Store `{gameState, lastError}` as a single combined object in the reducer's state shape (`reducer(state, move) => {gameState: result.state, lastError: result.error ?? null}`), so `useReducer` handles both in one round-trip with no double computation. Slightly more idiomatic "pure reducer" style, but couples the toast's lifecycle to the game-state reducer's state shape.

Either is acceptable; Approach B avoids the double-`applyMove`-call subtlety in Pattern 2's naive draft and is the tighter fit for `useReducer`. This is an implementation detail correctly left to Claude's discretion per CONTEXT.md ("internal reducer structure... not a decision the user needs to weigh in on") — but the *existence* of the side-channel problem is a research finding the planner needs, since D-07 ("replace-not-queue... resets the dismiss timer") implies the toast's dismiss-timer state also needs to live somewhere reachable from every dispatch, most naturally the `useToast` hook (see Code Examples).

### Anti-Patterns to Avoid
- **Mutating array elements in place inside `applyMove` handlers** (`updatedPlayer.hand[index] = null` on the *original* `player.hand` reference) — this is exactly the current bug (`App.tsx:465` takes a live reference, `App.tsx:582`/`:628`-`:640` mutate it). Always `const newHand = [...player.hand]; newHand[index] = null;` before touching a nested array.
- **Reimplementing a `gameLogic.ts` predicate inline "just for a tooltip"** — this is precisely how the current duplication happened (Hand.tsx/Table.tsx's tooltip logic re-derives the same rank-matching and playability rules `canPlayMultipleCards`/`canPlayCard` already encode). Tooltips should call the same predicates the reducer calls, even if it means exporting a couple of tooltip-only helper predicates from `gameLogic.ts` alongside the reducer-facing ones.
- **Letting the Context provider own DOM/animation state** (`drawingCards`, `document.querySelector` calls, `flushSync`) — that's presentation-layer, UI-thread-timing-sensitive code that doesn't belong in a `GameProvider` whose job is to host reducer-derived game state. Keep it in `GameScreen.tsx` as local component state, reading `gameState` from context but not storing animation-transient state there.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|--------------|-----|
| Toast notifications | A generic toast queue/stacking system | A single-slot `useToast` hook (current message + timeout ref) per D-07's "replace-not-queue" | D-07 explicitly rejects a queue; building one is scope creep the user already declined |
| Shared game state across screens | Prop-drilling through the orchestrator, or a third-party state library | `createContext` + `useReducer` (built into React 19, already a dependency) | D-08 locks Context; adding zustand/redux/jotai for a single game-state object with one provider is unjustified dependency weight for what React's built-ins already solve cleanly |
| Deck shuffling algorithm | A new shuffle implementation, or a "verify randomness" test suite | The existing Fisher-Yates `shuffleDeck` in `App.tsx:38-45`, relocated not rewritten | Already correct (standard Fisher-Yates, unbiased); the fix needed is deduplication (Pattern 3, site 3), not a rewrite |
| Rank/rule comparison logic | New comparator functions per component | `RANK_VALUES` map and `canPlayCard`/`canPlayMultipleCards` already in `gameLogic.ts` | These are already correct and tested (6 existing test files cover `gameLogic.ts` extensively); the entire point of ENGINE-04 is routing everything through this single source, not writing new rule code |

**Key insight:** Almost nothing in this phase requires new logic — the correct rules already exist in `gameLogic.ts` and are well-tested. The work is entirely architectural: relocate duplicate implementations to call the one true source, and stop mutating state in place while doing so.

## Common Pitfalls

### Pitfall 1: The direct-mutation bug is broader than the one named line pair
**What goes wrong:** CONTEXT.md names `App.tsx:465` (live reference) and `App.tsx:582` (`player.hand = sortedHand.map(...)`) as *the* mutation bug. Reading the full `playCards` function shows the same live-reference-then-mutate pattern recurring multiple times in the *same function*: `updatedPlayer.hand[index] = null` (lines 628-630, 633-635, 638-640, on `const updatedPlayer = { ...player }` — a shallow copy, so `updatedPlayer.hand` is still the *same array reference* as `player.hand`), and again inside the blind-play-fails branch (lines 649-673) and the draw-cards-fill branch (lines 811-817), which mutates `updatedPlayer.hand` well after the "immutable" `updatedState` object has already been constructed and handed to `updateGameState` in the non-drawing branch.
**Why it happens:** `{ ...player }` is a shallow copy — `hand`/`faceUp`/`faceDown` arrays are still shared references with the original `player` object (and, transitively, with `gameState.players[playerIndex]`, and with anything else holding a reference to that player before the update, e.g. closures in event handlers or the `player` local variable used for `lastAction` messages later in the same function).
**How to avoid:** In `applyMove`, every array touched must be spread (`const newHand = [...player.hand]`) *before* index-assignment, at every single mutation site, not just the two named in CONTEXT.md. A reducer test that asserts referential inequality (`expect(result.state.players[0].hand).not.toBe(originalState.players[0].hand)`) after every move type, combined with a test that the *original* state object passed in is unchanged after a call (`expect(originalState).toEqual(structuredClone(originalStateBeforeCall))`), will catch any remaining shallow-copy mistakes — recommend this as a standard assertion pattern across all D-11 exhaustive engine tests, not just once.
**Warning signs:** Any place using `array[index] = value` instead of `[...array.slice(0,index), value, ...array.slice(index+1)]` or `array.map((v,i) => i===index ? value : v)` on data that came from the function's input parameters (as opposed to a value freshly created within the same function call).

### Pitfall 2: React 19 StrictMode double-invocation will surface leftover mutation bugs loudly (which is good — but expect noisy failures during the transition)
**What goes wrong:** `main.tsx` already wraps the app in `<StrictMode>`. StrictMode double-invokes state updater functions and effects in development to surface side-effect bugs. If any mutation-in-place code survives the refactor (e.g. the Hand.tsx/Table.tsx swap sites from Pitfall/Pattern 3, site 4, if missed), StrictMode's double-invocation can cause visibly incorrect double-swaps or corrupted array state during manual testing, which is a useful signal but can be confusing if not expected.
**Why it happens:** `[CITED: react.dev/reference/react/StrictMode]` — StrictMode intentionally calls component render/effect functions twice in development to help find impure code; mutating handlers that aren't pure will produce different results on the second invocation.
**How to avoid:** Treat any StrictMode-only glitch during manual verification as a signal to re-check for a missed mutation site, not as a StrictMode bug to work around by removing StrictMode.
**Warning signs:** A card swap or play that "sometimes" applies twice, or a hand that briefly shows a stale state before correcting, specifically in dev mode but not (or less) in a production build.

### Pitfall 3: `useReducer` cannot report per-dispatch success/failure back to the caller
**What goes wrong:** `applyMove`'s contract (D-02) is `{state, error?}` — a value returned synchronously to whoever calls it. `useReducer`'s `dispatch` function returns `void` — there's no way for a `dispatchMove(move)` call site (a screen component) to know, from the `dispatch` call itself, whether the move succeeded or was rejected. This mismatch is architecturally exactly why Pattern 4 exists: something has to bridge `applyMove`'s per-call error into a place the toast can read it.
**Why it happens:** This is a fundamental characteristic of the reducer pattern in React — `dispatch` is fire-and-forget by design, matching `setState`'s own fire-and-forget nature. `[CITED: react.dev/reference/react/useReducer]`
**How to avoid:** Pick Pattern 4's Approach A or B deliberately (don't let it emerge as an accident); document the choice in the plan so the engine-wiring task and the toast task agree on where `lastError` lives.
**Warning signs:** A toast task and an engine-wiring task planned as fully independent tasks that don't reference how the error crosses the boundary — this is a common seam where "the reducer works" and "the toast works" pass their own tests independently but fail to integrate.

### Pitfall 4: The draw-card animation's `flushSync` + `setTimeout` + `document.querySelector` sequencing is fragile to reducer refactors
**What goes wrong:** `playCards` (`App.tsx:763-825`) uses `flushSync(() => updateGameState(updatedState))` followed by nested `setTimeout`s that query the DOM for `.hand-area [data-empty-slot]` positions, depending on the *exact* render timing of the state update to find empty hand slots before they're filled. If `applyMove`'s `PLAY_CARDS` handler changes when/how the "empty slots to fill" information is computed or exposed, this animation's slot-finding logic can silently break (cards drawing to the wrong position, or not animating) without any test catching it, since there's no automated test for the animation path.
**Why it happens:** The animation logic depends on state shape and timing details of the *current* `playCards` implementation that aren't part of `gameLogic.ts`'s pure predicates — it's DOM-coupled, not rule-coupled.
**How to avoid:** D-10 already scopes visual/UX changes out of this phase, and the roadmap explicitly defers rebuilding this animation to Phase 6 (POLISH-01: "rebuilt on the Phase 1 engine, no `document.querySelector`/`setTimeout`/`flushSync` hacks"). For *this* phase, the safe move is to keep the same drawn-cards-array-index bookkeeping shape leaving `GameScreen.tsx` (wherever `playCards`-equivalent logic ends up calling `dispatchMove` for `PLAY_CARDS`) so the existing animation code can be lifted with minimal change, and manually re-verify the draw animation after wiring (it has no test coverage and Phase 1 doesn't add any — this is a known gap, not a phase-1 test requirement, since ENGINE-07 asks for engine + screen tests, not animation tests).
**Warning signs:** Draw animation plays cards flying to `(0,0)` or off-screen after the refactor — usually means the `emptyIndices`/`drawnCards` computation moved to a point where the DOM hasn't rendered the new slots yet.

### Pitfall 5: `App.css` import fix is one line, but two celebration-animation classes are used before the CSS exists to back them
**What goes wrong:** `App.tsx` already references `celebration-modal`, `celebration-emoji-pulse`, and `celebration-emoji` classes (lines 1464-1490) whose keyframes live in `App.css` (`:81-91`). This is *already-correct* JSX from recent commits (`feat: Add player finish celebration modals`, `fix: Resolve celebration modal race conditions...`) — the only missing piece, confirmed by reading `main.tsx`, is that `main.tsx` imports `./index.css` and `./storage` but not `./App.css`.
**Why it happens:** The CSS file was written and the JSX was written to reference its classes, but the import statement wiring them together was never added.
**How to avoid:** Add `import './App.css';` to `main.tsx` (or to `App.tsx` itself — either resolves it via Vite's CSS bundling; `main.tsx` matches the existing `./index.css` import site for consistency).
**Warning signs:** None needed — this is a confirmed, located, one-line fix, not a debugging task.

## Code Examples

### `useToast` hook (D-05/D-06/D-07: single slot, auto-dismiss, replace-not-queue, resets timer)
```typescript
// src/hooks/useToast.ts
import { useState, useCallback, useRef } from 'react';

export interface ToastState {
  message: string;
  code?: string;
}

const DISMISS_MS = 3500;

export function useToast() {
  const [toast, setToast] = useState<ToastState | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const show = useCallback((message: string, code?: string) => {
    if (timerRef.current) clearTimeout(timerRef.current); // D-07: reset the dismiss timer
    setToast({ message, code });                            // D-07: replace, not queue
    timerRef.current = setTimeout(() => setToast(null), DISMISS_MS);
  }, []);

  const dismiss = useCallback(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
    setToast(null);
  }, []);

  return { toast, show, dismiss };
}
```

### `<Toast>` component (D-05: corner, non-blocking; D-06: one generic style for all codes)
```typescript
// src/components/Toast.tsx
import { X } from 'lucide-react'; // already a project dependency
import type { ToastState } from '../hooks/useToast';

export function Toast({ toast, onDismiss }: { toast: ToastState | null; onDismiss: () => void }) {
  if (!toast) return null;
  return (
    <div
      role="alert"
      aria-live="polite"
      className="fixed bottom-4 right-4 z-50 max-w-sm bg-slate-800 border-2 border-red-500 rounded-lg p-4 shadow-2xl flex items-start gap-3"
    >
      <p className="text-white text-sm flex-1">{toast.message}</p>
      <button onClick={onDismiss} aria-label="Dismiss" className="text-white/70 hover:text-white">
        <X size={16} />
      </button>
    </div>
  );
}
```
Position/style choices (corner, colour, icon) are within Claude's discretion per CONTEXT.md — this example follows the existing app's Tailwind slate/purple/red palette (`App.tsx`'s pick-up-confirmation modal already uses `bg-slate-800 border-2 border-purple-500`) for visual consistency rather than introducing a new colour scheme.

### Engine test pattern (D-11: exhaustive per-move-type, valid + each rejection reason)
```typescript
// src/__tests__/engine/applyMove.test.ts (new file — pattern matches existing __tests__/gameLogic/*.test.ts style)
import { describe, it, expect } from 'vitest';
import { applyMove } from '../../engine/applyMove';
import type { GameState } from '../../types';

function makeState(overrides: Partial<GameState> = {}): GameState {
  // build a minimal valid GameState fixture — recommend a shared test builder
  // (src/__tests__/testUtils/buildGameState.ts) since every move-type test needs one
  return { /* ... */ } as GameState;
}

describe('applyMove - PLAY_CARDS', () => {
  it('rejects a move from a player whose id does not match currentTurn', () => {
    const state = makeState({ currentTurn: 0 });
    const result = applyMove(state, { type: 'PLAY_CARDS', playerId: 'not-current-player', cards: [] });
    expect(result.error?.code).toBe('NOT_YOUR_TURN');
    expect(result.state).toBe(state); // D-02: unchanged state reference on rejection
  });

  it('does not mutate the input state on a successful play', () => {
    const state = makeState(/* valid first-turn setup */);
    const before = structuredClone(state);
    applyMove(state, { type: 'PLAY_CARDS', playerId: state.players[state.currentTurn].id, cards: [{ type: 'hand', index: 0 }] });
    expect(state).toEqual(before); // ENGINE-02: original object untouched
  });

  it('returns a new player array reference on success', () => {
    const state = makeState(/* ... */);
    const result = applyMove(state, { type: 'PLAY_CARDS', playerId: state.players[state.currentTurn].id, cards: [{ type: 'hand', index: 0 }] });
    expect(result.state.players).not.toBe(state.players);
    expect(result.state.players[0].hand).not.toBe(state.players[0].hand);
  });
});
```
The `structuredClone`-based "input unchanged" assertion and the `.not.toBe()` reference-inequality assertions are the concrete, repeatable pattern for verifying ENGINE-02 across all of D-11's exhaustive per-move-type + edge-case tests — recommend the plan calls this out as a required assertion pair for *every* engine test, not left to individual task discretion.

### Screen smoke test pattern (D-12: render + key interaction, not just mount)
```typescript
// src/__tests__/screens/GameScreen.test.tsx (new — first RTL usage in this codebase)
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom'; // needs vitest.config.ts setupFiles wiring — see Wave 0 Gaps
import { GameProvider } from '../../context/GameContext';
import { GameScreen } from '../../screens/GameScreen';

describe('GameScreen', () => {
  it('renders the board and triggers a dispatch when a playable card is clicked', () => {
    const initialState = /* build a 'playing' phase GameState fixture */;
    render(
      <GameProvider initialState={initialState}>
        <GameScreen />
      </GameProvider>
    );
    const card = screen.getByTestId(/* or getByRole/getByText per Card.tsx's rendered content */);
    fireEvent.click(card);
    // assert on the resulting DOM (selected-state ring class, or updated hand display)
    // rather than mocking dispatchMove — RTL favours asserting observable outcomes
  });
});
```
`@testing-library/react` 16.x supports React 19 out of the box `[VERIFIED: npm registry — package installed and its peerDependencies accept react ^19]`; no compatibility shims needed.

## State of the Art

| Old Approach (current `App.tsx`) | Current Approach (target) | When Changed | Impact |
|--------------------|-------------------|---------------|--------|
| Move handlers (`playCards`, `pickUpPile`, `swapCards`, `setReady`) inline in the 1,501-line root component, each independently deciding rules and mutating state | Single `applyMove(state, move)` pure reducer, all rule decisions delegated to `gameLogic.ts`, all handlers pure | This phase (ENGINE-01) | Enables Phase 2's server-side validation to reuse the exact same module; removes the "four places to check when a rule changes" maintenance cost |
| `alert()` for all invalid-move feedback (14 call sites) | In-app toast, `{code, message}` from `applyMove`'s error | This phase (ENGINE-05) | Non-blocking UX; `code` becomes usable for server-side logging/rate-limiting in Phase 2 (MPLAY-04) without UI changes |
| `App.css` written but not imported — celebration keyframes inert | One-line `import './App.css'` | This phase (ENGINE-06) | No code change beyond the import; JSX and CSS already correct as of the current commit |
| Prop-drilled `gameState`/`updateGameState`/`selectedCards` through `Table`/`Hand` component props | `GameProvider` Context, `useGameContext()` in consumers | This phase (ENGINE-03/D-08) | Insulates Phase 3 (accessibility wrapper nesting) and Phase 6 (shared `Modal`) from prop-chain rewrites |

**Deprecated/outdated:**
- Direct object/array mutation of React state (`player.hand = ...`, `updatedPlayer.hand[i] = ...` on a shared-reference array) — never valid in React's mental model, was already a bug, not a pattern that changed over time.

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | `zustand`'s current npm version (5.0.14) was checked only for the Alternatives Considered table's context, not recommended for use — flagged `[VERIFIED: npm registry]` for registry existence only, not vetted via official docs since it is explicitly *not* being adopted (contradicts D-08) | Standard Stack → Alternatives Considered | None — this package is explicitly rejected, the version check was informational only |
| A2 | React 19's `useReducer`/Context guidance ("dispatch is fire-and-forget, no return value") is standard, well-established React behaviour going back to React 16's Hooks introduction, not something that changed in React 19 specifically — stated as `[CITED: react.dev]` based on training knowledge of React's stable API surface, not re-verified against a version-specific changelog this session | Common Pitfalls → Pitfall 3 | Low — this API characteristic has been stable across all Hook-era React versions; if wrong, the reducer-wiring pattern (Pattern 2/4) would need revisiting but the underlying problem (error side-channel needed) would still exist |
| A3 | The DISMISS_MS constant (3500ms) in the `useToast` code example is an arbitrary illustrative value, not derived from any project convention or user decision — D-05 only says "auto-dismiss after a few seconds" without a number | Code Examples → useToast hook | None if treated as illustrative; risk only if the planner treats 3500 as a locked value rather than a placeholder for the implementing task to choose |

## Open Questions (RESOLVED)

1. **Does the `SWAP_CARDS` move type need to cover same-source reordering (hand↔hand, faceUp↔faceUp), or is that intentionally left as local UI-only reordering outside the engine?**
   - What we know: `Hand.tsx` and `Table.tsx` currently implement hand↔hand and faceUp↔faceUp swapping locally, bypassing both the `swapCards` prop and (post-refactor) `applyMove` entirely.
   - What's unclear: Whether this is "duplicate rule logic" in ENGINE-01's sense (a card-position mutation that changes game state, so arguably yes) or purely cosmetic reordering with no rule content (arguably fine to leave as local Context-dispatched-but-trivial state, since there's no "rule" being duplicated, just an index swap).
   - Recommendation: Treat as in-scope for `applyMove` given ENGINE-02's "no move handler mutates existing state... in place" applies to *any* state mutation, not just rule-gated ones — these two sites currently do mutate-adjacent things (build new arrays correctly today, but bypass the reducer and update Context state directly). Fold into `SWAP_CARDS` (extend its payload to accept `{sourceA: CardSource, indexA, sourceB: CardSource, indexB}`) or add a lightweight `REORDER` move type. Flag for the plan's task breakdown.
   - **RESOLVED (Plan 01-01, `moves.ts`):** `SWAP_CARDS` was extended to the `sourceA/indexA/sourceB/indexB` shape (not a separate `REORDER` type), covering hand<->hand and faceUp<->faceUp reordering in addition to hand<->faceUp. Implemented in `applyMove.ts`'s `applySwapCards` (Plan 01-02) and dispatched from `Hand.tsx`/`Table.tsx` (Plan 01-07).

2. **Should `applyMove`'s `PICK_UP_PILE` handling also fold in the separate `confirmPickUpPile` confirmation-modal flow (`App.tsx:836-924`), or does the confirmation modal stay purely client-side UI state (not a move) with only the final "yes, pick up" click dispatching `PICK_UP_PILE`?**
   - What we know: `pickUpPile` decides whether confirmation is needed (calls `GameLogic.shouldConfirmPickUp`) and either shows a confirmation modal or calls `confirmPickUpPile` directly; `confirmPickUpPile` does the actual state change.
   - What's unclear: Whether "should I confirm" is a query the UI makes against `gameLogic.ts` directly (fine, it's a pure predicate, not a mutation) before ever dispatching a move, or whether `applyMove` itself should express a rejection/confirmation-required outcome via the error channel.
   - Recommendation: Keep `shouldConfirmPickUp` as a UI-side pre-check (call `GameLogic.shouldConfirmPickUp` directly from the screen component to decide whether to show the confirm modal), and have `applyMove`'s `PICK_UP_PILE` case perform the actual pickup unconditionally once dispatched (mirroring today's `confirmPickUpPile`) — this keeps the reducer's job purely "given a move, produce a result," with the confirm-or-not UX decision staying a presentation concern, consistent with D-10's "no visual/UX changes."
   - **RESOLVED (Plan 01-06, `GameScreen.tsx`):** `shouldConfirmPickUp` stays a UI-side pre-check called directly from `GameScreen`'s `pickUpPile` handler before deciding whether to show the confirmation modal; `applyMove`'s `PICK_UP_PILE` case (Plan 01-02) performs the pickup unconditionally once dispatched, with no confirmation-awareness inside the reducer itself.

## Environment Availability

Skipped — this phase has no external service/tool dependencies beyond the already-installed npm toolchain (Node, npm, Vite, Vitest — all present and already used by the existing `npm test`/`npm run dev`/`npm run build` scripts in `package.json`). No new environment setup is required.

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Vitest 4.0.16 (installed), jsdom environment, `globals: true` |
| Config file | `vitest.config.ts` (repo root) |
| Quick run command | `npm test -- --run src/__tests__/engine` (or `npx vitest run <path>` for a specific new file) |
| Full suite command | `npm test -- --run` (or `npm run test:coverage` for coverage) |

### Phase Requirements → Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| ENGINE-01 | Every move type routes through `applyMove`, no rule logic duplicated elsewhere | unit | `npx vitest run src/__tests__/engine/applyMove.test.ts` | ❌ Wave 0 |
| ENGINE-02 | No handler mutates input state/player objects | unit (reference-inequality + `structuredClone`-equality assertions embedded in every applyMove test) | `npx vitest run src/__tests__/engine/applyMove.test.ts` | ❌ Wave 0 (same file as ENGINE-01) |
| ENGINE-03 | Screens render correctly split from `App.tsx` | smoke (RTL render) | `npx vitest run src/__tests__/screens` | ❌ Wave 0 |
| ENGINE-04 | Deduped logic behaves identically to the old inline implementations | unit — extend existing `gameLogic` tests, **rewrite** `deck.test.ts` to import real `createDeck`/`shuffleDeck` instead of its private copy | `npx vitest run src/__tests__/gameLogic src/__tests__/utils/deck.test.ts` | ✅ (existing, needs edit) |
| ENGINE-05 | Toast shows on invalid move, replaces on second invalid move, auto-dismisses | unit (hook) + smoke (component interaction) | `npx vitest run src/__tests__/hooks/useToast.test.ts src/__tests__/screens` | ❌ Wave 0 |
| ENGINE-06 | Celebration CSS actually applies | manual-only — justification: verifying a CSS animation "plays" visually is not meaningfully assertable via jsdom (no real paint/animation timing); the *import* itself can be asserted, but the visual effect cannot | manual visual check in browser | n/a |
| ENGINE-07 | Coverage exists for engine + screens | — (meta-requirement, satisfied by the above rows collectively) | `npm run test:coverage` | — |

### Sampling Rate
- **Per task commit:** targeted `npx vitest run <changed-file-pattern>` for the file(s) touched
- **Per wave merge:** `npm test -- --run` (full suite)
- **Phase gate:** Full suite green before `/gsd-verify-work`, plus a manual check of the celebration animation and draw-card animation (both outside automated coverage per Pitfall 4 / ENGINE-06 manual-only note)

### Wave 0 Gaps
- [ ] `vitest.config.ts` — `setupFiles: []` is currently empty; needs `setupFiles: ['./src/test-setup.ts']` (or inline) importing `@testing-library/jest-dom` once, so `toBeInTheDocument()` etc. are available to all RTL tests without per-file imports
- [ ] `src/__tests__/engine/applyMove.test.ts` — covers ENGINE-01/ENGINE-02
- [ ] `src/__tests__/screens/*.test.tsx` — covers ENGINE-03/ENGINE-05 (smoke + interaction)
- [ ] `src/__tests__/hooks/useToast.test.ts` — covers ENGINE-05's dismiss/replace-timer behaviour in isolation
- [ ] `src/__tests__/testUtils/buildGameState.ts` (or similar) — a shared `GameState` fixture builder; D-11's "exhaustive per-move-type" bar means many tests need a valid baseline state, and building one inline per test (as `core.test.ts` currently does with raw object literals) will get unwieldy fast — worth a shared builder before D-11's volume of tests is written
- [ ] `src/__tests__/utils/deck.test.ts` — needs editing (not creating) to import the real `createDeck`/`shuffleDeck` post-relocation instead of its current private copy, per Pattern 3 site 3

## Security Domain

This phase has no authentication, session, or cryptography surface (single-browser, no network calls beyond `localStorage`) — most ASVS categories are not applicable yet (Phase 2 introduces Supabase auth/session, at which point V2/V3 become relevant). The one category that *is* directly relevant is input validation, because `applyMove` is explicitly being built as "the actual Phase 2 security boundary" (D-02).

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | No | Deferred to Phase 2 (Supabase anonymous auth, MPLAY-03) |
| V3 Session Management | No | Deferred to Phase 2 |
| V4 Access Control | Yes (in embryonic form) | `applyMove`'s D-03 turn-ownership check (`playerId` must match `state.currentTurn`'s player) is the access-control mechanism this phase must get right, since Phase 2's server will trust this same check unchanged |
| V5 Input Validation | Yes | Every `Move`'s `playerId` and payload indices must be validated *inside* `applyMove` (player exists, indices in range, card references non-null) before being used — this is exactly what D-02/D-04's `{code, message}` error contract exists to enforce cleanly, rather than assuming a well-behaved caller |
| V6 Cryptography | No | No crypto surface in this phase |

### Known Threat Patterns for this stack

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| A future network caller (Phase 2 Edge Function context) sends a move with a `playerId` that isn't the actual authenticated caller | Spoofing | Out of scope for Phase 1's `applyMove` itself (Phase 1 has no auth to check `playerId` against) — but Phase 1 must ensure `applyMove` unconditionally rejects any move where `move.playerId !== state.players[state.currentTurn].id`, so that *when* Phase 2 adds "does this authenticated session's id match playerId" on top, the underlying game-rule check is already sound and independent |
| Malformed/out-of-range card indices in a `Move` payload (e.g. `{type:'PLAY_CARDS', cards:[{type:'hand', index: 999}]}`) | Tampering | `applyMove` must bounds-check every index against the relevant array length and return a `{code: 'INVALID_SELECTION', ...}` error rather than throwing or producing `undefined`/`NaN` propagation into state — this is directly testable under D-11's "each distinct rejection reason" requirement |

## Sources

### Primary (HIGH confidence)
- `src/gameLogic.ts`, `src/App.tsx`, `src/components/Hand.tsx`, `src/components/Table.tsx`, `src/types.ts`, `src/hooks/useGameState.ts`, `src/hooks/useSelection.ts`, `src/hooks/useHandSorting.ts`, `src/storage.ts`, `src/main.tsx`, `src/App.css`, `src/index.css`, `src/components/Card.tsx`, `src/__tests__/utils/deck.test.ts`, `src/__tests__/gameLogic/core.test.ts` — read directly this session, exact line references verified against current file contents, not from CONTEXT.md's summary alone
- `package.json`, `vitest.config.ts`, `tailwind.config.js`, `eslint.config.js` — read directly this session
- `npm view <pkg> version` — ran directly against the npm registry for `react`, `vitest`, `@testing-library/react`, `zustand` this session

### Secondary (MEDIUM confidence)
- React documentation on `useReducer` and Context+reducer scaling pattern — `[CITED: react.dev]`, referenced from training knowledge of React's stable, long-documented Hooks API; not re-fetched via WebFetch this session since the API surface described (dispatch is fire-and-forget, Context+useReducer is the recommended pattern for cross-tree state) has been stable and unchanged since Hooks' introduction and is not React-19-version-specific
- React StrictMode double-invocation behaviour — `[CITED: react.dev/reference/react/StrictMode]`, same basis as above

### Tertiary (LOW confidence)
- None — all findings in this document are either read directly from the project's own source (HIGH) or well-established, version-stable React documentation content (MEDIUM, cited but not re-fetched this session)

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — no new packages, all versions confirmed live against npm registry this session
- Architecture: HIGH — patterns derived directly from reading the actual codebase (exact line numbers cited) plus React's own stable, well-documented Context+reducer guidance
- Pitfalls: HIGH — every pitfall traced to a specific, currently-existing line range in the codebase, not speculative

**Research date:** 2026-07-25
**Valid until:** 60 days — this is an internal refactor of first-party code with no new external dependencies; the only external-facing information (npm registry versions) is unlikely to require re-verification unless planning is significantly delayed
