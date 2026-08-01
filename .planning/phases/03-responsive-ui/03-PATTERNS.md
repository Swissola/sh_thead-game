# Phase 3: Responsive UI - Pattern Map

**Mapped:** 2026-08-01
**Files analyzed:** 8 (5 extended + 3 new)
**Analogs found:** 8 / 8 (all extended files are their own analog; new hooks map to existing hook conventions)

This phase is a pure retrofit — every "new" file either extends an existing component in place or is a small new hook that must match an existing hook's shape. There are no new components, screens, controllers, or services. Because of that, "closest analog" for the five extended files is overwhelmingly *the file itself* (extend in place, following its own established idioms) plus one cross-cutting analog (`Toast.tsx`) for the live-region and one convention-source (`useHandSorting.ts`/`useToast.ts`) for the two new hooks.

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|--------------------|------|-----------|-----------------|---------------|
| `src/components/Card.tsx` | component (leaf) | request-response (click/keydown -> toggle) | itself (extend in place) | exact |
| `src/components/Hand.tsx` | component (listbox container) | request-response | itself (extend in place); `Card.tsx`'s existing `onClick`/hover-timer pattern for the new `onKeyDown` | exact |
| `src/components/Table.tsx` | component (two listboxes) | request-response | itself (extend in place); mirrors `Hand.tsx`'s selection-toggle shape | exact |
| `src/screens/GameScreen.tsx` | component (orchestrator) | event-driven (turn change) + request-response (modal) | itself (extend in place); `Toast.tsx` for the always-mounted `aria-live` pattern | exact (for live-region), role-match (Toast is unmount-on-empty, must NOT be copied verbatim) |
| `src/screens/LobbyScreen.tsx` | component | request-response | itself (extend in place) — touch-target sizing audit only, no structural change | exact |
| `src/hooks/useRovingTabindex.ts` (NEW) | hook | event-driven (keydown -> focus index) | `src/hooks/useHandSorting.ts` / `src/hooks/useSelection.ts` (hook shape/return-object convention) | role-match |
| `src/hooks/useFocusTrap.ts` (NEW) | hook | event-driven (keydown/focus DOM listeners) | `src/hooks/useToast.ts` (ref + `useEffect` + cleanup convention) | role-match |
| `src/index.css` | config/utility (new `.sr-only` class) | n/a | `src/App.css` (existing global CSS conventions: plain class, no `@apply`) | role-match |

## Pattern Assignments

### `src/components/Card.tsx` (component, request-response)

**Analog:** itself — `src/components/Card.tsx` (214 lines, read in full)

**Current imports** (lines 1-2):
```typescript
import React, { useRef, useState } from 'react';
import type { CardProps } from '../types';
```
`useRef`/`useState` already imported for the hover-tooltip timers — the new keyboard handler needs no new import beyond what's already here.

**Existing hover-tooltip mechanism to preserve, not replace** (lines 60-87, face-down branch; lines 146-173, face-up branch — identical 250ms show / 100ms hide `setTimeout` pair in both branches):
```typescript
onMouseEnter={() => {
    if (hideTimer.current) { window.clearTimeout(hideTimer.current); hideTimer.current = null; }
    if (showTimer.current) { window.clearTimeout(showTimer.current); showTimer.current = null; }
    showTimer.current = window.setTimeout(() => { setHover(true); showTimer.current = null; }, 250);
}}
onMouseLeave={() => {
    if (showTimer.current) { window.clearTimeout(showTimer.current); showTimer.current = null; }
    if (hideTimer.current) { window.clearTimeout(hideTimer.current); hideTimer.current = null; }
    hideTimer.current = window.setTimeout(() => { setHover(false); hideTimer.current = null; }, 100);
}}
```
D-08 explicitly says do **not** port this show/hide mechanic to touch — RESP-02 is satisfied by legible card-face text alone. Leave this block structurally untouched; only add `onFocus`/`onBlur` mirroring `onMouseEnter`/`onMouseLeave` if the planner decides sighted-keyboard users should also see the tooltip on focus (Pitfall 4 in RESEARCH.md flags this as a natural side effect of adding focus, not a new mechanism).

