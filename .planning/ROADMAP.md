# Roadmap: sh_thead-game

## Overview

Shithead's stage-one prototype plays a full game inside a single browser, but
the "join a room with a code" flow is an illusion — two devices can't see the
same game today. This roadmap turns that into real cross-device multiplayer,
then carries the app from browser prototype to phones, desktops, and the app
stores. Phase 1 extracts a single, pure rules engine (`applyMove`) that both
the browser and a future server can run identically — nothing after it works
without that foundation, since Phase 2 needs the engine to also act as the
server's authority. Phases 3-6 (responsive UI, mobile packaging, desktop
polish, visual/gameplay polish) can reorder more freely once the engine and
multiplayer exist. Phase 7 closes out the professional groundwork — legal,
CI, monitoring, store assets — needed for an actual app store release.

## Phases

**Phase Numbering:**
- Integer phases (1, 2, 3): Planned milestone work
- Decimal phases (2.1, 2.2): Urgent insertions (marked with INSERTED)

Decimal phases appear between their surrounding integers in numeric order.

- [ ] **Phase 1: Rules Engine Refactor** - Extract a single pure `applyMove` reducer and split the 1,500-line `App.tsx`, so client and future server can run identical rules
- [ ] **Phase 2: Real Cross-Device Multiplayer** - Supabase-backed rooms with Realtime sync, anonymous identity, and server-validated moves — a friend can actually join and play from another device
- [ ] **Phase 3: Responsive UI** - The game is fully usable on a phone-sized screen and via keyboard, not just desktop mouse
- [ ] **Phase 4: Mobile Packaging (Capacitor)** - The app installs and runs as a native app on Android and iOS
- [ ] **Phase 5: Desktop Polish** - A polished, PWA-installable desktop experience with no native wrapper
- [ ] **Phase 6: Visual/Gameplay Polish** - Animations, sound, and a shared modal make the game feel finished
- [ ] **Phase 7: Launch Readiness** - Legal, CI, monitoring, and store listing assets ready for app store submission

## Phase Details

### Phase 1: Rules Engine Refactor
**Goal**: The game's rules run through a single, pure engine that a future server can also run, with no client-side state-mutation bugs
**Depends on**: Nothing (first phase)
**Requirements**: ENGINE-01, ENGINE-02, ENGINE-03, ENGINE-04, ENGINE-05, ENGINE-06, ENGINE-07
**Success Criteria** (what must be TRUE):
  1. Every move (play cards, pick up pile, swap cards, ready up) is processed by one `applyMove(state, move)` reducer built on `gameLogic.ts`, with no duplicate rule logic (hand-sort, "shares a rank", deck creation) left elsewhere in the codebase
  2. No move handler mutates existing state or player objects in place — every move produces a new state object
  3. `App.tsx` is split into Menu, Lobby, and Game screen components plus a slim orchestrator
  4. Invalid moves and game feedback appear as in-app messages instead of blocking browser alerts, and the finish celebration animation plays
  5. The new engine and screen components are covered by automated tests
**Plans**: TBD

