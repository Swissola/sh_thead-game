# Phase 3: Responsive UI - Research

**Researched:** 2026-08-01
**Domain:** Web accessibility (WCAG 2.2 / WAI-ARIA APG) + Tailwind CSS responsive layout, applied to a React 19 card-game UI
**Confidence:** HIGH

## Summary

This phase retrofits keyboard navigation, screen-reader semantics, touch-target sizing, and a mobile layout onto five already-split components (`Card.tsx`, `Hand.tsx`, `Table.tsx`, `GameScreen.tsx`, `LobbyScreen.tsx`). None of it requires a new dependency: React 19 + Tailwind 3.4.19 (stock config, no custom breakpoints) are sufficient for every RESP-01..05 requirement, confirmed against the WAI-ARIA Authoring Practices Guide (APG) and WCAG 2.2.

The keyboard/selection work (RESP-04, D-01..D-04) maps directly onto the APG's **multi-selectable listbox where selection does not follow focus** pattern: `role="listbox"` / `role="option"`, `aria-multiselectable`, arrow keys move a roving-tabindex focus cursor, Space/Enter toggles the focused option's `aria-selected` state independently of focus. This is an exact match for D-02's "arrow moves cursor, Enter/Space toggles selection" model — no custom interaction model needs to be invented. Each of the three card collections (hand, face-up pile, face-down pile) becomes its own listbox = its own single Tab stop, with `aria-multiselectable="true"` on hand/face-up and `false` (or single-select entirely) on face-down per D-03.

The modal focus-trap (RESP-05, D-06) has no existing utility in the codebase or its dependencies (no `focus-trap-react`, no headless UI library) — it must be built as a small vanilla hook (`querySelectorAll` for focusable descendants + Tab/Shift+Tab wrap + Escape + focus-return-on-close), which is the standard approach documented across every non-library React focus-trap writeup and matches D-06/D-07's explicit "no new dependency" framing.

The turn-announcement region (D-05) must reuse `Toast.tsx`'s `aria-live="polite"` pattern but with one critical divergence: `Toast` unmounts (`return null`) when there's nothing to show, which is exactly the pattern that silently breaks live-region announcements in React. The turn-announcer element must stay permanently mounted and only have its *text content* change.

**Primary recommendation:** Build three small, reusable pieces of infrastructure this phase produces once and reuses across `Hand.tsx`/`Table.tsx`/`GameScreen.tsx`: (1) a roving-tabindex/listbox keyboard hook layered onto `useSelection.ts`, (2) a vanilla `useFocusTrap` hook applied to the celebration modal, (3) an always-mounted `aria-live="polite"` turn-announcer region in `GameScreen.tsx`. All three are plain React + DOM APIs, no packages.

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Roving-tabindex keyboard nav for hand/table cards | Browser / Client (React component + hook) | — | Pure client-side focus/DOM state; no server involvement, same as existing click-selection logic in `useSelection.ts` |
| Card selection state (toggle on Enter/Space/click/touch) | Browser / Client (`useSelection.ts`) | — | Already client-only state; RESP-04 extends it, doesn't move it |
| Focus-trap for celebration modal | Browser / Client (`GameScreen.tsx` + new hook) | — | Modal is a client-rendered portal; trap is pure DOM focus management |
| Turn-change announcement (`aria-live`) | Browser / Client (`GameScreen.tsx`) | — | Derived from `gameState.currentTurn`, which already flows from the server via Realtime (Phase 2) — this phase only adds a client-side announcer reacting to that existing value |
| Responsive layout reflow (breakpoints) | Browser / Client (Tailwind classes in JSX) | — | Presentation-only; `tailwind.config.js` and component markup, no build/server change |
| Touch target sizing (44px) | Browser / Client (Tailwind utility classes) | — | Same as above |

No capability in this phase touches the API/Edge Function tier, the database, or CDN/static config — this is exclusively a client-rendering/accessibility phase, consistent with the CONTEXT.md phase boundary ("no game rules, no multiplayer flow" changes).

## Project Constraints (from CLAUDE.md)

- `tsconfig.app.json` has `strict`, `noUnusedLocals`, `noUnusedParameters` all on — any new hook/helper must not declare unused variables even transiently; order declarations to match use.
- `src/engine/applyMove.ts` is the only place game rules are enforced — this phase must not add any rule-affecting logic there; it is purely additive UI/accessibility work.
- `src/gameLogic.ts` holds shared pure predicates — if any new predicate is genuinely shared logic (unlikely for this phase; it's UI-only), it belongs here, not duplicated inline.
- `src/context/GameContext.tsx`'s `dispatchMove` is the only path from UI to `applyMove` — keyboard-triggered Play/Pick-up-Pile must call the same handlers (`playCards`, `pickUpPile`) already wired to `dispatchMove`, not a parallel path.
- Testing gotcha: `getCardsToDrawCount` needs the post-play hand, not pre-play — irrelevant to this phase's own logic but any test harness reuse must preserve this.
- Testing gotcha: face-down cards must never expose rank/suit to the UI before Play is committed — the keyboard/ARIA work must not leak a face-down card's identity via `aria-label`/`aria-describedby` any more than the existing mouse UI does (D-08's blind-play invariant applies equally to assistive-tech-facing text).
- Testing gotcha: ephemeral timed UI state (`.draw-card-ghost`) must be asserted immediately after the triggering event, not inside `waitFor` — applies if this phase's roving-focus/announcer tests touch anything timer-driven.
- `GameScreen.test.tsx` harness pattern (`renderGame`, `Probe` component, `[data-card-key]` / `[data-facedown-index]` selectors) is the existing precedent for asserting real `applyMove` round-trips; new keyboard tests should extend this harness rather than mocking `dispatchMove`.

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

