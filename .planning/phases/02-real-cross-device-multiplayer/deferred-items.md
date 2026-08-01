# Deferred Items — Phase 02

Items discovered during execution that are out of scope for the task that found them
(pre-existing, in files the task did not touch). Logged, not fixed, per executor scope
boundary rules.

## Plan 02-01

- **`npm run lint` exits 1, not 0** (Task 1 acceptance criterion expects exit 0). Three
  pre-existing issues, none in files touched by this plan (`package.json`, `.gitignore`,
  `.env.example`, `supabase/config.toml`):
  - `src/App.tsx:32` — `react-hooks/exhaustive-deps` warning (missing `gameState` dep)
  - `src/context/GameContext.tsx:98` — `react-refresh/only-export-components` error
  - `src/screens/GameScreen.tsx:85` — `react-hooks/set-state-in-effect` error
  - Confirmed pre-existing via `git diff package-lock.json` (only additions from the new
    Supabase installs, no version bump to `eslint-plugin-react-hooks` or eslint itself)
    and via `git diff --stat` on this plan's commits (none of the three flagged files are
    modified anywhere in this plan). Out of scope for Task 1; carried forward for a future
    lint-cleanup pass.
- **`npm audit` reports 14 vulnerabilities (1 low, 1 moderate, 9 high, 3 critical)** after
  `npm install`. All are in pre-existing dev-tooling transitive deps (`vite`, `vitest`,
  `rollup`, `postcss`, `minimatch`, `picomatch`, `js-yaml`, `brace-expansion`, `flatted`,
  `ws`, `ajv`, `@babel/core`) — none in `@supabase/supabase-js` or `supabase` themselves.
  Out of scope for this plan (build-tooling supply chain, unrelated to the Supabase
  scaffolding this plan adds); flagged for a future dependency-audit pass.

## Plan 02-04

