/**
 * Deno wrapper for room creation. All branching logic lives in
 * `_shared/createRoom.ts` - this file only binds HTTP, auth and the store.
 */
import { withSupabase } from 'npm:@supabase/server';
import { createRoom } from '../_shared/createRoom.ts';
import { createSupabaseRoomStore } from '../_shared/supabaseStore.ts';
import { jsonResponse, edgeError } from '../_shared/respond.ts';
import { localSecretKeyOverride } from '../_shared/envCompat.ts';
import { EDGE_ERROR_CODES } from '../../../src/supabase/roomTypes.ts';

export default {
    fetch: withSupabase({ auth: 'user', env: localSecretKeyOverride() }, async (req, ctx) => {
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
        // modified client claim to be anyone. `ctx.userClaims` is
        // `@supabase/server`'s normalised camelCase view of the JWT claims,
        // which maps the raw `sub` claim to `.id` (not `.sub` - that only
        // exists on the raw `ctx.jwtClaims`). Discovered running plan
        // 02-13's smoke suite for real: `.sub` here silently evaluated to
        // `undefined`, producing a room with no player id at all.
        const playerId = ctx.userClaims.id;
        const playerName = typeof body.playerName === 'string' ? body.playerName : '';

        const store = createSupabaseRoomStore(ctx.supabaseAdmin);
        const result = await createRoom(store, { playerId, playerName });
        return jsonResponse(result);
    }),
};
