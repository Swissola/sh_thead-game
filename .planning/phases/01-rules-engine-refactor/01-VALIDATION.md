---
phase: 1
slug: rules-engine-refactor
status: draft
nyquist_compliant: true
wave_0_complete: false
created: 2026-07-25
---

# Phase 1 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Vitest 4.0.16 (jsdom environment, `globals: true`) |
| **Config file** | `vitest.config.ts` |
| **Quick run command** | `npx vitest run <changed-file-pattern>` |
| **Full suite command** | `npm test -- --run` (or `npm run test:coverage` for coverage) |
| **Estimated runtime** | ~10-15s today (6 existing `gameLogic` test files); grows as engine + screen tests are added this phase |

---

## Sampling Rate

- **After every task commit:** Run `npx vitest run <changed-file-pattern>` for the file(s) touched
- **After every plan wave:** Run `npm test -- --run` (full suite)
- **Before `/gsd-verify-work`:** Full suite must be green, plus a manual visual check of the celebration animation (ENGINE-06) and a regression check of the existing draw-card animation (fragile to reducer timing changes per RESEARCH.md Pitfall 4 — not itself a phase requirement, but at risk from this phase's changes)
- **Max feedback latency:** ~15 seconds

---

## Per-Task Verification Map

Task IDs are assigned by the planner (`{padded_phase}-{plan}-{task}`) — this table maps at requirement level since it is written before PLAN.md files exist. The planner should carry these rows forward into task-level `<acceptance_criteria>`.

| Requirement | Behavior | Test Type | Automated Command | File Exists | Status |
|-------------|----------|-----------|-------------------|-------------|--------|
| ENGINE-01 | Every move type routes through `applyMove`; no rule logic duplicated elsewhere (incl. the 4th duplication site: Hand.tsx/Table.tsx setup-phase swaps) | unit | `npx vitest run src/__tests__/engine/applyMove.test.ts` | ❌ W0 | ⬜ pending |
| ENGINE-02 | No handler mutates input state/player objects in place | unit — reference-inequality + `structuredClone`-equality assertions embedded in every `applyMove` test | `npx vitest run src/__tests__/engine/applyMove.test.ts` | ❌ W0 | ⬜ pending |
| ENGINE-03 | App.tsx split into Menu/Lobby/Game screens + slim orchestrator; screens render correctly | smoke (RTL render) | `npx vitest run src/__tests__/screens` | ❌ W0 | ⬜ pending |
| ENGINE-04 | Deduped logic (hand-sort, rank-share, deck creation) behaves identically to old inline implementations | unit — extend existing `gameLogic` tests; **rewrite** `deck.test.ts` to import real `createDeck`/`shuffleDeck` instead of its private copy | `npx vitest run src/__tests__/gameLogic src/__tests__/utils/deck.test.ts` | ✅ (existing, needs edit) | ⬜ pending |
| ENGINE-05 | Toast shows on invalid move, replaces (not queues) on a second invalid move, auto-dismisses | unit (hook) + smoke (component interaction) | `npx vitest run src/__tests__/hooks/useToast.test.ts src/__tests__/screens` | ❌ W0 | ⬜ pending |
| ENGINE-06 | Celebration CSS actually applies/plays | manual-only — jsdom cannot assert real paint/animation timing | manual visual check in browser | n/a | ⬜ pending |
| ENGINE-07 | Automated coverage exists for engine + screens | meta-requirement, satisfied by the rows above collectively | `npm run test:coverage` | — | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `vitest.config.ts` — `setupFiles: []` is currently empty; wire `setupFiles: ['./src/test-setup.ts']` importing `@testing-library/jest-dom` so `toBeInTheDocument()` etc. are available to all RTL tests
- [ ] `src/__tests__/engine/applyMove.test.ts` — stubs for ENGINE-01/ENGINE-02
- [ ] `src/__tests__/screens/*.test.tsx` — stubs for ENGINE-03/ENGINE-05
- [ ] `src/__tests__/hooks/useToast.test.ts` — stubs for ENGINE-05's dismiss/replace-timer behaviour
- [ ] `src/__tests__/testUtils/buildGameState.ts` — shared `GameState` fixture builder; needed before D-11's exhaustive per-move-type test volume makes inline fixtures unwieldy
- [ ] `src/__tests__/utils/deck.test.ts` — edit (not create) to import the real `createDeck`/`shuffleDeck` post-relocation instead of its current private copy

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Celebration animation plays on player finish | ENGINE-06 | jsdom has no real paint/animation timing to assert against | Play a game to a finish in the browser; confirm the celebration modal's bounce/pulse/fade-in animations actually render (not just the modal appearing statically) |
| Draw-card animation still plays correctly | Regression risk only (Pitfall 4), not a new requirement | Animation depends on `flushSync`/`setTimeout`/DOM-query timing not covered by any existing or planned test | After wiring `applyMove`'s `PLAY_CARDS` case, manually play a hand that triggers a draw and confirm cards animate into the correct hand slots, not off-screen or to `(0,0)` |

---

## Validation Sign-Off

- [x] All tasks have `<automated>` verify or Wave 0 dependencies
- [x] Sampling continuity: no 3 consecutive tasks without automated verify
- [x] Wave 0 covers all MISSING references
- [x] No watch-mode flags
- [x] Feedback latency < 15s
- [x] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