### Phase 2: Real Cross-Device Multiplayer
**Goal**: A friend can join a room from any device and play a full game with you in real time
**Depends on**: Phase 1 (the engine must exist before it can also be the server's authority)
**Requirements**: MPLAY-01, MPLAY-02, MPLAY-03, MPLAY-04, MPLAY-05, MPLAY-06
**Success Criteria** (what must be TRUE):
  1. Two people on two different devices/browsers can join the same room code and see the same live game state
  2. Each player has a distinct, persistent identity across the session, so the app can always tell players apart
  3. A move submitted by a modified/cheating client is rejected, because the server validates every move through the same `applyMove` engine
  4. A card played by the local player appears instantly, then reconciles with what the server confirms
  5. Players can see when an opponent has disconnected mid-game
**Plans**: TBD

### Phase 3: Responsive UI
**Goal**: Users can comfortably play the game on a phone-sized screen and via keyboard, not just a desktop mouse
**Depends on**: Phase 1 (needs the split screen components to retrofit a responsive layout onto)
**Requirements**: RESP-01, RESP-02, RESP-03, RESP-04, RESP-05
**Success Criteria** (what must be TRUE):
  1. The board and every component reflow to fit a phone screen with no overflow
  2. A player can see card details via touch, not just mouse hover
  3. Every interactive control is at least 44px, easy to tap
  4. A player can select and play cards using only the keyboard
  5. Turn changes are announced and modals trap focus properly for screen reader/keyboard users
**Plans**: TBD
**UI hint**: yes

### Phase 4: Mobile Packaging (Capacitor)
**Goal**: Users can install and play the game as a native app on their Android or iOS phone
**Depends on**: Phase 3 (native packaging needs the responsive/touch layer to wrap)
**Requirements**: MOBILE-01, MOBILE-02, MOBILE-03, MOBILE-04, MOBILE-05
**Success Criteria** (what must be TRUE):
  1. The app installs and runs as a native app on an Android device
  2. The app installs and runs as a native app on an iOS device
  3. The app shows a real icon and branding, not the Vite placeholder
  4. Touch play works correctly on a real device inside the native WebView, not just desktop emulation
  5. A tester can install the app via TestFlight (iOS) or the Play internal testing track (Android)
**Plans**: TBD

### Phase 5: Desktop Polish
**Goal**: Users get a well-polished, installable desktop experience without any native wrapper
**Depends on**: Phase 3 (desktop polish is the stage-3 responsive layout done thoroughly)
**Requirements**: DESKTOP-01, DESKTOP-02
**Success Criteria** (what must be TRUE):
  1. The layout looks and works well at both wide and narrow desktop browser window sizes
  2. Users can install the app to their taskbar/dock as a PWA and launch it without browser chrome
**Plans**: TBD
**UI hint**: yes

### Phase 6: Visual/Gameplay Polish
**Goal**: The game feels finished — animations, sound, and modals are polished rather than functional-only
**Depends on**: Phase 1 (the draw animation rebuild targets the Phase 1 engine, not the multiplayer or packaging work)
**Requirements**: POLISH-01, POLISH-02, POLISH-03
**Success Criteria** (what must be TRUE):
  1. The draw-card animation plays reliably, rebuilt on the Phase 1 engine rather than DOM-querying/timing hacks
  2. Sound effects play for dealing, playing, burning a pile, and winning/losing
  3. Every modal in the app uses the same shared `Modal` component
**Plans**: TBD
**UI hint**: yes

### Phase 7: Launch Readiness
**Goal**: The app is ready to submit to and operate in the app stores as a professional product
**Depends on**: Phase 4 (store submission needs the mobile builds to exist)
**Requirements**: LAUNCH-01, LAUNCH-02, LAUNCH-03, LAUNCH-04
**Success Criteria** (what must be TRUE):
  1. A privacy policy and terms of service are published and linked from within the app
  2. Every push to the repo automatically runs lint, typecheck, and tests via CI
  3. Runtime errors in production are captured and visible in an error monitoring dashboard
  4. Store listing assets (icons, screenshots, description copy) are ready for both app stores
**Plans**: TBD

## Progress

**Execution Order:**
Phases execute in numeric order: 1 → 2 → 3 → 4 → 5 → 6 → 7. The only hard
dependency is 1 → 2 (the engine must exist before it can be the server's
authority); phases 3-6 can reorder more freely if a need arises (e.g. pulling
visual polish forward for something demoable to friends before the Supabase
rework lands).

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| 1. Rules Engine Refactor | 0/TBD | Not started | - |
| 2. Real Cross-Device Multiplayer | 0/TBD | Not started | - |
| 3. Responsive UI | 0/TBD | Not started | - |
| 4. Mobile Packaging (Capacitor) | 0/TBD | Not started | - |
| 5. Desktop Polish | 0/TBD | Not started | - |
| 6. Visual/Gameplay Polish | 0/TBD | Not started | - |
| 7. Launch Readiness | 0/TBD | Not started | - |
