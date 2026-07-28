/**
 * Deno wrapper for the apply-move Edge Function.
 *
 * Thin binding only - HTTP, auth and the store. Every game rule is enforced
 * inside `_shared/applyRoomMove.ts` / `_shared/engine.ts`; `move` is passed
 * through as `unknown` so applyRoomMove's own validation - not a cast here -
 * is what rejects a malformed payload.
 */
import { withSupabase } from 'npm:@supabase/server';
import { jsonResponse, edgeError } from '../_shared/respond.ts';
import { createSupabaseRoomStore } from '../_shared/supabaseStore.ts';
import { applyRoomMove } from '../_shared/applyRoomMove.ts';
import { localSecretKeyOverride } from '../_shared/envCompat.ts';
import { EDGE_ERROR_CODES } from '../../../src/supabase/roomTypes.ts';

interface ApplyMoveBody {
    roomCode: string;
    move: unknown;
}

export default {
    fetch: withSupabase({ auth: 'user', env: localSecretKeyOverride() }, async (req, ctx) => {
        if (!ctx.userClaims) {
            return jsonResponse({ error: edgeError(EDGE_ERROR_CODES.UNAUTHENTICATED, 'Not authenticated') });
        }

        let body: ApplyMoveBody;
        try {
            body = await req.json();
        } catch {
            return jsonResponse({ error: edgeError(EDGE_ERROR_CODES.BAD_REQUEST, 'Malformed request body') });
        }

        if (!body?.roomCode) {
            return jsonResponse({ error: edgeError(EDGE_ERROR_CODES.BAD_REQUEST, 'roomCode is required') });
        }

        // Identity comes only from the verified JWT subject - never the request body.
        // move is deliberately left as `unknown`: applyRoomMove validates its shape and
        // overrides playerId, so no cast to Move happens in this wrapper. `.id`, not
        // `.sub` - see create-room/index.ts for why.
        const playerId = ctx.userClaims.id;
        const store = createSupabaseRoomStore(ctx.supabaseAdmin);
        const result = await applyRoomMove(store, { playerId, roomCode: body.roomCode, move: body.move });
        return jsonResponse(result);
    }),
};
