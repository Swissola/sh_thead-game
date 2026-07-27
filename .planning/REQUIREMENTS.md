# Requirements: sh_thead-game

**Defined:** 2026-07-25
**Core Value:** A friend can join a room from any device (phone, desktop, either OS) and play a full game with you in real time.

## v1 Requirements

Requirements for initial release. Each maps to roadmap phases. Derived from the
prior staged plan in the repo's `ROADMAP.md` (7 stages), captured as context in
`.planning/intel/context.md` since it was ingested as a `DOC`, not a `PRD`.

### Engine (rules engine refactor)

- [x] **ENGINE-01**: Every move (play cards, pick up pile, swap cards, ready up) is processed through a single, pure `applyMove(state, move)` reducer built on `gameLogic.ts`'s existing predicates
- [x] **ENGINE-02**: No move handler mutates existing state or player objects in place — every move produces a new state object
- [x] **ENGINE-03**: `App.tsx` is split into Menu, Lobby, and Game screen components plus a slim orchestrator (down from ~1,500 lines in one file)
- [x] **ENGINE-04**: Duplicated rules logic (hand-sort comparators, "cards share a rank" checks, deck creation/shuffling) is removed from `App.tsx`/`Hand.tsx`/`Table.tsx` and delegated to `gameLogic.ts`'s single implementation
- [x] **ENGINE-05**: Invalid moves and game feedback appear as in-app toast/inline messages instead of blocking `window.alert()` calls
- [x] **ENGINE-06**: The player finish celebration animation (already written in `App.css`) actually plays in the browser
- [x] **ENGINE-07**: The new engine and split screen components have automated test coverage (unit tests for the engine, smoke tests for the screens)

### Multiplayer (real cross-device play via Supabase)

- [x] **MPLAY-01**: A friend on a different device or browser can join a room using a room code and see the same live game
- [x] **MPLAY-02**: Room state is stored in Supabase (Postgres) and updates propagate via Realtime subscriptions, replacing the 2-second `localStorage` poll
- [ ] **MPLAY-03**: Each player has a persistent, distinguishable identity via Supabase anonymous auth (fixes the never-set `playerId` bug)
- [x] **MPLAY-04**: Moves are validated server-side by a Supabase Edge Function calling the same `applyMove` engine, so a modified client cannot submit an illegal move
- [ ] **MPLAY-05**: The client applies a move optimistically for instant feedback, then reconciles against the authoritative server broadcast
- [x] **MPLAY-06**: Players can see when an opponent has disconnected mid-game (presence)

### Responsive UI

- [ ] **RESP-01**: The board and every component reflow to fit a phone-sized screen without overflow (Tailwind breakpoints replace fixed-pixel layouts)
- [ ] **RESP-02**: Card details/tooltips are accessible via touch, not just mouse hover
- [ ] **RESP-03**: Every interactive control (sort buttons, cards, etc.) meets a minimum 44px touch target
- [ ] **RESP-04**: A player can select and play cards using only the keyboard
- [ ] **RESP-05**: Turn changes are announced (`aria-live`) and modals have proper dialog semantics with focus trapping

### Mobile packaging (Capacitor)

- [ ] **MOBILE-01**: The app installs and runs as a native app on an Android device
- [ ] **MOBILE-02**: The app installs and runs as a native app on an iOS device
- [ ] **MOBILE-03**: The app has a real app icon and branding (replacing the Vite placeholder favicon)
- [ ] **MOBILE-04**: Touch play (selecting, playing cards) works correctly on a real device inside the native WebView, not just desktop emulation
- [ ] **MOBILE-05**: A tester can install a build via TestFlight (iOS) or the Google Play internal testing track (Android)

### Desktop polish

- [ ] **DESKTOP-01**: The layout looks and works well at both wide and narrow desktop browser window sizes
- [ ] **DESKTOP-02**: A user can install the app to their taskbar/dock as a PWA (manifest + service worker) and launch it without a browser chrome

### Visual/gameplay polish

- [ ] **POLISH-01**: The draw-card animation is rebuilt on the Phase 1 engine (no `document.querySelector`/`setTimeout`/`flushSync` hacks) and plays reliably
- [ ] **POLISH-02**: Sound effects play for key game events (deal, play, burn, win/lose)
- [ ] **POLISH-03**: Every modal in the app uses a single shared `Modal` primitive instead of duplicated branches

### Launch readiness (professional cross-cutting work)

- [ ] **LAUNCH-01**: A privacy policy and terms of service are published and linked from within the app
- [ ] **LAUNCH-02**: Every push to the repo automatically runs lint, typecheck, and tests via GitHub Actions CI
- [ ] **LAUNCH-03**: Runtime errors in production are captured and visible via error monitoring (Sentry free tier)
- [ ] **LAUNCH-04**: Store listing assets (icons at required sizes, screenshots, description copy) are ready for submission to both app stores

## v2 Requirements

None identified yet — the source document scoped exactly these 7 stages as
the full plan to app-store readiness. Add here if new scope emerges.

## Out of Scope

| Feature | Reason |
|---------|--------|
| React Native (separate native UI) | Capacitor reuses ~95% of the existing web codebase instead — one UI to maintain |
| Tauri/Electron desktop app | Desktop ships as the same responsive web app in a browser window, PWA-installable, no native wrapper |
| Firebase/Firestore backend | Supabase chosen so the data model is plain Postgres, keeping a future migration a data export, not a rewrite |

## Traceability

Which phases cover which requirements. Updated during roadmap creation.

| Requirement | Phase | Status |
|-------------|-------|--------|
| ENGINE-01 | Phase 1 | Complete |
| ENGINE-02 | Phase 1 | Complete |
| ENGINE-03 | Phase 1 | Complete |
| ENGINE-04 | Phase 1 | Complete |
| ENGINE-05 | Phase 1 | Complete |
| ENGINE-06 | Phase 1 | Complete |
| ENGINE-07 | Phase 1 | Complete |
| MPLAY-01 | Phase 2 | Complete |
| MPLAY-02 | Phase 2 | Complete |
| MPLAY-03 | Phase 2 | Pending |
| MPLAY-04 | Phase 2 | Complete |
| MPLAY-05 | Phase 2 | Pending |
| MPLAY-06 | Phase 2 | Complete |
| RESP-01 | Phase 3 | Pending |
| RESP-02 | Phase 3 | Pending |
| RESP-03 | Phase 3 | Pending |
| RESP-04 | Phase 3 | Pending |
| RESP-05 | Phase 3 | Pending |
| MOBILE-01 | Phase 4 | Pending |
| MOBILE-02 | Phase 4 | Pending |
| MOBILE-03 | Phase 4 | Pending |
| MOBILE-04 | Phase 4 | Pending |
| MOBILE-05 | Phase 4 | Pending |
| DESKTOP-01 | Phase 5 | Pending |
| DESKTOP-02 | Phase 5 | Pending |
| POLISH-01 | Phase 6 | Pending |
| POLISH-02 | Phase 6 | Pending |
| POLISH-03 | Phase 6 | Pending |
| LAUNCH-01 | Phase 7 | Pending |
| LAUNCH-02 | Phase 7 | Pending |
| LAUNCH-03 | Phase 7 | Pending |
| LAUNCH-04 | Phase 7 | Pending |

**Coverage:**
- v1 requirements: 32 total
- Mapped to phases: 32
- Unmapped: 0 ✓

---
*Requirements defined: 2026-07-25*
*Last updated: 2026-07-25 after initial roadmap creation*