**Keyboard card selection & play (RESP-04)**
- D-01: Arrow keys move a single roving focus cursor across the hand's cards (one Tab stop for the whole hand, not one per card) — keeps Tab order short regardless of hand size.
- D-02: Enter/Space toggles a card in/out of selection, mirroring today's click-to-select. Committing the play still goes through a focusable "Play" control, reached by continuing to Tab/arrow to it — there is no separate "play immediately" shortcut.
- D-03: Keyboard support covers the hand **and** the table's face-up pile, with multi-select available on both (a valid play can be several cards sharing a rank, whether drawn from hand or from the face-up pile). Face-down table cards are keyboard-selectable too, but **individually only** — a face-down card's rank is unknown until played, so there's no way to know in advance whether multiple face-down cards would form a legal multi-card play, and the UI must not let a player select more than one at a time.
- D-04: Keyboard focus gets a distinct focus ring, visually separate from the existing yellow "selected" ring and the hover scale/lift effect, so focused/selected/hovered stay individually legible to a sighted keyboard user.

**Turn announcements & modal focus (RESP-05)**
- D-05: An `aria-live="polite"` region (same pattern already used by `Toast.tsx`) announces just "Your turn" / "`<Name>`'s turn" on each turn change — no board-state summary, to avoid competing with move-result toasts on every turn.
- D-06: Phase 3 builds a real focus-trap (`role="dialog"`, focus trapped inside, Escape-to-close) now rather than deferring it to Phase 6. Phase 6 later swaps the implementation into the shared `Modal` component without changing this accessibility contract.
- D-07: This applies to the celebration/win modal only — the one modal-like UI that currently exists in the app (wired up in Phase 1, animations in `App.css`). No other confirm-style overlay UI exists today to bring into scope.

**Touch card-detail reveal (RESP-02)**
- D-08: No separate touch reveal mechanism is built. A face-up card's rank/suit is already printed on the card face itself — the mouse-hover tooltip is an accessibility/legibility aid, not the only way to see the value — so RESP-02 is satisfied by keeping card text legible at whatever size the responsive layout settles on, not by porting the tooltip's show/hide mechanic to touch.
- Face-down cards never receive a `title` prop anywhere in the codebase today — there is nothing to reveal for them regardless, consistent with the blind-play rule. No special-casing needed; whatever ships for face-up cards must not regress this invariant.

**Mobile layout reflow strategy (RESP-01 / RESP-03)**
- D-09: Below the phone breakpoint, the layout genuinely rearranges rather than just scaling the desktop arrangement down (e.g. the hand becomes a horizontally-scrollable strip pinned to the bottom, piles/table compress into a tighter cluster above it). Uniform scale-down was rejected as too likely to make cards/piles illegibly small or untappable on a real phone.
- D-10: Use Tailwind's stock breakpoints (`sm`/`md`/`lg` — 640/768/1024px) already available now that `tailwindcss` is an installed dependency (`tailwind.config.js` currently has no custom breakpoint overrides). No custom breakpoint values.
- D-11: `Hand.tsx`'s same-rank card overlap (`-mr-12` negative margin) is reduced (or removed) below the phone breakpoint, so each card keeps closer to its full tappable width instead of being mostly covered by its neighbour — directly supports RESP-03 rather than relying on the existing hover-lift effect to compensate.
- D-12: One phone-optimised layout serves both portrait and landscape — landscape just gets more horizontal room within the same rearranged-for-phone arrangement decided in D-09. No separate portrait-specific vs. landscape-specific layout to design or maintain.

**Undersized control buttons (RESP-03)**
- D-13: `Hand.tsx`'s hand-sort buttons (Original/Rank/Suit, currently `px-2 py-1 text-xs` — roughly 24-28px tall, under the 44px minimum) grow via bigger padding/height on the same three-button row, rather than switching to icon-only buttons or collapsing into a dropdown/segmented control. Smallest visual change; keeps the sort control always visible rather than adding an extra tap to change modes.
- Other interactive controls (Leave Game, Dismiss, Copy room code/link, Remove player, Auto-pickup timeout select) should be audited against the same 44px minimum during implementation — not separately discussed here, but in scope for RESP-03 wherever found undersized.

### Claude's Discretion
- Exact focus-ring colour/style for D-04, as long as it's visually distinct from the existing selected/hover treatments.
- Precise scroll/snap behaviour of the horizontally-scrollable hand strip on phone width (D-09) — implementation detail.
- Whether the Play control (D-02) is a persistent on-screen button or only reachable by continuing keyboard navigation past the hand — whichever fits the phone-rearranged layout from D-09 more naturally.
- Full audit list and exact padding fix for each undersized control beyond the hand-sort buttons (D-13) — Claude identifies and fixes these during implementation.

### Deferred Ideas (OUT OF SCOPE)
None — discussion stayed within phase scope. All six discussed areas (four originally selected, two more surfaced from codebase scouting — undersized buttons and orientation handling) were clarifications of how to implement RESP-01..05, not new capabilities.
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| RESP-01 | Board and every component reflow to fit a phone-sized screen without overflow (Tailwind breakpoints replace fixed-pixel layouts) | See "Architecture Patterns > Recommended Layout Strategy" and "Code Examples > Responsive Reflow" — stock `sm`/`md`/`lg` breakpoints, `flex-wrap`→horizontal-scroll-strip swap below `sm`, no custom config needed |
| RESP-02 | Card details/tooltips accessible via touch, not just mouse hover | See D-08 in User Constraints (locked: no new touch mechanism) plus "Common Pitfalls > Pitfall 5" — the existing tooltip `aria-hidden`s its own text, which is a real accessibility gap regardless of D-08's touch scope, worth fixing via `aria-describedby`/`aria-label` on the card element itself |
| RESP-03 | Every interactive control meets 44px minimum touch target | See "Touch Target Sizing" section — Tailwind `min-h-11`/`min-w-11` (2.75rem = 44px) utility pattern, full audit table of every undersized control found in this session's code reading |
| RESP-04 | Keyboard-only card select and play | See "Architecture Patterns > Roving Tabindex / Listbox Pattern" — APG multi-selectable listbox with selection-does-not-follow-focus, mapped onto `useSelection.ts`, `Hand.tsx`, `Table.tsx` |
| RESP-05 | Turn changes announced (`aria-live`) and modals have dialog semantics + focus trap | See "Architecture Patterns > Focus Trap" and "Code Examples > Turn Announcer" — vanilla `useFocusTrap` hook design, always-mounted live region pattern |
</phase_requirements>

## Standard Stack

### Core

No new runtime dependencies are required or recommended. All RESP-01..05 requirements are satisfiable with the existing stack:

