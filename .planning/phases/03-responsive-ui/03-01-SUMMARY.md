---
phase: 03-responsive-ui
plan: 01
subsystem: ui
tags: [react, hooks, accessibility, wai-aria, tailwind]

# Dependency graph
requires: []
provides:
  - useRovingTabindex hook (generic roving-tabindex focus cursor for role="option" listboxes)
  - useFocusTrap hook (vanilla Tab/Shift+Tab wrap + Escape + focus-return modal focus trap)
  - Confirmed sr-only utility is already available via Tailwind's core accessibility plugin
affects: [03-03, 03-04, 03-05]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Roving-tabindex cursor clamp is a render-time derivation from itemCount, never a useEffect+setState, to satisfy this project's lint rules and avoid the shrink-under-cursor bug"
    - "Vanilla focus-trap hook (document keydown listener, recomputed focusable list each keypress, focus-return via a previouslyFocused ref) with no new dependency"

key-files:
  created:
    - src/hooks/useRovingTabindex.ts
    - src/hooks/useFocusTrap.ts
    - src/__tests__/hooks/useRovingTabindex.test.tsx
    - src/__tests__/hooks/useFocusTrap.test.tsx
  modified: []

key-decisions:
  - "sr-only is already shipped by Tailwind v3's core accessibility plugin (grep-confirmed) - no duplicate rule added to src/index.css"

patterns-established:
  - "New generic hooks live in src/hooks/ as plain named-export functions returning a plain object, matching useHandSorting.ts/useSelection.ts/useToast.ts conventions - no default exports, no classes"

requirements-completed: [RESP-04, RESP-05]

# Metrics
duration: ~25min
completed: 2026-08-01
---

# Phase 3 Plan 01: Accessibility Primitives Summary

**Two reusable accessibility hooks - useRovingTabindex (WAI-ARIA APG listbox roving-tabindex cursor) and useFocusTrap (vanilla modal Tab-wrap/Escape/focus-return) - built once for Hand.tsx, Table.tsx, and GameScreen.tsx's celebration modal to consume in later plans.**

## Performance

- **Duration:** ~25 min
- **Completed:** 2026-08-01T21:03:28Z
- **Tasks:** 2 completed
- **Files modified:** 4 (all new)

## Accomplishments

- `useRovingTabindex(itemCount)` — a generic roving-tabindex focus cursor for any container with `[role="option"]` descendants. Cursor position is derived at render time (`Math.min(Math.max(rawIndex, 0), itemCount - 1)`), not stored via a `useEffect`+`setState` pair, which both satisfies this project's lint rules and fixes 03-RESEARCH.md's Pitfall 1 (a card leaving the hand mid-cursor no longer strands the listbox with zero `tabIndex="0"` items).
- `useFocusTrap(active, onEscape)` — a vanilla focus trap for the celebration modal: on activation it records the previously-focused element, moves focus to the first focusable descendant, wraps Tab/Shift+Tab at both ends of the focusable set (recomputed fresh on every keypress, never cached), calls `onEscape()` on Escape, and restores focus to the pre-trap element on cleanup/unmount.
- Settled the `sr-only` open question with evidence rather than assumption: Tailwind v3's `corePlugins.js` (`src/corePlugins.js:669` and the built `lib/corePlugins.js:639`) already registers `.sr-only` (and `.not-sr-only`) as a core `accessibility` utility with the exact WCAG-standard visually-hidden recipe. `src/index.css` was left untouched — no duplicate rule added.

## Task Commits

Each task was committed atomically:

1. **Task 1: useRovingTabindex hook** - `3f543e0` (feat)
2. **Task 2: useFocusTrap hook and the sr-only utility** - `f21b9cc` (feat)

## Files Created/Modified

- `src/hooks/useRovingTabindex.ts` - generic roving-tabindex hook; exports `useRovingTabindex`, returns `{ containerRef, activeIndex, getItemProps, onKeyDown }`
- `src/hooks/useFocusTrap.ts` - vanilla focus-trap hook; exports `useFocusTrap`, returns the container `RefObject`
- `src/__tests__/hooks/useRovingTabindex.test.tsx` - 8 tests: arrow/Home/End navigation, no-wraparound at both ends, ArrowDown/Up aliasing, single `tabIndex=0` invariant, Pitfall 1 shrink-under-cursor regression, unhandled-key no-op
- `src/__tests__/hooks/useFocusTrap.test.tsx` - 7 tests: initial focus, Tab wrap forward/backward, Escape callback, focus-return on unmount, inactive-listener isolation, Dismiss-only-child shape

## Decisions Made

- Confirmed via `grep -rn "sr-only" node_modules/tailwindcss/src/corePlugins.js` (and the built `lib/corePlugins.js`) that Tailwind v3 already ships `.sr-only` as a core accessibility utility (`position: absolute; width: 1px; height: 1px; padding: 0; margin: -1px; overflow: hidden; clip: rect(0, 0, 0, 0); white-space: nowrap; border-width: 0;` — an exact match for the recipe 03-RESEARCH.md documented). No new rule was added to `src/index.css`, avoiding a dead duplicate.

## Deviations from Plan

None — plan executed exactly as written. `node_modules` had to be installed from the existing `package-lock.json` (worktree checkout carried no `node_modules`); this is routine environment setup from the committed lockfile, not a new/unverified package install, so it did not trigger the package-install checkpoint.

## Issues Encountered

The worktree branch (`worktree-agent-a018f41c881c8417d`) was created from an old ancestor of `stage-1-refactor` (231 commits behind, predating `.planning/` entirely — zero unique commits of its own). Fast-forwarded via `git merge --ff-only stage-1-refactor` before starting, matching the same pattern noted in STATE.md for prior worktree sessions (02-19).

## Next Phase Readiness

- `useRovingTabindex` and `useFocusTrap` are ready for 03-03 (`Hand.tsx`), 03-04 (`Table.tsx`), and 03-05 (`GameScreen.tsx`'s celebration modal + turn announcer) to consume directly.
- `sr-only` availability is confirmed — 03-05's always-mounted live region can use the `sr-only` Tailwind class without any further setup.
- Full hook test suite (`npm test -- --run src/__tests__/hooks`) is green: 108 tests across 7 files, including the two new ones. `npm run build` (strict TS) and the scoped `npx eslint` on all four new files are both clean.

---
*Phase: 03-responsive-ui*
*Completed: 2026-08-01*

## Self-Check: PASSED

All created files verified present (`src/hooks/useRovingTabindex.ts`, `src/hooks/useFocusTrap.ts`, both test files, this SUMMARY.md). All three commit hashes (`3f543e0`, `f21b9cc`, `3f905f6`) verified present in git log.
