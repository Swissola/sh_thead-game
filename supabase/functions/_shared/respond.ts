/**
 * HTTP response shaping for Edge Functions.
 *
 * Kept free of `npm:` specifiers and Deno globals so it can be imported
 * directly by Vitest as well as by each Deno-run function's index.ts.
 */
import type { EdgeError, EdgeErrorCode, EdgeResult } from '../../../src/supabase/roomTypes.ts';

/**
 * Edge/lifecycle error codes to HTTP status. Anything the client should treat
 * as "your request was malformed or refers to a state that isn't allowed"
 * maps to 400; the rest map to the conventional status for what actually went
 * wrong (auth, authorization, missing resource, version conflict).
 */
const STATUS_BY_CODE: Record<EdgeErrorCode, number> = {
    BAD_REQUEST: 400,
    ROOM_CODE_COLLISION: 400,
    GAME_ALREADY_STARTED: 400,
    NAME_AMBIGUOUS: 400,
    NAME_IN_USE: 400,
    NOT_ENOUGH_PLAYERS: 400,
    TIMEOUT_NOT_ELAPSED: 400,
    UNAUTHENTICATED: 401,
    NOT_HOST: 403,
    NOT_IN_ROOM: 403,
    ROOM_NOT_FOUND: 404,
    CONFLICT: 409,
};

/** Small constructor so call sites don't hand-assemble the `EdgeError` shape. */
export function edgeError(code: EdgeErrorCode, message: string): EdgeError {
    return { code, message };
}

/** Serialises an `EdgeResult` to a `Response`: 200 + `{ room }` on success, or the mapped status + `{ error }`. */
export function jsonResponse(result: EdgeResult): Response {
    const status = result.error ? STATUS_BY_CODE[result.error.code] : 200;
    return new Response(JSON.stringify(result), {
        status,
        headers: { 'Content-Type': 'application/json' },
    });
}
