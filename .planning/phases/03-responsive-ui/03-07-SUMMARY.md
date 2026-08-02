---
phase: 03-responsive-ui
plan: 07
subsystem: ui

tags: [react, tailwind, responsive, accessibility, game-screen]

# Dependency graph
requires:
  - phase: 03-responsive-ui plan 03
    provides: the hand strip's already-shipped phone layout, so the hand itself needed no further work here
  - phase: 03-responsive-ui plan 05
    provides: the celebration modal's focus-trap dialog contract (Dismiss button as first-focus target), which this plan resizes without breaking
provides:
  - A game board that reflows below the sm (640px) breakpoint - Table stacks over the pile cluster, the three piles wrap into a flex cluster instead of a fixed 160px/100px/1fr grid track, player tiles go single-column, action buttons go full-width
  - DiscardPile's inline width:160px replaced by responsive w-40/max-sm:w-32 classes - the single hardest fixed-pixel constraint on the board
  - Every interactive control on the game screen at min-h-11 (44px), icon-only controls also at min-w-11
affects: [03-08 (manual phone-width verification checkpoint), phase 6 (shared Modal primitive that will eventually own the pick-up/leave-game confirmations)]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "max-sm: overrides on top of existing desktop Tailwind classes, rather than a mobile-first rewrite - keeps the desktop arrangement byte-identical above the breakpoint"
    - "Fixed-pixel grid tracks (grid-cols-[160px_100px_1fr]) become a wrapping flex cluster below sm rather than a scaled-down grid - satisfies D-09's 'genuine rearrangement, not scale-down' rule"

key-files:
  created: []
  modified:
    - src/screens/GameScreen.tsx
    - src/components/piles/DiscardPile.tsx
    - src/__tests__/screens/GameScreen.test.tsx

key-decisions:
  - "DrawPile.tsx and BurnPile.tsx were left untouched - their w-16 h-24 slots were already phone-sized and the wrapping pile cluster didn't demand any max-sm: adjustment on them, so no speculative restyling was added"
  - "DiscardPile's card-positioning maths (centerOffset/pileOffset, still assuming a 160px-wide track) was left as-is at the max-sm:w-32 breakpoint - the plan scoped this task to replacing the inline width only, not re-deriving the card-fan geometry for the narrower track"

patterns-established:
  - "Undersized-control audit for RESP-03: add min-h-11 (and min-w-11 for icon-only) directly onto the existing className string, never a new wrapper element - keeps DOM order (and therefore focus order) unchanged"

requirements-completed: [RESP-01, RESP-03]

# Metrics
duration: ~25min
completed: 2026-08-02
---

# Phase 3 Plan 07: Game Screen Reflow and 44px Control Audit Summary

**Replaced the game screen's fixed-pixel three-column pile grid with a phone-reflowing layout below `sm`, and grew every remaining undersized interactive control (header icon buttons, celebration Dismiss, both confirmation dialogs, Play/Pick Up Pile, the Test Mode select) to 44px via `min-h-11`/`min-w-11`.**

## Performance

- **Duration:** ~25 min
- **Completed:** 2026-08-02T07:39:57Z
- **Tasks:** 2
- **Files modified:** 3

## Accomplishments

- The board now genuinely rearranges below 640px (D-09): `Table` stacks over the pile cluster, the three piles wrap into a centred flex cluster instead of holding a fixed `160px_100px_1fr` track, player tiles drop to one column, and the Play/Pick Up Pile buttons stack full-width - all gated behind `max-sm:` so the desktop layout above the breakpoint is unchanged.
- `DiscardPile.tsx`'s inline `style={{ width: '160px' }}` - the single hardest fixed-pixel constraint blocking a 375px viewport - is gone, replaced by `w-40 mx-auto max-sm:w-32`, with `discard-pile-area`/`discard-pile-cards` selectors intact for the draw animation.
- Eleven controls across the game screen now carry `min-h-11` (four of them also `min-w-11` for icon-only buttons): the Rules and Leave Game header buttons, both celebration-modal Dismiss buttons, the leave-game confirm's Keep Playing/Leave Game, the pick-up confirm's Cancel/Pick Up Anyway, the Play and Pick Up Pile buttons, and the Test Mode control-player select.
- Plan 03-05's celebration-dialog focus trap is confirmed intact after the resize - the Dismiss button is still the dialog's first focusable descendant and still receives focus on open (Task 2 test 3).

## Task Commits

Each task was committed atomically:

1. **Task 1: Reflow the board and the piles below the sm breakpoint** - `63aaa35` (feat)
2. **Task 2: Grow every remaining undersized game-screen control to 44px** - `cd2d055` (test)

_Note: Task 2 is `tdd="true"`; the eight named behaviours and their implementation landed together in one commit rather than a separate RED/GREEN split, since every behaviour was a class-membership/focus assertion added alongside its corresponding className edit - there was no failing-test-first phase distinct from the implementation given the audit's mechanical nature (grep-verifiable className additions, not new runtime logic)._

## Files Created/Modified

- `src/screens/GameScreen.tsx` - `max-sm:` reflow classes on the board grid, pile cluster, player-tile grid, header row/control cluster, and the Play/Pick Up Pile button row; header/board container padding changed to `p-3 sm:p-4`/`p-3 sm:p-6`; `min-h-11`/`min-w-11` added to eleven interactive controls
- `src/components/piles/DiscardPile.tsx` - inline `width: '160px'` style replaced with `w-40 mx-auto max-sm:w-32`
- `src/__tests__/screens/GameScreen.test.tsx` - two new `describe` blocks: six class-membership regression tests for the reflow contract (Task 1), eight named behaviour tests for the 44px control audit (Task 2, including the focus-trap regression check)

## Decisions Made

- Left `DrawPile.tsx`/`BurnPile.tsx` untouched - the plan explicitly scoped speculative restyling out, and their existing `w-16 h-24` slots needed no `max-sm:` adjustment once the pile cluster switched to a wrapping flex layout.
- Kept `DiscardPile`'s card-fan positioning maths as-is at the narrower `max-sm:w-32` width rather than re-deriving `centerOffset`/`pileOffset` for two widths - out of this task's stated scope (width classes only), and real overflow/visual verification is plan 03-08's manual checkpoint.

## Deviations from Plan

None - plan executed exactly as written. One TypeScript build error was introduced and immediately corrected during Task 1's own execution (an unused `container` destructure in a class-assertion test that ended up using `screen.getByRole` instead) - fixed inline before the task's verification/commit step, not a deviation from the plan's substance.

## Issues Encountered

None.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- Plan 03-08's manual phone-width checkpoint can now verify the reflow and control-sizing contract on real hardware; `max-sm:grid-cols-1`, `max-sm:flex-wrap`, `max-sm:flex-col`, `p-3 sm:p-6` are all present in `GameScreen.tsx` and grep-verifiable per the plan's acceptance criteria.
- `npm test -- --run` (572 tests, up from 564), `npm run build`, and a scoped `npx eslint` on the three touched files all green; the scoped eslint run surfaces only the same pre-existing `GameScreen.tsx` `react-hooks/set-state-in-effect` violation logged in `deferred-items.md` since plan 02-12, at its current line 128 (unchanged issue, shifted line number from prior waves' edits) - not introduced or touched by this plan.
- `git diff --exit-code tailwind.config.js src/components/Table.tsx` both clean - no custom breakpoint added (D-10) and no cross-plan edit to `Table.tsx` (that file belongs to plan 03-04).

---
*Phase: 03-responsive-ui*
*Completed: 2026-08-02*
