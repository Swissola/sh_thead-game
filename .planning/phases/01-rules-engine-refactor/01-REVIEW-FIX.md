---
phase: 01-rules-engine-refactor
fixed_at: 2026-07-25T20:51:45Z
review_path: .planning/phases/01-rules-engine-refactor/01-REVIEW.md
iteration: 1
findings_in_scope: 6
fixed: 6
skipped: 0
status: all_fixed
---

# Phase 01: Code Review Fix Report

**Fixed at:** 2026-07-25T20:51:45Z
**Source review:** .planning/phases/01-rules-engine-refactor/01-REVIEW.md
**Iteration:** 1

**Summary:**
- Findings in scope: 6 (fix_scope: critical_warning -> CR-01, CR-02, WR-01, WR-02, WR-03, WR-04; IN-01/IN-02 out of scope)
- Fixed: 6
- Skipped: 0

All fixes verified against the full suite after each commit: `npx tsc -b` clean and `npx vitest run` green (139 -> 151 tests as fix-specific regression tests were added; no pre-existing test was weakened, only two applyMove.test.ts blind-play fixtures were corrected to satisfy the new hand-emptiness precondition CR-01 now enforces).

## Fixed Issues

### CR-01: applyMove does not enforce hand -> face-up -> face-down play order

**Files modified:** `src/engine/applyMove.ts`, `src/__tests__/engine/applyMove.test.ts`
**Commit:** a8a4ef3
**Applied fix:** Added a source-validation check in `applyPlayCards` between the mixed-selection combo branch and the `cardsToPlay` build loop: outside the documented hand+faceUp combo exception, every selection's `type` must equal the player's current `cardSource` (from `GameLogic.getAvailableCardSource`), else the move is rejected with `INVALID_SELECTION` ("You must play from your {source} cards first"). This closes the gap where a `faceDown` or pure `faceUp` selection could be processed while the player still held hand cards.

For `PICK_UP_PILE`'s `revealedFaceDownIndex`, added a documenting comment (not a code-gating change) explaining this is an intentionally accepted exception consistent with RESEARCH.md's Open Question 2 resolution ("PICK_UP_PILE performs the pickup unconditionally once dispatched") - picking up the pile is always legal regardless of source, and the UI (`Table.tsx`) already only lets a player reveal a face-down card when `getAvailableCardSource` is `'faceDown'`, so this isn't a rule-order bypass in the same sense as PLAY_CARDS.

Updated two pre-existing `applyMove.test.ts` blind-play tests whose fixtures had the player holding hand cards while playing a `faceDown` selection - a scenario the fix now correctly rejects - to give those players an empty hand (matching the legal precondition). Added two new tests asserting the CR-01 rejection for `faceDown` and pure `faceUp` selections made while hand cards remain.

### CR-02: Move-dispatch persistence failures are silent - no user feedback, potential data loss

**Files modified:** `src/hooks/useGameState.ts`, `src/context/GameContext.tsx`
**Commit:** 3fea629
**Applied fix:** `useGameStateUpdater` now takes a `showToast` callback and its `updateGameState` is `async`: the non-testMode branch awaits `window.storage.set(...)` inside a try/catch, calling `setGameState` only on success and `showToast('Failed to save your move - please retry.')` on failure - matching the existing `setGameState` (MenuScreen/LobbyScreen) pattern. `GameContext`'s `dispatchMove` now calls `void updateGameState(result.state)` (the `void` marks the fire-and-forget as intentional now that the promise is self-handling, rather than an unhandled rejection).

### WR-01: applyMove has no fallback for an unrecognised move.type

**Files modified:** `src/engine/applyMove.ts`, `src/__tests__/engine/applyMove.test.ts`
**Commit:** 4a4d4eb
**Applied fix:** Added a `default` case to the `switch (move.type)` in `applyMove` returning `{ state, error: { code: ERROR_CODES.INVALID_SELECTION, message: 'Unrecognised move type' } }` instead of falling through to an implicit `undefined`. Added a regression test that casts a malformed move object past the `Move` union and asserts `applyMove` returns a defined result with this error rather than crashing the caller.

