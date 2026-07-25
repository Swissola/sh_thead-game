# Phase 1: Rules Engine Refactor - Context

**Gathered:** 2026-07-25
**Status:** Ready for planning

<domain>
## Phase Boundary

Extract a single pure `applyMove(state, move) -> {state, error?}` reducer that every move handler (play cards, pick up pile, swap cards, ready up) goes through, built on `gameLogic.ts`'s existing predicates. Fix the in-place state mutation this forces a fix for. Split the 1,501-line `App.tsx` into Menu/Lobby/Game screens plus a slim orchestrator. Dedupe rules logic currently repeated outside `gameLogic.ts`. Replace the 14 blocking `alert()` calls with in-app toast messages. Wire up the already-written celebration animation. Add automated test coverage for the engine and the split screens.

This is a structural refactor, not a visual one — responsive/visual polish is explicitly Phase 3/5/6's job.

</domain>

<decisions>
## Implementation Decisions

### applyMove contract shape
- **D-01:** Every move carries an explicit `playerId` — e.g. `{type: 'PLAY_CARDS', playerId, cards: CardSelection[]}` — reusing the existing `CardSelection` type from `types.ts`. Chosen because Phase 2's server-side Edge Function will need to know who sent a move over the network; building this in now avoids reshaping the move type later.
- **D-02:** `applyMove` never throws. It returns `{state, error?}` — unchanged state plus an error on rejection, new state and no error on success. Validation inside `applyMove` is the actual Phase 2 security boundary (MPLAY-04: "a modified client cannot submit an illegal move"), not defensive programming against the UI. Today's UI already only ever offers legal plays, so the real client rarely hits the rejection path — but a request that bypasses the UI entirely (a future network caller) must still be rejected by the engine itself, independent of the caller.
- **D-03:** `applyMove` enforces "is it this player's turn" internally now (rejects any move where `playerId` doesn't match `state.currentTurn`'s player), even though today only one trusted client exists. This makes Phase 2's server-side call secure by construction rather than by remembering to add the check later.
- **D-04:** Errors carry a machine-readable code alongside the human message — `{code: 'NOT_YOUR_TURN', message: 'Wait for your turn'}` — so the UI and, later, the server can branch/log/rate-limit by error type without string-matching.

### In-app feedback for invalid moves (replaces ENGINE-05's 14 `alert()` calls)
- **D-05:** Toast in a screen corner, auto-dismiss after a few seconds. Non-blocking, doesn't obscure the board.
- **D-06:** One generic visual style for all error codes — the codes exist for future server-side use (logging, rate-limiting), not for UI branching in this phase.
- **D-07:** A second invalid move while a toast is showing replaces the message and resets the dismiss timer. No message queue.

### Screen split & state ownership (ENGINE-03)
- **D-08:** GameState lives in a React Context provider (`<GameProvider>`) wrapping all three screens, with a `useGameContext` hook for consumers — not prop-drilled from the orchestrator. Decided after weighing both: prop drilling is fine for today's shallow tree, but Phase 3 adds accessibility wrappers (dialog semantics, focus traps) and Phase 6 adds a shared `Modal` primitive — both add nesting layers on top of what exists today. Context insulates those later phases from having to rewire prop chains each time a layer is added. Re-render cost is a non-issue: a move already re-renders the whole board today.
- **D-09:** The orchestrator's job is routing + top-level layout: it decides which screen renders based on `GameState.phase`, wires up the `applyMove` dispatch, and owns shared chrome (header, toast container) so that isn't duplicated across Menu/Lobby/Game. It does not render board/hand UI itself.
- **D-10:** Structural refactor plus opportunistic small cleanups — fix obviously bad code encountered along the way (dead code, awkward naming) even where not strictly required by ENGINE-01..07, but no visual/UX changes (that stays Phase 3/5/6's scope).

### Test depth (ENGINE-07)
- **D-11:** Engine tests are exhaustive per-move-type: every move type (play/pickup/swap/ready) tested for the valid case plus each distinct rejection reason (wrong turn, illegal rank, etc.), plus rules edge cases (burning the pile, four-of-a-kind, empty deck). Higher bar than golden-path-only because this reducer becomes Phase 2's security boundary.
- **D-12:** Screen smoke tests must do more than render-without-crashing — each screen's key interaction must be exercised (e.g. Game screen renders the board and clicking a card triggers a dispatch; Lobby's ready button calls the ready handler). Confirms the split didn't break wiring, not just that components mount.

