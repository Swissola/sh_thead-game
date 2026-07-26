/**
 * Persistent, distinguishable player identity backed by Supabase anonymous auth
 * (MPLAY-03), replacing App.tsx's per-mount random-UUID generation on every mount.
 *
 * `ensurePlayerIdentity()` always checks for an existing session before calling
 * `signInAnonymously()` - calling it unconditionally mints a brand-new anonymous
 * user on every page load, silently destroying D-01's auto-rejoin guarantee.
 * Supabase also rate-limits anonymous sign-in to 30 requests/hour per IP, so the
 * in-flight call is memoised to survive React 19 strict-mode double-invocation
 * or two components mounting at once.
 *
 * An unrecoverable session (private/incognito, cleared storage, a different
 * browser) resolves to `{ playerId: null, error }` rather than throwing - that's
 * D-02's expected manual-rejoin fallback, not a crash.
 */
import { getSupabaseClient } from './client';

export interface PlayerIdentityResult {
  playerId: string | null;
  error?: string;
}

let inFlight: Promise<PlayerIdentityResult> | null = null;

async function resolvePlayerIdentity(): Promise<PlayerIdentityResult> {
  const client = getSupabaseClient();

  const { data: sessionData } = await client.auth.getSession();
  if (sessionData?.session) {
    return { playerId: sessionData.session.user.id };
  }

  const { data: signInData, error } = await client.auth.signInAnonymously();
  if (error) {
    return { playerId: null, error: error.message };
  }

  return { playerId: signInData?.user?.id ?? null };
}

/**
 * Resolves to the caller's stable Supabase anonymous-auth identity, reusing an
 * existing session where possible and never calling `signInAnonymously()` more
 * than once concurrently.
 */
export function ensurePlayerIdentity(): Promise<PlayerIdentityResult> {
  if (!inFlight) {
    inFlight = resolvePlayerIdentity();
  }
  return inFlight;
}

/** Test-only: clears the memoised in-flight/resolved identity promise. */
export function resetIdentityMemoForTests(): void {
  inFlight = null;
}

export const LAST_NAME_STORAGE_KEY = 'shithead:lastPlayerName';

/**
 * Reads back the last-used display name (D-09's pre-fill, D-02's manual
 * rejoin). Backed directly by `localStorage` - not `src/storage.ts`'s
 * poll-based persistence shim, which this phase is dismantling. A device
 * preference, not game state.
 */
export function readLastUsedName(): string {
  try {
    return window.localStorage.getItem(LAST_NAME_STORAGE_KEY) ?? '';
  } catch {
    return '';
  }
}

/**
 * Persists the last-used display name, trimmed. Writing an empty (post-trim)
 * name clears the stored value rather than storing an empty string entry.
 */
export function writeLastUsedName(name: string): void {
  const trimmed = name.trim();
  try {
    if (trimmed === '') {
      window.localStorage.removeItem(LAST_NAME_STORAGE_KEY);
    } else {
      window.localStorage.setItem(LAST_NAME_STORAGE_KEY, trimmed);
    }
  } catch {
    // Private-mode/storage-disabled: degrade to a no-op, same as D-02's
    // unrecoverable-session fallback.
  }
}
