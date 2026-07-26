# sh_thead-game

## What This Is

Shithead is a browser-based multiplayer card game (React web client). Stage one
shipped a working single-browser prototype: rules, dealing, and turn logic are
solid and reasonably well tested. Everything a real multiplayer game needs around
that core — state management, cross-device play, layout, packaging — is still
prototype-grade, because a single browser was all stage one had to support.

## Core Value

A friend can join a room from any device (phone, desktop, either OS) and play a
full game with you in real time — the thing that doesn't work at all today.
Everything else in the roadmap (mobile packaging, desktop polish, visual polish,
app store release) is in service of that.

## Requirements

### Validated

<!-- Shipped and confirmed valuable, from stage one (pre-dates this roadmap). -->

- ✓ Core game rules (dealing, turn order, valid-move checking, burning the pile,
  win detection) implemented as pure, tested functions in `src/gameLogic.ts` —
  stage one
- ✓ A single browser can play a full game start-to-finish via the existing
  Menu/Lobby/Game flow — stage one
- ✓ Rules run through one shared, pure `applyMove` engine so client and server
  never disagree — Phase 1 (2026-07-26). Live UAT surfaced and fixed four
  further pre-existing bugs beyond the refactor's own scope: a same-rank
  multi-card play under-drew replacement cards, a face-down card's identity
  leaked to the player before they committed to playing it, and two related
  draw-animation regressions from fixing the first bug.

### Active

<!-- Current scope. Building toward these. See REQUIREMENTS.md for full v1 list with IDs. -->

- [ ] Real cross-device multiplayer via Supabase, replacing the localStorage-poll
      illusion (Phase 2)
- [ ] A responsive, touch- and keyboard-usable UI (Phase 3)
- [ ] Native Android + iOS packaging via Capacitor (Phase 4)
- [ ] Desktop polish and PWA installability (Phase 5)
- [ ] Visual and gameplay polish — animations, sound, shared modal (Phase 6)
- [ ] App-store-readiness: legal, CI, monitoring, store listing assets (Phase 7)

### Out of Scope

<!-- Explicit boundaries. Includes reasoning to prevent re-adding. -->

- React Native / a second native UI layer — Capacitor wraps the existing web
  app instead, trading native look-and-feel for one UI to build and maintain
- Tauri/Electron desktop packaging — desktop is the same responsive web app in
  a browser window (PWA-installable), not a separately packaged native app
- Firebase/Firestore as the multiplayer backend — Supabase chosen instead so
  the data underneath is plain Postgres, keeping a future migration a data
  export rather than a data-model rewrite

## Context

**Codebase audit findings (shape almost every phase below):**
- Multiplayer is currently an illusion: `src/storage.ts` wraps `localStorage`;
  `createRoom`/`joinRoom`/`pollGameState` in `App.tsx` read/write the same
  browser's local storage on a 2-second poll. Two people on different devices
  cannot see the same room today, regardless of what the join-code UI implies.
  **(Phase 2 scope, not yet addressed.)**
- ~~`playerId` is never actually set (`App.tsx:62`, guarded by a
  `@ts-expect-error`)~~ — **Resolved in Phase 1**: `App.tsx` now generates a
  real `crypto.randomUUID()` on mount, no `@ts-expect-error` bypass.
- ~~State is mutated directly in place: `playCards` (`App.tsx:461-834`, ~370
  lines) takes a live reference into `gameState.players[playerIndex]` and later
  mutates it directly before ever copying it~~ — **Resolved in Phase 1**: all
  moves now go through the pure `applyMove` reducer, proven immutable by a
  40+ test suite asserting reference-inequality on every mutated array.
- ~~Rules logic is duplicated 2-3 times outside `gameLogic.ts`~~ —
  **Resolved in Phase 1**: `Hand.tsx`/`Table.tsx` call `gameLogic.ts`
  directly for hand-sort and rank-share checks; zero inline duplicates remain.
- Zero responsive design: no Tailwind breakpoints or `@media` queries anywhere
  in `src/`; fixed pixel widths overflow on a phone screen.
  **(Phase 3 scope, not yet addressed.)**
- Mouse-only interaction: hover-only tooltips, no keyboard support for
  selecting or playing a card. **(Phase 3 scope, not yet addressed.)**
- ~~14 blocking `window.alert()` calls are the entire user-feedback
  mechanism~~ — **Resolved in Phase 1**: zero `alert()` calls remain, all
  replaced by a toast system.
- ~~`src/App.css` is imported by nothing — the celebration modal's animations
  ... have never played~~ — **Resolved in Phase 1**: `main.tsx` imports
  `App.css`; the celebration animation was confirmed actually rendering in a
  live browser via UAT.
- Test coverage was 100% pure-logic-only; every mutation path (handlers,
  screens, hooks) had zero test coverage. **Substantially improved in Phase
  1**: 153 tests now cover the engine, screens, hooks, and components — though
  gaps remain (two of the four bugs found in live UAT had no automated
  coverage until added retroactively; `storage.ts` itself is still untested).

None of this is a criticism of stage one — it's an accurate account of what
this roadmap has to deal with, as opposed to what the existing feature list
implies.

**Source document:** this roadmap is derived from a prior planning document
(`ROADMAP.md` in the repo root) that already worked through a full codebase
audit and staged plan with the user. See `.planning/intel/context.md` for the
full extracted context.

## Constraints

- **Sequencing**: Phase 1 (rules engine refactor) must complete before Phase 2
  (real multiplayer) — the engine has to exist before it can also be the
  server's authority. Phases 3-6 can reorder more freely if there's a need to
  pull something forward (e.g. visual polish, to have something demoable to
  friends before the Supabase rework lands).
- **Budget**: Apple Developer Program is $99/year, required for any App Store
  distribution including TestFlight beta. Google Play Console is a one-time
  $25. Everything else in the plan (React, Capacitor, Supabase free tier,
  Tailwind, Vite) is free.
- **Tech stack**: React web client stays the single UI codebase — Capacitor
  wraps it for mobile rather than a separate native build, per the decisions
  below.

## Key Decisions

<!-- Decisions that constrain future work. Add throughout project lifecycle. -->

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| Supabase (Postgres + Realtime + anonymous auth) for the multiplayer backend | Free tier generous enough for friends-scale play, zero ops, and plain Postgres underneath means migrating off it later is a data export, not a data-model rewrite | — Pending |
| Capacitor wrapping the existing React web app for Android/iOS | Reuses ~95% of the current codebase, one UI to maintain, fastest path to both stores; trades native look-and-feel for not building a second UI layer | — Pending |
| Responsive web app, no native wrapper, for desktop | No Tauri/Electron packaging work; desktop is the same responsive app in a browser window, PWA-installable if a taskbar icon is wanted | — Pending |
| Refactor-first sequencing: build a shared `applyMove` rules engine before the backend work | Client and future server need to run identical rules instead of duplicating them a fourth time; without this, a modified client could submit an illegal move once rooms are real and nothing would stop it | ✓ Delivered (Phase 1, 2026-07-26). Note for Phase 2: `applyMove`'s `PLAY_CARDS` case computes the hand→faceUp→faceDown play-order rule but doesn't fully enforce it outside one branch (flagged in `01-REVIEW.md` CR-01, confirmed pre-existing, not fixed in Phase 1) — worth closing before treating the engine as the server's authority. |

---
*Last updated: 2026-07-26 after Phase 1 completion*