### Claude's Discretion
- Exact toast component implementation/positioning within the existing layout.
- Where precisely the "opportunistic small cleanup" line sits — use judgement; anything beyond obviously-bad-code-encountered-in-passing belongs in its own phase, not this one.
- Internal reducer structure (single switch vs per-move-type functions composed together) — implementation detail, not a decision the user needs to weigh in on.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Source planning documents
- `ROADMAP.md` (repo root) — the original staged 7-stage plan this project's `.planning/ROADMAP.md` was derived from. Contains implementation-level detail beyond the condensed phase entry: specific file/line references for the mutation bug, exact duplication sites for rules logic, and the full "Stage 1" task list this phase's requirements map to.
- `.planning/intel/context.md` — distilled extraction of the above, organized by topic (codebase audit findings, the refactor-first rationale, the full staged plan). Faster to read than the root document for the same information.

### Project-level context
- `.planning/PROJECT.md` — Core Value, Constraints (Phase 1 → Phase 2 sequencing dependency), Key Decisions table.
- `.planning/REQUIREMENTS.md` — full ENGINE-01..07 requirement text this phase must satisfy.

No ADRs exist yet for this project — decisions above are the locked record for this phase.

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `src/gameLogic.ts` — pure predicates (`canPlayCard`, `canPlayMultipleCards`, `shouldBurnPile`, `hasPlayerWon`, `getNextPlayer`, `shouldConfirmPickUp`, etc.) that `applyMove` should be built on top of, not reimplement.
- `src/types.ts` — `CardSelection { type: CardSource; index: number }` already models a card reference; reuse directly in the move type rather than inventing a new shape.
- `src/hooks/useGameState.ts` (`useGameStateUpdater`) — existing pattern for persisting state (testMode vs storage-backed); the new engine's state updates should integrate with this rather than bypass it.
- `src/hooks/useSelection.ts` — existing selection state hook, likely stays as local UI state (not game state) even after the Context migration.
- React Testing Library — already a devDependency, currently unused; use it for the new screen smoke tests (D-12).

### Established Patterns
- `App.tsx`'s handlers (`playCards` line 461, `pickUpPile` line 836, `confirmPickUpPile` line 871, `swapCards` line 388, `setReady` line 422) are the five move handlers to consolidate into `applyMove`'s discriminated union cases.
- The direct-mutation bug pattern to eliminate: `App.tsx:465` takes a live reference into `gameState.players[playerIndex]`, then `App.tsx:582` (`player.hand = sortedHand.map(...)`) mutates it before ever copying — `applyMove` must produce new state objects by construction, not by convention.
- `src/App.css` is fully written (celebration bounce/pulse/fade-in keyframes) but never imported — `main.tsx` needs `import './App.css'` as a one-line fix to wire it up.

### Integration Points
- Rules-logic duplication to remove when wiring the new engine: hand-sort comparators (`App.tsx` and `Hand.tsx`), "cards share a rank" checks (reimplemented in `Hand.tsx` and twice in `Table.tsx` instead of calling `canPlayMultipleCards`), deck creation/shuffling (`App.tsx` vs a private reimplementation in its own test file).
- `playerId` is never actually set (`App.tsx:62`, guarded by `@ts-expect-error`) — the new `applyMove` requiring an explicit `playerId` on every move (D-01) forces this to be fixed as part of the refactor rather than left as a latent bug.

</code_context>

<specifics>
## Specific Ideas

No specific visual/UX references given — this phase is explicitly structural (D-10). The `{code, message}` error shape (D-04) and Context-based state (D-08) are the concrete architectural choices to carry into planning.

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope. No scope-creep items came up; all four discussed areas were clarifications of how to implement what's already in ENGINE-01..07.

</deferred>

---

*Phase: 01-rules-engine-refactor*
*Context gathered: 2026-07-25*
