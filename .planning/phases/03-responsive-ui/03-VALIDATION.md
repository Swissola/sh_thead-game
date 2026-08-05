---
phase: 03
slug: responsive-ui
status: partial
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
| **Estimated runtime** | ~6 seconds (572 tests as of plan 03-08's Task 1 gate run, up from the 478 baseline recorded at Phase 02 close) |

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
| 03-03-02 | 03-03 | 2 | RESP-01 | — | Below-640px hand becomes a horizontally scroll-snapping strip with same-rank overlap removed; no overflow | unit (className assertion) | `npm test -- --run src/__tests__/components/Hand.test.tsx` | ✅ | ✅ green |
| 03-02-02 | 03-02 | 1 | RESP-02 | — | Keyboard focus reveals playability text immediately via the existing tooltip mechanism; face-down cards get no rank/suit exposure | unit (a11y attribute assertion) | `npm test -- --run src/__tests__/components/Card.test.tsx` | ✅ | ✅ green |
| 03-03-02 | 03-03 | 2 | RESP-03 | — | Hand-sort buttons grow to `min-h-11` (≥44px) | unit (className assertion) | `npm test -- --run src/__tests__/components/Hand.test.tsx` | ✅ | ✅ green |
| 03-03-01 | 03-03 | 2 | RESP-04 | — | ArrowRight/Left moves roving focus across the hand without changing selection; Space/Enter toggles the focused card's selection | integration (`fireEvent.keyDown` round-trip via `applyMove`) | `npm test -- --run src/__tests__/components/Hand.test.tsx` | ✅ | ✅ green |
| 03-05-01/02 | 03-05 | 3 | RESP-05 | T-03-02 | Turn change updates always-mounted live-region text; Escape closes celebration modal and returns focus to trigger; Tab wraps within modal | integration + manual (AT announcement is manual-only, see Task 2) | `npm test -- --run src/__tests__/screens/GameScreen.test.tsx` | ✅ | ✅ green |
| 03-01-01 | 03-01 | 1 | RESP-04 | — | `useRovingTabindex` generic hook: arrow/Home/End navigation, no-wraparound, single `tabIndex=0` invariant, shrink-under-cursor regression (Pitfall 1) | unit | `npm test -- --run src/__tests__/hooks/useRovingTabindex.test.tsx` | ✅ | ✅ green |
| 03-01-02 | 03-01 | 1 | RESP-05 | — | `useFocusTrap` generic hook: initial focus, Tab wrap forward/backward, Escape callback, focus-return on unmount | unit | `npm test -- --run src/__tests__/hooks/useFocusTrap.test.tsx` | ✅ | ✅ green |
| 03-02-01 | 03-02 | 1 | RESP-02, RESP-04 | T-03-01 | Card gains `role="option"`, Enter/Space activation through the existing `onClick`; face-down `aria-label` never exposes rank/suit | unit (a11y attribute assertion, blind-play scan) | `npm test -- --run src/__tests__/components/Card.test.tsx` | ✅ | ✅ green |
| 03-04-01 | 03-04 | 2 | RESP-04 | — | Face-up pile is a multi-selectable listbox; same-rank keyboard multi-select via Space | integration | `npm test -- --run src/__tests__/components/Table.test.tsx` | ✅ | ✅ green |
| 03-04-02 | 03-04 | 2 | RESP-04 | T-03-01 | Face-down pile is a strictly single-select listbox; fixed `aria-label="Face-down card"` regardless of the card underneath (blind-play invariant) | integration (`innerHTML` blind-play scan) | `npm test -- --run src/__tests__/components/Table.test.tsx` | ✅ | ✅ green |
| 03-06-01/02 | 03-06 | 1 | RESP-01, RESP-03 | — | Every LobbyScreen interactive control resolves to ≥44px; room-code/auto-pickup/player rows wrap instead of overflow at 375px | unit (className assertion) | `npm test -- --run src/__tests__/screens/LobbyScreen.test.tsx` | ✅ | ✅ green |
| 03-07-01/02 | 03-07 | 4 | RESP-01, RESP-03 | — | Game board reflows below `sm` (Table stacks over piles, piles wrap, player tiles single-column); eleven remaining controls grow to ≥44px | unit (className assertion) | `npm test -- --run src/__tests__/screens/GameScreen.test.tsx` | ✅ | ✅ green |

*Status legend: ⬜=not yet run · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [x] `src/__tests__/components/Hand.test.tsx` — dedicated component test file (Hand is currently only exercised indirectly via `GameScreen.test.tsx`); needed for RESP-01/03 className-level assertions without re-mounting full GameScreen. Created in 03-03 (11 tests).
- [x] `src/__tests__/components/Card.test.tsx` — dedicated component test file for RESP-02/04 per-card ARIA attribute assertions (`role="option"`, `aria-selected`, `tabIndex`, `aria-label`). Created in 03-02 (15 tests).
- [x] `src/__tests__/components/Table.test.tsx` — same rationale for the face-up/face-down listbox split (RESP-04, D-03). Created in 03-04 (16 tests).
- No framework install needed — Vitest/RTL already fully configured

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions | Verified | Evidence |
|----------|-------------|------------|-------------------|----------|----------|
| Layout genuinely reflows with no overflow at phone width | RESP-01 | Visual overflow/clipping is not reliably assertable from unit tests alone | Chrome DevTools responsive mode at 375px width (and a real device if available), scroll through full game screen | ✅ 2026-08-05 | Verified via Playwright at true 375×812 (not DevTools-chrome-emulated) across the menu and full game screen, plus 568×320 (small landscape, stays under `sm`) and 812×375 (large landscape, correctly falls into the desktop-style grid above `sm` per D-12). Two real bugs found and fixed in this pass: a missing `scrollbar-gutter` causing an asymmetric right-edge border cut-off, and `MenuScreen`'s room-code input missing `min-w-0` causing the Join button to clip off-screen at 375px. Stated variance: Chromium-engine automated viewport rather than a physical handset. |
| Touch targets are comfortably tappable on a real phone | RESP-03 | Computed CSS px size doesn't prove real-world tap accuracy/ergonomics | Load the dev server on a real phone (or Chrome DevTools device emulation as a fallback) and tap every interactive control | ✅ 2026-08-05 | Every interactive control on `MenuScreen` and `GameScreen` (including both confirmation dialogs) measured via `getBoundingClientRect()` at true 375px width — all ≥44×44px. One undersized control found and fixed: the Rules modal's close button was 40×40 with no accessible name, grown to `min-h-11 min-w-11` with `aria-label="Close rules"`. Stated variance: scripted bounding-box measurement, not literal finger-taps on physical hardware. |
| Keyboard-only play completes a full turn | RESP-04 | jsdom simulates `Tab`/keydown handling; a real browser's native tab order and focus-visible behaviour must be exercised directly | Mouse down; Tab/Shift+Tab/arrows/Enter/Space/Escape only, reach the hand, select same-rank cards, reach Play; confirm the cyan focus ring stays distinct from the yellow selected ring; reach the face-down pile and confirm single-select; open the celebration modal and confirm the focus trap | ⚠️ 2026-08-05 (partial) | Tab reaches every control in order (Rules, Leave Game, control-player select, Table listboxes, sort buttons, Hand listbox); arrow keys move the roving cursor without changing selection; Enter selects (yellow ring) while the cyan `focus-visible` ring stays visually distinct even when a card is both focused and selected. **Not independently confirmed:** the face-down "selecting a second deselects the first" behaviour — correctly gated by game rules (hand/face-up must be emptied first) but the actual multi-select-rejection path wasn't forced via a full playthrough. Flagged for gap closure. |
| Real screen-reader announces "Your turn" / "`<Name>`'s turn" on turn change | RESP-05 | Automated tests can only verify DOM text-content correctness, not actual AT announcement behaviour | Run VoiceOver/NVDA against `npm run dev:auto`, trigger a turn change, confirm audible announcement | ❌ Not yet run | Deferred by the user to a later session. NVDA installed on the test machine 2026-08-05, but the actual pass (three consecutive turn announcements, celebration-dialog role/heading, face-down card's `aria-label` staying "Face-down card" with no rank/suit leak) has not been run. This is the phase's one T-03-01-tagged item the plan calls "a blocker, not a polish item" — gap closure required before full sign-off. |

---

## Validation Sign-Off

- [x] All tasks have `<automated>` verify or Wave 0 dependencies
- [x] Sampling continuity: no 3 consecutive tasks without automated verify
- [x] Wave 0 covers all MISSING references
- [x] No watch-mode flags
- [x] Feedback latency < 30s
- [ ] `nyquist_compliant: true` set in frontmatter — not set. RESP-05's screen-reader pass and the face-down multi-select sub-check are still open; see Manual-Only Verifications table.

**Approval:** pending — 3 of 4 Manual-Only rows verified 2026-08-05; RESP-05 (screen reader) deferred by the user to a later session (NVDA now installed). Re-run `/gsd-execute-phase 03` (or verify manually and re-run Task 3) once that pass is done to flip `nyquist_compliant`/`wave_0_complete` to `true` and set `status: complete`.
