---
phase: 03-responsive-ui
plan: 03
subsystem: ui
tags: [react, aria, listbox, roving-tabindex, tailwind, keyboard-accessibility]

# Dependency graph
requires:
  - phase: 03-responsive-ui
    provides: "useRovingTabindex hook (03-01) and Card.tsx's role/ariaSelected/ariaLabel/tabIndex/onFocus option props with Enter/Space-to-onClick wiring (03-02)"
provides:
  - "Hand.tsx as a WAI-ARIA multi-selectable listbox (role=listbox, aria-multiselectable, per-card role=option/aria-selected) with roving keyboard focus"
  - "44px-minimum (min-h-11) hand-sort buttons, unchanged labels/colours"
  - "Below-640px horizontally scroll-snapping hand strip with zero same-rank card overlap"
  - "src/__tests__/components/Hand.test.tsx - first dedicated Hand test file, 11 tests"
affects: [03-04, 03-05, 03-06, 03-07, 03-08]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Destructure a custom hook's return object to local bindings before using any ref in JSX (const { containerRef: x } = useHook()) rather than property access (hook().containerRef) - the react-compiler ESLint rule (react-hooks/refs, eslint-plugin-react-hooks v7) false-positives on ref-via-property-access and cannot verify it's safe"
    - "Compute list-length-derived hook inputs (e.g. handCardCount) before an early-return, immediately after the component's other hooks, since hooks cannot run conditionally after a return"

key-files:
  created:
    - src/__tests__/components/Hand.test.tsx
  modified:
    - src/components/Hand.tsx

key-decisions:
  - "useRovingTabindex's returned object is destructured to local bindings (handContainerRef/handOnKeyDown/getHandItemProps) rather than used via roving.foo property access, to satisfy the react-compiler ESLint rule without disabling it"

patterns-established:
  - "Listbox container: role=listbox + aria-multiselectable=true + aria-label, with the roving hook's containerRef/onKeyDown wired directly onto the same element that already carries the layout class list"

requirements-completed: [RESP-01, RESP-03, RESP-04]

