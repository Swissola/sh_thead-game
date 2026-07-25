# Phase 1: Rules Engine Refactor - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-07-25
**Phase:** 1-rules-engine-refactor
**Areas discussed:** applyMove contract shape, In-app feedback for invalid moves, Screen split & state ownership, Test depth for ENGINE-07

---

## applyMove contract shape

| Option | Description | Selected |
|--------|-------------|----------|
| Explicit playerId on every move | e.g. `{type: 'PLAY_CARDS', playerId, cards: CardSelection[]}` — needed for Phase 2 anyway | ✓ |
| No playerId (assumes state.currentTurn) | Simpler for now, would need adding later | |
| You decide | | |

**User's choice:** Explicit playerId on every move.

| Option | Description | Selected |
|--------|-------------|----------|
| Never throws — returns {state, error?} | Uniform handling, easy for UI/server to branch on | ✓ |
| Throws a typed error class | Conventional, but every call site needs try/catch | |
| You decide | | |

**User's choice:** Never throws — returns `{state, error?}`, reached after discussion (see below).
**Notes:** User initially pushed back, pointing out the UI already only lets players select legal cards from their hand, so `applyMove` would rarely see an illegal move in practice — questioned whether robust invalid-move handling was needed at all. Clarified that validation inside `applyMove` isn't defensive programming against the UI, it's the actual Phase 2 security boundary (MPLAY-04: a modified client can't submit an illegal move) — once rooms are real, the caller isn't the trusted UI anymore, it's whatever an Edge Function receives over the wire. UI's job stays the same (only ever offer legal plays); `applyMove`'s validation exists for the case the UI can't prevent — a request that bypassed the UI entirely. User agreed and confirmed the result-object shape.

| Option | Description | Selected |
|--------|-------------|----------|
| Yes — enforce it now | applyMove rejects any move where playerId != current turn's player | ✓ |
| No — defer to Phase 2 | Trust the caller for now | |

**User's choice:** Yes — enforce it now.

| Option | Description | Selected |
|--------|-------------|----------|
| Code + message | `{code: 'NOT_YOUR_TURN', message: '...'}` — lets UI/server categorize later | ✓ |
| Message string only | Simpler, no categorization possible | |

**User's choice:** Code + message.

---

## In-app feedback for invalid moves

| Option | Description | Selected |
|--------|-------------|----------|
| Toast (corner, auto-dismiss) | Non-blocking, doesn't obscure the board | ✓ |
| Inline banner near the action | More contextual, needs layout space | |
| You decide | | |

**User's choice:** Toast (corner, auto-dismiss).

| Option | Description | Selected |
|--------|-------------|----------|
| One generic style for all errors | Codes exist for future server use, not UI branching | ✓ |
| Differentiate by category | More polished, more component work | |

**User's choice:** One generic style for all errors.

| Option | Description | Selected |
|--------|-------------|----------|
| Replace with the new message | Latest error wins, resets timer | ✓ |
| Queue and show in order | More correct, adds a small state machine | |
| You decide | | |

**User's choice:** Replace with the new message.

---

## Screen split & state ownership

| Option | Description | Selected |
|--------|-------------|----------|
| Single hook at the orchestrator, passed down as props | No new mechanism, matches today's pattern | |
| React Context provider wrapping all screens | Avoids prop-drilling as the tree grows | ✓ |
| You decide | | |

**User's choice:** React Context provider, reached after discussion (see below).
**Notes:** User asked for pros/cons of each option weighed against the whole roadmap, not just this phase. Analysis presented: prop drilling is fine for today's shallow 2-3 level tree and has no learning/debugging overhead, but Phase 3 adds accessibility wrappers (dialog semantics, focus traps) and Phase 6 adds a shared Modal primitive — both add nesting layers on top of today's tree, and each would require rewiring every intermediate component's props under prop-drilling. Context insulates those phases from that rewiring; consumers read state directly wherever rendered. Phase 2's realtime/optimistic-update logic (MPLAY-05) is orthogonal to this choice — it lives in the state-owning layer either way. Re-render cost isn't a real concern since a move already re-renders the whole board today. Given the orchestrator was already chosen to own top-level layout (next decision below), wrapping in `<GameProvider>` there is close to free. User chose Context on this basis.

| Option | Description | Selected |
|--------|-------------|----------|
| Routing + wiring only | No game-logic, no board/hand rendering | |
| Routing + top-level layout | Plus shared chrome (header, toast container) | ✓ |
| You decide | | |

**User's choice:** Routing + top-level layout.

| Option | Description | Selected |
|--------|-------------|----------|
| Pure structural refactor only | No visual/UX changes at all | |
| Structural refactor + opportunistic small cleanups | Fix obviously bad code encountered along the way | ✓ |

**User's choice:** Structural refactor + opportunistic small cleanups.

---

## Test depth for ENGINE-07

| Option | Description | Selected |
|--------|-------------|----------|
| Exhaustive per-move-type + edge cases | Every move type, every rejection reason, plus rules edge cases | ✓ |
| Golden-path + known bug regressions | Faster, less edge-case coverage | |
| You decide | | |

**User's choice:** Exhaustive per-move-type + edge cases.

| Option | Description | Selected |
|--------|-------------|----------|
| Renders without crashing + key interaction works | Confirms the split didn't break wiring | ✓ |
| Renders without crashing only | Faster, wouldn't catch a broken click handler | |

**User's choice:** Renders without crashing + key interaction works.

---

## Claude's Discretion

- Exact toast component implementation/positioning within the existing layout.
- Where precisely the "opportunistic small cleanup" line sits.
- Internal reducer structure (single switch vs per-move-type functions composed together).

## Deferred Ideas

None — discussion stayed within phase scope.
