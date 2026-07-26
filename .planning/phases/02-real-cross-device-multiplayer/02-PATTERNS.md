# Phase 2: Real Cross-Device Multiplayer - Pattern Map

**Mapped:** 2026-07-26
**Files analyzed:** 21 (8 new backend, 5 new client, 8 modified client)
**Analogs found:** 15 / 21 (backend/networking files have no in-repo analog since this is a client-only app pre-Phase-2; client-side files reuse strong existing seams)

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|---|---|---|---|---|
| `supabase/migrations/0001_rooms_and_rls.sql` | migration | CRUD | none in repo | no analog (see RESEARCH.md Code Examples) |
| `supabase/functions/_shared/engine.ts` | utility (re-export barrel) | transform | `src/engine/moves.ts` (barrel-style type/value re-export) | role-match |
| `supabase/functions/create-room/index.ts` | controller (Edge Function) | request-response | `src/screens/MenuScreen.tsx`'s `createRoom` | role-match (same operation, moving tier) |
| `supabase/functions/join-room/index.ts` | controller (Edge Function) | request-response | `src/screens/MenuScreen.tsx`'s `joinRoom` | role-match |
| `supabase/functions/start-game/index.ts` | controller (Edge Function) | request-response | `src/screens/LobbyScreen.tsx`'s `startGame` | role-match |
| `supabase/functions/apply-move/index.ts` | controller (Edge Function) | request-response + optimistic-concurrency retry | `src/engine/applyMove.ts` (wrapped, not reimplemented) + `src/context/GameContext.tsx`'s `dispatchMove` | role-match |
| `supabase/functions/check-turn-timeout/index.ts` | controller (Edge Function) | batch/event-driven (lazy sweep) | `supabase/functions/apply-move/index.ts` (sibling, same retry-loop shape) | role-match (self-referential, no prior analog) |
| `src/supabase/client.ts` | config | request-response (client singleton) | `src/storage.ts` (existing storage-seam singleton + global wiring) | partial match |
| `src/hooks/useRoomSubscription.ts` | hook | streaming (Realtime Postgres Changes) | `src/App.tsx`'s `Router` poll `useEffect` (lines 23-32) - the exact mechanism being replaced | exact (functional replacement) |
| `src/hooks/usePresence.ts` | hook | pub-sub (Realtime Presence) | `src/hooks/useToast.ts` (hook-shape: internal state + subscription-like effect) | partial match (no true presence analog exists) |
| `src/App.tsx` | provider/router (modified) | event-driven (auth bootstrap + URL routing) | its own current `Router`/`ShitheadGame` (being edited in place) | exact (self) |
| `src/hooks/useGameState.ts` | hook (modified persistence seam) | CRUD | its own current `useGameStateUpdater` | exact (self) |
| `src/context/GameContext.tsx` | provider (modified `dispatchMove`) | request-response + optimistic apply | its own current `dispatchMove` (lines 47-61) | exact (self) |
| `src/screens/MenuScreen.tsx` | screen/controller (modified) | request-response | its own current `createRoom`/`joinRoom` | exact (self) |
| `src/screens/LobbyScreen.tsx` | screen/controller (modified) | request-response | its own current `startGame`/`copyRoomCode` | exact (self) |
| `src/hooks/useToast.ts` | hook (modified: add `variant`) | transform | its own current `useToast` | exact (self) |
| `src/components/Toast.tsx` | component (modified: variant styling) | transform | its own current `Toast` | exact (self) |
| `src/screens/GameScreen.tsx` | screen (modified: offline badges + Leave Game) | request-response + presence-driven render | its own player-tile block (lines 590-628) + Rules button/`pickUpConfirmation` portal (lines 356-363, 656-683) | exact (self) |
| `src/engine/applyMove.ts` | service/reducer (modified: gate `revealedFaceDownIndex`) | transform | its own CR-01 fix in `applyPlayCards` (lines 94-112) | exact (self, cross-function pattern reuse) |
| `src/__tests__/hooks/useRoomSubscription.test.ts` | test | streaming | `src/__tests__/hooks/useToast.test.ts` (renderHook + fake timers/async hook testing convention) | role-match |
| `src/__tests__/hooks/usePresence.test.ts` | test | pub-sub | `src/__tests__/hooks/useToast.test.ts` | role-match |

