---
phase: 03
slug: responsive-ui
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-08-01
---

# Phase 03 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Vitest ^4.0.16 + @testing-library/react ^16.3.1 + @testing-library/jest-dom ^6.9.1 |
| **Config file** | `vite.config.ts` (test config colocated with Vite config) |
| **Quick run command** | `npm test -- --run src/__tests__/components` (scoped to touched files during a task) |
| **Full suite command** | `npm test -- --run` |
| **Estimated runtime** | ~30 seconds (478 tests per STATE.md) |

Note: `@testing-library/user-event` is not installed. Not a blocker — this phase's focus-trap and roving-tabindex logic are hand-rolled `onKeyDown` handlers, so `fireEvent.keyDown(element, { key: 'Tab' | 'ArrowRight' | ' ' })` against the focused element plus asserting `document.activeElement` is sufficient and matches this project's existing `fireEvent`-based test style.

---

## Sampling Rate

- **After every task commit:** Run `npm test -- --run src/__tests__/components` and/or `src/__tests__/screens/GameScreen.test.tsx` depending on which files the task touches
- **After every plan wave:** Run `npm test -- --run` (full suite)
- **Before `/gsd-verify-work`:** Full suite green, plus `npm run build` (strict TS) and `npm run lint`, plus a manual real-device or browser-devtools-emulated phone-width + keyboard-only + screen-reader smoke pass (this phase has two irreducibly-manual success criteria: real-device touch, screen-reader announcement)
- **Max feedback latency:** ~30 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 03-01-01 | TBD | 0 | RESP-01 | — | Hand/table reflow below `sm` applies `max-sm:` classes, no overflow | unit (className assertion) | `npm test -- --run src/__tests__/components/Hand.test.tsx` | ❌ Wave 0 | ⬜ pending |
| 03-01-02 | TBD | 0 | RESP-02 | — | Keyboard-focused card exposes playability text via `aria-label`/`aria-describedby`; face-down cards get no rank/suit exposure | unit (a11y attribute assertion) | `npm test -- --run src/__tests__/components/Card.test.tsx` | ❌ Wave 0 | ⬜ pending |
| 03-01-03 | TBD | 0 | RESP-03 | — | Sort buttons and audited controls compute to ≥44px (`min-h-11`/`min-w-11`) | unit (className/computed-style assertion) | `npm test -- --run src/__tests__/components/Hand.test.tsx` | ❌ Wave 0 | ⬜ pending |
| 03-01-04 | TBD | 1+ | RESP-04 | — | ArrowRight/Left moves roving focus without changing selection; Space/Enter toggles focused card's selection; face-down listbox rejects a second simultaneous selection | integration (`fireEvent.keyDown` round-trip via `applyMove`) | `npm test -- --run src/__tests__/screens/GameScreen.test.tsx` | ✅ (extend existing harness) | ⬜ pending |
| 03-01-05 | TBD | 1+ | RESP-05 | — | Turn change updates always-mounted live-region text; Escape closes celebration modal and returns focus to trigger; Tab wraps within modal | integration + manual (AT announcement is manual-only) | `npm test -- --run src/__tests__/screens/GameScreen.test.tsx` | ✅ (extend existing harness) | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `src/__tests__/components/Hand.test.tsx` — dedicated component test file (Hand is currently only exercised indirectly via `GameScreen.test.tsx`); needed for RESP-01/03 className-level assertions without re-mounting full GameScreen
- [ ] `src/__tests__/components/Card.test.tsx` — dedicated component test file for RESP-02/04 per-card ARIA attribute assertions (`role="option"`, `aria-selected`, `tabIndex`, `aria-label`)
- [ ] `src/__tests__/components/Table.test.tsx` — same rationale for the face-up/face-down listbox split (RESP-04, D-03)
- No framework install needed — Vitest/RTL already fully configured

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Real screen-reader announces "Your turn" / "`<Name>`'s turn" on turn change | RESP-05 | Automated tests can only verify DOM text-content correctness, not actual AT announcement behaviour | Run VoiceOver/NVDA against `npm run dev:auto`, trigger a turn change, confirm audible announcement |
| Touch targets are comfortably tappable on a real phone | RESP-03 | Computed CSS px size doesn't prove real-world tap accuracy/ergonomics | Load the dev server on a real phone (or Chrome DevTools device emulation as a fallback) and tap every interactive control |
| Layout genuinely reflows with no overflow at phone width | RESP-01 | Visual overflow/clipping is not reliably assertable from unit tests alone | Chrome DevTools responsive mode at 375px width (and a real device if available), scroll through full game screen |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 30s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
