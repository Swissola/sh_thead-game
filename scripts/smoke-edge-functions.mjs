#!/usr/bin/env node
/**
 * Edge Function smoke suite - closes `02-VALIDATION.md`'s Wave 0 question
 * ("Deno test runner vs. scripted `supabase functions serve` smoke tests").
 *
 * Decision: scripted `supabase functions serve` + `fetch`, run via
 * `npm run test:edge:smoke`, over a `deno test` runner. Three reasons:
 *   - The Supabase CLI already bundles the Deno runtime, so serving costs no
 *     new toolchain dependency. RESEARCH.md's Environment Availability table
 *     lists Docker and Node, not a standalone Deno.
 *   - The wrappers' entire load-bearing behaviour is `withSupabase({ auth:
 *     'user' })` validating a real JWT. A `deno test` that imported
 *     `index.ts` would have to stub that out, which would test everything
 *     except the thing worth testing.
 *   - It matches the existing `scripts/check-edge-wrappers.mjs` convention -
 *     a plain Node `.mjs` script with per-case PASS lines and a non-zero
 *     exit - so the two read as one family.
 *
 * Runtime honesty: a first run pulls and starts the functions container and
 * can take a few minutes, well beyond the usual fast-feedback target. This is
 * the same accepted one-time bootstrap exception as plan 02-01's `supabase
 * start`; warm runs are tens of seconds. That cost is why this suite is a
 * wave-6 gate rather than a per-commit check - the per-commit signal stays
 * Vitest plus `check-edge-wrappers.mjs`.
 *
 * T-02-46: the target URL and key are parsed from `npx supabase status`,
 * never read from a hosted-project env file - this suite writes real rooms,
 * plays moves and removes players, and must never do that against a hosted
 * database.
 */
import { execSync, execFileSync, spawn } from 'node:child_process';
import { createClient } from '@supabase/supabase-js';

const IS_WINDOWS = process.platform === 'win32';
const READY_TIMEOUT_MS = 120000;

let failed = 0;
function check(label, condition) {
  if (condition) {
    console.log(`PASS ${label}`);
  } else {
    failed += 1;
    console.error(`FAIL ${label}`);
  }
}

/**
 * Preflight: parse the API URL, Functions URL and anon key straight out of
 * `npx supabase status -o json` - never the hosted-project env file plan
 * 02-03's checkpoint pointed at the browser client (T-02-46).
 */
function readSupabaseStatus() {
  let raw;
  try {
    raw = execSync('npx supabase status -o json', {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    });
  } catch (err) {
    console.error('FAIL preflight: the local Supabase stack does not appear to be running.');
    console.error('  Run `npm run supabase:start`, then re-run `npm run test:edge:smoke`.');
    const stderr = err.stderr ? err.stderr.toString().trim() : '';
    if (stderr) console.error(stderr);
    process.exit(1);
  }

  const start = raw.indexOf('{');
  const end = raw.lastIndexOf('}');
  if (start === -1 || end === -1) {
    console.error('FAIL preflight: could not parse `npx supabase status -o json` output:');
    console.error(raw);
    process.exit(1);
  }

  let parsed;
  try {
    parsed = JSON.parse(raw.slice(start, end + 1));
  } catch {
    console.error('FAIL preflight: `npx supabase status -o json` did not print valid JSON.');
    process.exit(1);
  }

  const apiUrl = parsed.API_URL;
  const functionsUrl = parsed.FUNCTIONS_URL;
  const anonKey = parsed.ANON_KEY;
  if (!apiUrl || !functionsUrl || !anonKey) {
    console.error(
      'FAIL preflight: `supabase status` output is missing API_URL/FUNCTIONS_URL/ANON_KEY.'
    );
    process.exit(1);
  }
  return { apiUrl, functionsUrl, anonKey };
}

