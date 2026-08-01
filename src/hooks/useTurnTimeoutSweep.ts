import { useEffect, useRef, useState } from 'react';
import { getSupabaseClient } from '../supabase/client';
import { EDGE_ERROR_CODES, type EdgeResult } from '../supabase/roomTypes';

/**
 * D-05's client-side lazy trigger cadence - a purely client-side
 * display/polling concern with no server counterpart (RESEARCH.md), so it
 * lives here rather than in roomTypes.ts's shared client/server contract.
 * 5s means the badge flips and the auto-pickup lands within five seconds of
 * expiry, comfortably inside the human tolerance for the room's configured
 * (30s-300s) grace period.
 */
export const TURN_SWEEP_INTERVAL_MS = 5000;

export interface UseTurnTimeoutSweepArgs {
  roomCode: string;
  testMode: boolean;
  phase: string;
  turnStartedAt: string;
  currentTurnPlayerId: string | undefined;
  playerId: string;
  /**
   * MPLAY-07 (plan 02-19): the room's own configured auto-pickup grace
   * period, read from gameState.turnTimeoutMs by the caller - the value
   * this hook now compares elapsed time against, replacing the previously
   * hardcoded 60s constant this file used to import from roomTypes.ts.
   */
  turnTimeoutMs: number;
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
 *
 * MPLAY-07 (plan 02-19): the room's own turnTimeoutMs value, read from
 * gameState and passed in by the caller, is exactly as much of a hint as
 * the clock comparison already was - checkTurnTimeout (02-18) recomputes
 * elapsed time against its own server-stored row.state.turnTimeoutMs, so a
 * client carrying a stale or spoofed turnTimeoutMs only changes when *that
 * client* calls the sweep endpoint, never whether the sweep actually
 * succeeds.
 */
export function useTurnTimeoutSweep({
  roomCode,
  testMode,
  phase,
  turnStartedAt,
  currentTurnPlayerId,
  playerId,
  turnTimeoutMs,
}: UseTurnTimeoutSweepArgs): UseTurnTimeoutSweepResult {
  const armKey = `${roomCode}|${String(testMode)}|${phase}|${turnStartedAt}|${currentTurnPlayerId ?? ''}|${playerId}|${turnTimeoutMs}`;
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
      const expired = elapsedMs >= turnTimeoutMs;
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
        .then(({ data, error }) => {
          // Three-way branch matching useGameState.ts's canonical shape for an
          // invoke result: a resolved top-level error (transport/5xx,
          // surfaced without throwing), or an EdgeResult carried in `data`.
          if (error) {
            // No EdgeResult to inspect on this shape, so there is no code to
            // whitelist against - this is precisely the shape an unexpected
            // server-side failure takes, and must not stay silent.
            console.warn('check-turn-timeout sweep failed with a transport error', error);
            return;
          }
          const result = data as EdgeResult | undefined;
          const code = result?.error?.code;
          if (code && code !== EDGE_ERROR_CODES.TIMEOUT_NOT_ELAPSED && code !== EDGE_ERROR_CODES.CONFLICT) {
            // TIMEOUT_NOT_ELAPSED is the every-tick normal case and CONFLICT is
            // withVersionRetry losing a race it will retry on the next tick -
            // both expected-quiet. Anything else means the server rejected a
            // sweep for a reason nobody predicted.
            console.warn(`check-turn-timeout sweep returned unexpected error code ${code}`, result?.error?.message);
          }
        })
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
  }, [roomCode, testMode, phase, turnStartedAt, currentTurnPlayerId, playerId, turnTimeoutMs]);

  return { graceExpired: state.graceExpired };
}