| Library | Version (installed) | Purpose | Why Standard |
|---------|---------|---------|--------------|
| react | ^19.2.0 [VERIFIED: package.json] | Component/hook layer for all new keyboard/focus/ARIA logic | Already the project's only UI framework |
| tailwindcss | ^3.4.19 [VERIFIED: package.json] | Responsive breakpoints, touch-target sizing, focus-ring styling | Already installed, stock config, `sm`/`md`/`lg` breakpoints and `scroll-snap`/`focus-visible` utilities are core (non-plugin) features as of Tailwind v3 [CITED: tailwindcss.com/docs] |
| lucide-react | ^0.562.0 [VERIFIED: package.json] | Icons already used throughout (`X`, `HelpCircle`, etc.) — no new icon needs for this phase | Already the project's icon set |

### Supporting

None. This phase deliberately avoids adding a focus-trap library (e.g. `focus-trap-react`, `@radix-ui/react-dialog`) per D-06/D-07's explicit framing that Phase 3 builds a minimal focus-trap now and Phase 6 later folds it into a shared `Modal` primitive — introducing a dialog library now would create migration friction against that stated Phase 6 plan, not reduce it.

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Vanilla `useFocusTrap` hook | `focus-trap-react` (npm) or `@radix-ui/react-dialog` | Both are legitimate, well-maintained packages, but D-06/D-07 explicitly scope this phase's modal work as "swapped into the shared `Modal` component" in Phase 6 (POLISH-03) — picking a dialog library now pre-commits Phase 6 to that library's API. A ~40-line vanilla hook (documented below) costs nothing to replace later and has zero new supply-chain surface for a single-modal use case. |
| APG "listbox, selection does not follow focus" pattern for card selection | `role="grid"` (APG Grid pattern) | Grid is the right choice when 2D arrow navigation (up/down AND left/right) across rows/columns is needed. The hand and each table pile are 1D collections — a grid role would be semantically incorrect and add unused complexity (row/cell wrapper elements) for no behavioural gain. |
| Tailwind's stock `sm` (640px) breakpoint for the phone/desktop split | A custom `xs`/`phone` breakpoint | D-10 explicitly locks stock breakpoints; a custom value would also require a `tailwind.config.js` edit the phase doesn't otherwise need. |

**Installation:**
No installation required — nothing new to add to `package.json`.

**Version verification:** `react@19.2.0` and `tailwindcss@3.4.19` confirmed directly from the project's own `package.json` (read 2026-08-01) — no registry lookup needed since these are already-installed, in-use versions, not new additions.

## Package Legitimacy Audit

Not applicable — this phase introduces no new external packages. `npm view`/slopcheck steps are skipped because there is nothing to install.

**Packages removed due to slopcheck [SLOP] verdict:** none (nothing evaluated — no new packages)
**Packages flagged as suspicious [SUS]:** none

## Architecture Patterns

### System Architecture Diagram

```
User input (keyboard / touch / mouse)
        |
        v
+-------------------------------------------------------------+
|  Card.tsx (leaf)                                             |
|  - onClick (existing)                                        |
|  - onKeyDown (NEW: Enter/Space -> same toggle as onClick)    |
|  - tabIndex (NEW: 0 for roving-focused card, -1 otherwise)   |
|  - aria-selected, role="option" (NEW)                        |
+-------------------------------------------------------------+
        |  toggle/select events bubble to parent's handler
        v
+-------------------------------------------------------------+
|  Hand.tsx / Table.tsx                                        |
|  - existing selectedCards state ownership (via props)        |
|  - NEW: useRovingTabindex(itemCount) hook per listbox         |
|    -> tracks focusedIndex, exposes onKeyDown (ArrowLeft/      |
|       Right/Home/End) + tabIndex-per-item helper              |
|  - role="listbox", aria-multiselectable (NEW, container)     |
+-------------------------------------------------------------+
        |  selection state (existing prop-drilled setSelectedCards)
        v
+-------------------------------------------------------------+
|  GameScreen.tsx (orchestrator)                                |
|  - existing playCards()/pickUpPile() dispatch to GameContext  |
|  - NEW: aria-live="polite" turn-announcer <div>, always       |
|    mounted, text updated by a gameState.currentTurn effect    |
|  - NEW: useFocusTrap hook wraps celebrationModal portal        |
|    (role="dialog", aria-modal, Escape -> dismissCelebration,  |
|     focus returns to trigger element on close)                |
+-------------------------------------------------------------+
        |  dispatchMove (existing, unchanged)
        v
  GameContext -> applyMove (Phase 1 engine, untouched by this phase)
```

Data flow for the primary keyboard use case: a player Tabs into the hand listbox (one stop) -> ArrowRight/Left moves the roving-tabindex cursor between cards (focus only, no selection change) -> Space/Enter toggles `aria-selected`/visual selection on the focused card, reusing the exact same `setSelectedCards` callback `onClick` already calls -> player continues Tab to the "Play" button -> Enter activates it -> `playCards()` dispatches through the existing, unmodified `GameContext`/`applyMove` pipeline.

### Recommended Project Structure

No new top-level folders needed. New files fit the existing `hooks/` and `components/` conventions:

```
src/
├── hooks/
│   ├── useSelection.ts        # existing — extended with focus-cursor state per listbox, or...
│   ├── useRovingTabindex.ts   # NEW — generic roving-tabindex cursor for a fixed-length list
│   └── useFocusTrap.ts        # NEW — generic Tab/Shift+Tab wrap + Escape + return-focus hook
├── components/
│   ├── Card.tsx                # extended: tabIndex, onKeyDown, role="option", aria-selected
│   ├── Hand.tsx                 # extended: role="listbox", aria-multiselectable, useRovingTabindex
│   └── Table.tsx                # extended: two listboxes (face-up multi, face-down single)
└── screens/
    └── GameScreen.tsx           # extended: aria-live turn announcer, useFocusTrap on celebration modal
```

### Pattern 1: Roving Tabindex + Listbox (selection does not follow focus)

**What:** A composite widget (the hand, or a table pile) is a single Tab stop. Arrow keys move an internal focus cursor between child "option" elements; Space/Enter toggles the *selection* state of whichever child currently has focus, independent of the focus-move itself.

