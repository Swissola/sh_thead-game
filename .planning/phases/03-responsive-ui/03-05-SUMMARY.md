---
phase: 03-responsive-ui
plan: 05
subsystem: ui
tags: [react, accessibility, wai-aria, aria-live, focus-trap]

# Dependency graph
requires:
  - phase: 03-responsive-ui plan 01
    provides: useFocusTrap hook (vanilla Tab/Shift+Tab wrap + Escape + focus-return)
provides:
  - Always-mounted aria-live="polite" role="status" turn-announcer region in GameScreen.tsx
  - Celebration modal converted to a real role="dialog" aria-modal="true" focus-trapped dialog
affects: [03-08]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Render-body state adjustment (not useEffect+setState) for state that must update in lockstep with a gameState change - required by this project's react-hooks/set-state-in-effect AND react-hooks/refs lint rules, which forbid both setState-in-effect and ref reads/writes during render. A useState-based guard (not a useRef) tracks 'last processed value' when the guard itself must be read during render."

key-files:
  created: []
  modified:
    - src/screens/GameScreen.tsx
    - src/__tests__/screens/GameScreen.test.tsx

key-decisions:
  - "Turn-announcer guard implemented as useState (lastAnnouncedTurn), not the plan's specified useRef (lastAnnouncedTurnRef) - see Deviations"

patterns-established:
  - "A DOM-node-stable aria-live region (never conditionally unmounted) is the correct pattern for any future always-on status announcement in this codebase, per Pitfall 2"
  - "useFocusTrap's contract (stable onEscape via useCallback, ref attached at hook level not inside the portal JSX) is now proven out end-to-end in a real screen, not just its own unit tests - safe to reuse for Phase 6's shared Modal primitive"

requirements-completed: [RESP-05]

# Metrics
duration: ~20min
completed: 2026-08-02
---

# Phase 3 Plan 05: Turn Announcer and Focus-Trapped Celebration Dialog Summary

**An always-mounted `aria-live="polite"` turn announcer and a `role="dialog"` focus-trapped celebration modal in `GameScreen.tsx`, both proven by a real `useFocusTrap`/render-body-state integration rather than unit tests of the hook alone.**

## Performance

- **Duration:** ~20 min
- **Completed:** 2026-08-02T08:25:43+01:00
- **Tasks:** 2 completed
- **Files modified:** 2

## Accomplishments

- A permanently mounted `<div aria-live="polite" role="status" className="sr-only">` in `GameScreen.tsx`, rendered on every path the component renders at all (including the setup phase), text content switching between exactly `"Your turn"` and `"<Name>'s turn"` on genuine `gameState.currentTurn` transitions only.
- The celebration modal (`SH!THEAD!` / `SAFE!` variants) is now a real `role="dialog"` `aria-modal="true"` dialog named via `aria-labelledby="celebration-heading"` pointing at its own visible heading, replacing the prior `role="alert"` `aria-live="assertive"` announcement-only treatment.
- `useFocusTrap` (built in plan 03-01) wired at the component's hook level: Tab/Shift+Tab wraps within the dialog, Escape dismisses, and focus returns to the pre-open element on close - all driven by the existing `dismissCelebration` handler, now stabilised with `useCallback` so it can serve as both the Dismiss button's `onClick` and the trap's `onEscape`.
- The pick-up-confirmation and leave-game-confirm portals are untouched, `src/App.css`'s `.celebration-modal`/`.celebration-emoji`/`.celebration-emoji-pulse` classes are untouched, per D-07's scope boundary.

## Task Commits

Each task was committed atomically:

1. **Task 1: Always-mounted turn-announcement live region** - `85fed69` (feat)
2. **Task 2: Celebration modal as a focus-trapped dialog** - `f0ae47f` (feat)

## Files Created/Modified

- `src/screens/GameScreen.tsx` - added the turn-announcer live region and its render-body state adjustment; converted the celebration modal portal to `role="dialog"`/`aria-modal="true"`/`aria-labelledby`, wired `useFocusTrap`, stabilised `dismissCelebration` with `useCallback`
- `src/__tests__/screens/GameScreen.test.tsx` - 6 new tests for the turn announcer (presence during setup/playing, correct text for self/other, no-rewrite on unrelated re-render, real transition), 7 new tests for the celebration dialog (role/attrs, accessible name for both variants, initial focus, Escape dismissal, Tab containment, focus-return on close, mouse-dismiss regression check)

## Decisions Made

