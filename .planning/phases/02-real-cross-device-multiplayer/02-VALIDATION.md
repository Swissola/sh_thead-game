---
phase: 02
slug: real-cross-device-multiplayer
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-07-26
---

# Phase 02 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property               | Value                                                                  |
| ---------------------- | ---------------------------------------------------------------------- |
| **Framework**          | Vitest 4.0.16 (already configured)                                     |
| **Config file**        | `vitest.config.ts` (jsdom environment, `src/test-setup.ts` setup file) |
| **Quick run command**  | `npm test -- --run src/__tests__/engine/applyMove.test.ts`             |
| **Full suite command** | `npm test -- --run`                                                    |
| **Estimated runtime**  | ~10 seconds (existing suite)                                           |

**Gap:** Vitest runs in Node/jsdom and cannot execute Deno-runtime Edge Function code directly. Pure-TypeScript logic re-exported from `src/gameLogic.ts`/`src/engine/*` is already covered by existing Vitest suites. The thin Edge Function wrapper itself (`withSupabase`, request/response handling, the optimistic-concurrency retry loop) needs either `deno test` run against the function source, or integration smoke testing via `supabase functions serve` + a scripted client — this is new testing surface the project hasn't needed before and must be decided in Wave 0.

---

## Sampling Rate

- **After every task commit:** Run the targeted Vitest file for the module just touched
- **After every plan wave:** Run `npm test -- --run` (full suite)
- **Before `/gsd-verify-work`:** Full suite must be green, plus a manual two-device smoke test (this phase's success criteria are inherently cross-device and can't be fully proven by a single-process test suite)
- **Max feedback latency:** 10 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior                                                                                                                  | Test Type               | Automated Command                                                                         | File Exists                                      | Status     |
| ------- | ---- | ---- | ----------- | ---------- | -------------------------------------------------------------------------------------------------------------------------------- | ----------------------- | ----------------------------------------------------------------------------------------- | ------------------------------------------------ | ---------- |
| TBD     | TBD  | TBD  | MPLAY-01    | —          | Two clients joining the same room see the same live state                                                                        | integration/manual      | `supabase functions serve` + two browser sessions, or a scripted two-client Realtime test | ❌ W0                                            | ⬜ pending |
| TBD     | TBD  | TBD  | MPLAY-02    | —          | Postgres Changes subscription replaces the localStorage poll                                                                     | unit                    | `npm test -- --run src/__tests__/hooks/useRoomSubscription.test.ts`                       | ❌ W0 (new file)                                 | ⬜ pending |
| TBD     | TBD  | TBD  | MPLAY-03    | —          | Anon session persists across reload; falls back to manual rejoin-by-name                                                         | unit                    | `npm test -- --run` (new file)                                                            | ❌ W0                                            | ⬜ pending |
| TBD     | TBD  | TBD  | MPLAY-04    | T-02-01    | Modified/cheating client's move is rejected — RLS blocks direct writes, Edge Function overrides `playerId` from the verified JWT | unit + Deno/integration | `npx vitest run src/__tests__/engine/applyMove.test.ts` (existing) + new Deno-side test   | Partial — engine ✅, Edge Function wrapper ❌ W0 | ⬜ pending |
| TBD     | TBD  | TBD  | MPLAY-05    | —          | Optimistic local apply reconciles against authoritative server state on mismatch                                                 | unit                    | `npm test -- --run` (new file)                                                            | ❌ W0                                            | ⬜ pending |
| TBD     | TBD  | TBD  | MPLAY-06    | —          | Presence-driven offline/auto-pickup badge reflects disconnect state                                                              | unit + manual           | `npm test -- --run` (new file)                                                            | ❌ W0                                            | ⬜ pending |

_Task IDs, plan IDs, and wave numbers to be filled in once the planner assigns tasks to plans._

---

## Wave 0 Requirements

- [x] Decide and set up Edge Function test strategy (Deno test runner vs. scripted `supabase functions serve` smoke tests) — no existing convention in this project to follow. **Decision (plan 02-13): scripted `supabase functions serve` + `fetch`, run via `npm run test:edge:smoke` (`scripts/smoke-edge-functions.mjs`)** — the Supabase CLI already bundles Deno so serving costs no new toolchain dependency, a `deno test` importing `index.ts` would have to stub out the JWT validation that's the actual thing worth testing, and it matches `scripts/check-edge-wrappers.mjs`'s existing plain-Node-script convention.
- [ ] `src/__tests__/hooks/useRoomSubscription.test.ts` — stubs for MPLAY-02
- [ ] New reconciliation-logic test file — stubs for MPLAY-05
- [ ] New presence-mapping test file — stubs for MPLAY-06
- [ ] A local Supabase project (`supabase init` + `supabase start`) so the above can run against something real rather than pure mocks

---

## Manual-Only Verifications

| Behavior                                                            | Requirement | Why Manual                                                                               | Test Instructions                                                                                                                                            | Verified |
| ------------------------------------------------------------------- | ----------- | ---------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Two devices/browsers see the same live game state                   | MPLAY-01    | Cross-device/cross-process behavior can't be fully proven by a single-process Vitest run | Open the app in two separate browser profiles/devices, join the same room code, confirm both see identical state as moves are played                         | ✅ 2026-07-28 to 2026-08-01, hosted project — `02-UAT.md` tests 1, 2, 3, 7, 9 (room create/join via link, both screens in sync across several turns of live play) |
| Opponent disconnect → offline badge → auto-pickup → reconnect toast | MPLAY-06    | Requires real Presence timing and an actual dropped connection, not a mock               | Close one client's tab mid-game, wait past the grace period, confirm the badge transitions and the auto-pickup fires; reopen and confirm the reconnect toast | ✅ 2026-07-28 to 2026-08-01, hosted project — `02-UAT.md` tests 4b (auto-pickup targeting), 5/6 (reconnect toast + badge clear, Leave Game/rejoin), 10 (reconnect-toast misattribution found and fixed). Disconnect was exercised via Leave Game, an Ethernet-adapter disable, and Airplane Mode rather than literally closing the tab every time - functionally equivalent since the Presence channel doesn't distinguish cause of disconnect; noted as a variance from the literal instruction, not a coverage gap |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 10s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