### WR-02: MenuScreen.joinRoom has a read-modify-write race (lost update)

**Files modified:** `src/screens/MenuScreen.tsx`, `src/__tests__/screens/MenuScreen.test.tsx`
**Commit:** 02e192c
**Applied fix:** As scoped in the review (full fix needs a backend with compare-and-set, out of scope for localStorage), `joinRoom` now re-reads the room from storage immediately after writing and checks whether the joining player is present in the re-read player list; if not, shows a `'Failed to join room - please retry.'` toast instead of failing silently. Added a test seeding a waiting room directly in `localStorage` and asserting a successful join produces no spurious retry toast (collision-free happy path).

### WR-03: Room code generation is weak and can produce short/predictable codes

**Files modified:** `src/screens/MenuScreen.tsx`, `src/__tests__/screens/MenuScreen.test.tsx`
**Commit:** 6da18e8
**Applied fix:** Replaced `Math.random().toString(36).substr(2, 6).toUpperCase()` with a `generateRoomCode()` helper using `crypto.getRandomValues(new Uint8Array(6))` mapped through `(b % 36).toString(36)`, guaranteeing a fixed 6-character result (fixing both the weak-randomness and variable-length problems, and dropping the deprecated `.substr`). `createRoom` now loops (bounded to 5 attempts) re-checking `window.storage.get` for a collision before committing to the generated code. Added a test asserting the generated code is exactly 6 uppercase alphanumeric characters.

### WR-04: Hand.tsx and Table.tsx duplicate ~80 lines of selectable/tooltip logic

**Files modified:** `src/uiLogic.ts` (new), `src/components/Hand.tsx`, `src/components/Table.tsx`, `src/__tests__/uiLogic.test.ts` (new)
**Commit:** f6ee014
**Applied fix:** Extracted the literal duplicated logic (`canPlayMultipleCards` + `isLimiter`/`isBurn`/`RANK_VALUES` tooltip-text branching + `canAddToSelection` same-rank check) into `getCardPlayability(card, discardPile, selectedCards): { isPlayable, tooltip }` in a new `src/uiLogic.ts` module. Both `Hand.tsx`'s non-first-turn hand-card branch and `Table.tsx`'s `currentSource === 'faceUp'` branch now call this shared function instead of independently re-implementing the same tooltip strings and branching.

Adapted from the review's suggested single-function design: the two call sites differ meaningfully beyond the shared core (`Hand.tsx` has first-turn rank-matching that doesn't apply to `Table.tsx`'s face-up branch; `Table.tsx` has `revealedFaceDown` and hand+faceUp-combine cases that don't apply to `Hand.tsx`), so that gating logic was deliberately left local to each component rather than folded into the shared helper, to avoid changing behaviour for edge cases the two components were not previously handling identically. Added `src/__tests__/uiLogic.test.ts` (7 tests) locking down the extracted function's tooltip text and `isPlayable` outcomes for every branch (empty pile, generic pile-rank mismatch, burn-on-limiter, limiter-rank-exceeded, limiter-rank-allowed, selection-rank-mismatch, selection-rank-match).

**Note for reviewer follow-up:** this fix is a behaviour-preserving refactor verified by the full existing suite (including `GameScreen.test.tsx`'s DOM-level selection tests) plus new targeted unit tests, but UI selectable/tooltip branching has many paths not all individually exercised by automated tests (e.g. the limiter-tooltip path is only covered at the unit level, not through a DOM interaction test). Recommend a quick manual pass over Hand/Table card selection (setup-phase swap, in-play hand/face-up selection with a 7 on the pile, first-turn rank restriction) to confirm no visual/interaction regression before this phase is considered fully verified.

## Skipped Issues

None - all 6 in-scope findings (critical_warning fix_scope) were fixed. IN-01 and IN-02 (Info severity) were out of scope for this run and were not attempted.

---

_Fixed: 2026-07-25T20:51:45Z_
_Fixer: Claude (gsd-code-fixer)_
_Iteration: 1_