# Metrics
duration: ~15min active work (session interrupted by an API usage-limit error between Task 2's code changes and its commit; resumed and completed in a follow-up session)
completed: 2026-08-02
---

# Phase 03 Plan 03: Hand as an accessible, phone-usable listbox Summary

**Hand.tsx wired to `useRovingTabindex` as a multi-selectable ARIA listbox, its sort buttons grown to 44px, and its card strip made a non-overlapping horizontal scroll-snap layout below 640px**

## Performance

- **Duration:** ~15 min active work (interrupted mid-plan by an API session-limit error, resumed same worktree/branch)
- **Started:** 2026-08-01T22:10Z (approx, file reads)
- **Completed:** 2026-08-02T08:04Z
- **Tasks:** 2/2 completed
- **Files modified:** 2 (1 created, 1 modified)

## Accomplishments
- The hand is now a single Tab stop: `role="listbox"`, `aria-multiselectable="true"`, `aria-label="Your hand"` on the container, with `useRovingTabindex` driving arrow-key focus movement across `role="option"` cards without touching selection state
- Enter/Space toggle selection through the pre-existing `onClick` handler (via `Card.tsx`'s already-merged keyboard wiring) - no new `setSelectedCards` call site was added, so every gating rule the mouse path already enforced (turn, phase, card source, first-turn rank, same-rank multi-select) applies identically to the keyboard path
- Hand-sort buttons (`Original`/`Rank`/`Suit`) grew from `px-2 py-1 text-xs` to `min-h-11 px-3 py-2 text-sm font-semibold` - 44px touch minimum, same labels, same active/inactive colour branching
- Below the `sm` (640px) breakpoint the hand becomes a horizontally scroll-snapping strip (`max-sm:flex-nowrap max-sm:overflow-x-auto max-sm:snap-x max-sm:snap-mandatory max-sm:py-4`) with the same-rank `-mr-12` overlap demoted to `sm:`-only, so no card is partially occluded on a touch screen

## Task Commits

Each task was committed atomically:

1. **Task 1: Hand as a multi-selectable listbox with roving keyboard focus** - `482be18` (feat)
2. **Task 2: 44px sort buttons and the phone-width hand strip** - `a370197` (feat)

**Plan metadata:** *(pending - this SUMMARY.md commit)*

## Files Created/Modified
- `src/components/Hand.tsx` - listbox/roving-tabindex wiring (Task 1), 44px sort buttons and phone-width scroll-snap strip (Task 2)
- `src/__tests__/components/Hand.test.tsx` - new file; 11 tests covering listbox semantics, roving focus, Enter/Space selection toggling, same-rank multi-select, unplayable-card aria-label, the shrinking-hand tabindex regression (Pitfall 1), and Task 2's className assertions

## Decisions Made
- Destructured `useRovingTabindex`'s return value to local bindings (`handContainerRef`, `handOnKeyDown`, `getHandItemProps`) instead of the plan's literal `roving.containerRef`/`roving.onKeyDown`/`roving.getItemProps(index)` property-access form. See Deviations below - this was a Rule 3 blocking-issue fix, not a design change; the listbox/roving-tabindex behaviour is unchanged, only how the hook's return value is bound to local names.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Destructured useRovingTabindex's return value instead of accessing it via `roving.foo` property access**
- **Found during:** Task 2 (running the plan's mandated `npx eslint src/components/Hand.tsx src/__tests__/components/Hand.test.tsx` verification step)
- **Issue:** The plan's literal instruction (`ref={roving.containerRef}`, `onKeyDown={roving.onKeyDown}`, `{...roving.getItemProps(index)}`) passed `npm run build` and all tests, but failed the plan's own required `npx eslint` check with three `react-hooks/refs` (React Compiler) errors: "Cannot access refs during render" / "Passing a ref to a function may read its value during render". The lint rule cannot statically prove that a ref reached through property access on a custom hook's returned object (`roving.containerRef`) is safe to hand to a JSX `ref` prop, even though this is exactly the intended, safe usage `useRovingTabindex` was designed for
- **Fix:** Destructured the hook's return value to local bindings at the call site (`const { containerRef: handContainerRef, onKeyDown: handOnKeyDown, getItemProps: getHandItemProps } = useRovingTabindex(handCardCount);`) and used those bindings directly in JSX. This matches the already-working `useFocusTrap` pattern elsewhere in the codebase (`const containerRef = useFocusTrap(...); <div ref={containerRef}>`), which the same lint rule accepts without complaint - the compiler's ref-detection only recognises a ref reached via direct variable binding, not via a property on an intermediate object
- **Files modified:** `src/components/Hand.tsx` (the same file the plan already scoped this task to; no additional files touched)
- **Verification:** `npx eslint src/components/Hand.tsx src/__tests__/components/Hand.test.tsx` now exits clean (0 errors, 0 warnings); `npm test -- --run` (529/529 tests) and `npm run build` both still pass unchanged
- **Committed in:** `a370197` (Task 2 commit)

---

**Total deviations:** 1 auto-fixed (1 blocking)
**Impact on plan:** No behavioural or architectural change - the listbox, roving focus, and phone-strip layout all work exactly as specified. Purely a binding-style fix required to satisfy the plan's own verification command. No scope creep.

## Issues Encountered
- Mid-plan API session-limit interruption occurred after Task 2's code changes were made and staged but before the commit ran. Resumed in a follow-up session on the same worktree/branch (`worktree-agent-a60e28a2d0652c65f`); re-verified `npm test -- --run` (529 passed) and `npm run build` (clean) before committing, per the coordinator's resume instructions, rather than re-doing already-complete work.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness
- `Hand.tsx` is now a fully keyboard-accessible, phone-usable listbox; plan 03-04 (Table.tsx's face-up/face-down piles) can reuse the same `useRovingTabindex` destructuring pattern established here
- The `handContainerRef`/`handOnKeyDown`/`getHandItemProps` local-binding convention should be followed by any other component wiring `useRovingTabindex` or `useFocusTrap`, to avoid re-triggering the same `react-hooks/refs` lint failure
- No blockers for subsequent Phase 03 plans

---
*Phase: 03-responsive-ui*
*Completed: 2026-08-02*

## Self-Check: PASSED

- FOUND: src/components/Hand.tsx
- FOUND: src/__tests__/components/Hand.test.tsx
- FOUND: .planning/phases/03-responsive-ui/03-03-SUMMARY.md
- FOUND commit: 482be18 (Task 1)
- FOUND commit: a370197 (Task 2)
- FOUND commit: 5065305 (docs: SUMMARY.md)
