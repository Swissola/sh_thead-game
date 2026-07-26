import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../supabase/client', () => ({
  getSupabaseClient: vi.fn(),
}));

import { getSupabaseClient } from '../../supabase/client';
import {
  ensurePlayerIdentity,
  resetIdentityMemoForTests,
  readLastUsedName,
  writeLastUsedName,
  LAST_NAME_STORAGE_KEY,
} from '../../supabase/session';

function makeFakeClient(overrides: {
  getSession?: ReturnType<typeof vi.fn>;
  signInAnonymously?: ReturnType<typeof vi.fn>;
}) {
  return {
    auth: {
      getSession: overrides.getSession ?? vi.fn(),
      signInAnonymously: overrides.signInAnonymously ?? vi.fn(),
    },
  };
}

describe('ensurePlayerIdentity', () => {
  beforeEach(() => {
    resetIdentityMemoForTests();
    vi.mocked(getSupabaseClient).mockReset();
  });

  it('resolves to the existing session user id and never calls signInAnonymously when a session already exists', async () => {
    const getSession = vi
      .fn()
      .mockResolvedValue({ data: { session: { user: { id: 'existing-user-1' } } }, error: null });
    const signInAnonymously = vi.fn();
    vi.mocked(getSupabaseClient).mockReturnValue(
      makeFakeClient({ getSession, signInAnonymously }) as unknown as ReturnType<
        typeof getSupabaseClient
      >
    );

    const result = await ensurePlayerIdentity();

    expect(result).toEqual({ playerId: 'existing-user-1' });
    expect(signInAnonymously).not.toHaveBeenCalled();
  });

  it('calls signInAnonymously exactly once and resolves to the new user id when there is no session', async () => {
    const getSession = vi.fn().mockResolvedValue({ data: { session: null }, error: null });
    const signInAnonymously = vi
      .fn()
      .mockResolvedValue({ data: { user: { id: 'new-user-1' } }, error: null });
    vi.mocked(getSupabaseClient).mockReturnValue(
      makeFakeClient({ getSession, signInAnonymously }) as unknown as ReturnType<
        typeof getSupabaseClient
      >
    );

    const result = await ensurePlayerIdentity();

    expect(result).toEqual({ playerId: 'new-user-1' });
    expect(signInAnonymously).toHaveBeenCalledTimes(1);
  });

  it('two sequential calls with a session present produce zero signInAnonymously calls', async () => {
    const getSession = vi
      .fn()
      .mockResolvedValue({ data: { session: { user: { id: 'existing-user-2' } } }, error: null });
    const signInAnonymously = vi.fn();
    vi.mocked(getSupabaseClient).mockReturnValue(
      makeFakeClient({ getSession, signInAnonymously }) as unknown as ReturnType<
        typeof getSupabaseClient
      >
    );

    await ensurePlayerIdentity();
    await ensurePlayerIdentity();

    expect(signInAnonymously).not.toHaveBeenCalled();
  });

  it('concurrent calls before the first resolves share one in-flight promise and produce at most one signInAnonymously call', async () => {
    let resolveSession: (value: { data: { session: null }; error: null }) => void;
    const sessionPromise = new Promise((resolve) => {
      resolveSession = resolve;
    });
    const getSession = vi.fn().mockReturnValue(sessionPromise);
    const signInAnonymously = vi
      .fn()
      .mockResolvedValue({ data: { user: { id: 'new-user-2' } }, error: null });
    vi.mocked(getSupabaseClient).mockReturnValue(
      makeFakeClient({ getSession, signInAnonymously }) as unknown as ReturnType<
        typeof getSupabaseClient
      >
    );

    const first = ensurePlayerIdentity();
    const second = ensurePlayerIdentity();

    resolveSession!({ data: { session: null }, error: null });

    const [firstResult, secondResult] = await Promise.all([first, second]);

    expect(firstResult).toEqual({ playerId: 'new-user-2' });
    expect(secondResult).toEqual({ playerId: 'new-user-2' });
    expect(signInAnonymously).toHaveBeenCalledTimes(1);
    expect(getSession).toHaveBeenCalledTimes(1);
  });

  it('resolves to { playerId: null, error } rather than throwing when signInAnonymously returns an error', async () => {
    const getSession = vi.fn().mockResolvedValue({ data: { session: null }, error: null });
    const signInAnonymously = vi
      .fn()
      .mockResolvedValue({ data: { user: null }, error: { message: 'rate limited' } });
    vi.mocked(getSupabaseClient).mockReturnValue(
      makeFakeClient({ getSession, signInAnonymously }) as unknown as ReturnType<
        typeof getSupabaseClient
      >
    );

    const result = await ensurePlayerIdentity();

    expect(result.playerId).toBeNull();
    expect(result.error).toBe('rate limited');
  });
});

describe('readLastUsedName / writeLastUsedName', () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it('readLastUsedName returns "" when nothing has been stored', () => {
    expect(readLastUsedName()).toBe('');
  });

  it('writeLastUsedName("Bob") followed by readLastUsedName() returns "Bob"', () => {
    writeLastUsedName('Bob');

    expect(readLastUsedName()).toBe('Bob');
  });

  it('writeLastUsedName("  Bob  ") stores the trimmed value', () => {
    writeLastUsedName('  Bob  ');

    expect(readLastUsedName()).toBe('Bob');
  });

  it('writeLastUsedName("") clears the stored value rather than storing an empty string entry', () => {
    writeLastUsedName('Bob');
    expect(window.localStorage.getItem(LAST_NAME_STORAGE_KEY)).not.toBeNull();

    writeLastUsedName('');

    expect(window.localStorage.getItem(LAST_NAME_STORAGE_KEY)).toBeNull();
    expect(readLastUsedName()).toBe('');
  });

  it('readLastUsedName returns "" and does not throw when localStorage.getItem throws', () => {
    const getItemSpy = vi.spyOn(window.localStorage.__proto__, 'getItem').mockImplementation(() => {
      throw new Error('storage disabled');
    });

    expect(() => readLastUsedName()).not.toThrow();
    expect(readLastUsedName()).toBe('');

    getItemSpy.mockRestore();
  });
});
