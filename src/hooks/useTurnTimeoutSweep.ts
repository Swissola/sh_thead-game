import { useEffect, useRef, useState } from 'react';
import { getSupabaseClient } from '../supabase/client';
import { TURN_GRACE_MS } from '../supabase/roomTypes';

/**
 * D-05's client-side lazy trigger cadence - a purely client-side
 * display/polling concern with no server counterpart (RESEARCH.md), so it
 * lives here rather than in roomTypes.ts's shared client/server contract.
 * 5s means the badge flips and the auto-pickup lands within five seconds of
 * expiry, comfortably inside the human tolerance for a 60s grace period.
 */
export const TURN_SWEEP_INTERVAL_MS = 5000;

export interface UseTurnTimeoutSweepArgs {
  roomCode: string;
  testMode: boolean;
  phase: string;
  turnStartedAt: string;
  currentTurnPlayerId: string | undefined;
  playerId: string;
}

export interface UseTurnTimeoutSweepResult {
  graceExpired: boolean;
}

/**
 * Client-side trigger for the check-turn-timeout Edge Function (D-05) - the
 * missing Browser/Client half of RESEARCH.md's Architectural Responsibility
 * Map row for the turn-timeout grace period. Plan 02-07's checkTurnTimeout
 * was built and tested thoroughly, but nothing calls it - without this hook
 * a stalled turn never resolves.
 *
 * The local clock is strictly a hint: the request body carries only
 * roomCode, and checkTurnTimeout recomputes elapsed time from its own
 * server clock, returning TIMEOUT_NOT_ELAPSED with zero writes if the
 * caller was early (T-02-24). A client that lies about its clock achieves
 * nothing, which is why any authenticated player in the room may call it.
 *
 * Follows usePresence.ts's hook shape: useState for the derived value,
 * useRef for the interval handle (and here, an in-flight guard), one
 * useEffect that short-circuits, arms and tears down, returning a small
 * plain object.
 */
export function useTurnTimeoutSweep({
  roomCode,
  testMode,
  phase,
  turnStartedAt,
  currentTurnPlayerId,
  playerId,
}: UseTurnTimeoutSweepArgs): UseTurnTimeoutSweepResult {
  const [graceExpired, setGraceExpired] = useState(false);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const inFlightRef = useRef(false);

  useEffect(() => {
    // A changed turnStartedAt (new turn) resets the flag immediately,
    // before waiting for the next tick to re-evaluate.
    setGraceExpired(false);

    if (testMode || !roomCode || phase !== 'playing' || !turnStartedAt) {
      return;
    }

    const tick = () => {
      const elapsedMs = Date.now() - Date.parse(turnStartedAt);
      const expired = elapsedMs >= TURN_GRACE_MS;
      setGraceExpired(expired);

      if (!expired) return;

      // Not on your own turn: you're present and can act, and a client
      // that timed itself out would be self-sabotage. Every other
      // client is still sweeping, so the turn resolves regardless as
      // long as one other player is connected.
      if (currentTurnPlayerId === playerId) return;

      // Guard against pile-up with an in-flight flag rather than
      // cancelling - a pending call should not spawn a second, and a
      // failed one is simply retried on the next tick, silently (a
      // missed sweep is not a user-facing error).
      if (inFlightRef.current) return;

      inFlightRef.current = true;
      const supabase = getSupabaseClient();
      const request = supabase.functions.invoke('check-turn-timeout', { body: { roomCode } });
      void request
        .catch(() => {})
        .finally(() => {
          inFlightRef.current = false;
        });
    };

    intervalRef.current = setInterval(tick, TURN_SWEEP_INTERVAL_MS);

    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
      intervalRef.current = null;
      inFlightRef.current = false;
    };
  }, [roomCode, testMode, phase, turnStartedAt, currentTurnPlayerId, playerId]);

  return { graceExpired };
}