## Pattern Assignments

### `src/hooks/useRoomSubscription.ts` (hook, streaming)

**Analog:** `src/App.tsx`'s `Router` (current poll `useEffect`, lines 18-32)

**What's being replaced** (`src/App.tsx:23-32`):
```typescript
useEffect(() => {
    if (!gameState || testMode) return;
    const interval = setInterval(async () => {
        const result = await window.storage.get(`game:${gameState.roomCode}`, true);
        if (result) {
            setGameState(JSON.parse(result.value));
        }
    }, 2000);
    return () => clearInterval(interval);
}, [gameState?.roomCode, testMode, setGameState]);
```
**Shape to carry forward:** same guard (`if (!gameState || testMode) return`), same dependency on `gameState?.roomCode`/`testMode`, same `setGameState` write-back target, same cleanup-on-unmount contract (`return () => ...`) - just replace the `setInterval`/`window.storage.get` body with a `.channel(...).on('postgres_changes', ...).subscribe()` (RESEARCH.md Pattern 1) and clean up with `supabase.removeChannel(channel)` instead of `clearInterval`.

**Reconciliation responsibility:** per RESEARCH.md Pattern 3, this hook's `postgres_changes` callback is also the actual reconciliation trigger (not the `functions.invoke()` response) - it should compare `version`/state against the local optimistic value and call `showToast(..., 'RECONCILED')` (D-12) when they differ, matching the toast call shape already used in `GameContext.tsx`'s `dispatchMove`.

---

### `src/hooks/usePresence.ts` (hook, pub-sub)

**No strong in-repo analog** - this is a genuinely new capability (RESEARCH.md Pattern 5). Closest structural precedent for *hook shape* (internal state + cleanup):

**Analog:** `src/hooks/useToast.ts` (lines 10-26)
```typescript
export function useToast() {
    const [toast, setToast] = useState<ToastState | null>(null);
    const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    const show = useCallback((message: string, code?: string) => {
        if (timerRef.current) clearTimeout(timerRef.current);
        setToast({ message, code });
        timerRef.current = setTimeout(() => setToast(null), DISMISS_MS);
    }, []);
    ...
    return { toast, show, dismiss };
}
```
Follow this shape - internal `useState` for derived presence map, a `useEffect` that subscribes/tracks on mount and tears down on unmount (`supabase.removeChannel`), returning a small plain object (`{ onlinePlayerIds }`) rather than exposing the raw channel. Use RESEARCH.md's own code example (Architecture Patterns, Pattern 5) for the Supabase-specific subscribe/track calls themselves - there is no existing Realtime usage in this repo to copy verbatim.

---

### `src/App.tsx` (provider/router, modified)

**Analog:** itself - current `Router`/`ShitheadGame` (full file above)

**What changes:**
1. The poll `useEffect` (lines 23-32) is deleted and replaced by a call to the new `useRoomSubscription` hook.
2. `ShitheadGame`'s `crypto.randomUUID()` playerId bootstrap:
```typescript
// current (line 45):
const [playerId] = useState(() => crypto.randomUUID());
```
becomes an anonymous-auth session check (RESEARCH.md Code Examples / Pattern 4) - `useEffect` on mount calling `supabase.auth.getSession()` then `signInAnonymously()` only if absent, setting `playerId` from `session.user.id` once resolved (async, so `playerId` starts as `null`/`''` and the provider should not render children with an empty ID - mirror the existing `if (!gameState) return null;` early-return convention used throughout `GameScreen.tsx`/`Table.tsx` for "wait for data" gating).
3. New: read `location.pathname` once on mount for the `/join/:code` deep-link (D-15) and pass the parsed code down to `MenuScreen` as an initial prop/state seed - no router library, per RESEARCH.md's Don't Hand-Roll table. `Router`'s existing pattern of deriving all render decisions from `gameState.phase` (lines 34-41) is the model to extend, not replace: the join-link only pre-fills `MenuScreen`'s existing input state, it does not add a new `phase`.

