# sh_thead-game

## Commands

```bash
npm run dev:auto      # Vite dev server, fixed 127.0.0.1:5173
npm run build          # tsc -b (strict) && vite build
npm test                # vitest (watch mode)
npm test -- --run       # vitest, single run (use this one in CI-style checks)
npm run lint            # eslint . --fix
npm run format           # prettier --write .
```

`tsconfig.app.json` has `strict`, `noUnusedLocals`, and `noUnusedParameters`
all on — declaring a variable before it's used, even briefly, fails the
build. Order declarations to match actual use.

## Architecture

- `src/engine/applyMove.ts` — the single pure reducer for every move type
  (`PLAY_CARDS`, `PICK_UP_PILE`, `SWAP_CARDS`, `READY_UP`). This is the only
  place game rules should be enforced; nothing else should mutate player
  state directly. `src/engine/moves.ts` / `errors.ts` hold its types.
- `src/gameLogic.ts` — pure predicates/helpers shared by the engine and the
  UI (deck creation, hand sort, rank-share checks, draw-count, pickup
  confirmation heuristics). Components should call into here, not
  reimplement a check inline.
- `src/context/GameContext.tsx` — `GameProvider`/`useGameContext`;
  `dispatchMove` is the only path from UI to `applyMove`.
- `src/screens/` — `MenuScreen` / `LobbyScreen` / `GameScreen`, routed by
  `App.tsx`'s `Router` based on `gameState.phase`.
- `src/components/` — `Hand`, `Table`, `Toast`, `Card`, plus
  `components/piles/` (`DrawPile`, `DiscardPile`, `BurnPile`).
- `src/hooks/` — `useGameState` (storage persistence), `useSelection`,
  `useHandSorting`, `useToast`.

## Testing gotchas

- `getCardsToDrawCount(player, deckSize)` needs the hand *after* removing the
  cards being played, not before — it only asks "how many more to reach 3."
  Feeding it the pre-play hand silently under-counts. Check both call sites
  (`applyMove.ts`'s authoritative draw, `GameScreen.tsx`'s cosmetic
  animation prediction) whenever either changes.
- Face-down cards must never expose rank/suit to the UI before the player
  commits via Play — blind play is a core rule. Don't add a "preview" of a
  selected face-down card's identity anywhere.
- Testing ephemeral timed UI state (e.g. `.draw-card-ghost`, cleared via
  `setTimeout`): assert immediately after `fireEvent.click`, not inside
  `waitFor` — polling can race past the real-timer clear and false-negative.
- `GameScreen.test.tsx`'s harness: `renderGame(playerId, state)` renders
  `GameProvider` + a `SeedGameState` effect-seeder + a `Probe` component that
  exposes `gameState` as text, so assertions prove a real `applyMove`
  round-trip rather than mocking `dispatchMove`. Card selectors:
  `[data-card-key="<id>"]` (hand/faceUp), `[data-facedown-index="<i>"]`
  (faceDown) — click target is usually `...firstElementChild`.

## Dev/test mode

- `npm run dev:auto` runs Vite on a fixed `127.0.0.1:5173` — useful when
  scripting/automating against the dev server.
- In-game "Test Mode" is fully client-side: it deals a fresh random hand
  into React state on every click and never reads or writes `localStorage`
  on creation or page reload. Don't pre-seed storage expecting Test Mode to
  pick it up — it won't. Real (non-test) rooms poll `localStorage` every 2s.
