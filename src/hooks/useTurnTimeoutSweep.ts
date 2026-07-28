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

interface SweepState {
  armKey: string;
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
 * graceExpired only ever changes from inside the setInterval callback (an
 * external-system update, not the effect body itself) - the officially
 * documented shape for calling setState from an effect. The one exception
 * is the arm-key comparison below: React's own "adjusting state when a prop
 * changes" pattern (calling setState directly in the render body, not a
 * ref, not an effect) resets graceExpired to false the instant a new turn
 * starts, rather than waiting up to TURN_SWEEP_INTERVAL_MS for the next tick.
 */
export function useTurnTimeoutSweep({
  roomCode,
  testMode,
  phase,
  turnStartedAt,
  currentTurnPlayerId,
  playerId,
}: UseTurnTimeoutSweepArgs): UseTurnTimeoutSweepResult {
  const armKey = `${roomCode}|${String(testMode)}|${phase}|${turnStartedAt}|${currentTurnPlayerId ?? ''}|${playerId}`;
  const [state, setState] = useState<SweepState>({ armKey, graceExpired: false });

  if (state.armKey !== armKey) {
    setState({ armKey, graceExpired: false });
  }

  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const inFlightRef = useRef(false);

  useEffect(() => {
    if (testMode || !roomCode || phase !== 'playing' || !turnStartedAt) {
      return;
    }

    const tick = () => {
      const elapsedMs = Date.now() - Date.parse(turnStartedAt);
      const expired = elapsedMs >= TURN_GRACE_MS;
      setState((prev) =>
        prev.graceExpired === expired ? prev : { ...prev, graceExpired: expired }
      );

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

  return { graceExpired: state.graceExpired };
}
