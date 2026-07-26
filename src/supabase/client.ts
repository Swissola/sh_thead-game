/**
 * Lazily-created, memoised Supabase browser client singleton.
 *
 * The client is only constructed on first call (inside `getSupabaseClient`),
 * not at module top level, so importing this module in a Vitest/jsdom run
 * without env vars configured does not throw at import time - only when the
 * client is actually requested.
 */
import { createClient, type SupabaseClient } from '@supabase/supabase-js';

let cachedClient: SupabaseClient | null = null;

export function getSupabaseClient(): SupabaseClient {
    if (cachedClient) {
        return cachedClient;
    }

    const url = import.meta.env.VITE_SUPABASE_URL;
    const publishableKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

    const missing: string[] = [];
    if (!url) missing.push('VITE_SUPABASE_URL');
    if (!publishableKey) missing.push('VITE_SUPABASE_PUBLISHABLE_KEY');
    if (missing.length > 0) {
        throw new Error(`Missing required Supabase env var(s): ${missing.join(', ')}`);
    }

    cachedClient = createClient(url, publishableKey, {
        auth: { persistSession: true, autoRefreshToken: true },
    });
    return cachedClient;
}

/** Test-only reset of the memoised client, so each test can reconfigure env vars. */
export function resetSupabaseClientForTests(): void {
    cachedClient = null;
}
