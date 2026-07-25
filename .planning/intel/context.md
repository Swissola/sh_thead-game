# Context (from DOCs)

Running notes extracted from classified `DOC`-type sources, appended verbatim
by topic with source attribution.

---

## Topic: Project framing

`Shithead` is a prototype card game (React web client) that shipped a working
single-browser "stage one": rules, dealing, turn logic, mostly built through
chat-driven development. The rules layer (`src/gameLogic.ts`) is described as
solid, pure, and reasonably well tested. Everything else — state management,
multiplayer, layout, packaging — is described as prototype-grade.

The document's stated purpose is the plan for turning "friends can join a
game with a code" from something the UI implies into something actually true
cross-device, then getting the app onto phones, desktops, and eventually app
stores.

source: C:\Users\marti\sh_thead-game\ROADMAP.md (## Context)

---

## Topic: Codebase audit findings

A full codebase audit preceded the roadmap and is stated to shape "almost
every decision" in it:

- Multiplayer is currently an illusion: `src/storage.ts` is a thin wrapper
  over `localStorage`; `createRoom`/`joinRoom`/`pollGameState` (`App.tsx`)
  read/write the same browser's local storage on a 2-second poll. Two
  people on different devices cannot see the same room today regardless of
  what the join-code UI implies.
- `playerId` is never actually set (`App.tsx:62`, guarded by a
  `@ts-expect-error`), so even the existing multiplayer plumbing can't tell
  players apart outside test mode.
- State is mutated directly in place: `playCards` (`App.tsx:461-834`, ~370
  lines) takes a live reference into `gameState.players[playerIndex]`
  (`App.tsx:465`) and later mutates it directly (`App.tsx:582`,
  `player.hand = sortedHand.map(...)`) before ever copying it — described as
  a classic React footgun that "will get worse, not better" once state has
  to reconcile with a server.
- Rules logic is duplicated 2-3 times outside `gameLogic.ts`: hand-sort
  comparators exist in both `App.tsx` and `Hand.tsx`; "selected cards share
  a rank" is reimplemented separately in `Hand.tsx` and twice in
  `Table.tsx` instead of calling `canPlayMultipleCards`; deck
  creation/shuffling exists in `App.tsx` and is separately re-implemented
  (not imported) inside its own test file.
- Zero responsive design: no Tailwind breakpoint prefixes (`sm:`/`md:`/`lg:`)
  anywhere in `src/`, no `@media` queries in any loaded stylesheet. Fixed
  pixel widths are used (`DiscardPile.tsx` hardcodes `width: '160px'`; board
  grid is `grid-cols-[160px_100px_1fr]`) — overflows on a phone screen.
- Mouse-only interaction: card tooltips are hover-only
  (`onMouseEnter`/`onMouseLeave`); no keyboard support anywhere for
  selecting or playing a card.
- 14 blocking `window.alert()` calls are the entire user-feedback mechanism
  for invalid moves.
- `src/App.css` is imported by nothing — the celebration modal's
  bounce/pulse/fade-in keyframes are fully written and have never played.
- Test coverage is 100% pure-logic-only: every mutation path (`playCards`/
  `pickUpPile`/`swapCards` handlers, all three screens, all hooks,
  `storage.ts`) has zero test coverage.

The document is explicit that none of this is a criticism of stage one; it's
framed as an accurate account of what "stage two" has to deal with, as
opposed to what the existing feature list implies.

source: C:\Users\marti\sh_thead-game\ROADMAP.md (### What a full codebase audit found)

---

## Topic: Decisions made (as stated in ROADMAP.md)

The document contains its own "Decisions made" table. Note: this document is
classified as type `DOC`, not `ADR` — these are recorded here as stated
project context, not as synthesized/locked architectural decisions in
`decisions.md`.

- Multiplayer backend: **Supabase** (Postgres + Realtime + anonymous auth).
  Stated rationale: free tier generous enough for friends-scale play, zero
  ops (no server to run/patch), and — unlike Firebase/Firestore — plain
  Postgres underneath, so migrating off it later is a data export rather
  than a data-model rewrite.
- Mobile (Android + iOS): **Capacitor**, wrapping the existing React web
  app. Stated rationale: reuses ~95% of the current codebase, one UI to
  maintain, fastest path to both stores; trades off native look-and-feel
  against not building/maintaining a second UI layer (React Native).
- Desktop: **Responsive web app, no native wrapper**. Stated rationale: no
  Tauri/Electron packaging work at all — "desktop" is the same responsive
  app rendered in a browser window, installable via PWA support if a
  taskbar icon is wanted later.
- Sequencing: **Refactor first**, then backend, then everything else — see
  "the throughline" topic below.

**Unavoidable costs, regardless of any technical choice above:** Apple
Developer Program is $99/year (required for any App Store distribution,
including TestFlight beta). Google Play Console is a one-time $25.
Everything else in the plan (React, Capacitor, Supabase's free tier,
Tailwind, Vite) is stated as free.

source: C:\Users\marti\sh_thead-game\ROADMAP.md (## Decisions made)

---

## Topic: The throughline (rationale for refactor-first sequencing)

Refactoring first is framed as producing the one thing every later stage
depends on: a single, pure, framework-free rules engine that both the
browser and a future server can run identically.

Stated concern: right now every move is computed and trusted entirely
client-side. Once rooms are real and cross-device, a modified client could
submit an illegal move and nothing would stop it — there is no authority.
The proposed fix is to extract an `applyMove(state, move) -> state` reducer
out of logic currently spread across `App.tsx`'s handlers, built on the pure
predicates already in `gameLogic.ts` (`canPlayCard`, `canPlayMultipleCards`,
`shouldBurnPile`, `hasPlayerWon`, `getNextPlayer`, etc.). Doing this once
means it runs in the browser for instant feedback and on the server as the
actual authority, instead of the rules being written a fourth time.

source: C:\Users\marti\sh_thead-game\ROADMAP.md (## The throughline)

---

## Topic: Staged plan

**Stage 1 — Refactor into a real engine**
- Extract a single `applyMove` reducer from the existing pure predicates in
  `gameLogic.ts`, plus the inline mutation logic spread across `playCards`,
  `pickUpPile`, `confirmPickUpPile`, `swapCards`, and `setReady` in
  `App.tsx`.
- Fix the direct-mutation bug this forces a fix for (`App.tsx:465` / `:582`
  pattern) — a pure reducer can't mutate its input by construction.
- Split the 1,500-line `App.tsx` into Menu / Lobby / Game screen components
  plus a slim orchestrator; pull the ~90-line rules modal and the opponent
  scoreboard into their own components.
- Dedupe: hand-sort comparators (`App.tsx` and `Hand.tsx`), "cards share a
  rank" checks (reimplemented three times instead of calling
  `canPlayMultipleCards`), deck creation/shuffling (`App.tsx` vs its own
  test file's private copy).
- Replace the 14 `alert()` calls with an in-app toast/inline-message
  system.
- One-line fix along the way: `import './App.css'` in `main.tsx` — the
  celebration animations are already written, just never wired in.
- Add unit tests for the new engine, and basic smoke tests for the
  split-out screen components (React Testing Library is already a
  devDependency, currently unused).

**Stage 2 — Real cross-device multiplayer (Supabase)**
- A Supabase table for room state, with Realtime subscriptions replacing
  the 2-second `localStorage` poll (`pollGameState`, `App.tsx:331`).
- Anonymous auth, giving every browser a real, persistent player identity —
  fixes the never-set `playerId` bug as a side effect.
- Moves submitted as `{roomCode, move}`, validated server-side by a
  Supabase Edge Function calling the same `applyMove` engine from stage
  one, so a modified client can't cheat. Client applies the move
  optimistically for responsiveness, then reconciles against the
  authoritative broadcast.
- Presence, for "player disconnected" states, which don't exist at all
  today.

**Stage 3 — Make the UI actually responsive**
- Tailwind breakpoints on every fixed-pixel layout (board's
  `grid-cols-[160px_100px_1fr]`, `DiscardPile`'s hardcoded 160px width,
  `Table.tsx`'s `-80px` overlay offset tied to a specific card size).
- A touch-friendly replacement for the hover-only card tooltip.
- Minimum 44px touch targets (sort buttons are currently ~22px tall).
- Baseline accessibility: keyboard support for card selection, `aria-live`
  on turn changes, dialog semantics and focus trapping on all three
  modals.

**Stage 4 — Capacitor packaging (Android + iOS)**
- `cap init`, add platforms, real app icon/branding (currently the Vite
  placeholder favicon).
- Verify the stage-3 touch layer actually works inside the native WebView,
  on-device, not just in a desktop browser's device-emulation mode.
- Apple Developer account + TestFlight; Google Play Console + internal
  testing track.

**Stage 5 — Desktop polish**
- Largely "stage 3 done thoroughly" at wide and narrow window sizes, plus a
  PWA manifest and service worker so it's installable to a taskbar/dock
  icon without any native wrapper.

**Stage 6 — Visual/gameplay polish**
- Rebuild the draw animation on top of the stage-1 refactor rather than
  patching it further — current one is fragile (`document.querySelector` +
  `setTimeout(10)` + `flushSync`, `App.tsx:766-825`).
- Sound effects (deal, play, burn, win/lose).
- A shared `Modal` primitive to replace the duplicated modal branches.

**Stage 7 — Professional cross-cutting work**
- Privacy policy + ToS (both app stores require a privacy policy link, even
  for an anonymous-auth app that stores gameplay data).
- CI: lint + typecheck + test on push via GitHub Actions — npm scripts
  already exist, just need a workflow file.
- Error monitoring (Sentry free tier).
- Store listing assets: icons at required sizes, screenshots, description
  copy.

source: C:\Users\marti\sh_thead-game\ROADMAP.md (## Stage 1 through ## Stage 7)

---

## Topic: Sequencing constraints

The only hard dependency stated is **1 -> 2**: the engine has to exist
before it can also be the server's authority. Stages 3 through 6 are stated
to be reorderable more freely, e.g. pulling visual polish forward if there
is a need for something demoable to friends before the Supabase rework
lands.

source: C:\Users\marti\sh_thead-game\ROADMAP.md (## Sequencing)
