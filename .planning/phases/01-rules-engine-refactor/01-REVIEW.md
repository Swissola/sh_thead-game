---
phase: 01-rules-engine-refactor
reviewed: 2026-07-25T12:00:00Z
depth: standard
files_reviewed: 25
files_reviewed_list:
  - src/App.tsx
  - src/__tests__/App.test.tsx
  - src/__tests__/components/Toast.test.tsx
  - src/__tests__/engine/applyMove.test.ts
  - src/__tests__/gameLogic/dedup.test.ts
  - src/__tests__/hooks/useToast.test.ts
  - src/__tests__/screens/GameScreen.test.tsx
  - src/__tests__/screens/LobbyScreen.test.tsx
  - src/__tests__/screens/MenuScreen.test.tsx
  - src/__tests__/testUtils/buildGameState.test.ts
  - src/__tests__/testUtils/buildGameState.ts
  - src/__tests__/utils/deck.test.ts
  - src/components/Hand.tsx
  - src/components/Table.tsx
  - src/components/Toast.tsx
  - src/context/GameContext.tsx
  - src/engine/applyMove.ts
  - src/engine/errors.ts
  - src/engine/moves.ts
  - src/gameLogic.ts
  - src/hooks/useToast.ts
  - src/main.tsx
  - src/screens/GameScreen.tsx
  - src/screens/LobbyScreen.tsx
  - src/screens/MenuScreen.tsx
  - src/test-setup.ts
findings:
  critical: 2
  warning: 4
  info: 2
  total: 8
status: issues_found
---

# Phase 01: Code Review Report

**Reviewed:** 2026-07-25T12:00:00Z
**Depth:** standard
**Files Reviewed:** 25
**Status:** issues_found

## Summary

Reviewed the Phase 1 rules-engine refactor: `applyMove`/`gameLogic` reducer, `GameContext`/`useToast` state management, and the `Menu`/`Lobby`/`Game` screen extraction, plus their tests. The reducer's rejection paths (WRONG_PHASE, NOT_YOUR_TURN, INVALID_SELECTION, etc.) are solid and well covered by tests, and the "never mutate, always return fresh state" discipline documented in the file headers does hold up under inspection for the paths that are checked.

However, the file's own claim that `applyMove` is "the actual Phase 2 security boundary" does not hold for the play-source ordering rule (hand → face-up → face-down): nothing in `applyPlayCards` verifies that a `PLAY_CARDS` selection's source (`hand`/`faceUp`/`faceDown`) matches the player's actually-available source computed via `getAvailableCardSource`. That variable is computed but only consulted inside the narrow "combine hand+faceUp when deck is empty" branch. A caller can submit a `faceDown` (blind) selection, or a pure `faceUp` selection, while the player still holds hand cards, and the reducer will process it as a normal/blind play. This is a genuine rule-bypass in the authoritative reducer, not just a client-UI gap (the UI does gate this correctly, but per the file's own stated threat model, the UI is not trusted).

Also found a silent-data-loss path in the move-dispatch/persistence pipeline (storage write failures are neither awaited nor caught), a switch statement in `applyMove` with no fallback for unrecognised move types, a lost-update race in room joining, weak room-code generation, and a chunk of near-duplicated selection/tooltip logic between `Hand.tsx` and `Table.tsx`.

## Critical Issues

### CR-01: applyMove does not enforce hand → face-up → face-down play order

**File:** `src/engine/applyMove.ts:35-133` (particularly lines 52, 56-85, 87-99, 117-133)
**Issue:**
`applyPlayCards` computes `cardSource = GameLogic.getAvailableCardSource(...)` (line 52), but that value is only ever read inside the `hasMixedSelection` branch (line 59: `cardSource !== 'hand'`), which exists purely to gate the special "combine hand + face-up cards when the deck is empty" rule. There is no check anywhere in the function that a plain `faceUp` selection is only legal when the player's hand is empty, or that a `faceDown` selection is only legal when both hand and faceUp are empty.

Concretely:
- `isBlindPlay` is derived only from `move.cards[0].type === 'faceDown'` (line 53) — it says nothing about whether the player was entitled to play blind.
- The bounds/null checks in the `cardsToPlay` build loop (lines 87-99) resolve whichever array `selection.type` names (`hand`/`faceUp`/`faceDown`) without ever comparing that to `cardSource`.
- The first-turn check (lines 101-115) and the `canPlayMultipleCards` check (lines 117-119, and again at line 133 for the blind-invalid path) operate purely on card rank, never on source legality.