**When to use:** Any card collection where D-01/D-02/D-03 apply — `Hand.tsx`'s hand, `Table.tsx`'s face-up pile, `Table.tsx`'s face-down pile (as its own single-select listbox).

**Example** (APG-sourced interaction model, adapted to this codebase's existing `selectedCards`/`onClick` shape):
```typescript
// Source: WAI-ARIA APG Listbox Pattern - https://www.w3.org/WAI/ARIA/apg/patterns/listbox/
// (multi-selectable, selection does not follow focus variant)

// Container (e.g. Hand.tsx's card-row div):
<div
  role="listbox"
  aria-multiselectable="true"
  aria-label="Your hand"
  onKeyDown={(e) => {
    if (e.key === 'ArrowRight') { moveFocus(+1); e.preventDefault(); }
    if (e.key === 'ArrowLeft')  { moveFocus(-1); e.preventDefault(); }
    if (e.key === 'Home')       { moveFocusTo(0); e.preventDefault(); }
    if (e.key === 'End')        { moveFocusTo(lastIndex); e.preventDefault(); }
  }}
>
  {items.map((item, i) => (
    <CardComponent
      key={item.card.id}
      role="option"
      aria-selected={isSelected(item)}
      tabIndex={i === focusedIndex ? 0 : -1}   // roving tabindex
      onFocus={() => setFocusedIndex(i)}       // keeps mouse focus in sync too
      onKeyDown={(e) => {
        if (e.key === ' ' || e.key === 'Enter') {
          e.preventDefault();
          toggleSelection(item);               // SAME callback onClick already uses
        }
      }}
      onClick={() => toggleSelection(item)}     // unchanged existing handler
      card={item.card}
      selected={isSelected(item)}
    />
  ))}
</div>
```

**On mount / after any hand-size change:** ensure exactly one item has `tabIndex={0}` (clamp `focusedIndex` to `[0, items.length - 1]` — a card being played and removed from the hand must not leave zero items with `tabIndex="0"`, which would make the whole listbox untabbable).

### Pattern 2: Vanilla Focus Trap for a Portal-Rendered Modal

**What:** On open, focus moves into the dialog; Tab/Shift+Tab cycles only among focusable elements inside it (wrapping at both ends); Escape closes it; focus returns to whatever triggered it on close.

**When to use:** `GameScreen.tsx`'s celebration modal (D-06/D-07) — the only in-scope modal this phase.

**Example:**
```typescript
// Source: WAI-ARIA APG Dialog (Modal) Pattern - https://www.w3.org/WAI/ARIA/apg/patterns/dialog-modal/
// Vanilla hook, no library - matches D-06's "no new dependency" framing.

function useFocusTrap(active: boolean, onEscape: () => void) {
  const containerRef = useRef<HTMLDivElement>(null);
  const previouslyFocused = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (!active) return;
    previouslyFocused.current = document.activeElement as HTMLElement | null;

    const container = containerRef.current;
    const focusableSelector =
      'a[href], button:not([disabled]), textarea, input, select, [tabindex]:not([tabindex="-1"])';

    const getFocusable = () =>
      container ? Array.from(container.querySelectorAll<HTMLElement>(focusableSelector)) : [];

    // Move focus into the dialog on open.
    getFocusable()[0]?.focus();

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onEscape();
        return;
      }
      if (e.key !== 'Tab') return;

      const focusable = getFocusable();
      if (focusable.length === 0) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];

      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    };

    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('keydown', onKeyDown);
      // Focus returns to the trigger element on close (APG requirement).
      previouslyFocused.current?.focus();
    };
  }, [active, onEscape]);

  return containerRef;
}

// Usage in GameScreen.tsx's celebration modal portal:
const dialogRef = useFocusTrap(!!celebrationModal?.show, dismissCelebration);
// <div ref={dialogRef} role="dialog" aria-modal="true" aria-label="Game result">
```

**Note on `role="alert"` vs `role="dialog"`:** the celebration modal currently uses `role="alert" aria-live="assertive"` (an *announcement*, not an interactive dialog). D-06 asks for `role="dialog"` with a real focus trap. `role="dialog"` + `aria-modal="true"` + `aria-label`/`aria-labelledby` replaces `role="alert"` — a dismiss button already exists (`aria-label="Dismiss"`) and becomes the natural first-focus target if no other focusable content exists in the modal.

### Pattern 3: Always-Mounted `aria-live` Region for Turn Announcements

**What:** A screen-reader-only element that is *always present in the DOM* and whose *text content* changes — never conditionally rendered/unmounted — because assistive tech tracks DOM mutations on a stable node, not React's virtual-DOM diffing.

**When to use:** D-05's turn-change announcer in `GameScreen.tsx`.

**Example:**
```typescript
// Source: MDN aria-live + WAI-ARIA APG general live-region guidance;
// cross-checked against Toast.tsx's existing aria-live="polite" usage in this repo.

// Always rendered (unlike Toast, which returns null when there's nothing to show):
<div aria-live="polite" role="status" className="sr-only">
  {turnAnnouncement}
</div>
```
```typescript
// In GameScreen.tsx, derive turnAnnouncement from the existing gameState.currentTurn:
const [turnAnnouncement, setTurnAnnouncement] = useState('');
const lastAnnouncedTurnRef = useRef<number | null>(null);

useEffect(() => {
  if (!gameState || gameState.phase !== 'playing') return;
  if (lastAnnouncedTurnRef.current === gameState.currentTurn) return; // avoid re-announcing on unrelated re-renders
  lastAnnouncedTurnRef.current = gameState.currentTurn;

  const activePlayer = gameState.players[gameState.currentTurn];
  if (!activePlayer) return;
  setTurnAnnouncement(activePlayer.id === currentPlayerId ? 'Your turn' : `${activePlayer.name}'s turn`);
}, [gameState, currentPlayerId]);
```

A `sr-only` utility class (visually hidden, still in the accessibility tree) is not part of Tailwind's default preflight but is a one-off documented Tailwind recipe (`position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0,0,0,0); white-space: nowrap;`) — add it to `index.css` once rather than reaching for a plugin.

### Anti-Patterns to Avoid

- **Conditionally rendering the live-region container** (`{turnAnnouncement && <div aria-live="polite">...}`) — this is the exact `Toast.tsx`-style `return null` pattern, and it is the single most common reason `aria-live` silently fails in React apps [CITED: k9n.dev/en/blog/2025-11-aria-live]. Keep the element always mounted; toggle only its text.
- **Relying on the browser's native Tab order for the modal instead of the manual trap** — without `event.preventDefault()` + explicit `.focus()` calls on wrap-around, Tab will walk out of the modal into the page behind it (or, worse, into `aria-hidden` background content), defeating D-06 entirely.
- **Selection-follows-focus for multi-select hand/face-up cards** — moving the arrow cursor must never itself change what's selected (that's the Shift+Arrow variant, not plain Arrow); conflating the two would make it impossible to arrow past an already-selected card without deselecting it.
- **Letting face-down cards join the same listbox as face-up cards** — D-03 requires face-down single-select as an independent constraint from face-up's multi-select; putting them in one `aria-multiselectable="true"` listbox would let a screen-reader/keyboard user select two face-down cards simultaneously, which the mouse UI has never allowed (`Table.tsx`'s `revealedFaceDown` is already a single nullable slot, not an array).

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| ARIA interaction semantics for the card listboxes | A custom "cardgrid" ARIA role/pattern invented from scratch | The APG's existing multi-selectable-listbox-without-selection-follows-focus pattern (role/attributes only — no library) | It is a byte-for-byte match for D-01/D-02's stated interaction model; inventing a new pattern risks a semantics screen readers don't recognise |
| 44px touch targets | Manually computed pixel padding per button | Tailwind's spacing-scale utilities: `min-h-11 min-w-11` (`11` = `2.75rem` = 44px exactly) [VERIFIED: `node -e "require('tailwindcss/defaultTheme').spacing['11']"` → `2.75rem`] | Guarantees the exact WCAG 2.5.5 figure without hand-computing rem/px conversions per component |
| Horizontal-scroll snap strip for the phone hand layout | Custom scroll-position JS/IntersectionObserver | Tailwind's core `overflow-x-auto snap-x snap-mandatory` + per-card `snap-start shrink-0` | CSS scroll-snap is native browser behaviour; JS reimplementation would be strictly worse (jankier, more code, another thing to keep accessible) |

**Key insight:** every problem this phase touches — keyboard interaction semantics, focus trapping, live-region announcement, touch sizing, responsive scroll strips — already has a settled, standards-body-documented answer (APG or WCAG) or a zero-cost Tailwind utility. There is no part of RESP-01..05 that benefits from a bespoke solution or a new package; the risk in this phase is under-researching the *existing* pattern, not lacking tooling.

## Common Pitfalls

### Pitfall 1: Roving tabindex left at zero items focusable after a card is played
**What goes wrong:** A card is removed from the hand mid-game (played). If the roving-tabindex cursor was pointing at the now-removed card's index and nothing re-clamps it, either no card has `tabIndex={0}` (the whole listbox becomes untabbable) or the cursor points past the end of the array.
**Why it happens:** `focusedIndex` state is independent of `player.hand`'s length, and hand contents change via `dispatchMove`/`applyMove`, not via the roving-tabindex hook itself.
**How to avoid:** Clamp `focusedIndex` to `Math.min(focusedIndex, items.length - 1)` (and `Math.max(0, ...)`) on every render where `items.length` has changed, not only in response to arrow-key events.
**Warning signs:** After playing a card via keyboard, Tab-ing into the hand no longer lands on any card, or lands on an empty slot.

### Pitfall 2: `aria-live` region unmounts between updates
**What goes wrong:** Screen readers stop announcing turn changes entirely, or announce inconsistently, despite the JSX "looking correct."
**Why it happens:** Copying `Toast.tsx`'s exact structure (`if (!toast) return null`) for the turn announcer — this conditional-unmount pattern is fine for Toast (each toast is a discrete new alert) but breaks a persistent status region, since the DOM node assistive tech is watching disappears and reappears instead of just changing text [CITED: k9n.dev/en/blog/2025-11-aria-live].
**How to avoid:** Render the `aria-live` container unconditionally (empty string when there's nothing to say); only the text node's content changes.
**Warning signs:** Manual screen-reader testing (NVDA/VoiceOver) shows the first turn change announced but subsequent ones silent, or vice versa.

### Pitfall 3: Identical consecutive announcements are silently swallowed
**What goes wrong:** If the same exact text is set twice in a row on a live region (e.g. two renders both compute `"Alice's turn"` for the same actual turn, or a rare rules edge-case where the turn doesn't visibly change name), some screen readers do not re-announce because the accessible-name/text-content diff is empty.
**Why it happens:** This is standard, documented AT behaviour, not a bug in this codebase — live regions announce on *content change*, and identical content is not a change.
**How to avoid:** For this phase's actual requirement (announce only real turn *changes*, i.e. `gameState.currentTurn` transitions to a different index — see the `lastAnnouncedTurnRef` guard in Pattern 3's example) this is a non-issue by construction, since a genuine turn change always changes the player name in the announced text. Flag it only if a future requirement needs the same message re-announced twice.
**Warning signs:** None expected for this phase's specific requirement — documented here so the planner doesn't need to independently discover it if scope creeps.

### Pitfall 4: Tooltip text is `aria-hidden`, so screen-reader users get none of the playability info sighted mouse users get
**What goes wrong:** `Card.tsx`'s existing hover tooltip div is marked `aria-hidden="true"` (deliberately, since it's a purely visual hover affordance) — but that means today, a screen-reader user gets zero indication of *why* a card isn't playable ("Not your turn", "First turn: only 4s allowed", etc.), even after this phase adds keyboard focus to the card. Sighted keyboard users get the visual tooltip only on mouse hover, not on keyboard focus either (`onMouseEnter`/`onMouseLeave`, no `onFocus`/`onBlur`).
**Why it happens:** The tooltip was built as a mouse-hover-only affordance before this phase's keyboard/screen-reader work existed; nothing in the RESP-02 decision (D-08) explicitly calls this out because D-08 is scoped to "touch reveal," not "keyboard/AT reveal."
**How to avoid:** When adding `role="option"`/keyboard focus to `Card.tsx` for RESP-04, also thread the same `title` string into an `aria-label` (or `aria-describedby` pointing at a visually-hidden element) on the card so a screen-reader user focusing the card hears the same "Not your turn"/playability text a sighted mouse user sees. This is a natural side-effect of the RESP-04 work, not a separate RESP-02 task — flagging it here so the planner captures it under whichever requirement's tasks touch `Card.tsx`'s markup. Must preserve the blind-play invariant: never derive this `aria-label` from a face-down card's actual rank/suit.
**Warning signs:** A screen-reader user tabs onto an unplayable card and hears only "card, option" with no explanation of why it's disabled/unplayable.

### Pitfall 5: `-mr-12` overlap makes touch targets smaller than their rendered `w-20`/`w-16` size implies
**What goes wrong:** `Hand.tsx`'s same-rank overlap (`-mr-12` on `w-20` cards, i.e. only 8px of a 80px-wide card remains un-overlapped) makes the *effective* tappable area of a partially-covered card far smaller than 44px even though the element itself is sized correctly — RESP-03's 44px minimum is about the actually-hittable area, not the DOM element's declared width, since the overlapping neighbour sits on top and intercepts the tap.
**Why it happens:** `z-index: index` stacking means later cards render on top of earlier ones in the same-rank group; a mouse pointer can hover-lift the covered card (compensating via the existing `hover:scale-110 hover:-translate-y-2`), but touch has no equivalent hover pre-step to reveal it before the tap commits.
**How to avoid:** This is exactly what D-11 already mandates (reduce/remove the negative margin below the phone breakpoint) — treat it as a hard requirement, not a nice-to-have, precisely because the hover-compensation mechanism doesn't exist on touch.
**Warning signs:** On a real phone, tapping the visually-narrow sliver of a covered card in a same-rank group taps the wrong card (the one on top) instead.

### Pitfall 6: `overflow-x-auto` clips the existing hover-lift/selection scale transform
**What goes wrong:** `Card.tsx`'s selected/hover states use `scale-110 -translate-y-3`/`-translate-y-2` — if the phone-width hand strip's scroll container uses `overflow-x-auto` without also allowing vertical overflow, a card scaling/lifting near the top or bottom edge of the strip can be visually clipped.
**Why it happens:** `overflow-x-auto` alone constrains the Y axis to `visible` by default in most browsers, but if `overflow-hidden` is ever added defensively (e.g. to stop horizontal scrollbar flicker) it clips both axes.
**How to avoid:** Use `overflow-x-auto` (not `overflow-hidden`/`overflow-auto` on both axes) and leave enough top/bottom padding in the strip container to accommodate the existing lift transforms without clipping.
**Warning signs:** Selecting/hovering the top row of cards in the mobile strip visually chops off the top of the lifted card.

## Code Examples

### Responsive Reflow (RESP-01, D-09/D-10)

```typescript
// Source: Tailwind CSS core docs (overflow, scroll-snap, responsive design) -
// https://tailwindcss.com/docs/responsive-design, https://tailwindcss.com/docs/overflow
// Desktop: existing flex-wrap. Below `sm` (640px): horizontal scroll-snap strip.

