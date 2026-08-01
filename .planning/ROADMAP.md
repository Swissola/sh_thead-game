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

- [x] **Phase 1: Rules Engine Refactor** - Extract a single pure `applyMove` reducer and split the 1,500-line `App.tsx`, so client and future server can run identical rules (completed 2026-07-25)
- [x] **Phase 2: Real Cross-Device Multiplayer** - Supabase-backed rooms with Realtime sync, anonymous identity, and server-validated moves — a friend can actually join and play from another device (completed 2026-08-01)
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

**Plans:** 7/7 plans complete

Plans:
**Wave 1**

- [x] 01-01-PLAN.md — Test infra (setupFiles/jest-dom, buildGameState fixtures), gameLogic.ts dedup (sortHand/canAddToSelection/createDeck/shuffleDeck), applyMove contract types (moves.ts/errors.ts)

**Wave 2** *(blocked on Wave 1 completion)*

- [x] 01-02-PLAN.md — TDD: applyMove core (READY_UP, SWAP_CARDS, PICK_UP_PILE)

**Wave 3** *(blocked on Wave 2 completion)*

- [x] 01-03-PLAN.md — TDD: applyMove PLAY_CARDS (burn/draw/win/blind/mixed-source sequencing)

**Wave 4** *(blocked on Wave 3 completion)*

- [x] 01-04-PLAN.md — GameContext (GameProvider/useGameContext) + useToast + Toast component

**Wave 5** *(blocked on Wave 4 completion)*

- [x] 01-05-PLAN.md — App.tsx orchestrator (phase-based routing) + MenuScreen + LobbyScreen extraction

**Wave 6** *(blocked on Wave 5 completion)*

- [x] 01-06-PLAN.md — GameScreen extraction (celebration, rules panel, play/pickup/ready wiring, ENGINE-06 CSS fix)

**Wave 7** *(blocked on Wave 6 completion)*

- [x] 01-07-PLAN.md — Hand.tsx/Table.tsx dedup + SWAP_CARDS dispatch rewire (closes the 4th duplication site)

### Phase 2: Real Cross-Device Multiplayer

**Goal**: A friend can join a room from any device and play a full game with you in real time
**Depends on**: Phase 1 (the engine must exist before it can also be the server's authority)
**Requirements**: MPLAY-01, MPLAY-02, MPLAY-03, MPLAY-04, MPLAY-05, MPLAY-06, MPLAY-07
**Success Criteria** (what must be TRUE):

  1. Two people on two different devices/browsers can join the same room code and see the same live game state
  2. Each player has a distinct, persistent identity across the session, so the app can always tell players apart
  3. A move submitted by a modified/cheating client is rejected, because the server validates every move through the same `applyMove` engine
  4. A card played by the local player appears instantly, then reconciles with what the server confirms
  5. Players can see when an opponent has disconnected mid-game
  6. The room host can set the turn auto-pickup timeout (30s-300s) in the lobby, visible to all players (MPLAY-07)

**Plans:** 19/19 plans executed
Plans:
**Wave 1**

- [x] 02-01-PLAN.md — Supabase toolchain, local stack, browser client singleton, shared room contract
- [x] 02-02-PLAN.md — Engine hardening (gate revealedFaceDownIndex), Deno-safe import specifiers, toast variants

**Wave 2** *(blocked on Wave 1)*

- [x] 02-03-PLAN.md — rooms/moves schema with deny-all-writes RLS, Realtime publication, shared Edge Function foundation, hosted-project push
- [x] 02-04-PLAN.md — Anonymous-auth identity bootstrap and last-used-name persistence

**Wave 3** *(unblocked — Wave 2 complete)*

- [x] 02-05-PLAN.md — create-room / join-room Edge Functions, the full reconnect seat-matching story, wrapper invariant checker
- [x] 02-06-PLAN.md — start-game / apply-move Edge Functions: server-side deal and server-authoritative moves
- [x] 02-07-PLAN.md — check-turn-timeout / heartbeat / remove-player: grace-period auto-pickup, server-verified liveness, host transfer
- [x] 02-08-PLAN.md — useRoomSubscription (Realtime replaces the poll) and usePresence
- [x] 02-09-PLAN.md — Optimistic dispatch and authoritative reconciliation in GameContext

**Wave 4** *(blocked on Wave 3)*

- [x] 02-10-PLAN.md — App.tsx identity gate and Realtime wiring; MenuScreen create/join via Edge Functions, name pre-fill, join-link
- [x] 02-11-PLAN.md — LobbyScreen: server-backed start, join-link copy, host removal, offline markers

**Wave 5** *(blocked on Wave 4)*

- [x] 02-12-PLAN.md — GameScreen: two-state offline badge, reconnect toast, check-turn-timeout client trigger, Leave Game

**Wave 6** *(blocked on Wave 5)*

- [x] 02-13-PLAN.md — Edge Function functional smoke suite over all seven wrappers, plus the two-device cross-device play test (Task 3 signed off against this session's full 02-UAT.md testing record)

**Wave 7** *(gap closure — blocked on Wave 6)*

- [x] 02-14-PLAN.md — Gap closure (blocker): empty-pile turn-timeout stall — auto-play the lowest card via applyMove, and stop the sweep swallowing unexpected failures

**Wave 8** *(gap closure — blocked on Wave 7)*

- [x] 02-15-PLAN.md — Gap closure (major): version-exempt player_seen write path so heartbeats and D-01 auto-rejoins stop polluting the reconciliation stream

**Wave 9** *(gap closure — blocked on Wave 8)*

- [x] 02-16-PLAN.md — Gap closure (major): per-client pending-move tracker gates the reconciliation toast on GameContext/useGameState/useRoomSubscription, closing 02-UAT.md test 7

**Wave 10** *(gap closure — blocked on Wave 9)*

- [x] 02-17-PLAN.md — Gap closure (blocker): self-healing room-data channel reconnect with dwell-gated backoff and a drop-gated recovery refetch, closing 02-UAT.md test 8

**Wave 11** *(blocked on Wave 10)*

- [x] 02-18-PLAN.md — MPLAY-07 server authority: host-configurable, bounds-validated SET_TURN_TIMEOUT move, enforced in applyMove and check-turn-timeout

**Wave 12** *(blocked on Wave 11)*

- [x] 02-19-PLAN.md — MPLAY-07 UI: lobby host control + all-players display for the turn timeout, and client-side sweep cadence wired to the room's configured value

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
| 1. Rules Engine Refactor | 7/7 | Complete    | 2026-07-26 |
| 2. Real Cross-Device Multiplayer | 19/19 | Complete    | 2026-08-01 |
| 3. Responsive UI | 0/TBD | Not started | - |
| 4. Mobile Packaging (Capacitor) | 0/TBD | Not started | - |
| 5. Desktop Polish | 0/TBD | Not started | - |
| 6. Visual/Gameplay Polish | 0/TBD | Not started | - |
| 7. Launch Readiness | 0/TBD | Not started | - |
