/**
 * Deno wrapper for the check-turn-timeout Edge Function. All branching
 * logic lives in `_shared/turnTimeout.ts` - this file only binds HTTP,
 * auth and the store.
 */
import { withSupabase } from 'npm:@supabase/server';
import { checkTurnTimeout } from '../_shared/turnTimeout.ts';
import { createSupabaseRoomStore } from '../_shared/supabaseStore.ts';
import { jsonResponse, edgeError } from '../_shared/respond.ts';
import { localSecretKeyOverride } from '../_shared/envCompat.ts';
import { EDGE_ERROR_CODES } from '../../../src/supabase/roomTypes.ts';

interface CheckTurnTimeoutBody {
    roomCode?: unknown;
}

export default {
    fetch: withSupabase({ auth: 'user', env: localSecretKeyOverride() }, async (req, ctx) => {
        if (!ctx.userClaims) {
            return jsonResponse({ error: edgeError(EDGE_ERROR_CODES.UNAUTHENTICATED, 'Missing verified session') });
        }

        let body: CheckTurnTimeoutBody;
        try {
            body = await req.json();
        } catch {
            return jsonResponse({ error: edgeError(EDGE_ERROR_CODES.BAD_REQUEST, 'Malformed JSON body') });
        }

        const roomCode = typeof body.roomCode === 'string' ? body.roomCode : '';
        if (!roomCode) {
            return jsonResponse({ error: edgeError(EDGE_ERROR_CODES.BAD_REQUEST, 'roomCode is required') });
        }

        const store = createSupabaseRoomStore(ctx.supabaseAdmin);
        const result = await checkTurnTimeout(store, { roomCode });
        return jsonResponse(result);
    }),
};