<div className="hand-area flex flex-wrap sm:flex-wrap
                 max-sm:flex-nowrap max-sm:overflow-x-auto max-sm:snap-x max-sm:snap-mandatory
                 max-sm:py-4">
  {sortedCards.map((item) => (
    <div
      key={item.card.id}
      className="max-sm:shrink-0 max-sm:snap-start
                 mr-2 sm:mr-2"
      // ... existing -mr-12 same-group overlap becomes max-sm:mr-1 or similar (D-11)
    >
      <CardComponent {...} />
    </div>
  ))}
</div>
```

Note: Tailwind v3's `max-sm:` variant (max-width 639.98px) is the idiomatic "below the phone breakpoint" selector paired with `sm:` for "at/above" — both are stock, no config change, matching D-10.

### Touch Target Sizing (RESP-03, D-13)

```typescript
// Hand.tsx sort buttons - before: px-2 py-1 text-xs (~24-28px tall)
// After: min-h-11 min-w-11 keeps the same 3-button row, same visible label,
// grows via padding/min-height rather than switching control type (D-13).
<button
  onClick={() => setHandSortMode('rank')}
  className={`min-h-11 px-3 py-2 text-sm rounded ${handSortMode === 'rank' ? 'bg-purple-600 text-white' : 'bg-slate-700 text-slate-400 hover:bg-slate-600'}`}