---

### `src/hooks/useGameState.ts` (hook, modified persistence seam)

**Analog:** itself - current `useGameStateUpdater` (full file above)

**Current shape to preserve exactly:**
```typescript
export function useGameStateUpdater(
    testMode: boolean,
    roomCode: string,
    setGameState: (s: GameState) => void,
    showToast: (message: string, code?: string) => void
) {
    const updateGameState = useCallback(async (newState: GameState) => {
        if (testMode) {
            setGameState(newState);
            return;
        }
        try {
            await window.storage.set(`game:${roomCode}`, JSON.stringify(newState), true);
            setGameState(newState);
        } catch {
            showToast('Failed to save your move - please retry.');
        }
    }, [testMode, roomCode, setGameState, showToast]);

    return updateGameState;
}
```
**What changes:** the `try { await window.storage.set(...) }` body becomes `await supabase.functions.invoke('apply-move', { body: move })` (or is removed entirely if `dispatchMove` in `GameContext.tsx` takes over calling the Edge Function directly per RESEARCH.md Pattern 3 - confirm during planning which layer owns the network call). The `testMode` short-circuit, the `try/catch` → `showToast` failure path, and the hook's signature/dependency-array shape should all carry over unchanged - this is the CR-02 error-handling contract Phase 1 already established and Phase 2 must not regress.

---

### `src/context/GameContext.tsx` (provider, modified `dispatchMove`)

**Analog:** itself - current `dispatchMove` (lines 47-61)

```typescript
const dispatchMove = useCallback(
    (move: Move) => {
        if (!gameState) return;
        const result = applyMove(gameState, move);
        if (result.error) {
            showToast(result.error.message, result.error.code);
            return;
        }
        void updateGameState(result.state);
    },
    [gameState, updateGameState, showToast]
);
```
**What changes (RESEARCH.md Pattern 3):** the existing "compute `applyMove` locally, toast on `result.error`, else write" structure IS the optimistic-apply pattern already - it doesn't need reinventing, only extending: after `void updateGameState(result.state)` (now firing the `apply-move` Edge Function per above), attach a `.then()` that shows a **distinct** `'RECONCILED'`-coded toast if the server rejects what the client thought was legal, per D-12's copy ("Your move didn't stick - synced with the latest game state."). The `useCallback` dependency-array discipline and the "one call-site, no duplication" comment (lines 8-13) are the conventions to preserve.

**Toast variant note:** `showToast(message, code)`'s existing two-arg shape needs a third optional `variant` param (or `code` itself gains a new sentinel value `'RECONCILED'` alongside the closed `ERROR_CODES` set) - see Toast pattern below.

---

### `src/screens/MenuScreen.tsx` (screen/controller, modified)

**Analog:** itself - current `createRoom`/`joinRoom` (lines 109-191)

**Current try/catch/showToast shape to preserve:**
```typescript
const createRoom = async () => {
    if (!playerName.trim()) {
        showToast('Please enter your name');
        return;
    }
    let code = generateRoomCode();
    for (let attempts = 0; attempts < 5; attempts++) {
        const existing = await window.storage.get(`game:${code}`, true);
        if (!existing) break;
        code = generateRoomCode();
    }
    const newGameState: GameState = { ... };
    try {
        await setGameState(newGameState);
    } catch {
        showToast('Failed to create room');
    }
};
```
**What changes:** the collision-check loop (`window.storage.get` against a client-generated code) and the direct `setGameState(newGameState)` write both move server-side into the `create-room` Edge Function (RESEARCH.md Pitfall 3 - this is a trust-boundary write, same as any `Move`). `generateRoomCode()` (lines 13-18, `crypto.getRandomValues`-based, WR-03) stays client-side as a *suggestion* only if the Edge Function itself doesn't generate the code - confirm during planning; either way the collision-avoidance *concept* (regenerate on collision, bounded attempts) moves to a Postgres unique-constraint retry inside the Edge Function per RESEARCH.md's Architecture Patterns. The `if (!playerName.trim())` early-validation-then-showToast pattern is unchanged and should gate the new Edge-Function call the same way it gates the old direct write.