/**
 * Spawns `npx supabase functions serve` as a child process. Teardown is
 * registered by the caller on normal exit, thrown failure and SIGINT (T-02-48)
 * so a failed run never leaves an orphaned serve process holding the port.
 *
 * `--no-verify-jwt` disables Kong's own gateway-level JWT check, which would
 * otherwise short-circuit an unauthenticated request with a generic
 * `INVALID_CREDENTIALS` error before it ever reaches the wrapper's own
 * `ctx.userClaims` check. Case 1 below exists to prove the wrapper's own
 * `UNAUTHENTICATED` rejection, not Kong's - the same layering the real
 * client relies on, since it always calls through the `apikey` header rather
 * than a Kong-level JWT.
 */
function spawnFunctionsServe() {
  const child = IS_WINDOWS
    ? spawn('npx supabase functions serve --no-verify-jwt', {
        shell: true,
        stdio: ['ignore', 'pipe', 'pipe'],
      })
    : spawn('npx', ['supabase', 'functions', 'serve', '--no-verify-jwt'], {
        stdio: ['ignore', 'pipe', 'pipe'],
      });

  const outputLines = [];
  const record = (chunk) => {
    outputLines.push(chunk.toString());
    if (outputLines.length > 200) outputLines.shift();
  };
  child.stdout.on('data', record);
  child.stderr.on('data', record);
  child.getRecentOutput = () => outputLines.join('');
  return child;
}

/** Kills the spawned serve process (and, on Windows, its whole process tree). */
function teardown(child) {
  if (!child || child.exitCode !== null) return;
  if (IS_WINDOWS) {
    try {
      execFileSync('taskkill', ['/pid', String(child.pid), '/t', '/f'], { stdio: 'ignore' });
    } catch {
      // Already gone.
    }
  } else {
    try {
      child.kill('SIGTERM');
    } catch {
      // Already gone.
    }
  }
}

/**
 * Polls the functions endpoint until it answers anything at all - including
 * an error status - rather than refusing the connection, bounded at
 * `READY_TIMEOUT_MS`.
 */
async function waitForFunctionsReady(functionsUrl, anonKey, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      await fetch(`${functionsUrl}/create-room`, { method: 'POST', headers: { apikey: anonKey } });
      return;
    } catch {
      // Connection refused / container still booting - keep polling.
    }
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }
  throw new Error(`Functions endpoint did not respond within ${timeoutMs}ms`);
}