>
  Rank
</button>
```

`min-h-11` = `min-height: 2.75rem` = 44px at the browser default 16px root font size [VERIFIED: `tailwindcss/defaultTheme` spacing scale, checked directly against the installed package].

### Distinct Focus Ring (D-04)

```typescript
// Card.tsx - existing selected ring is ring-4 ring-yellow-400 (on `selected`).
// Keyboard focus needs a visually distinct ring that composes without conflicting.
className={`
  ...
  ${selectable ? 'hover:scale-110 hover:-translate-y-2 shadow-lg' : ''}
  ${selected ? 'scale-110 -translate-y-3 ring-4 ring-yellow-400' : ''}
  focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-cyan-400 focus-visible:ring-offset-2 focus-visible:ring-offset-slate-900
`}
```

`focus-visible:` (not bare `focus:`) ensures the ring only appears for keyboard/AT focus, not for a mouse click that also happens to focus the element — matching D-04's "focused/selected/hovered stay individually legible" requirement without a visible ring flashing on every mouse click. `focus-visible` pseudo-class support is broad in evergreen browsers (Chrome/Edge 86+, Firefox 85+, Safari 15.4+); Tailwind's `focus-visible:` variant is a stock v3 feature.

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|---------------|--------|
| WCAG 2.5.5 Target Size (Enhanced, AAA, 44×44px) as the only touch-target guidance | WCAG 2.2 added 2.5.8 Target Size (Minimum, AA, 24×24px with a spacing exception) alongside the existing 2.5.5 | WCAG 2.2, October 2023 [CITED: w3.org/TR/WCAG22] | The project's locked 44px target (D-13) exceeds the AA-level minimum (24px) and meets the stricter AAA-level figure — worth planning against 2.5.5's wording specifically (no spacing exception, applies more strictly) rather than 2.5.8's more permissive one, since 44px was the number chosen |
| `aria-activedescendant` as the default focus-management technique for listbox-style widgets | Either technique remains valid per APG; roving tabindex is preferred when automatic scroll-into-view on navigation is wanted | Ongoing APG guidance, not a recent change | Roving tabindex (chosen here) means arrow-navigating an overflowing hand strip auto-scrolls the newly-focused card into view for free — relevant for the D-09 horizontal-scroll-strip mobile layout |

**Deprecated/outdated:** None specific to this phase — the APG listbox/dialog patterns and WCAG 2.2 target-size criteria referenced here are current guidance, not superseded techniques.

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | `focus-visible:` pseudo-class browser support is sufficient for this project's target audience (no IE11/legacy-browser requirement stated anywhere in CLAUDE.md/PROJECT.md) | Code Examples > Distinct Focus Ring | If a legacy-browser requirement exists that wasn't surfaced in this research, `focus-visible:` would silently fall back to no focus ring in unsupported browsers rather than erroring — low risk given this is a 2026 web app with no stated legacy-browser constraint, but not independently verified against PROJECT.md's full constraints list |

**If this table is empty:** N/A — see A1 above; every other claim in this research is either read directly from the project's own source files (`[VERIFIED: ...]`), sourced from the official WAI-ARIA APG / WCAG 2.2 specification pages (`[CITED: ...]`), or drawn from the Tailwind CSS official documentation.

## Open Questions (RESOLVED)

1. **Should the "Play" button be duplicated/pinned for the mobile scroll-strip layout, or reached only by continuing keyboard/scroll navigation past the hand?** — RESOLVED
   - What we know: CONTEXT.md explicitly leaves this to Claude's discretion ("whichever fits the phone-rearranged layout from D-09 more naturally").
   - What's unclear: Whether a pinned/sticky Play button competes for vertical space with the D-09 "hand pinned to the bottom" layout on very small phone heights (e.g. landscape phone, D-12's single-layout-serves-both constraint).
   - Recommendation: Planner should treat this as an implementation-detail task, not a separate research gap — prototype both during Wave 1 and pick based on real viewport testing (a `checkpoint:human-verify` on a real or emulated phone width, consistent with this phase's UI-heavy nature).
   - **Resolution:** `03-07-PLAN.md` keeps the Play control in normal document flow (`max-sm:flex-col` full-width buttons) rather than pinning/sticking it, and `03-08-PLAN.md`'s blocking human checkpoint verifies this against a real/emulated phone width before the phase closes.

2. **Exact wording/reading of the celebration modal's accessible name (`aria-label` vs `aria-labelledby`) once it moves from `role="alert"` to `role="dialog"`.** — RESOLVED
   - What we know: The modal has visible heading text ("SH!THEAD!" / "SAFE!") already in the DOM.
   - What's unclear: Whether to point `aria-labelledby` at that existing heading `div` (cleanest, no duplicated string) or add a fresh `aria-label` — both are valid APG approaches.
   - Recommendation: Prefer `aria-labelledby` pointing at the existing heading element (add an `id` to it) — avoids maintaining two copies of the same string, standard APG guidance for dialogs with a visible title.
   - **Resolution:** `03-UI-SPEC.md`'s Copywriting Contract locks in `aria-labelledby` pointing at the existing heading element, implemented verbatim by `03-05-PLAN.md`.

## Environment Availability

Skipped — this phase has no external tool/service/runtime dependencies beyond the already-installed npm packages verified above (no database, no new CLI, no Docker, no network service).

## Validation Architecture

### Test Framework

| Property | Value |
|----------|-------|
| Framework | Vitest ^4.0.16 + @testing-library/react ^16.3.1 + @testing-library/jest-dom ^6.9.1 [VERIFIED: package.json] |
| Config file | `vite.config.ts` (test config colocated with Vite config per standard Vitest setup — not separately confirmed this session, but implied by `npm test` running `vitest` directly with no `-c` flag) |
| Quick run command | `npm test -- --run src/__tests__/components` (scoped to touched files during a task) |
| Full suite command | `npm test -- --run` |

Note: `@testing-library/user-event` is **not** installed (`node_modules/@testing-library` contains only `dom`, `jest-dom`, `react`). This is not a blocker: this phase's focus-trap and roving-tabindex logic are hand-rolled `onKeyDown` handlers (not reliant on jsdom's native Tab-order simulation), so `fireEvent.keyDown(element, { key: 'Tab' })`/`{ key: 'ArrowRight' }`/`{ key: ' ' }` against the focused element, combined with asserting `document.activeElement`, is sufficient and matches this project's existing `fireEvent`-based test style (per CLAUDE.md's `GameScreen.test.tsx` harness notes). No new devDependency needed.

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| RESP-01 | Hand/table reflow below `sm` breakpoint applies `max-sm:` classes, no overflow | unit (className assertion) or manual viewport check | `npm test -- --run src/__tests__/components/Hand.test.tsx` | ❌ Wave 0 (no `Hand.test.tsx` currently exists — component tests live under `GameScreen.test.tsx` today) |
| RESP-02 | Card face text remains legible; keyboard-focused card exposes playability text via `aria-label`/`aria-describedby` | unit (a11y attribute assertion) | `npm test -- --run src/__tests__/components/Card.test.tsx` | ❌ Wave 0 (no dedicated `Card.test.tsx` exists) |
| RESP-03 | Sort buttons and audited controls have `min-h-11`/`min-w-11` (or equivalent computed 44px) | unit (className/computed-style assertion) | same as RESP-01 | ❌ Wave 0 |
| RESP-04 | ArrowRight/Left moves roving focus without changing selection; Space/Enter toggles the focused card's selection; face-down listbox rejects a second simultaneous selection | integration (`GameScreen.test.tsx`-style `applyMove` round-trip via `fireEvent.keyDown`) | `npm test -- --run src/__tests__/screens/GameScreen.test.tsx` | ✅ (harness exists — extend it, per CLAUDE.md's documented pattern) |
| RESP-05 | Turn change updates the always-mounted live-region's text; Escape closes the celebration modal and returns focus to the trigger; Tab wraps within the modal | integration (`GameScreen.test.tsx`) + manual (screen-reader smoke test — automated tests cannot verify actual AT announcement, only DOM text-content correctness) | `npm test -- --run src/__tests__/screens/GameScreen.test.tsx` | ✅ (extend existing harness); manual-only for real AT announcement |

### Sampling Rate
- **Per task commit:** `npm test -- --run src/__tests__/components` and/or `src/__tests__/screens/GameScreen.test.tsx` depending on which files a task touches
- **Per wave merge:** `npm test -- --run` (full suite, currently 478 tests per STATE.md)
- **Phase gate:** Full suite green, plus `npm run build` (strict TS) and `npm run lint`, before `/gsd-verify-work`. A manual real-device or browser-devtools-emulated phone-width + keyboard-only + screen-reader smoke pass is also warranted given this phase's `UI hint: yes` marker and its two irreducibly-manual success criteria (touch on a real device, screen-reader announcement).

### Wave 0 Gaps
- [ ] `src/__tests__/components/Hand.test.tsx` — dedicated component test file (currently Hand is only exercised indirectly via `GameScreen.test.tsx`); needed to cover RESP-01/03's className-level assertions without re-mounting the full GameScreen for every case
- [ ] `src/__tests__/components/Card.test.tsx` — dedicated component test file for RESP-02/04's per-card ARIA attribute assertions (`role="option"`, `aria-selected`, `tabIndex`, `aria-label`)
- [ ] `src/__tests__/components/Table.test.tsx` — same rationale for the face-up/face-down listbox split (RESP-04, D-03)
- [ ] No framework install needed (Vitest/RTL already fully configured)

## Security Domain

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-------------------|
| V2 Authentication | No | Untouched by this phase (Phase 2's Supabase anonymous auth is unmodified) |
| V3 Session Management | No | Untouched by this phase |
| V4 Access Control | No | Untouched by this phase — all moves still validated server-side by the unchanged Edge Functions |
| V5 Input Validation | No | This phase adds no new user-text input fields; `aria-label`/`aria-describedby` content is derived from existing, already-validated game state (card rank/suit, player names already rendered elsewhere), not new untrusted input |
| V6 Cryptography | No | Not applicable |

### Known Threat Patterns for this stack

No new threat surface is introduced by this phase. This is purely client-side rendering/accessibility work: no new network calls, no new data persisted, no new user-supplied strings rendered (all announcer/label text is derived from `gameState`, which already flows through Phase 2's server-side validated `applyMove` pipeline before reaching this UI layer). The one thing worth reiterating as a data-handling constraint rather than a security vulnerability: `aria-label`/`aria-describedby` text added to face-down `Card` elements must never be derived from that card's actual `rank`/`suit` fields before the player commits a Play — this is the CLAUDE.md-documented blind-play invariant (Testing gotchas section), not a new ASVS-category concern, but it is the one place this phase could regress an existing game-integrity rule if implemented carelessly (see Pitfall 4).

## Sources

### Primary (HIGH confidence)
- WAI-ARIA APG — Listbox Pattern - https://www.w3.org/WAI/ARIA/apg/patterns/listbox/ — multi-select, selection-does-not-follow-focus keyboard model
- WAI-ARIA APG — Developing a Keyboard Interface (roving tabindex) - https://www.w3.org/WAI/ARIA/apg/practices/keyboard-interface/ — roving tabindex implementation steps
- WAI-ARIA APG — Dialog (Modal) Pattern - https://www.w3.org/WAI/ARIA/apg/patterns/dialog-modal/ — role/attributes, focus containment, Escape, focus-return rules
- Project source files read directly (2026-08-01): `src/components/Card.tsx`, `src/components/Hand.tsx`, `src/components/Table.tsx`, `src/components/Toast.tsx`, `src/hooks/useSelection.ts`, `src/screens/GameScreen.tsx`, `src/screens/LobbyScreen.tsx`, `src/components/piles/DrawPile.tsx`, `src/types.ts`, `src/App.css`, `tailwind.config.js`, `package.json`, `src/test-setup.ts`
- `tailwindcss/defaultTheme` spacing scale, checked directly against the installed package (`node -e "require('tailwindcss/defaultTheme').spacing['11']"` → `2.75rem`)

### Secondary (MEDIUM confidence)
- WCAG 2.2 SC 2.5.5 Target Size (Enhanced) vs SC 2.5.8 Target Size (Minimum) — cross-referenced across multiple accessibility-consultancy summaries (Silktide, TestParty, WCAG22aa.org) that all agree on the 44px/24px figures and the spacing-exception distinction
- k9n.dev — "When Your Live Region Isn't Live: Fixing aria-live in Angular, React, and Vue" (2025-11) - confirms the always-mounted-container requirement for reliable React `aria-live` announcements
- Tailwind CSS official docs (`tailwindcss.com/docs/overflow`, `/docs/responsive-design`) via WebSearch-surfaced summaries — `snap-x`/`snap-start`/`shrink-0`/`overflow-x-auto` pattern, `max-sm:`/`sm:` breakpoint variants

### Tertiary (LOW confidence)
- None — every claim in this document is either read directly from project source, sourced from an official W3C/WAI specification page, or cross-verified against multiple independent secondary sources.

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH - no new packages, all versions read directly from the project's own `package.json`
- Architecture (roving tabindex / listbox / focus trap): HIGH - patterns sourced directly from official W3C WAI-ARIA APG pages, cross-checked against the project's existing component structure
- Pitfalls: HIGH - each pitfall is either a documented AT/ARIA gotcha (live regions, focus trapping) cross-verified across multiple sources, or a direct observation from reading the actual `Card.tsx`/`Hand.tsx`/`Table.tsx` source this session

**Research date:** 2026-08-01
**Valid until:** 2026-09-15 (30 days — Tailwind/React APIs used here are stable, non-fast-moving; WAI-ARIA APG patterns referenced are settled, long-standing guidance, not likely to change within this window)
