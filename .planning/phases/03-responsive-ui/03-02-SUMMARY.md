---
phase: 03-responsive-ui
plan: 02
subsystem: ui
tags: [react, tailwind, aria, accessibility, keyboard-navigation, vitest]

# Dependency graph
requires:
  - phase: 03-responsive-ui plan 01
    provides: (no direct dependency - this plan's depends_on is empty; it targets the standalone Card leaf)
provides:
  - "CardProps extended with role, ariaSelected, ariaLabel, tabIndex, onFocus"
  - "Card.tsx: role=\"option\", aria-selected (option-role-gated), Enter/Space activation through the existing onClick callback, focus-visible cyan focus ring, immediate (non-debounced) focus-triggered tooltip reveal"
  - "src/__tests__/components/Card.test.tsx: 15-test scaffold for per-card ARIA/keyboard assertions"
affects: ["03-03 (Hand.tsx listbox container)", "03-04 (Table.tsx listbox container)"]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Keyboard activation (Enter/Space) always routed through the same onClick callback the mouse path uses - never a parallel dispatch path"
    - "aria-selected only ever rendered when role=\"option\" is also present (ARIA validity)"
    - "focus-visible: (never bare focus:) for the keyboard-only focus ring, composed as a plain non-interpolated class-string segment alongside the interpolated selected/hover expressions"
    - "Keyboard focus reveals the hover tooltip immediately (no 250ms/100ms timer), with any pending mouse-hover timer cleared first so a stale timer cannot overwrite focus-driven state"

key-files:
  created:
    - src/__tests__/components/Card.test.tsx
  modified:
    - src/types.ts
    - src/components/Card.tsx

key-decisions:
  - "Both Card.tsx branches (face-down, face-up) received identical role/aria-selected/aria-label/tabIndex/onFocus/onKeyDown wiring rather than only the face-up branch, since Task 1's behaviour list explicitly required both branches to support option semantics"
  - "onKeyDown was added directly on Card rather than as a CardProps prop, per the plan's explicit instruction - Card owns Enter/Space, arrow keys are left unhandled to bubble to the listbox container 03-03/03-04 will add"

requirements-completed: [RESP-02, RESP-04]

# Metrics
duration: ~25min
completed: 2026-08-01
---

# Phase 3 Plan 2: Card Keyboard/ARIA Accessibility Summary

**Card.tsx gains `role="option"`, Enter/Space activation through its existing `onClick` callback, a `focus-visible:ring-cyan-400` keyboard focus ring distinct from the yellow selected ring, and focus-triggered (non-debounced) tooltip reveal - all while preserving the blind-play invariant for face-down cards.**

## Performance

- **Duration:** ~25 min
- **Completed:** 2026-08-01
- **Tasks:** 2 completed
- **Files modified:** 3 (1 created, 2 modified)

## Accomplishments
- `CardProps` extended with `role`, `ariaSelected`, `ariaLabel`, `tabIndex`, `onFocus` (no `onKeyDown` prop - Card owns that itself)
- Both branches of `Card.tsx` (face-down and face-up) apply the new props identically, with `aria-selected` only emitted when `role === 'option'`
- Enter/Space call the same `onClick?.()` each branch's mouse path already uses, gated identically to the existing mouse gating (face-down unconditional, face-up behind `selectable`); arrow keys are deliberately left unhandled so they bubble to the future listbox container
- New `focus-visible:ring-4 ring-cyan-400 ring-offset-2 ring-offset-slate-900` ring composes alongside the existing `ring-4 ring-yellow-400` selected ring and the hover lift - all three states stay independently legible
- Keyboard focus now reveals the playability tooltip immediately (no 250ms mouse-hover delay), closing the gap where a sighted keyboard user got no explanation for why a card was unplayable
- Tooltip text grown from `font-medium` (500) to `font-semibold` (600) per `03-UI-SPEC.md`'s Label row
- 15-test `Card.test.tsx` scaffold created, all passing; full suite (493 tests, up from 478) and `npm run build` both green

## Task Commits

Each task followed the plan's RED -> GREEN TDD cycle, two commits per task:

1. **Task 1: Option semantics and Enter/Space activation on Card**
   - `144bf8a` (test) - nine failing tests for role/tabIndex/Enter/Space/aria-selected/arrow-bubbling/blind-play
   - `94abf81` (feat) - CardProps extension + Card.tsx role/aria-selected/aria-label/tabIndex/onFocus/onKeyDown wiring on both branches
2. **Task 2: Distinct keyboard focus ring and focus-revealed playability text**
   - `5d6dc54` (test) - six failing tests for the focus ring, focus/blur tooltip reveal, accessible name, and onFocus pass-through
   - `b7bcb32` (feat) - focus-visible ring, immediate focus/blur tooltip reveal (bypassing the mouse-hover timers), font-semibold tooltip text

**Plan metadata:** (this commit) - SUMMARY.md

_TDD gate compliance: both tasks show a `test(...)` commit (RED, confirmed failing before implementation) followed by a `feat(...)` commit (GREEN, confirmed passing after implementation). No REFACTOR commit was needed for either task._

## Files Created/Modified
- `src/types.ts` - `CardProps` gains `role?: 'option'`, `ariaSelected?: boolean`, `ariaLabel?: string`, `tabIndex?: number`, `onFocus?: FocusEventHandler<HTMLDivElement>`
- `src/components/Card.tsx` - both branches apply the five new props, add an inline `onKeyDown` (Enter/Space -> the same `onClick` callback the mouse path uses), a `focus-visible:ring-cyan-400` ring, and an immediate (non-debounced) `onFocus`/`onBlur` tooltip reveal that clears any pending mouse-hover timer first
- `src/__tests__/components/Card.test.tsx` - new, 15 tests across both tasks' behaviour lists

## Decisions Made
- Kept `aria-selected` strictly gated behind `role === 'option'` (per the plan's explicit ARIA-validity rule) rather than always emitting it - verified by a dedicated test asserting the attribute is entirely absent when no `role` prop is given
- `onFocus`/`onBlur` clear both `showTimer` and `hideTimer` before setting hover state, so a card that was already mid-hover-in (mouse) or mid-hover-out cannot have its keyboard-driven state overwritten a moment later by a stale mouse timeout firing

## Deviations from Plan

None - plan executed exactly as written. Both tasks' `<action>` and `<acceptance_criteria>` blocks were followed literally; all listed grep-based acceptance checks pass with their exact expected counts (`onKeyDown` x2, `role === 'option' ? ariaSelected : undefined` x2, `focus-visible:ring-cyan-400` x2, `ring-4 ring-yellow-400` x2, bare `focus:ring` x0, touch-reveal handlers x0, `onBlur` x2, `text-sm font-semibold` x2, `font-medium` x0).

## Issues Encountered

**Stale worktree branch.** This worktree's branch (`worktree-agent-a5dba9448f77a2008`) was still on `d606485`, an old ancestor of `stage-1-refactor` that predates `.planning/` entirely (0 commits ahead, 231 behind `stage-1-refactor`, clean working tree). This is the same class of issue previously logged in `STATE.md` for plan 02-19. Resolved with `git merge --ff-only stage-1-refactor` before starting any plan work - a pure fast-forward, no conflicts, no commits lost. Flagging here in case the worktree-provisioning step that spawns these agents needs a fix to stop recurring.

## Next Phase Readiness
- `Card.tsx` now speaks `role="option"` and handles Enter/Space natively, which is exactly what `03-03-PLAN.md` (`Hand.tsx`) and `03-04-PLAN.md` (`Table.tsx`) need when they turn their containers into roving-tabindex listboxes in Wave 2 - neither plan needs to reimplement per-card keyboard handling
- No blockers for 03-03/03-04

---
*Phase: 03-responsive-ui*
*Completed: 2026-08-01*

## Self-Check: PASSED

All created/modified files confirmed present (`src/types.ts`, `src/components/Card.tsx`, `src/__tests__/components/Card.test.tsx`, `.planning/phases/03-responsive-ui/03-02-SUMMARY.md`). All five commit hashes (`144bf8a`, `94abf81`, `5d6dc54`, `b7bcb32`, `258960a`) confirmed present in `git log`.
