/**
 * Deno wrapper for room creation. All branching logic lives in
 * `_shared/createRoom.ts` - this file only binds HTTP, auth and the store.
 */
import { withSupabase } from 'npm:@supabase/server';
import { createRoom } from '../_shared/createRoom.ts';
import { createSupabaseRoomStore } from '../_shared/supabaseStore.ts';
import { jsonResponse, edgeError } from '../_shared/respond.ts';
import { EDGE_ERROR_CODES } from '../../../src/supabase/roomTypes.ts';

export default {
    fetch: withSupabase({ auth: 'user' }, async (req, ctx) => {
        if (!ctx.userClaims) {
            return jsonResponse({ error: edgeError(EDGE_ERROR_CODES.UNAUTHENTICATED, 'Missing verified session') });
        }

        let body: { playerName?: unknown };
        try {
            body = await req.json();
        } catch {
            return jsonResponse({ error: edgeError(EDGE_ERROR_CODES.BAD_REQUEST, 'Malformed JSON body') });
        }

        // Identity always comes from the verified JWT subject, never the
        // request body (T-02-13) - a spoofed id would otherwise let a
        // modified client claim to be anyone.
        const playerId = ctx.userClaims.sub;
        const playerName = typeof body.playerName === 'string' ? body.playerName : '';

        const store = createSupabaseRoomStore(ctx.supabaseAdmin);
        const result = await createRoom(store, { playerId, playerName });
        return jsonResponse(result);
    }),
};