**Also modified per D-15/D-09:** add a copy-join-link button next to the existing pattern from `LobbyScreen.tsx`'s `copyRoomCode` (see below) and pre-fill `playerName` from a persisted last-used-name value (read once on mount, e.g. from the same anon-auth-adjacent local storage the Supabase client already uses for session persistence) instead of the current `useState('')` default (line 26).

---

### `src/screens/LobbyScreen.tsx` (screen/controller, modified)

**Analog:** itself - current `startGame`/`copyRoomCode` (full file above)

**Copy-to-clipboard pattern to replicate for the new join-link button (D-15):**
```typescript
const [copied, setCopied] = useState(false);

const copyRoomCode = () => {
    if (!gameState) return;
    navigator.clipboard.writeText(gameState.roomCode);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
};
```
UI-SPEC.md's copy for the new join-link button follows this exact interaction shape (`Link2` → `Check` icon swap, 2s revert) - duplicate this function as `copyJoinLink` writing `` `${origin}/join/${gameState.roomCode}` `` instead of the bare code, with its own `copied`/`copiedLink` state pair so the two buttons don't fight over one boolean.

**`startGame`'s client-side deal-and-write** (lines 22-50) has the same trust-boundary problem as `createRoom`/`joinRoom`: `GameLogic.shuffleDeck`/`createDeck` run client-side today and the result is written directly via `setGameState`. This entire body moves into the `start-game` Edge Function (RESEARCH.md Pitfall 3), reusing the *same* `GameLogic.shuffleDeck(GameLogic.createDeck(numDecks))` call - not reimplemented server-side, imported from `supabase/functions/_shared/engine.ts`.

