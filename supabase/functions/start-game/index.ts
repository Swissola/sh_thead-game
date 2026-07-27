/**
 * Deno wrapper for the start-game Edge Function.
 *
 * Thin binding only - HTTP, auth and the store. All game-rule and
 * authorisation logic lives in `_shared/startGame.ts`, unit-tested by Vitest;
 * `scripts/check-edge-wrappers.mjs` enforces that no rule check lives inline
 * here.
 */
import { withSupabase } from 'npm:@supabase/server';
import { jsonResponse, edgeError } from '../_shared/respond.ts';
import { createSupabaseRoomStore } from '../_shared/supabaseStore.ts';
import { startGame } from '../_shared/startGame.ts';
import { EDGE_ERROR_CODES } from '../../../src/supabase/roomTypes.ts';

interface StartGameBody {
    roomCode: string;
}

export default {
    fetch: withSupabase({ auth: 'user' }, async (req, ctx) => {
        if (!ctx.userClaims) {
            return jsonResponse({ error: edgeError(EDGE_ERROR_CODES.UNAUTHENTICATED, 'Not authenticated') });
        }

        let body: StartGameBody;
        try {
            body = await req.json();
        } catch {
            return jsonResponse({ error: edgeError(EDGE_ERROR_CODES.BAD_REQUEST, 'Malformed request body') });
        }

        if (!body?.roomCode) {
            return jsonResponse({ error: edgeError(EDGE_ERROR_CODES.BAD_REQUEST, 'roomCode is required') });
        }

        // Identity comes only from the verified JWT subject - never the request body.
        const playerId = ctx.userClaims.sub;
        const store = createSupabaseRoomStore(ctx.supabaseAdmin);
        const result = await startGame(store, { playerId, roomCode: body.roomCode });
        return jsonResponse(result);
    }),
};
