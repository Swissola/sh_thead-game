/**
 * Deno wrapper for room joining. All branching logic lives in
 * `_shared/joinRoom.ts` - this file only binds HTTP, auth and the store.
 */
import { withSupabase } from 'npm:@supabase/server';
import { joinRoom } from '../_shared/joinRoom.ts';
import { createSupabaseRoomStore } from '../_shared/supabaseStore.ts';
import { jsonResponse, edgeError } from '../_shared/respond.ts';
import { EDGE_ERROR_CODES } from '../../../src/supabase/roomTypes.ts';

export default {
    fetch: withSupabase({ auth: 'user' }, async (req, ctx) => {
        if (!ctx.userClaims) {
            return jsonResponse({ error: edgeError(EDGE_ERROR_CODES.UNAUTHENTICATED, 'Missing verified session') });
        }

        let body: { playerName?: unknown; roomCode?: unknown };
        try {
            body = await req.json();
        } catch {
            return jsonResponse({ error: edgeError(EDGE_ERROR_CODES.BAD_REQUEST, 'Malformed JSON body') });
        }

        // Identity always comes from the verified JWT subject, never the
        // request body (T-02-13) - a spoofed id would otherwise let a
        // modified client claim someone else's seat.
        const playerId = ctx.userClaims.sub;
        const playerName = typeof body.playerName === 'string' ? body.playerName : '';
        const roomCode = typeof body.roomCode === 'string' ? body.roomCode : '';

        const store = createSupabaseRoomStore(ctx.supabaseAdmin);
        const result = await joinRoom(store, { playerId, playerName, roomCode });
        return jsonResponse(result);
    }),
};