**New (D-07/D-08):** host-removes-AFK-player and host-auto-transfer-on-disconnect are new lobby-only Edge Function-backed actions with no existing client-side analog in this file; model their button/handler shape on the existing `startGame` handler (host-gated via `isHost`, disabled/short-circuited when the precondition isn't met, same `async () => { ...; await ...; }` shape) rather than inventing a new interaction pattern.

---

### `src/hooks/useToast.ts` + `src/components/Toast.tsx` (modified: `variant` support, D-10/D-12)

**Analog:** both files' own current state (full contents above)

**`useToast.ts` current signature:**
```typescript
export interface ToastState {
    message: string;
    code?: string;
}
const show = useCallback((message: string, code?: string) => { ... }, []);
```
**Change:** add a `variant?: 'error' | 'reconcile' | 'reconnect'` field to `ToastState`, defaulting to `'error'` in `show()`'s signature (`show(message, code?, variant: ToastState['variant'] = 'error')`) so every existing `showToast(message, code)` call site (in `GameContext.tsx`, `GameScreen.tsx`, `MenuScreen.tsx`) keeps compiling unchanged - this exact backward-compatible-default approach is called out in UI-SPEC.md's Interaction Notes and must be honoured, not reworked into a breaking signature change.

**`Toast.tsx` current single-style render:**
```typescript
export function Toast({ toast, onDismiss }: { toast: ToastState | null; onDismiss: () => void }) {
    if (!toast) return null;
    return (
        <div role="alert" aria-live="polite"
             className="fixed bottom-4 right-4 z-50 max-w-sm bg-slate-800 border-2 border-red-500 rounded-lg p-4 shadow-2xl flex items-start gap-3">
            <p className="text-white text-sm flex-1">{toast.message}</p>
            <button onClick={onDismiss} aria-label="Dismiss" className="text-white/70 hover:text-white">
                <X size={16} />
            </button>
        </div>
    );
}
```
**Change:** the hardcoded `border-red-500` becomes a lookup keyed on `toast.variant` (`error` → `border-red-500` unchanged; `reconcile` → `border-amber-500` per UI-SPEC.md's amber "reconciliation/attention" color; `reconnect` → `border-green-500`), and an icon is added per UI-SPEC.md's Copywriting Contract (`RotateCcw` for reconcile, `CheckCircle2` for reconnect) next to the existing `X` dismiss button - the `role="alert"`/`aria-live="polite"` accessibility contract and the `onDismiss` button stay exactly as-is (existing `Toast.test.tsx` asserts on `getByRole('alert')` and the dismiss button - preserve both).

---

### `src/screens/GameScreen.tsx` (modified: offline badges D-10, Leave Game button D-14)

**Analog:** itself - player-tile block (lines 590-628) for badges; header Rules button + `pickUpConfirmation` portal (lines 356-363, 656-683) for Leave Game

**Player-tile block to extend (lines 590-628):**
```typescript
{gameState.players.map((player, index) => {
    const isTheirTurn = gameState.phase === 'playing' && gameState.players[gameState.currentTurn]?.id === player.id;
    ...
    return (
        <div key={player.id} ... className={`rounded-lg p-3 border-2 transition-all ${isControlling ? '...' : 'bg-slate-800 border-slate-700'} ${isTheirTurn ? 'border-yellow-500 shadow-lg' : ''} ...`}>
            <div className="flex items-center justify-between mb-2">
                <p className="text-white font-semibold truncate">{player.name}...</p>
                {isTheirTurn && <div className="w-2 h-2 bg-yellow-500 rounded-full animate-pulse" />}
            </div>
            ...
        </div>
    );
})}
```
**What to add:** a derived `isOffline = !onlinePlayerIds.includes(player.id)` (from the new `usePresence` hook) and `isAutoPickingUp` (derived from a server-provided "grace period expired" flag - likely a field added to `GameState`/`Player` or computed client-side from `turn_started_at` + 60s, to be resolved in planning) drive: (a) the tile's className gaining `opacity-60 border-slate-600` per UI-SPEC.md's neutral/offline color when `isOffline`, following the exact same conditional-class-string style already used for `isControlling`/`isTheirTurn` above; (b) a new badge element (`WifiOff` icon + "Offline" label, or `RotateCw` + "Offline - auto-picking up" in amber once the grace period expires) placed in the same `flex items-center justify-between mb-2` header row as the existing turn-indicator dot, sized per UI-SPEC.md's existing 8px badge pattern (`text-xs px-2 py-1 rounded`, matching `LobbyScreen.tsx`'s "You" badge: `className="text-xs bg-purple-600 px-2 py-1 rounded"`).

**Leave Game button placement (header, analog at lines 356-363):**
```typescript
<button
    onClick={() => setShowRules(!showRules)}
    className="p-2 bg-purple-600 hover:bg-purple-700 rounded-lg transition-colors"
    title="Rules"
>
    <HelpCircle size={24} className="text-white" />
</button>
```
Add a sibling button in the same `flex items-center gap-3` container, same `p-2 rounded-lg` shape but neutral slate palette (`bg-slate-700 hover:bg-slate-600` per UI-SPEC.md) with a `LogOut` icon, opening a confirm dialog.

**Confirm dialog analog (`pickUpConfirmation` portal, lines 656-683):**
```typescript
{pickUpConfirmation?.show &&
    createPortal(
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
            <div className="bg-slate-800 border-2 border-purple-500 rounded-lg p-6 max-w-md shadow-2xl">
                <h2 className="text-xl font-bold text-white mb-4">Confirm Pick Up</h2>
                <p className="text-slate-300 mb-6">...</p>
                <div className="flex gap-4">
                    <button onClick={...} className="flex-1 px-4 py-2 bg-slate-700 hover:bg-slate-600 text-white rounded-lg font-semibold transition-colors">Cancel</button>
                    <button onClick={confirmPickUpAnyway} className="flex-1 px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg font-semibold transition-colors">Pick Up Anyway</button>
                </div>
            </div>
        </div>,
        document.body
    )}
```
Duplicate this exact structure for the new "Leave game?" dialog per UI-SPEC.md's Copywriting Contract: same `createPortal`-to-`document.body` mechanism, same `bg-black/50` overlay / `border-2 border-purple-500` panel, buttons relabelled "Keep Playing" (same neutral `slate-700`/`slate-600` classes as the existing "Cancel") and "Leave Game" (same `bg-red-600 hover:bg-red-700` classes as the existing "Pick Up Anyway", per UI-SPEC.md's explicit instruction to match that treatment even though leaving is reversible).

