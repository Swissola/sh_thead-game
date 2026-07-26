---
phase: 02-real-cross-device-multiplayer
plan: 02
subsystem: engine
tags: [typescript, deno, engine-hardening, toast, ui, tdd]

# Dependency graph
requires:
  - phase: 01-rules-engine-refactor
    provides: the pure applyMove(state, move) reducer and its closed ERROR_CODES set
provides:
  - applyPickUpPile's revealedFaceDownIndex gated on getAvailableCardSource(player) === 'faceDown', closing the last untrusted-client gap ahead of MPLAY-04's server trust boundary
  - Confirmed CR-01 (hand->faceUp->faceDown play-order enforcement) is closed, with a standing regression suite rather than a re-implementation
  - Deno-importable engine module graph (src/types.ts, src/gameLogic.ts, src/engine/errors.ts, src/engine/moves.ts, src/engine/applyMove.ts all use extension-qualified relative imports)
  - useToast/Toast variant support ('error' | 'reconcile' | 'reconnect') with a backward-compatible default, ready for D-10/D-12's reconciliation and reconnect UX
affects: [02-03, 02-04, 02-05]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Extension-qualified relative imports (.ts suffix) in the engine's transitive closure only, so a future Deno Edge Function can re-export these exact files verbatim"
    - "Toast variant lookup table (VARIANT_BORDER_CLASS) keyed on a defaulted optional field, preserving every existing two-argument call site"

key-files:
  created: []
  modified:
    - src/engine/applyMove.ts
    - src/__tests__/engine/applyMove.test.ts
    - src/gameLogic.ts
    - src/engine/moves.ts
    - src/hooks/useToast.ts
    - src/components/Toast.tsx
    - src/__tests__/hooks/useToast.test.ts
    - src/__tests__/components/Toast.test.tsx

key-decisions:
  - "Gated PICK_UP_PILE's revealedFaceDownIndex on getAvailableCardSource(player) === 'faceDown', reusing the same INVALID_SELECTION code and message wording as CR-01's PLAY_CARDS gate, rather than accepting the risk under the new server trust model (RESEARCH.md Pitfall 2 / T-02-03)"
  - "show()'s new variant parameter is a defaulted third argument ('error') rather than a change to the existing two-argument shape, so GameContext/GameScreen/MenuScreen needed zero edits"

patterns-established:
  - "Untrusted-client gates in applyMove return the closed ERROR_CODES set only, never a new ad hoc code, even when hardening a previously-accepted-risk path"

requirements-completed: [MPLAY-04, MPLAY-05]

# Metrics
duration: 25min
completed: 2026-07-26
---

# Phase 2 Plan 2: Engine hardening and Deno-importability, toast variants Summary