**Selected-ring pattern to extend, not collide with** (lines 93-94 face-down, 179-180 face-up):
```typescript
${selectable ? 'hover:scale-110 hover:-translate-y-2 shadow-lg' : ''}
${selected ? 'scale-110 -translate-y-3 ring-4 ring-yellow-400' : ''}
```
D-04's new focus ring (`focus-visible:ring-4 focus-visible:ring-cyan-400 focus-visible:ring-offset-2 focus-visible:ring-offset-slate-900`, per 03-UI-SPEC.md Color section) appends as a sibling conditional class string, composing alongside `selected`/`hover`, never replacing `ring-yellow-400`.

**`title` prop -> `aria-hidden` tooltip div** (lines 98-107 face-down, 184-193 face-up) is the exact thing Pitfall 4 flags: the tooltip text is marked `aria-hidden="true"` so screen readers get nothing today. When adding keyboard focus (`tabIndex`, `role="option"`), thread the same `title` string into `aria-label` on the outer `div` (face-up only — face-down must use the fixed non-identifying `"Face-down card"` string per 03-UI-SPEC.md's Copywriting Contract, never the real `title`, to preserve the blind-play invariant).

**Data flow to extend for RESP-04:** the container `div`'s existing `onClick={selectable ? onClick : undefined}` (face-up, line 145) / `onClick={onClick}` (face-down, line 59) is the single toggle callback both mouse and keyboard must call — an `onKeyDown` handler checking `e.key === ' ' || e.key === 'Enter'` should call the *same* `onClick`, not a parallel handler (mirrors RESEARCH.md Pattern 1's `onKeyDown` example).

---

### `src/components/Hand.tsx` (component, request-response — listbox container)

**Analog:** itself — `src/components/Hand.tsx` (194 lines, read in full)

**Imports** (lines 1-6):
```typescript
import React from 'react';
import * as GameLogic from '../gameLogic';
import type { Card as CardType, CardSelection, GameState, Player } from '../types';
import { Card as CardComponent } from './Card';
import { useGameContext } from '../context/GameContext';
import { getCardPlayability } from '../uiLogic';
```

**Sort buttons — D-13's exact target** (lines 43-60):
```typescript
<button
    onClick={() => setHandSortMode('original')}
    className={`px-2 py-1 text-xs rounded ${handSortMode === 'original' ? 'bg-purple-600 text-white' : 'bg-slate-700 text-slate-400 hover:bg-slate-600'}`}
>
    Original
</button>
```
Grow via `min-h-11 px-3 py-2 text-sm` per 03-RESEARCH.md's Code Examples "Touch Target Sizing" section — same three-button row, same active/inactive class branching, only the size classes change.