---

### `src/engine/applyMove.ts` (modified: gate `revealedFaceDownIndex`, hardening pass)

**Analog:** its own CR-01 fix in `applyPlayCards` (lines 94-112) - the pattern to replicate in `applyPickUpPile`

```typescript
// Enforce the hand -> face-up -> face-down play order (CR-01): outside the
// documented hand+faceUp combo exception, every selection's source must equal
// the player's single currently-available source.
if (!hasMixedSelection) {
    const selectionTypes = new Set(move.cards.map((s) => s.type));
    for (const type of selectionTypes) {
        if (type !== cardSource) {
            return {
                state,
                error: { code: ERROR_CODES.INVALID_SELECTION, message: `You must play from your ${cardSource} cards first` },
            };
        }
    }
}
```
**Where to apply the same idea (`applyPickUpPile`, lines 367-386):** RESEARCH.md's Pitfall 2 identifies `revealedFaceDownIndex` as currently un-gated against `GameLogic.getAvailableCardSource(player) === 'faceDown'`. If the hardening decision (a genuinely open call per RESEARCH.md, not a re-run of CR-01) is to close this gap, follow the exact same shape: compute `const cardSource = GameLogic.getAvailableCardSource(player);` at the top of `applyPickUpPile` and only honour `move.revealedFaceDownIndex` when `cardSource === 'faceDown'`, returning an `INVALID_SELECTION` error otherwise - reusing the same error code and message style (`` `You must play from your ${cardSource} cards first` ``) already established by CR-01's fix, for consistency of the closed `ERROR_CODES` set (D-04).

**Existing regression tests to extend (not duplicate):** `src/__tests__/engine/applyMove.test.ts` already has "rejects INVALID_SELECTION for a faceDown selection while the player still holds hand cards (CR-01)" and the faceUp equivalent - add a parallel `PICK_UP_PILE`-with-`revealedFaceDownIndex`-while-holding-hand-cards test alongside them, same `describe`/`it` structure.

---

## Shared Patterns

### Error/Toast dispatch (existing, extend don't replace)
**Source:** `src/context/GameContext.tsx`'s `dispatchMove` (lines 47-61), `src/hooks/useToast.ts`'s `show()`
**Apply to:** `apply-move` Edge Function's rejection path, `useRoomSubscription.ts`'s reconciliation callback, `useGameState.ts`'s persistence-failure path
```typescript
if (result.error) {
    showToast(result.error.message, result.error.code);
    return;
}
```
Every new failure/reconciliation surface should route through this exact `showToast(message, code)` call shape (now with an added `variant` argument), never a raw `alert()`/`console.error`-only path - this was Phase 1's D-05/D-06/D-07 convention and Phase 2 must not regress it.

### Try/catch-then-showToast for async writes (existing, extend don't replace)
**Source:** `src/hooks/useGameState.ts`'s `useGameStateUpdater`, `src/screens/MenuScreen.tsx`'s `createRoom`/`joinRoom`
**Apply to:** every new `supabase.functions.invoke(...)` call site (create-room, join-room, start-game, apply-move)
```typescript
try {
    await window.storage.set(`game:${roomCode}`, JSON.stringify(newState), true);
    setGameState(newState);
} catch {
    showToast('Failed to save your move - please retry.');
}
```
Replace the storage call with the Edge Function invocation; keep the try/catch → generic-failure-toast shape identical, since D-06's "Room not found"/"Game has already started" style messages already establish the plain-statement error copy convention UI-SPEC.md's Copywriting Contract explicitly continues.

### Copy-to-clipboard with 2s revert (existing, replicate exactly)
**Source:** `src/screens/LobbyScreen.tsx`'s `copyRoomCode` (lines 15-20)
**Apply to:** the new copy-join-link button (D-15)
```typescript
const copyRoomCode = () => {
    if (!gameState) return;
    navigator.clipboard.writeText(gameState.roomCode);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
};
```