**Closed the last untrusted-client gap in `applyPickUpPile` (revealedFaceDownIndex now requires faceDown to be the player's only source), made the engine's five core modules resolvable by Deno via extension-qualified imports, and added a backward-compatible `variant` field to the toast system for the upcoming reconciliation/reconnect UX.**

## Performance

- **Duration:** ~25 min
- **Started:** 2026-07-26T18:31:00Z (first test run)
- **Completed:** 2026-07-26T18:36:56Z
- **Tasks:** 3 completed
- **Files modified:** 8

## Accomplishments

- Verified CR-01 (hand->faceUp->faceDown play order) is already closed (43 pre-existing tests passed unmodified before any change), then closed the genuinely-open adjacent gap: `PICK_UP_PILE`'s `revealedFaceDownIndex` can no longer reveal a face-down card's identity while the player still holds hand or face-up cards.
- Made `src/types.ts`, `src/gameLogic.ts`, `src/engine/errors.ts`, `src/engine/moves.ts` and `src/engine/applyMove.ts` importable verbatim by a Deno Edge Function, by appending `.ts` to every relative import specifier in that module graph only.
- Added `ToastVariant` (`'error' | 'reconcile' | 'reconnect'`) to `useToast`/`Toast`, following full RED -> GREEN TDD, with zero changes required to any of the three existing call sites (`GameContext.tsx`, `GameScreen.tsx`, `MenuScreen.tsx`).

## Task Commits

Each task was committed atomically:

1. **Task 1: Verify CR-01 is closed, then gate revealedFaceDownIndex in applyPickUpPile (D-13)** - `5a97ab5` (fix)
2. **Task 2: Make the engine modules Deno-importable with extension-qualified specifiers** - `561b380` (refactor)
3. **Task 3: Add toast variants for reconciliation and reconnect (D-10, D-12)** - `6cbc0e9` (test, RED) then `8e03d55` (feat, GREEN)

## Files Created/Modified

- `src/engine/applyMove.ts` - `applyPickUpPile` now computes `getAvailableCardSource(player)` and rejects `revealedFaceDownIndex` with `INVALID_SELECTION` unless the source is `faceDown`; extension-qualified its own relative imports
- `src/__tests__/engine/applyMove.test.ts` - three new `PICK_UP_PILE` + `revealedFaceDownIndex` regression tests, plus one pre-existing fixture (`unshifts the revealed face-down card...`) updated so its player setup is consistent with the new gate
- `src/gameLogic.ts`, `src/engine/moves.ts` - relative imports of `./types`/`../types`/`./errors` now carry an explicit `.ts` extension
- `src/hooks/useToast.ts` - `ToastState.variant?: ToastVariant`, exported `ToastVariant` type, `show()`'s third parameter defaults to `'error'`
- `src/components/Toast.tsx` - border colour and leading icon (`RotateCcw`/`CheckCircle2`) keyed on `toast.variant ?? 'error'`
- `src/__tests__/hooks/useToast.test.ts`, `src/__tests__/components/Toast.test.tsx` - new variant-behaviour tests; one pre-existing `useToast` fixture updated for the new default `variant` field on `ToastState`

## Decisions Made

- Reused CR-01's exact error code and message-wording pattern (`INVALID_SELECTION`, `` `You must play from your ${cardSource} cards first` ``) for the new `revealedFaceDownIndex` gate, keeping `src/engine/errors.ts`'s closed `ERROR_CODES` set untouched (confirmed via `git diff --stat`).
- `errors.ts` and `types.ts` needed no import-specifier changes in Task 2 (neither has a relative import), so only 3 of the 5 listed files show a diff - this satisfies "no changes outside the five listed files" rather than contradicting it.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Updated a pre-existing `PICK_UP_PILE` test fixture that contradicted the new gate**
- **Found during:** Task 1
- **Issue:** The existing test "unshifts the revealed face-down card into the pickup..." gave the player a non-empty hand while also setting `revealedFaceDownIndex`, a combination the new gate correctly now rejects. Running the suite after adding the gate surfaced this as a failing test, not a design ambiguity.
- **Fix:** Changed the fixture's `hand`/`faceUp` to empty (so `faceDown` is genuinely the only source) and adjusted the expected resulting hand accordingly. Renamed the test to note the source is now faceDown, and referenced T-02-03.
- **Files modified:** `src/__tests__/engine/applyMove.test.ts`
- **Verification:** `npm test -- --run src/__tests__/engine/applyMove.test.ts` - all 46 tests pass
- **Committed in:** `5a97ab5` (Task 1 commit)

**2. [Rule 1 - Bug] Updated a pre-existing `useToast` D-07 fixture for the new default `variant` field**
- **Found during:** Task 3 (GREEN step)
- **Issue:** The existing "second show() resets the dismiss timer" test asserted `toEqual({ message, code })` with no `variant` key; once `show()` started defaulting `variant: 'error'`, the assertion under-specified the actual (correct) returned object and failed.
- **Fix:** Added `variant: 'error'` to the three `toEqual(...)` assertions in that one test.
- **Files modified:** `src/__tests__/hooks/useToast.test.ts`
- **Verification:** `npm test -- --run src/__tests__/hooks/useToast.test.ts src/__tests__/components/Toast.test.tsx` - all 16 tests pass
- **Committed in:** `8e03d55` (Task 3 GREEN commit)

---

**Total deviations:** 2 auto-fixed (both Rule 1 - pre-existing test fixtures that predated new correctness constraints)
**Impact on plan:** Both fixes are necessary consequences of the plan's own intended behaviour changes, not scope creep. No production code beyond what the plan specified was touched.

## Issues Encountered

None beyond the two fixture updates documented above.

## User Setup Required

None - no external service configuration required. Both pieces of work in this plan are purely local (no Supabase dependency), as stated in the plan's objective.

## Next Phase Readiness

- The engine's remaining untrusted-client gap is closed and regression-tested, so later plans in this phase can treat `applyMove` as the server's full authority (MPLAY-04) without further hardening work.
- The engine module graph is Deno-importable today; a later plan can create `supabase/functions/_shared/engine.ts` re-exporting these exact files with no risk of specifier-resolution failure.
- Toast variants are available and tested; the reconciliation/reconnect plans (D-10, D-12, likely 02-04/02-05) can call `showToast(message, code, 'reconcile')` / `showToast(message, code, 'reconnect')` directly with no further toast-plumbing work.
- No blockers identified for subsequent plans in this phase.

---
*Phase: 02-real-cross-device-multiplayer*
*Completed: 2026-07-26*
