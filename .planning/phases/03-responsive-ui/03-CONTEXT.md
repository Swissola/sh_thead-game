# Phase 3: Responsive UI - Context

**Gathered:** 2026-08-01
**Status:** Ready for planning

<domain>
## Phase Boundary

Make the existing game fully usable on a phone-sized screen and via keyboard, without changing any game rules or the multiplayer flow underneath. Covers: layout reflow so nothing overflows on a phone width (RESP-01), a touch-usable replacement for the current mouse-hover card tooltip (RESP-02), touch targets meeting a 44px minimum including undersized existing controls (RESP-03), full keyboard support for selecting and playing cards (RESP-04), and turn-change screen-reader announcements plus real modal focus-trapping (RESP-05).

This is a retrofit onto Phase 1's already-split screen components (`Hand.tsx`, `Table.tsx`, `Card.tsx`, `GameScreen.tsx`, `LobbyScreen.tsx`) — no new game mechanics, no visual/animation polish beyond what's needed to satisfy RESP-01..05 (that's Phase 6's job), and the shared `Modal` primitive itself stays out of scope (Phase 6/POLISH-03) even though this phase must make the one existing modal-like UI (the celebration modal) properly accessible now.

</domain>

<decisions>
## Implementation Decisions

### Keyboard card selection & play (RESP-04)
- **D-01:** Arrow keys move a single roving focus cursor across the hand's cards (one Tab stop for the whole hand, not one per card) — keeps Tab order short regardless of hand size.
- **D-02:** Enter/Space toggles a card in/out of selection, mirroring today's click-to-select. Committing the play still goes through a focusable "Play" control, reached by continuing to Tab/arrow to it — there is no separate "play immediately" shortcut.
- **D-03:** Keyboard support covers the hand **and** the table's face-up pile, with multi-select available on both (a valid play can be several cards sharing a rank, whether drawn from hand or from the face-up pile). Face-down table cards are keyboard-selectable too, but **individually only** — a face-down card's rank is unknown until played, so there's no way to know in advance whether multiple face-down cards would form a legal multi-card play, and the UI must not let a player select more than one at a time.
- **D-04:** Keyboard focus gets a distinct focus ring, visually separate from the existing yellow "selected" ring and the hover scale/lift effect, so focused/selected/hovered stay individually legible to a sighted keyboard user.

### Turn announcements & modal focus (RESP-05)
- **D-05:** An `aria-live="polite"` region (same pattern already used by `Toast.tsx`) announces just "Your turn" / "`<Name>`'s turn" on each turn change — no board-state summary, to avoid competing with move-result toasts on every turn.
- **D-06:** Phase 3 builds a real focus-trap (`role="dialog"`, focus trapped inside, Escape-to-close) now rather than deferring it to Phase 6. Phase 6 later swaps the implementation into the shared `Modal` component without changing this accessibility contract.
- **D-07:** This applies to the celebration/win modal only — the one modal-like UI that currently exists in the app (wired up in Phase 1, animations in `App.css`). No other confirm-style overlay UI exists today to bring into scope.

### Touch card-detail reveal (RESP-02)
- **D-08:** No separate touch reveal mechanism is built. A face-up card's rank/suit is already printed on the card face itself — the mouse-hover tooltip is an accessibility/legibility aid, not the only way to see the value — so RESP-02 is satisfied by keeping card text legible at whatever size the responsive layout settles on, not by porting the tooltip's show/hide mechanic to touch.
- Face-down cards never receive a `title` prop anywhere in the codebase today (confirmed via `Hand.tsx`/`Table.tsx` call sites) — there is nothing to reveal for them regardless, consistent with the blind-play rule. No special-casing needed; whatever ships for face-up cards must not regress this invariant.

### Mobile layout reflow strategy (RESP-01 / RESP-03)
- **D-09:** Below the phone breakpoint, the layout genuinely rearranges rather than just scaling the desktop arrangement down (e.g. the hand becomes a horizontally-scrollable strip pinned to the bottom, piles/table compress into a tighter cluster above it). Uniform scale-down was rejected as too likely to make cards/piles illegibly small or untappable on a real phone.
- **D-10:** Use Tailwind's stock breakpoints (`sm`/`md`/`lg` — 640/768/1024px) already available now that `tailwindcss` is an installed dependency (`tailwind.config.js` currently has no custom breakpoint overrides). No custom breakpoint values.
- **D-11:** `Hand.tsx`'s same-rank card overlap (`-mr-12` negative margin) is reduced (or removed) below the phone breakpoint, so each card keeps closer to its full tappable width instead of being mostly covered by its neighbour — directly supports RESP-03 rather than relying on the existing hover-lift effect to compensate.
- **D-12:** One phone-optimised layout serves both portrait and landscape — landscape just gets more horizontal room within the same rearranged-for-phone arrangement decided in D-09. No separate portrait-specific vs. landscape-specific layout to design or maintain.