### Portal-based confirm dialog (existing, replicate exactly)
**Source:** `src/screens/GameScreen.tsx`'s `pickUpConfirmation` portal (lines 656-683)
**Apply to:** the new "Leave game?" confirm dialog (D-14)
Same `createPortal(..., document.body)` + `bg-black/50` overlay + `border-2 border-purple-500` panel + two-button (`slate` dismiss / `red-600` confirm) structure.

### `applyMove` as the untouched trust boundary (RESEARCH.md, not yet in repo)
**Source:** `src/engine/applyMove.ts` (whole file - already pure, already returns `{state, error?}`, already enforces turn ownership)
**Apply to:** every Edge Function in `supabase/functions/`
Never reimplement rule logic in SQL/Deno - import the same TS module via `supabase/functions/_shared/engine.ts`, and override `move.playerId` with the verified JWT subject (`ctx.userClaims.sub`) before calling it, per RESEARCH.md Pattern 2's explicit warning.

## No Analog Found

Files with no close match in the codebase (planner should use RESEARCH.md's Architecture Patterns/Code Examples instead):

| File | Role | Data Flow | Reason |
|---|---|---|---|
| `supabase/config.toml` | config | — | Generated by `supabase init`; no prior Supabase tooling exists in this repo |
| `supabase/migrations/0001_rooms_and_rls.sql` | migration | CRUD | This is a client-only app pre-Phase-2 - no `supabase/` directory, no SQL, no RLS anywhere yet. Use RESEARCH.md's Code Examples "Room + moves schema" verbatim as the starting point |
| `supabase/functions/create-room/index.ts` | controller (Edge Function) | request-response | No Edge Function or Deno runtime code exists in this repo; the *logic* analog is `MenuScreen.tsx`'s `createRoom`, but the *runtime/auth-wrapper* shape (`withSupabase`) has no precedent - use RESEARCH.md Pattern 2's code example |
| `supabase/functions/join-room/index.ts` | controller (Edge Function) | request-response | Same as above; logic analog is `MenuScreen.tsx`'s `joinRoom`, runtime shape from RESEARCH.md |
| `supabase/functions/start-game/index.ts` | controller (Edge Function) | request-response | Same as above; logic analog is `LobbyScreen.tsx`'s `startGame` |
| `supabase/functions/apply-move/index.ts` | controller (Edge Function) | request-response + retry | Logic fully covered by `src/engine/applyMove.ts` (import, don't reimplement); the retry-on-conflict/`withSupabase` wrapper shape is new - use RESEARCH.md Pattern 2's full code example (MEDIUM confidence, this research's own synthesis) |
| `supabase/functions/check-turn-timeout/index.ts` | controller (Edge Function) | batch (lazy sweep) | Entirely new capability (D-05's grace-period auto-pickup); no polling/timeout-check code exists anywhere in this repo today. Use RESEARCH.md's Architecture Patterns description + Pitfall 4's `turn_started_at` reset-timing discussion |
| `src/supabase/client.ts` | config | — | No prior third-party-service client bootstrap exists (only the hand-rolled `window.storage` shim in `src/storage.ts`, a much thinner analog). Use RESEARCH.md Code Examples "Anonymous auth client bootstrap" verbatim, respecting Pitfall 5's `VITE_` env-var-prefix requirement |

## Metadata

**Analog search scope:** `src/` (all `.ts`/`.tsx` excluding `__tests__`), repo root for `supabase/`/config files (confirmed absent)
**Files scanned:** 20 source files read in full (App.tsx, GameContext.tsx, useGameState.ts, storage.ts, MenuScreen.tsx, LobbyScreen.tsx, GameScreen.tsx, Toast.tsx, useToast.ts, useSelection.ts, engine/applyMove.ts, engine/moves.ts, engine/errors.ts, types.ts, gameLogic.ts) plus test-convention samples (useToast.test.ts, Toast.test.tsx, App.test.tsx grep)
**Pattern extraction date:** 2026-07-26
