/**
 * Deno wrapper for the heartbeat Edge Function. All branching logic lives
 * in `_shared/heartbeat.ts` - this file only binds HTTP, auth and the
 * store.
 */
import { withSupabase } from 'npm:@supabase/server';
import { heartbeat } from '../_shared/heartbeat.ts';
import { createSupabaseRoomStore } from '../_shared/supabaseStore.ts';
import { jsonResponse, edgeError } from '../_shared/respond.ts';
import { localSecretKeyOverride } from '../_shared/envCompat.ts';
import { EDGE_ERROR_CODES } from '../../../src/supabase/roomTypes.ts';

interface HeartbeatBody {
    roomCode?: unknown;
}

export default {
    fetch: withSupabase({ auth: 'user', env: localSecretKeyOverride() }, async (req, ctx) => {
        if (!ctx.userClaims) {
            return jsonResponse({ error: edgeError(EDGE_ERROR_CODES.UNAUTHENTICATED, 'Missing verified session') });
        }

        let body: HeartbeatBody;
        try {
            body = await req.json();
        } catch {
            return jsonResponse({ error: edgeError(EDGE_ERROR_CODES.BAD_REQUEST, 'Malformed JSON body') });
        }

        const roomCode = typeof body.roomCode === 'string' ? body.roomCode : '';
        if (!roomCode) {
            return jsonResponse({ error: edgeError(EDGE_ERROR_CODES.BAD_REQUEST, 'roomCode is required') });
        }

        // Identity always comes from the verified JWT subject, never the
        // request body (T-02-25) - a spoofed id would otherwise let a
        // modified client mark a different player as connected. `.id`, not
        // `.sub` - see create-room/index.ts for why.
        const playerId = ctx.userClaims.id;
        const store = createSupabaseRoomStore(ctx.supabaseAdmin);
        const result = await heartbeat(store, { playerId, roomCode });
        return jsonResponse(result);
    }),
};