### Undersized control buttons (RESP-03)
- **D-13:** `Hand.tsx`'s hand-sort buttons (Original/Rank/Suit, currently `px-2 py-1 text-xs` — roughly 24-28px tall, under the 44px minimum) grow via bigger padding/height on the same three-button row, rather than switching to icon-only buttons or collapsing into a dropdown/segmented control. Smallest visual change; keeps the sort control always visible rather than adding an extra tap to change modes.
- Other interactive controls (Leave Game, Dismiss, Copy room code/link, Remove player, Auto-pickup timeout select) should be audited against the same 44px minimum during implementation — not separately discussed here, but in scope for RESP-03 wherever found undersized.

### Claude's Discretion
- Exact focus-ring colour/style for D-04, as long as it's visually distinct from the existing selected/hover treatments.
- Precise scroll/snap behaviour of the horizontally-scrollable hand strip on phone width (D-09) — implementation detail.
- Whether the Play control (D-02) is a persistent on-screen button or only reachable by continuing keyboard navigation past the hand — whichever fits the phone-rearranged layout from D-09 more naturally.
- Full audit list and exact padding fix for each undersized control beyond the hand-sort buttons (D-13) — Claude identifies and fixes these during implementation.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Project-level context
- `.planning/PROJECT.md` — Core Value, Constraints (Phase 3 reorder flexibility), Key Decisions table.
- `.planning/REQUIREMENTS.md` — full RESP-01..05 requirement text this phase must satisfy.
- `.planning/ROADMAP.md` — Phase 3 goal, success criteria, and `UI hint: yes` marker (a `/gsd-ui-phase` UI-SPEC.md pass may be worth running before/alongside planning, given the layout-reflow scope).

### Phase 1 carry-forward (the split components this phase retrofits)
- `.planning/phases/01-rules-engine-refactor/01-CONTEXT.md` — D-08 (GameContext instead of prop-drilling, chosen partly *because* Phase 3 adds accessibility wrappers/focus traps on top), D-09 (orchestrator owns shared chrome/toast container).
- `src/components/Card.tsx`, `src/components/Hand.tsx`, `src/components/Table.tsx`, `src/screens/GameScreen.tsx`, `src/screens/LobbyScreen.tsx` — the components this phase retrofits; must not be reimplemented, only extended.
- `src/App.css` — celebration modal animations this phase adds focus-trap/dialog semantics around (D-06/D-07).

### Source planning documents
- `ROADMAP.md` (repo root) — original staged 7-stage plan; contains implementation-level detail beyond the condensed phase entry.
- `.planning/intel/context.md` — distilled extraction of the above, organized by topic.

No ADRs exist yet for this project — decisions above are the locked record for this phase.

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `src/components/Toast.tsx` — already has `aria-live="polite"` wired up; the exact pattern to reuse for D-05's turn-change announcement region.
- `tailwindcss` (already an installed dependency, `tailwind.config.js` has no custom theme/breakpoint overrides yet) — stock `sm`/`md`/`lg` breakpoints are available with zero config changes (D-10).
- `src/hooks/useSelection.ts` — existing `selectedCards`/`revealedFaceDown` selection state; the keyboard nav work (D-01..D-03) extends this rather than building parallel selection state.

### Established Patterns
- `src/components/Card.tsx` — zero `onKeyDown`/`tabIndex` anywhere today; keyboard support (RESP-04) is greenfield, not an extension of partial existing handling. Hover tooltip uses a 250ms show / 100ms hide `setTimeout` pair per card instance — this timing/pattern is what D-08 deliberately avoids porting to touch.
- `src/components/Hand.tsx` — same-rank cards get `-mr-12` negative margin to visually fan/overlap them (line ~119); the specific mechanism D-11 changes below the phone breakpoint. Sort buttons (`px-2 py-1 text-xs`, lines 43-58) are the concrete D-13 target.
- No `@media`/breakpoint usage exists anywhere in `src/` today (`App.css`/`index.css` are both breakpoint-free) — confirms D-09/D-10 are starting from zero, not adjusting existing responsive rules.
- Face-down `Card` instances (in `Table.tsx`'s face-down pile render and `DrawPile.tsx`) never pass a `title` prop — the invariant D-08's second point relies on.

### Integration Points
- `src/screens/GameScreen.tsx` — owns the celebration modal trigger and the toast container; where D-05's turn-announcement region and D-06's focus-trap logic both attach.
- `src/components/Hand.tsx` — where D-01/D-02's roving keyboard focus and D-09's horizontal-scroll-strip layout both live.
- `src/components/Table.tsx` — where D-03's face-up/face-down keyboard selection extends existing card rendering.

</code_context>

<specifics>
## Specific Ideas

No specific visual/UX references given beyond the decisions above. The keyboard-scope decision (D-03) was the one place the user corrected the framing mid-discussion: face-up multi-select needs full parity with mouse play (since same-rank multi-card plays are common), but face-down cards are deliberately restricted to single-select because their rank is unknown until played — a UI that let you multi-select unseen cards could imply a legality guarantee that doesn't exist.

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope. All six discussed areas (four originally selected, two more surfaced from codebase scouting — undersized buttons and orientation handling) were clarifications of how to implement RESP-01..05, not new capabilities.

</deferred>

---

*Phase: 03-responsive-ui*
*Context gathered: 2026-08-01*