**Card-row container — D-09/D-11's exact target** (line 65):
```typescript
<div className="hand-area flex flex-wrap">
```
Becomes (per 03-RESEARCH.md's Code Examples "Responsive Reflow"):
```typescript
<div className="hand-area flex flex-wrap max-sm:flex-nowrap max-sm:overflow-x-auto max-sm:snap-x max-sm:snap-mandatory max-sm:py-4" role="listbox" aria-multiselectable="true" aria-label="Your hand">
```

**Same-rank overlap — D-11's exact target** (line 119):
```typescript
<div key={item.card.id} data-card-key={item.card.id} className={sameGroup ? '-mr-12' : 'mr-2'} style={{ zIndex: index }}>
```
Per 03-UI-SPEC.md's Spacing Scale exceptions: `-mr-12` is replaced *entirely* (not reduced) with `max-sm:mr-2` below `sm`, keeping `-mr-12` only at `sm:` and above. Also add `max-sm:shrink-0 max-sm:snap-start` here for the scroll-snap strip.

**Selection-toggle callback to reuse for keyboard Enter/Space** (lines 172-182, the non-setup branch — this is the callback RESP-04's `onKeyDown` must invoke, not duplicate):
```typescript
} else if (!isSetupPhase && isMyTurn && GameLogic.getAvailableCardSource(player) === 'hand') {
    const alreadySelected = selectedCards.findIndex((s) => s.type === 'hand' && s.index === item.arrayIndex);
    if (alreadySelected >= 0) {
        setSelectedCards(selectedCards.filter((_, idx) => idx !== alreadySelected));
    } else {
        const clickedCard = player.hand[item.arrayIndex];
        if (clickedCard && GameLogic.canAddToSelection(clickedCard, resolvedHandSelection)) {
            setSelectedCards([...selectedCards, { type: 'hand', index: item.arrayIndex }]);
        }
    }
}
```

**`data-card-key` test selector already present** (line 119) — per CLAUDE.md, this is the existing selector new keyboard tests should reuse (`[data-card-key="<id>"]`), not a new `data-testid`.

---

### `src/components/Table.tsx` (component, request-response — two listboxes)

**Analog:** itself — `src/components/Table.tsx` (214 lines, read in full); mirrors `Hand.tsx`'s toggle shape for the face-up branch.

**Imports** (lines 1-6):
```typescript
import React from 'react';
import * as GameLogic from '../gameLogic';
import type { Card, CardSelection, GameState, Player } from '../types';
import { Card as CardComponent } from './Card';
import { useGameContext } from '../context/GameContext';
import { getCardPlayability, type CardPlayability } from '../uiLogic';
```

**Face-down pile — D-03's single-select-only target** (lines 49-81): currently one flat `<div className="flex gap-2">`, each card individually clickable via `setRevealedFaceDown({ card, index: i })` (line 73) — this call already enforces single-select (it replaces the whole `revealedFaceDown` value, never appends). Wrap this container as its **own** `role="listbox" aria-multiselectable="false"` (or omit the attribute, since it's inherently single-select) — RESEARCH.md's Anti-Patterns explicitly warns against merging this with the face-up listbox.

**Face-up pile — D-03's multi-select target** (lines 83-207): wrap as `role="listbox" aria-multiselectable="true"`, mirroring `Hand.tsx`'s hand listbox. The existing toggle logic to reuse for Enter/Space (lines 170-179):
```typescript
} else if (!isSetupPhase && isMyTurn && currentSource === 'faceUp') {
    const alreadySelected = selectedCards.findIndex((s) => s.type === 'faceUp' && s.index === i);
    if (alreadySelected >= 0) {
        setSelectedCards(selectedCards.filter((_, idx) => idx !== alreadySelected));
    } else {
        const clickedCard = currentPlayer.faceUp[i];
        if (clickedCard && GameLogic.canAddToSelection(clickedCard, resolvedFaceUpSelection)) {
            setSelectedCards([...selectedCards, { type: 'faceUp', index: i }]);
        }
    }
}
```

**Existing test selectors to reuse** (lines 55, 134): `data-facedown-index={i}` and `data-faceup-index={i}` — match CLAUDE.md's documented `[data-facedown-index="<i>"]` selector; keep both for new keyboard-nav tests.

---

### `src/screens/GameScreen.tsx` (orchestrator, event-driven + request-response)

**Analog for the turn-announcer:** `src/components/Toast.tsx` — but with the **one critical divergence** RESEARCH.md flags (Pitfall 2): do not copy the `if (!toast) return null` unmount pattern.

**Toast's pattern NOT to copy verbatim** (`src/components/Toast.tsx` lines 16-25):
```typescript
export function Toast({ toast, onDismiss }: { toast: ToastState | null; onDismiss: () => void }) {
    if (!toast) return null;   // <-- do NOT replicate this for the turn-announcer
    ...
    <div role="alert" aria-live="polite" className="...">
```
The turn-announcer must instead always render, per 03-RESEARCH.md Pattern 3:
```typescript
<div aria-live="polite" role="status" className="sr-only">{turnAnnouncement}</div>
```

**Celebration modal — D-06/D-07's exact target** (lines 888-932, `celebrationModal?.show && createPortal(...)`):
```typescript
{celebrationModal?.show &&
  createPortal(
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50" role="alert" aria-live="assertive">
      {celebrationModal.isShithead ? (
        <div className="celebration-modal relative bg-gradient-to-br from-red-600 to-pink-600 text-white px-12 py-8 rounded-2xl shadow-2xl border-4 border-slate-800 text-center max-w-md">
          <button onClick={dismissCelebration} aria-label="Dismiss" className="absolute top-3 right-3 text-white/80 hover:text-white">
            <X size={24} />
          </button>
          <div className="text-7xl mb-4 celebration-emoji-pulse">💩</div>
          <div className="text-5xl font-black mb-3">SH!THEAD!</div>
          ...
```
`role="alert" aria-live="assertive"` (line 892-893) is replaced with `role="dialog" aria-modal="true" aria-labelledby="<heading-id>"` per D-06, with the `useFocusTrap` hook's returned `containerRef` attached to this same `div`. The existing `dismissCelebration` handler (defined line 79, called lines 898/916) becomes both the Dismiss-button handler (unchanged) and the focus-trap's `onEscape` callback — same function, two entry points, not a duplicate. The existing `aria-label="Dismiss"` button (lines 897-903, 915-921) is the natural first-focus target per RESEARCH.md's note (no other focusable content exists inside the modal).

**Imports to extend** (lines 1-16):
```typescript
import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { HelpCircle, LogOut, RotateCw, WifiOff, X } from 'lucide-react';
...
import { useSelection } from '../hooks/useSelection';
import { useHandSorting } from '../hooks/useHandSorting';
import { useTurnTimeoutSweep } from '../hooks/useTurnTimeoutSweep';
```
Add `import { useFocusTrap } from '../hooks/useFocusTrap';` here, following the same relative-import style as the other hook imports.

**Turn/current-player readout to key the announcer off** (lines 497-503) — already the exact source value (`gameState.currentTurn`) the announcer effect needs, no new selector to build:
```typescript
<p className="text-sm text-slate-400">
  {isSetupPhase ? 'Setup Phase' : `Turn: ${gameState.players[gameState.currentTurn]?.name}`}
</p>
{isMyTurn && <p className="text-green-400 font-bold">Your Turn!</p>}
```

**Undersized controls — RESP-03 audit targets in this file** (all currently below 44px): Leave Game icon button (lines 489-496, `p-2` ~40px), Leave-game-confirm dialog buttons (lines 869-882, `px-4 py-2` ~40px tall), pick-up-confirmation dialog buttons (lines 840-855, same `px-4 py-2` pattern), celebration modal's Dismiss `X` button (lines 897-903 / 915-921, icon-only with no padding wrapper — smallest control in the file). All should grow to `min-h-11 min-w-11` per 03-UI-SPEC.md.

**Play / Pick Up Pile buttons — D-02's "Play" control target** (lines 700-720): already real focusable `<button>` elements reached via normal Tab order; RESP-04 makes them reachable *after* the new hand/table listboxes in Tab order, no structural change needed to these buttons themselves.
```typescript
<button onClick={playCards} disabled={(!revealedFaceDown && selectedCards.length === 0) || !isMyTurn} className="flex-1 bg-gradient-to-r from-green-500 to-emerald-500 ...">
  Play {...}
</button>
```

---

### `src/screens/LobbyScreen.tsx` (component, request-response)

**Analog:** itself — RESP-03 audit only, no structural change.

**Undersized controls found** (all below 44px today):
- Copy room code / Copy join link buttons (lines 139-149, 150-160): `p-2` icon-only buttons, ~36px.
- Auto-pickup timeout `<select>` (lines 167-178): `px-3 py-1`, ~28px tall.
- Offline badge (line 205) and "You" badge (line 211): `px-2 py-1` — these are non-interactive status badges, not controls; **not** in scope for the 44px audit (RESP-03 is about interactive controls only).
- Remove-player button (lines 214-222): `p-1` icon-only, ~24px — the smallest interactive control in this file.

```typescript
<button
    onClick={() => void removePlayerFromLobby(player.id)}
    disabled={!offline}
    aria-label={`Remove ${player.name}`}
    title={offline ? 'Remove player' : 'Player is connected'}
    className="p-1 hover:bg-slate-600 rounded transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
>
    <UserX size={16} className="text-red-400" />
</button>
```
Grow via `min-h-11 min-w-11` added to the existing `className`, keeping `p-1`/icon size and all existing `aria-label`/`disabled` semantics unchanged.

---

### `src/hooks/useRovingTabindex.ts` (NEW hook, event-driven)

**Analog for hook shape/convention:** `src/hooks/useHandSorting.ts` (simple `useState` + return-object hook) and `src/hooks/useSelection.ts` (multi-state return-object hook) — both establish this project's hook convention: no class, a plain function starting with `use`, internal `useState`, return a plain object of values + setters (no context, no memoization unless needed).

**`useHandSorting.ts` in full** (9 lines — the minimal-hook template to follow):
```typescript
import { useState } from 'react';

export type HandSortMode = 'original' | 'rank' | 'suit';

export function useHandSorting(initial: HandSortMode = 'original') {
    const [handSortMode, setHandSortMode] = useState<HandSortMode>(initial);
    return { handSortMode, setHandSortMode };
}
```

**`useSelection.ts` in full** (multi-value return shape to mirror for `useRovingTabindex`'s `{ focusedIndex, setFocusedIndex, onKeyDown }`-style return):
```typescript
import { useState } from 'react';
import type { CardSelection, Card as CardType } from '../types';

export function useSelection() {
    const [selectedCards, setSelectedCards] = useState<CardSelection[]>([]);
    const [revealedFaceDown, setRevealedFaceDown] = useState<{ card: CardType; index: number } | null>(null);

    return { selectedCards, setSelectedCards, revealedFaceDown, setRevealedFaceDown };
}
```

Follow RESEARCH.md's own reference implementation (Pattern 1) for the internal arrow-key/clamp logic — it is already written to this project's `selectedCards`/`onClick` shape and doesn't need re-deriving; just place it in this file following the two hooks above's plain-function, no-JSX, `export function useXxx(...)` convention (file goes in `src/hooks/`, same directory, same `.ts` not `.tsx` extension since it returns no JSX).

---

### `src/hooks/useFocusTrap.ts` (NEW hook, event-driven — DOM listeners)

**Analog for hook shape/convention:** `src/hooks/useToast.ts` — the closest existing precedent for a hook that owns a `useRef` + `useEffect`-driven side effect with cleanup (timer in Toast's case, DOM event listeners in this case).

**`useToast.ts`'s ref + effect + cleanup shape to mirror** (full file, 29 lines):
```typescript
import { useState, useCallback, useRef } from 'react';

export type ToastVariant = 'error' | 'reconcile' | 'reconnect';

export interface ToastState {
    message: string;
    code?: string;
    variant?: ToastVariant;
}

const DISMISS_MS = 3500;

export function useToast() {
    const [toast, setToast] = useState<ToastState | null>(null);
    const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    const show = useCallback((message: string, code?: string, variant: ToastVariant = 'error') => {
        if (timerRef.current) clearTimeout(timerRef.current);
        setToast({ message, code, variant });
        timerRef.current = setTimeout(() => setToast(null), DISMISS_MS);
    }, []);

    const dismiss = useCallback(() => {
        if (timerRef.current) clearTimeout(timerRef.current);
        setToast(null);
    }, []);

    return { toast, show, dismiss };
}
```
`useFocusTrap` follows the same `useRef` (for the container + previously-focused element) + `useCallback`-wrapped handlers + cleanup-on-unmount shape, but swaps the `setTimeout` ref for `document.addEventListener('keydown', ...)` / `removeEventListener` inside a `useEffect`. RESEARCH.md's Pattern 2 code example is the concrete implementation to use verbatim (already written against this exact file's needs) — this analog's role is to confirm the *file-organisation and naming convention* (`useXxx.ts` in `src/hooks/`, plain exported function, no default export), not to re-derive the DOM logic.

---

### `src/index.css` (config/utility — new `.sr-only` class)

**Analog:** `src/App.css` — existing global CSS file conventions (plain CSS classes, `@keyframes` blocks, no Tailwind `@apply`, no CSS modules).

**Existing celebration-modal CSS to leave untouched** (`src/App.css` lines 81-90):
```css
.celebration-modal {
  animation: celebrationFadeIn 0.4s ease-out;
}

.celebration-emoji {
  animation: celebrationBounce 1s ease-in-out infinite;
}

.celebration-emoji-pulse {
  animation: celebrationPulse 1.5s ease-in-out infinite;
}
```
These animation classes stay on the modal's outer `div` even after D-06 swaps `role="alert"` for `role="dialog"` — purely visual, no ARIA interaction.

**`.sr-only` addition** (RESEARCH.md's documented Tailwind recipe, since `sr-only` is not part of this project's Tailwind preflight/plugins):
```css
.sr-only {
  position: absolute;
  width: 1px;
  height: 1px;
  padding: 0;
  margin: -1px;
  overflow: hidden;
  clip: rect(0, 0, 0, 0);
  white-space: nowrap;
  border-width: 0;
}
```
Add to `src/index.css` (the project's other global stylesheet, imported before component-scoped styles) rather than `App.css`, since `App.css` is scoped to App-specific animations per its existing content; confirm actual import order in `src/main.tsx`/`src/index.css` before placing.

---

## Shared Patterns

### Toggle-selection-on-Enter/Space calls the existing onClick handler, never a parallel path
**Source:** `Hand.tsx` lines 172-182, `Table.tsx` lines 170-179, 141-201 (setup-phase swap branch too)
**Apply to:** `Card.tsx`'s new `onKeyDown`, and any `useRovingTabindex` consumer in `Hand.tsx`/`Table.tsx`
```typescript
// The SAME callback onClick already uses - do not duplicate the toggle logic
onKeyDown={(e) => {
  if (e.key === ' ' || e.key === 'Enter') {
    e.preventDefault();
    onClick?.();  // reuse, don't reimplement
  }
}}
```

### Always-mounted `aria-live` region (never conditionally unmount)
**Source:** `Toast.tsx` line 17 (`if (!toast) return null`) is the anti-pattern; RESEARCH.md Pattern 3 is the correct pattern
**Apply to:** `GameScreen.tsx`'s new turn-announcer only — `Toast.tsx` itself is correctly unmount-on-empty for its own use case (discrete alerts) and must NOT be changed.

### Blind-play invariant: face-down cards never expose real rank/suit via any new attribute
**Source:** CLAUDE.md Testing gotchas; confirmed in code — `Table.tsx` line 56 face-down `CardComponent` call and `DrawPile.tsx` line 18 never pass `title`
**Apply to:** `Card.tsx`'s new `aria-label` for face-down cards (must be the fixed string `"Face-down card"` per 03-UI-SPEC.md, never derived from `card.rank`/`card.suit`), and any `aria-describedby` text threaded through `Hand.tsx`/`Table.tsx`.

### 44px touch target via `min-h-11 min-w-11`, padding/height grows, control type unchanged
**Source:** 03-UI-SPEC.md Spacing Scale exceptions; 03-RESEARCH.md Code Examples "Touch Target Sizing"
**Apply to:** `Hand.tsx` sort buttons, `GameScreen.tsx`'s Leave Game / Dismiss / dialog buttons, `LobbyScreen.tsx`'s Copy/Remove-player buttons and timeout `<select>`.
```typescript
className={`min-h-11 px-3 py-2 text-sm rounded ${active ? 'bg-purple-600 text-white' : 'bg-slate-700 text-slate-400 hover:bg-slate-600'}`}
```

### `dispatchMove`/existing handler functions are the only path to game state change
**Source:** `src/context/GameContext.tsx`'s `dispatchMove` (per CLAUDE.md); `playCards`/`pickUpPile` already wired in `GameScreen.tsx` lines 701/715
**Apply to:** Any keyboard-triggered Play/Pick-up-Pile action must call these same existing functions, never a new dispatch path — this phase adds no new dispatchable move type.

## No Analog Found

None — every file in scope either extends an existing file in place or follows an existing hook-file convention directly. No file in this phase's scope requires inventing project structure from nothing.

## Metadata

**Analog search scope:** `src/components/`, `src/screens/`, `src/hooks/`, `src/App.css`, `src/types.ts`, `src/__tests__/components/`, `src/__tests__/screens/`
**Files scanned:** `Card.tsx`, `Hand.tsx`, `Table.tsx`, `GameScreen.tsx`, `LobbyScreen.tsx`, `Toast.tsx`, `useSelection.ts`, `useToast.ts`, `useHandSorting.ts`, `App.css`, `DrawPile.tsx`, `types.ts`, `GameScreen.test.tsx`, `Toast.test.tsx`
**Pattern extraction date:** 2026-08-01
