/**
 * Deno wrapper for the remove-player Edge Function. All branching logic
 * lives in `_shared/removePlayer.ts` - this file only binds HTTP, auth and
 * the store.
 */
import { withSupabase } from 'npm:@supabase/server';
import { removePlayer } from '../_shared/removePlayer.ts';
import { createSupabaseRoomStore } from '../_shared/supabaseStore.ts';
import { jsonResponse, edgeError } from '../_shared/respond.ts';
import { EDGE_ERROR_CODES } from '../../../src/supabase/roomTypes.ts';

interface RemovePlayerBody {
    roomCode?: unknown;
    targetPlayerId?: unknown;
}

export default {
    fetch: withSupabase({ auth: 'user' }, async (req, ctx) => {
        if (!ctx.userClaims) {
            return jsonResponse({ error: edgeError(EDGE_ERROR_CODES.UNAUTHENTICATED, 'Missing verified session') });
        }

        let body: RemovePlayerBody;
        try {
            body = await req.json();
        } catch {
            return jsonResponse({ error: edgeError(EDGE_ERROR_CODES.BAD_REQUEST, 'Malformed JSON body') });
        }

        const roomCode = typeof body.roomCode === 'string' ? body.roomCode : '';
        const targetPlayerId = typeof body.targetPlayerId === 'string' ? body.targetPlayerId : '';
        if (!roomCode || !targetPlayerId) {
            return jsonResponse({
                error: edgeError(EDGE_ERROR_CODES.BAD_REQUEST, 'roomCode and targetPlayerId are required'),
            });
        }

        // Identity always comes from the verified JWT subject, never the
        // request body - a spoofed id would otherwise let a modified client
        // impersonate the host.
        const playerId = ctx.userClaims.sub;
        const store = createSupabaseRoomStore(ctx.supabaseAdmin);
        const result = await removePlayer(store, { playerId, roomCode, targetPlayerId });
        return jsonResponse(result);
    }),
};