- Implemented the turn-announcer's "only announce on a real turn change" guard as `useState<number | null>` (`lastAnnouncedTurn`/`setLastAnnouncedTurn`) rather than the plan's specified `useRef` (`lastAnnouncedTurnRef`). See Deviations below - this project's `react-hooks/refs` lint rule forbids reading/writing a ref's `.current` during render, which the render-body "adjusting state" pattern (itself required by `react-hooks/set-state-in-effect`) needs to do.
- `dismissCelebration` wrapped in `useCallback` with an empty dependency array (it only touches refs and a stable `setCelebrationModal` setter), matching the plan's read_first note about `useFocusTrap`'s `[active, onEscape]` effect dependency.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Turn announcer: useEffect+setState triggered react-hooks/set-state-in-effect**
- **Found during:** Task 1
- **Issue:** The plan's specified implementation (a `useEffect` calling `setTurnAnnouncement` directly in its body) is exactly the shape this project's `react-hooks/set-state-in-effect` lint rule (React Compiler) flags as a new violation - `npx eslint src/screens/GameScreen.tsx` reported it at the new effect's `setTurnAnnouncement` call, on top of the one pre-existing violation the plan's acceptance criteria explicitly allows (the celebration-modal effect carried since 02-01).
- **Fix:** Moved the turn-announcement logic out of `useEffect` into the render body itself, following React's "adjusting state during render" pattern and this project's own established precedent (plan 02-12's grace-expired arm-key state). The check-and-set runs directly in the component body, guarded so it only fires on an actual `currentTurn` change.
- **Files modified:** `src/screens/GameScreen.tsx`
- **Verification:** `npx eslint src/screens/GameScreen.tsx` returns to exactly one violation (the pre-existing one); all six Task 1 tests still pass.
- **Committed in:** `85fed69` (Task 1 commit)

**2. [Rule 1 - Bug] Turn announcer guard: useRef access during render triggered react-hooks/refs**
- **Found during:** Task 1 (same fix pass as above)
- **Issue:** After moving the guard logic into the render body to satisfy `react-hooks/set-state-in-effect`, the plan's specified `lastAnnouncedTurnRef` (a `useRef`) is read and written directly in that render-body block - which trips a second, distinct lint rule, `react-hooks/refs` ("Cannot access ref value during render" / "Cannot update ref during render"). Refs are fundamentally incompatible with the render-body state-adjustment pattern this project's stricter rule set requires for effect-avoidance.
- **Fix:** Replaced `lastAnnouncedTurnRef` (`useRef<number | null>`) with `lastAnnouncedTurn`/`setLastAnnouncedTurn` (`useState<number | null>`), the same pattern plan 02-12 already established in this codebase for an equivalent "guard state that must be read/written during render" case. Behaviourally identical - the guard still gates on a real `currentTurn` index change - only the underlying React primitive differs from the plan's literal spec.
- **Files modified:** `src/screens/GameScreen.tsx`
- **Verification:** `npx eslint src/screens/GameScreen.tsx` clean of both rules (one pre-existing violation only); all six Task 1 tests pass; `npm run build` exits 0.
- **Committed in:** `85fed69` (Task 1 commit)

---

**Total deviations:** 2 auto-fixed (both Rule 1, same root cause - the plan's literal effect/ref-based implementation conflicts with this project's stricter React Compiler lint configuration; resolved using an existing in-codebase pattern from plan 02-12)
**Impact on plan:** Behaviourally identical to what the plan specified (same guard semantics, same announced strings, same six test behaviours). One acceptance-criterion detail changed as a direct, unavoidable consequence: `grep -c "lastAnnouncedTurnRef"` now returns 0 (the identifier is `lastAnnouncedTurn`, not `lastAnnouncedTurnRef`) - the criterion's intent (a guard preventing re-announcement on unrelated re-renders) is fully met and tested, only the literal variable name differs. No scope creep.

## Issues Encountered

None beyond the two auto-fixed lint conflicts above.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- `useFocusTrap` is now proven working end-to-end in a real screen (celebration modal), not just its own isolated unit tests - Phase 6's shared `Modal` primitive can reuse the same contract with confidence.
- Real screen-reader confirmation of the turn announcer and dialog is deferred to plan 03-08's manual checkpoint, per this plan's own `<verification>` section - automated tests here can only prove DOM/attribute correctness, not audible announcement.
- Full suite (558 tests, up from 545), `npm run build`, and scoped `npx eslint` on both touched files are all green.

---
*Phase: 03-responsive-ui*
*Completed: 2026-08-02*

## Self-Check: PASSED

All modified files verified present (`src/screens/GameScreen.tsx`, `src/__tests__/screens/GameScreen.test.tsx`, this SUMMARY.md). All three commit hashes (`85fed69`, `f0ae47f`, `cf1d1c1`) verified present in `git log`.