Net effect: a client (or a bug elsewhere producing a `PLAY_CARDS` move) can select `{ type: 'faceDown', index: N }` — or `{ type: 'faceUp', index: N }` — while the player still holds cards in hand, and `applyMove` will process it as a legitimate blind play or face-up play. If the face-down card's rank happens to satisfy `canPlayMultipleCards`/the first-turn rank check, the move succeeds outright: a card is played out of turn-order, the discard pile is mutated, and `isFirstTurn`/`currentTurn` advance, all while the player's hand cards sit untouched and out of sequence. The `Hand.tsx`/`Table.tsx` `selectable` props enforce the correct order only in the UI (`GameLogic.getAvailableCardSource(player) === 'faceDown'` etc.) — exactly the kind of client-side-only enforcement the file's own header comment says this reducer exists to replace.

**Fix:** Validate selection sources against `cardSource` before building `cardsToPlay`, e.g.:
```ts
const cardSource = GameLogic.getAvailableCardSource({ ...player, hand: effectiveHand });
const selectionTypes = new Set(move.cards.map((s) => s.type));

// Allow the documented hand+faceUp combo exception; otherwise every
// selection's source must equal the single currently-available source.
const isDocumentedCombo = hasMixedSelection; // computed as today
if (!isDocumentedCombo) {
    for (const type of selectionTypes) {
        if (type !== cardSource) {
            return {
                state,
                error: {
                    code: ERROR_CODES.INVALID_SELECTION,
                    message: `You must play from your ${cardSource} cards first`,
                },
            };
        }
    }
}
```
Apply the same "must currently be the faceDown source" constraint to `PICK_UP_PILE`'s `revealedFaceDownIndex` handling (`applyPickUpPile`, lines 341-350) unless voluntary pickup-with-reveal is an intentionally accepted exception — if so, document that explicitly next to the RESEARCH.md Open Question 2 comment, since it currently reads as an oversight rather than a decision.

### CR-02: Move-dispatch persistence failures are silent — no user feedback, potential data loss

**File:** `src/hooks/useGameState.ts:8-20`, `src/context/GameContext.tsx:47-58`
**Issue:**
`dispatchMove` (GameContext.tsx:47-58) is synchronous and calls `updateGameState(result.state)` without awaiting anything. `useGameStateUpdater`'s non-testMode branch (`useGameState.ts:14`) calls `window.storage.set(...)` and immediately continues to `setGameState(newState)` without awaiting or attaching a `.catch()`:
```ts
window.storage.set(`game:${roomCode}`, JSON.stringify(newState), true);
setGameState(newState);
```
`gameStorage.set` (`src/storage.ts:10-17`) re-throws on failure (e.g. `localStorage.setItem` throwing `QuotaExceededError`, or being unavailable in a private/embedded context), which becomes an unhandled promise rejection here. Local React state is updated regardless, so the acting player's UI shows the move as having succeeded even though it was never persisted. Because `Router`'s poll effect (`App.tsx:23-32`) overwrites local state from storage every 2 seconds, the very next poll tick will silently revert this player's screen to the pre-move state, with no toast, no error, and no indication of what happened.

This is inconsistent with `setGameState` (used by `MenuScreen`/`LobbyScreen`), which *is* awaited and wrapped in try/catch with a `showToast(...)` fallback (`MenuScreen.tsx:118-123`, `125-158`). Gameplay moves get none of that protection.

**Fix:** Make `updateGameState` async, await the storage write, and surface failures the same way `setGameState` does:
```ts
const updateGameState = useCallback(async (newState: GameState) => {
    if (testMode) {
        setGameState(newState);
        return;
    }
    try {
        await window.storage.set(`game:${roomCode}`, JSON.stringify(newState), true);
        setGameState(newState);
    } catch {
        showToast('Failed to save your move — please retry.');
    }
}, [testMode, roomCode, setGameState, showToast]);
```
and have `dispatchMove` await/handle the resulting promise (or at minimum attach a `.catch()` at the call site) rather than firing-and-forgetting it.

## Warnings

### WR-01: applyMove has no fallback for an unrecognised move.type

**File:** `src/engine/applyMove.ts:23-33`
**Issue:** The `switch (move.type)` covers exactly the four `Move` union members and has no `default` case. TypeScript accepts this only because it trusts the static `Move` type; there is no runtime guard. If `applyMove` is ever called with a malformed/unexpected object — which is exactly the scenario the file's own header comment anticipates for Phase 2 ("the actual Phase 2 security boundary") — the function falls through the switch and implicitly returns `undefined`, despite its declared `ApplyMoveResult` return type. The caller in `GameContext.dispatchMove` (line 51: `if (result.error)`) would then throw `Cannot read properties of undefined` on a legitimately possible bad-input path.
**Fix:**
```ts
switch (move.type) {
    case 'READY_UP': return applyReadyUp(state, playerIndex);
    case 'SWAP_CARDS': return applySwapCards(state, move, playerIndex);
    case 'PICK_UP_PILE': return applyPickUpPile(state, move, playerIndex);
    case 'PLAY_CARDS': return applyPlayCards(state, move, playerIndex);
    default:
        return { state, error: { code: ERROR_CODES.INVALID_SELECTION, message: 'Unrecognised move type' } };
}
```