- **`npm run lint` still exits 1** (Task 2 acceptance criterion expects exit 0) — the
  same three pre-existing issues logged under Plan 02-01 above, in the same three files
  (`App.tsx`, `GameContext.tsx`, `GameScreen.tsx`), none of which this plan touches or
  modifies. `npx eslint src/supabase/session.ts src/__tests__/supabase/session.test.ts`
  (this plan's only two files) is clean with zero output. Not re-fixed here per scope
  boundary; still carried forward for the same future lint-cleanup pass.

## Plan 02-03 (Task 2)

- **`npm run lint` still exits 1** (Task 2 acceptance criterion expects exit 0) — the
  same three pre-existing issues logged under Plan 02-01 above, in the same three files
  (`App.tsx`, `GameContext.tsx`, `GameScreen.tsx`), none of which this plan touches or
  modifies. `npx eslint supabase/functions/_shared/engine.ts
  supabase/functions/_shared/db.ts supabase/functions/_shared/respond.ts
  src/__tests__/edge/db.test.ts` (this task's four new/changed source files) is clean
  with zero output. Not re-fixed here per scope boundary; still carried forward for the
  same future lint-cleanup pass.

## Plan 02-05 (Task 3)

- **`npm run lint` still exits 1** (Task 3 acceptance criterion expects exit 0) — the
  same three pre-existing issues logged under Plan 02-01 above, in the same three files
  (`App.tsx`, `GameContext.tsx`, `GameScreen.tsx`), none of which this plan touches or
  modifies. `npx eslint supabase/functions/_shared/supabaseStore.ts
  src/__tests__/edge/createRoom.test.ts src/__tests__/edge/joinRoom.test.ts
  scripts/check-edge-wrappers.mjs` (this plan's own new/changed lintable files;
  `supabase/functions/*/index.ts` is globally ignored by `eslint.config.js`) is clean
  with zero output. Not re-fixed here per scope boundary and per the orchestrator's
  explicit instruction not to touch `GameContext.tsx`; still carried forward for the
  same future lint-cleanup pass.
- **This worktree's branch (`worktree-agent-a99d9f6be0cc2d664`) was created from a stale
  base commit** (`d606485`, an ancestor of `stage-1-refactor`'s tip `bc1c915`) rather
  than from the tip that already includes plan 02-03's merged shared modules
  (`db.ts`, `engine.ts`, `respond.ts`, `roomTypes.ts`). Fixed at the start of this
  plan's execution via `git merge --ff-only stage-1-refactor` (a safe fast-forward,
  since the worktree's HEAD was a strict ancestor - no rewrite, no lost work). Flagging
  here in case the same stale-base issue affects sibling worktrees for 02-06/02-07/
  02-08/02-09, which were reportedly branched the same way.

## Plan 02-06

- **`npm run lint` still exits 1** (Task 3 acceptance criterion expects exit 0) — the
  same three pre-existing issues logged under Plan 02-01 above, in the same three files
  (`App.tsx`, `GameContext.tsx`, `GameScreen.tsx`), none of which this plan touches,
  modifies, or is permitted to touch (`GameContext.tsx` is explicitly out of scope for
  this wave - owned by a sibling plan). `npx eslint
  supabase/functions/_shared/startGame.ts supabase/functions/_shared/applyRoomMove.ts
  src/__tests__/edge/startGame.test.ts src/__tests__/edge/applyRoomMove.test.ts` (this
  plan's four new files; the two Deno wrapper `index.ts` files are globally ignored by
  `eslint.config.js`) is clean with zero output. Not re-fixed here per scope boundary;
  still carried forward for the same future lint-cleanup pass.
- **`node scripts/check-edge-wrappers.mjs` could not be run** (Task 3's `<verify>` and
  first acceptance criterion) — this script, along with
  `supabase/functions/_shared/supabaseStore.ts`, is created by sibling plan 02-05
  (`files_modified` in `02-05-PLAN.md`), which executes in parallel in a separate
  worktree and had not merged into this worktree's base branch at execution time.
  Neither file exists here. `supabase/functions/start-game/index.ts` and
  `supabase/functions/apply-move/index.ts` were written to satisfy every invariant
  `check-edge-wrappers.mjs` is specified to enforce (per `02-05-PLAN.md` Task 3's
  action: contains `withSupabase`, contains `userClaims`, contains
  `ctx.supabaseAdmin`, no `body.playerId`/`body.player_id` read, no inline
  `applyMove(` call, under 80 lines) and import `createSupabaseRoomStore` from
  `../_shared/supabaseStore.ts` exactly as 02-05 will provide it - neither file was
  duplicated here to avoid a guaranteed merge conflict on the same new path. Verified
  instead via the acceptance criteria that don't depend on the missing script
  (`grep -c 'userClaims'` = 2, `grep -c 'as Move'` = 0, `npm run build` exits 0) plus
  the lint check above. **Action required at Wave 3 integration:** once 02-05 merges,
  re-run `node scripts/check-edge-wrappers.mjs` against these two wrappers to confirm
  they pass the live checker unchanged.

## Plan 02-07

- **`npm run lint` still exits 1** (Task 3 acceptance criterion expects exit 0) — the
  same three pre-existing issues logged under Plan 02-01 above, in the same three files
  (`App.tsx`, `GameContext.tsx`, `GameScreen.tsx`), none of which this plan touches,
  modifies, or is permitted to touch (`GameContext.tsx` is explicitly out of scope for
  this wave - owned by sibling plan 02-09, executing in parallel). `npx eslint
  supabase/functions/_shared/turnTimeout.ts supabase/functions/_shared/heartbeat.ts
  supabase/functions/_shared/removePlayer.ts src/__tests__/edge/turnTimeout.test.ts
  src/__tests__/edge/heartbeat.test.ts src/__tests__/edge/removePlayer.test.ts` (this
  plan's six new source/test files; the three Deno wrapper `index.ts` files are
  globally ignored by `eslint.config.js`) is clean with zero errors and zero warnings.
  Not re-fixed here per scope boundary; still carried forward for the same future
  lint-cleanup pass.
- This worktree's branch was also created from the same stale base commit (`d606485`)
  described under Plan 02-05 above, predating plan 02-03's merge of the shared modules
  this plan depends on (`engine.ts`, `db.ts`, `respond.ts`, etc.). Fixed at the start of
  this plan's execution via `git merge --ff-only stage-1-refactor` (confirmed a safe
  fast-forward: `git merge-base HEAD stage-1-refactor` equalled the worktree's
  pre-merge HEAD), followed by `npm install` since `node_modules` did not yet exist.

## Plan 02-08

- **`npm run lint` still exits 1** - the same three pre-existing issues logged under
  Plan 02-01 above, in the same three files (`App.tsx`, `GameContext.tsx`,
  `GameScreen.tsx`), none of which this plan touches or is permitted to touch
  (`GameContext.tsx` is explicitly owned by sibling plan 02-09 this wave). This plan's
  own two new hooks (`src/hooks/useRoomSubscription.ts`, `src/hooks/usePresence.ts`)
  and their tests initially tripped two *new* `react-hooks` lint rules
  (`react-hooks/refs` - writing `ref.current` during render; `react-hooks/set-state-in-effect`
  - calling `setState` synchronously in an effect's bail-out branch) plus two
  `no-unused-vars` hits in the fake-Supabase-client test helpers. All four were within
  this plan's own touched files, so fixed directly (Rule 1) rather than deferred:
  `useRoomSubscription.ts`'s three ref writes moved into their own no-deps effect;
  `usePresence.ts`'s reset moved from the bail-out branch into the "connected" branch's
  cleanup, since the initial `useState([])` already covers the bail-out case. Confirmed
  clean via `npx eslint src/hooks/useRoomSubscription.ts src/hooks/usePresence.ts
  src/__tests__/hooks/useRoomSubscription.test.ts src/__tests__/hooks/usePresence.test.ts`
  (zero output). Not re-fixed here per scope boundary; the three pre-existing files
  still carried forward for the same future lint-cleanup pass.
- **`supabase/functions/_shared/heartbeat.ts` does not exist in this worktree** - it is
  created by sibling plan 02-07, executing in parallel in a separate worktree, and had
  not merged into this worktree's base branch at execution time. `usePresence.ts`
  invokes the `heartbeat` Edge Function by name (`supabase.functions.invoke('heartbeat',
  { body: { roomCode } })`) per the plan's own action text and per 02-07-PLAN.md's
  documented `heartbeat(store, input: { playerId; roomCode })` contract (identity comes
  from the verified JWT server-side, matching every other wrapper in this codebase -
  `playerId` is never read from the request body). Not directly verifiable against the
  live handler in this worktree; flagged for Wave 3/4 integration to confirm the
  invoked function name and body shape match once 02-07 merges.

## Plan 02-12

- **`npm run lint` still exits 1** - down to two pre-existing issues by this point (the
  `App.tsx:32` `react-hooks/exhaustive-deps` warning logged under Plan 02-01 no longer
  reproduces; `App.tsx` was substantially rewritten by 02-10's identity/Realtime work):
  - `src/context/GameContext.tsx:142` - `react-refresh/only-export-components`
  - `src/screens/GameScreen.tsx:107` - `react-hooks/set-state-in-effect`, in the
    pre-existing celebration-modal effect (unrelated to this plan's offline-badge or
    turn-timeout-sweep effects added lower in the same file)
  - Confirmed pre-existing via `git show 2200042:src/screens/GameScreen.tsx` - the exact
    `setCelebrationModal({...})` call inside the celebration effect is present verbatim
    at this worktree's base commit, before any of this plan's edits. `GameContext.tsx`
    was not touched by this plan at all (read-only). Not re-fixed here per scope
    boundary; still carried forward for the same future lint-cleanup pass.
  - This plan's own new hook (`src/hooks/useTurnTimeoutSweep.ts`) initially tripped
    three *new* `react-hooks`/React Compiler rules this project's config enforces
    strictly (`react-hooks/set-state-in-effect`, `react-hooks/refs` - no ref
    reads/writes during render, `react-hooks/purity` - no impure calls like `Date.now()`
    during render). Fixed directly (Rule 1, within this plan's own file): `graceExpired`
    is tracked together with an "arm key" string in one `useState` object, reset via
    React's documented "adjusting state when a prop changes" render-body pattern
    (comparing the key and calling `setState` directly in the render body - not a ref,
    not an effect) rather than an effect-body `setState` call or a `Date.now()`-based
    pure render computation; the value is otherwise only ever updated from inside the
    `setInterval` callback the effect registers. Confirmed clean via
    `npx eslint src/hooks/useTurnTimeoutSweep.ts src/__tests__/hooks/useTurnTimeoutSweep.test.ts`
    (zero output).
- **Task 3's acceptance criterion `grep -c '>Cancel<' src/screens/GameScreen.tsx` is 1**
  cannot be satisfied literally under this project's Prettier config (100-char
  `printWidth`, 2-space `tabWidth`) - the pick-up dialog's "Cancel" button text has
  always rendered on its own line (`>\n  Cancel\n<`), confirmed via
  `git show 2200042:src/screens/GameScreen.tsx`, i.e. **before** this plan's Task 3
  touched the file at all. The underlying intent (the pre-existing pick-up dialog's own
  "Cancel" label was not renamed by this plan's new Leave Game dialog) holds and is
  covered by a passing test (`getByText('Cancel')` still resolves after Task 3's
  changes); the literal grep pattern is a plan-authoring assumption about formatting
  that predates this plan and does not match the codebase's actual (and unmodified)
  Prettier output. Not "fixed" by hand-collapsing the JSX against the formatter's own
  output, since that would just be undone by the next `npm run format`.

## Plan 02-15 (Task 3)

- **`npm run test:edge:smoke` completes all checks but does not exit on its own** -
  `main()` in `scripts/smoke-edge-functions.mjs` (pre-existing, not touched by this
  plan's `check()`-call edits) never calls `process.exit()`; it relies on Node's
  natural exit once the event loop drains. The spawned `npx supabase functions serve
  --no-verify-jwt` child process (also pre-existing `spawnFunctionsServe()` logic) is
  opened with piped stdio (`stdio: ['ignore', 'pipe', 'pipe']`), and a live child with
  open piped streams keeps the parent's event loop - and therefore the whole process -
  alive indefinitely, even after every `check()` and the final "All checks passed."
  line have already printed. Confirmed via Kong/GoTrue container logs
  (`docker logs supabase_kong_...`, `docker logs supabase_auth_...`): the full HTTP
  call sequence (all 18 checks, all 7 covered functions) completed in well under a
  minute; the process was still running 8+ minutes later with zero further activity in
  any container log, and only exited once manually killed. This did not affect the
  correctness of the run - the captured stdout, once flushed, showed every check as
  `PASS` including the two new heartbeat assertions this task adds - but it means
  every future invocation of `npm run test:edge:smoke` needs manual process
  termination (or a `--timeout`-bounded runner) rather than completing on its own.
  Out of scope to fix here per scope boundary (the hang is in the spawn/exit
  lifecycle code near the top of the file, not the `check()` calls or heartbeat
  assertions this task's `<files>` list covers); a follow-up fix would add either an
  explicit `process.exit(process.exitCode ?? 0)` at the end of `main()` or
  `child.unref()`/`child.stdout.unref()` after `spawnFunctionsServe()`.
- **This worktree's branch was three-plus waves stale** (`d606485`, an ancestor of
  `stage-1-refactor` missing all of plan 02-14 and the phase's `.planning/` scaffolding)
  rather than branched from the tip this plan's frontmatter (`depends_on: ["02-14"]`)
  assumes. Fixed at the start of this plan's execution via `git merge --ff-only
  stage-1-refactor` (confirmed a strict fast-forward: `git log --oneline
  stage-1-refactor..HEAD` was empty before merging, i.e. the worktree branch had zero
  commits of its own to lose). Same stale-base pattern previously logged under plans
  02-05 and 02-07 above; flagging again in case it recurs for later waves.
- **The local Supabase stack's `edge_runtime` and `studio` containers were `Exited`**
  at the start of this plan's execution, with bind mounts pointing at a *different*,
  no-longer-matching worktree path (`agent-aea2c752cd368982d` instead of this plan's
  `agent-ab626206d94067ea1`) - visible only when attempting `docker start` directly,
  which failed with an OCI mount error naming the stale path. `npx supabase stop`
  followed by `npx supabase start` recreated both containers correctly bound to the
  current worktree (confirmed via `supabase status -o json` gaining a `FUNCTIONS_URL`
  key it previously lacked). Not a code change; noted here since a sibling worktree
  hitting the same symptom will need the same stop/start cycle rather than assuming
  a hosted-project fallback is required.

## Plan 02-16 (Task 1)

- **`npm run lint` still exits 1** (Task 1 acceptance criterion expects exit 0) - the
  same two pre-existing issues logged under Plan 02-12 above:
  - `src/context/GameContext.tsx:221` - `react-refresh/only-export-components`
    (`useGameContext` exported alongside `GameProvider`, unchanged by this task; the
    line number shifted only because this task added lines earlier in the file)
  - `src/screens/GameScreen.tsx:107` - `react-hooks/set-state-in-effect`, in the
    same pre-existing celebration-modal effect, unrelated to this plan
  - Confirmed pre-existing by temporarily stashing this task's own edits (reverting to
    the worktree's base commit) and re-running `npm run lint`: both errors reproduce
    identically, at the same relative locations, with this task's changes absent.
    `npx eslint src/context/GameContext.tsx src/hooks/useGameState.ts
    src/supabase/roomTypes.ts` (this task's three source files) reports only the one
    pre-existing `react-refresh` error already logged above - no new lint errors from
    the `beginPendingMove`/`resolveOldestPendingMove`/`hasPendingMove` additions. Not
    re-fixed here per scope boundary; still carried forward for the same future
    lint-cleanup pass first logged under Plan 02-01.

## Plan 02-16 (Task 2)

- **`npm run lint` still exits 1** (this plan's own `<verification>` also expects exit
  0) - the same two pre-existing issues logged under Plan 02-16 (Task 1) above, in the
  same two files (`GameContext.tsx:221`, `GameScreen.tsx:107`), neither of which Task 2
  modifies (`GameContext.tsx` is read-only here - only its already-exposed
  `hasPendingMove` is consumed). `npx eslint src/hooks/useRoomSubscription.ts
  src/App.tsx src/__tests__/hooks/useRoomSubscription.test.ts
  src/__tests__/App.test.tsx` (this task's four touched files) is clean with zero
  output. Not re-fixed here per scope boundary; still carried forward for the same
  future lint-cleanup pass first logged under Plan 02-01.

## Plan 02-17 (Task 1 and Task 2)

- **`npm run lint` still exits 1** (Task 2's `<acceptance_criteria>` and this plan's own
  `<verification>` both expect exit 0) - the same two pre-existing issues logged under
  Plan 02-16 above, in the same two files (`GameContext.tsx:221`,
  `GameScreen.tsx:107`), neither of which this plan touches (`GameContext.tsx` is not
  imported or modified anywhere in this plan; `GameScreen.tsx` is untouched). Confirmed
  via `git status --short` after both tasks: only `src/supabase/roomTypes.ts`,
  `src/hooks/useRoomSubscription.ts` and
  `src/__tests__/hooks/useRoomSubscription.test.ts` are modified. `npx eslint
  src/supabase/roomTypes.ts src/hooks/useRoomSubscription.ts
  src/__tests__/hooks/useRoomSubscription.test.ts` (this plan's three touched files) is
  clean with zero output. Not re-fixed here per scope boundary; still carried forward
  for the same future lint-cleanup pass first logged under Plan 02-01.

## Plan 02-18 (Task 1)

- **`npm run lint` still exits 1** (Task 1's `<acceptance_criteria>` expects exit 0) -
  the same two pre-existing issues logged under Plan 02-16/02-17 above, in the same two
  files (`GameContext.tsx:221`, `GameScreen.tsx:111`), neither of which this task
  touches. Confirmed via `git status --short`: only `src/types.ts`,
  `src/engine/moves.ts`, `src/engine/errors.ts`, `src/engine/applyMove.ts`,
  `src/supabase/roomTypes.ts`, `src/screens/MenuScreen.tsx`, and this task's seven
  fixture/test files are modified. `npx eslint` scoped to exactly those fourteen files
  is clean with zero output. Not re-fixed here per scope boundary; still carried forward
  for the same future lint-cleanup pass first logged under Plan 02-01.

## Plan 02-19 (Task 1)

- **`npm run lint` still exits 1** (Task 1's `<acceptance_criteria>` expects exit 0) -
  the same two pre-existing issues logged under Plan 02-16/02-17/02-18 above, in the
  same two files (`GameContext.tsx:221`, `GameScreen.tsx:111`), neither of which this
  task touches. Confirmed via `git status --short`: only `src/screens/LobbyScreen.tsx`
  and `src/__tests__/screens/LobbyScreen.test.tsx` are modified. `npx eslint
  src/screens/LobbyScreen.tsx src/__tests__/screens/LobbyScreen.test.tsx` (this task's
  two touched files) is clean with zero output. Not re-fixed here per scope boundary;
  still carried forward for the same future lint-cleanup pass first logged under
  Plan 02-01.
