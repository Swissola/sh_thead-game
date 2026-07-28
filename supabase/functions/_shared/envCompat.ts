/**
 * Local-dev secret-key compatibility override (Rule 3 fix, plan 02-13).
 *
 * `npm:@supabase/server`'s `createAdminClient()` (behind `ctx.supabaseAdmin`)
 * reads the service-role key from a `SUPABASE_SECRET_KEY` env var. Locally,
 * `supabase functions serve`'s served worker process only ever carries the
 * legacy `SUPABASE_SERVICE_ROLE_KEY` name (confirmed by printing `Deno.env`
 * from inside a running function) - `SUPABASE_SECRET_KEY` is never set, so
 * `ctx.supabaseAdmin` silently resolves to a client with no working
 * credentials and every write fails RLS with "permission denied for table
 * rooms". This was discovered running plan 02-13's smoke suite for real
 * against `supabase functions serve`, which no static check
 * (`scripts/check-edge-wrappers.mjs`) could have caught.
 *
 * Two mechanisms that look like the fix are both dead ends:
 * - `supabase functions serve --env-file` refuses to accept any
 *   `SUPABASE_`-prefixed override ("Env name cannot start with SUPABASE_,
 *   skipping"), so a `SUPABASE_SECRET_KEY` line in an env file is silently
 *   dropped.
 * - `Deno.env.set(...)` from inside a served function is disallowed by the
 *   edge-runtime sandbox ("NotSupported: The operation is not supported")
 *   and crashes the worker's event loop outright.
 *
 * The supported fix is `withSupabase`'s own `env` override parameter, which
 * bypasses environment-variable resolution entirely for the keys supplied.
 * `localSecretKeyOverride()` returns that override only when the modern
 * `SUPABASE_SECRET_KEY` name is genuinely absent - a no-op on the hosted
 * platform, which already injects it directly.
 *
 * Excluded from `tsc` (see `tsconfig.app.json`) alongside every other
 * Deno-only file under `supabase/functions/`, since `Deno.env` has no type
 * declaration under this project's browser/Node-targeted TypeScript config.
 */
export function localSecretKeyOverride(): { secretKeys: Record<string, string> } | undefined {
    if (Deno.env.get('SUPABASE_SECRET_KEY')) return undefined;
    const legacyServiceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    if (!legacyServiceRoleKey) return undefined;
    return { secretKeys: { default: legacyServiceRoleKey } };
}