### WR-02: MenuScreen.joinRoom has a read-modify-write race (lost update)

**File:** `src/screens/MenuScreen.tsx:125-158`
**Issue:** `joinRoom` reads the room's current state via `window.storage.get`, pushes the joining player onto `state.players` locally, and writes the whole object back via `setGameState`. If two players join the same room within the same ~poll window, both reads can observe the same pre-join player list, and whichever write lands second silently discards the first joiner — no error, no toast, the first player simply never appears in anyone's lobby. This is a real defect in the shipped code today, independent of the Phase 2 Realtime migration mentioned elsewhere in the comments (which will remove the localStorage read-modify-write pattern entirely, but hasn't happened yet in this phase).
**Fix:** Out of scope to fully solve with the current localStorage-only backend, but at minimum detect the collision (e.g., re-read after write and confirm the joining player is present) and surface a "please retry" toast rather than failing silently.

### WR-03: Room code generation is weak and can produce short/predictable codes

**File:** `src/screens/MenuScreen.tsx:102`
**Issue:** `Math.random().toString(36).substr(2, 6).toUpperCase()` has two problems: (1) `Math.random` is not intended for anything access-control-adjacent, and a 6-character base36 code (~31 bits) is brute-forceable by an automated client hitting `joinRoom` repeatedly with no rate limiting anywhere in this codebase; (2) `.toString(36)` on a random float can legitimately produce fewer than 8 total characters (e.g. when the fractional part has few significant base-36 digits), so `.substr(2, 6)` can silently return a code shorter than 6 characters, further reducing the guess space. `.substr` is also deprecated. There is also no uniqueness check against an existing room before using the generated code.
**Fix:**
```ts
const code = Array.from(crypto.getRandomValues(new Uint8Array(6)))
    .map((b) => (b % 36).toString(36))
    .join('')
    .toUpperCase();
```
and check `window.storage.get(`game:${code}`)` for a collision before committing to it (loop/regenerate on collision).

### WR-04: Hand.tsx and Table.tsx duplicate ~80 lines of selectable/tooltip logic

**File:** `src/components/Hand.tsx:100-163`, `src/components/Table.tsx:96-145`
**Issue:** Both components independently re-derive `currentSource`/`top`, build near-identical tooltip strings ("Not your turn", "10 cannot be played on a 7", "Limiter (7): only 7 or lower allowed", "Can't be played on the current pile", "Select same rank to play together"), and independently recompute `isPlayable`/`selectable` with the same branching structure. This is straightforward duplicated logic (not just similar-looking JSX) — a future rule change (e.g., a new special card) requires updating both files in lockstep, and it's easy to update one and miss the other. The onClick handlers in both files are also deeply nested (4-5 levels of conditionals), which hurts readability and testability.
**Fix:** Extract a shared `getCardPlayability(card, { player, gameState, isSetupPhase, isMyTurn, selectedCards, source })` helper into `gameLogic.ts` or a new `src/uiLogic.ts` that returns `{ selectable, tooltip }`, and have both `Hand.tsx` and `Table.tsx` call it.

## Info

### IN-01: Duplicate, unused `PlayResult` interface in types.ts

**File:** `src/types.ts:51-54`
**Issue:** `types.ts` declares `export interface PlayResult { valid: boolean; message: string; }`, which is never imported or used anywhere in the codebase. `gameLogic.ts:142-146` declares its own, differently-shaped `PlayResult` (`{ burned, cardsPlayed, message }`) which is the one actually used throughout `applyMove.ts` and its tests. Having two same-named, differently-shaped interfaces in the same codebase is confusing for anyone who autocompletes the wrong one.
**Fix:** Delete the unused `PlayResult` from `types.ts`.

### IN-02: Negative slice bound in the test-mode console.log buffer

**File:** `src/screens/GameScreen.tsx:133`
**Issue:** `setConsoleLogs((prev) => [...prev.slice(-(50 - pendingLogs.length)), ...pendingLogs])`. If more than 50 messages accumulate in `pendingLogs` before the scheduled flush runs, `50 - pendingLogs.length` goes negative, and `Array.prototype.slice` with a positive-magnitude-but-now-differently-signed argument no longer means "last N" — the intended "keep the log capped at ~50 entries" invariant silently stops holding for that flush. Not crash-prone, but it defeats the log cap it's trying to implement, and only manifests in `testMode`.
**Fix:** Clamp the slice bound: `prev.slice(-Math.max(0, 50 - pendingLogs.length))`.

---

_Reviewed: 2026-07-25T12:00:00Z_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