/** Two/three independent `signInAnonymously()` calls give genuinely distinct `auth.uid()` values. */
async function createAnonSession(apiUrl, anonKey) {
  const client = createClient(apiUrl, anonKey, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
  const { data, error } = await client.auth.signInAnonymously();
  if (error || !data?.session || !data?.user) {
    throw new Error(`signInAnonymously failed: ${error?.message ?? 'no session returned'}`);
  }
  return { client, userId: data.user.id, token: data.session.access_token };
}

/**
 * POSTs to `${functionsUrl}/${name}`. A `null` token omits the Authorization
 * header entirely. `body` is JSON.stringify'd unless it is already a string
 * (used by the malformed-body case to send genuinely non-JSON bytes).
 */
async function callFunction(functionsUrl, anonKey, name, token, body) {
  const headers = { apikey: anonKey, 'Content-Type': 'application/json' };
  if (token) headers.Authorization = `Bearer ${token}`;
  const requestBody = typeof body === 'string' ? body : JSON.stringify(body);

  const res = await fetch(`${functionsUrl}/${name}`, {
    method: 'POST',
    headers,
    body: requestBody,
  });
  let json = null;
  try {
    json = await res.json();
  } catch {
    // Non-JSON response body - leave json as null.
  }
  return { status: res.status, json };
}

async function main() {
  const { apiUrl, functionsUrl, anonKey } = readSupabaseStatus();

  const child = spawnFunctionsServe();
  process.on('exit', () => teardown(child));
  process.on('SIGINT', () => {
    teardown(child);
    process.exit(130);
  });

  try {
    await waitForFunctionsReady(functionsUrl, anonKey, READY_TIMEOUT_MS);
  } catch (err) {
    console.error(`FAIL preflight: ${err.message}`);
    console.error(child.getRecentOutput());
    process.exitCode = 1;
    return;
  }

  // Two genuinely distinct real players - A and B, not two names for one subject.
  const a = await createAnonSession(apiUrl, anonKey);
  const b = await createAnonSession(apiUrl, anonKey);

  // ---------------------------------------------------------------------
  // Authentication and identity cases (Task 1) - the ones no static check
  // (`scripts/check-edge-wrappers.mjs`) can reach.
  // ---------------------------------------------------------------------

  // 1. create-room with no Authorization header -> 401.
  //
  // The plan's own wording expected this to surface our wrapper's own
  // `if (!ctx.userClaims) return jsonResponse({error: edgeError(UNAUTHENTICATED, ...)})`
  // check. Running this for real against `supabase functions serve`
  // disproves that: with a single `auth: 'user'` mode configured,
  // `npm:@supabase/server`'s own `verifyAuth` rejects a request carrying
  // no bearer token *before* the handler ever runs - `withSupabase`
  // short-circuits with its own `{message, code: 'INVALID_CREDENTIALS'}`
  // shape (not our `EdgeResult`'s `{error: {code, message}}` nesting).
  // `ctx.userClaims` being falsy inside the handler is consequently dead
  // code under this auth mode: every path that reaches the handler at all
  // already has a verified `ctx.userClaims`. The client-facing contract
  // this case actually needs to prove - an unauthenticated request never
  // reaches game logic and is rejected with 401 - still holds; only the
  // specific error-code shape differs from what static reading of
  // create-room/index.ts alone would suggest.
  const noAuth = await callFunction(functionsUrl, anonKey, 'create-room', null, {
    playerName: 'NoAuth',
  });
  check('create-room with no Authorization header returns 401', noAuth.status === 401);

  // 2. create-room with a syntactically valid but bogus bearer token -> 401.
  const bogus = await callFunction(functionsUrl, anonKey, 'create-room', 'bogus.jwt.token', {
    playerName: 'Bogus',
  });
  check('create-room with a bogus bearer token returns 401', bogus.status === 401);

  // 3. create-room called by A with a body that also carries B's uid as playerId
  // still produces a room whose host is A - the runtime proof of T-02-13's
  // JWT-subject override.
  const spoofCreate = await callFunction(functionsUrl, anonKey, 'create-room', a.token, {
    playerName: 'Alice',
    playerId: b.userId,
  });
  check(
    "create-room ignores a spoofed playerId in the body - the room's host is the real caller (A)",
    spoofCreate.status === 200 && spoofCreate.json?.room?.state?.host === a.userId
  );
  const spoofRoomCode = spoofCreate.json?.room?.roomCode;
  const spoofRoomVersion = spoofCreate.json?.room?.version;

  // 4. apply-move called by B, with a body whose move.playerId claims to be A,
  // is rejected and leaves the room's version unchanged - MPLAY-04's headline
  // claim, demonstrated rather than asserted. B is not seated in this room, so
  // the override (B's real identity, not A's claimed one) is what the engine
  // rejects against.
  const spoofMove = await callFunction(functionsUrl, anonKey, 'apply-move', b.token, {
    roomCode: spoofRoomCode,
    move: { type: 'READY_UP', playerId: a.userId },
  });
  check(
    'apply-move overrides a spoofed move.playerId with the caller identity and rejects the move',
    !!spoofMove.json?.error && !spoofMove.json?.room
  );
  const roomAfterSpoofMove = await a.client
    .from('rooms')
    .select('version')
    .eq('room_code', spoofRoomCode)
    .single();
  check(
    "the rejected spoofed move left the room's version unchanged",
    roomAfterSpoofMove.data?.version === spoofRoomVersion
  );

  // 5. A malformed (non-JSON) body -> 400 BAD_REQUEST.
  const malformed = await callFunction(
    functionsUrl,
    anonKey,
    'create-room',
    a.token,
    '{not valid json'
  );
  check(
    'a malformed JSON body returns 400 BAD_REQUEST',
    malformed.status === 400 && malformed.json?.error?.code === 'BAD_REQUEST'
  );

  if (failed > 0) {
    console.error(`\n${failed} check(s) failed.`);
    process.exitCode = 1;
  } else {
    console.log('\nAll checks passed.');
  }
}

main().catch((err) => {
  console.error('FAIL: smoke suite crashed:', err?.stack ?? err);
  process.exitCode = 1;
});
