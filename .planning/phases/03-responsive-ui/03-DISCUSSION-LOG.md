# Phase 3: Responsive UI - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-08-01
**Phase:** 03-responsive-ui
**Areas discussed:** Keyboard card selection & play, Turn announcements & modal focus, Touch card-detail reveal, Mobile layout reflow strategy, Undersized control buttons, Portrait vs landscape phone

---

## Keyboard card selection & play

| Option | Description | Selected |
|--------|-------------|----------|
| Arrow keys within hand | Left/Right arrows move a single focus cursor across the hand's cards (roving tabindex) | ✓ |
| Tab through each card | Every card is its own Tab stop | |

**User's choice:** Arrow keys within hand.

| Option | Description | Selected |
|--------|-------------|----------|
| Enter toggles + Enter again on a 'Play' control | Enter/Space toggles selection; committing still goes through a focusable Play button | ✓ |
| Enter selects, second distinct key plays | Enter/Space toggles selection; a separate shortcut submits immediately | |

**User's choice:** Enter toggles + Enter again on a 'Play' control.

| Option | Description | Selected |
|--------|-------------|----------|
| Hand only for now | Table cards only become playable once the hand is empty; scope keyboard nav to hand first | |
| Hand plus table's face-up/face-down cards | Full parity with mouse play from turn one | (modified) |

**User's choice:** Free text — "Hand plus table's face up cards is a must in case more than one of same type of card can be valid play. Face down cards can only be played individually as you'd never be able to tell if you could play many."
**Notes:** User corrected the framing offered in both options: full keyboard parity is needed for the hand and face-up pile (with multi-select, since same-rank multi-card plays exist), but face-down table cards must be restricted to single-select only, since their rank is unknown until played and multi-select would imply a legality guarantee the UI can't actually verify. Captured as D-03.

| Option | Description | Selected |
|--------|-------------|----------|
| Distinct focus ring | A ring/outline colour distinct from the existing selected ring and hover effect | ✓ |
| Reuse existing selected/hover styling | Focus looks like hover until Enter is pressed | |

**User's choice:** Distinct focus ring.

---

## Turn announcements & modal focus

| Option | Description | Selected |
|--------|-------------|----------|
| "Your turn" / "<Name>'s turn" | Short aria-live announcement, mirrors Toast.tsx's pattern | ✓ |
| Turn + board-state summary | Announces turn plus pile top card / cards remaining | |

**User's choice:** "Your turn" / "<Name>'s turn".

| Option | Description | Selected |
|--------|-------------|----------|
| Build real focus-trap now | role="dialog", focus trapped, Escape-to-close on whatever modal-like UI exists today | ✓ |
| Light pass, defer full a11y to Phase 6 | role="dialog" + Escape-to-close only, no full focus-trap until Phase 6 | |

**User's choice:** Build real focus-trap now.

| Option | Description | Selected |
|--------|-------------|----------|
| Celebration/win modal only | The only modal-like UI that currently exists | ✓ |
| Celebration modal + any confirm dialogs | Also covers pickup-pile confirmation etc. if implemented as overlay UI | |

**User's choice:** Celebration/win modal only.

---

## Touch card-detail reveal

| Option | Description | Selected |
|--------|-------------|----------|
| Skip a separate reveal | Card face already prints rank/suit; hover tooltip is a legibility aid, not the only way to see the value | ✓ |
| Tap-and-hold to peek | Long-press shows the same tooltip, release/tap-away dismisses | |
| Single tap opens, tap-away dismisses | First tap shows tooltip instead of selecting; second tap elsewhere dismisses | |

**User's choice:** Skip a separate reveal.
**Notes:** A follow-up question about face-down cards was withdrawn (InputValidationError — not a genuine choice, since face-down cards never receive a `title` prop and have nothing to reveal). Recorded as a confirmed fact in CONTEXT.md instead of a discussed decision.

---

## Mobile layout reflow strategy

| Option | Description | Selected |
|--------|-------------|----------|
| Rearrange for phone, scale for wider | Layout genuinely restructures below the phone breakpoint (e.g. hand becomes a scrollable strip) | ✓ |
| Same relative layout, scaled down | Keep today's arrangement, scale every element down uniformly | |

**User's choice:** Rearrange for phone, scale for wider.

| Option | Description | Selected |
|--------|-------------|----------|
| Reduce overlap on touch/narrow widths | Less negative margin below the phone breakpoint, so each card's tap target stays closer to full width | ✓ |
| Keep the same overlap everywhere | Rely on tap-to-select's scale+lift to make overlap a non-issue | |

**User's choice:** Reduce overlap on touch/narrow widths.

| Option | Description | Selected |
|--------|-------------|----------|
| Tailwind defaults: sm/md/lg | Use Tailwind's stock breakpoints, no config changes needed | ✓ |
| Custom breakpoints tuned to this game's layout | Define custom breakpoint values in tailwind.config.js | |

**User's choice:** Tailwind defaults: sm/md/lg.

---

## Undersized control buttons

| Option | Description | Selected |
|--------|-------------|----------|
| Bigger padding, same 3-button row | Increase padding/height on the existing three text buttons | ✓ |
| Icon-only buttons | Replace text labels with icons sized to a 44px square | |
| Dropdown/segmented control | Collapse the three options into a single dropdown/segmented control | |

**User's choice:** Bigger padding, same 3-button row.

---

## Portrait vs landscape phone

| Option | Description | Selected |
|--------|-------------|----------|
| Same rearranged layout, wider on landscape | One phone-optimised layout, landscape just has more horizontal room | ✓ |
| Distinct portrait-specific layout | Portrait gets its own arrangement genuinely different from landscape/tablet/desktop | |

**User's choice:** Same rearranged layout, wider on landscape.

---

## Claude's Discretion

- Exact focus-ring colour/style (D-04), as long as visually distinct from selected/hover treatments.
- Precise scroll/snap behaviour of the horizontally-scrollable hand strip on phone width (D-09).
- Whether the Play control (D-02) is a persistent on-screen button or only reachable via keyboard navigation past the hand.
- Full audit list and exact padding fix for undersized controls beyond the hand-sort buttons (D-13).

## Deferred Ideas

None — discussion stayed within phase scope throughout.
