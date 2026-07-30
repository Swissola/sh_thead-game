/**
 * Concrete `RoomStore` implementation backed by a Supabase service-role
 * client.
 *
 * The admin client is taken as a minimal, locally-defined structural type
 * rather than the real `@supabase/supabase-js` generic client type, so this
 * file needs no Deno npm-scheme import specifier and stays type-checked by
 * `npm run build`. The real service-role client satisfies this structurally
 * at the call site inside each Deno wrapper's `index.ts` (excluded from
 * `tsc` - see `tsconfig.app.json`), so there is no loss of runtime type
 * safety.
 */
import type { RoomRow } from '../../../src/supabase/roomTypes.ts';
import type { MoveLogEntry, RoomStore, RoomUpdatePatch } from './db.ts';

interface PostgrestError {
    code?: string;
    message: string;
}

interface SingleResult<T> {
    data: T | null;
    error: PostgrestError | null;
}

interface ArrayResult<T> {
    data: T[] | null;
    error: PostgrestError | null;
}

interface InsertResult {
    error: PostgrestError | null;
}

interface TableClient<Row> {
    select(columns: string): {
        eq(column: string, value: string): {
            single(): Promise<SingleResult<Row>>;
        };
    };
    insert(row: Row): Promise<InsertResult>;
    update(patch: Partial<Row>): {
        eq(column: string, value: string): {
            eq(column: string, value: number): {
                select(): Promise<ArrayResult<Row>>;
            };
        };
    };
}

/** Minimal structural surface this store depends on instead of the full Supabase client type. */
export interface SupabaseAdminClient {
    from(table: 'rooms'): TableClient<RoomRow>;
    from(table: 'moves'): TableClient<MoveLogEntry>;
    rpc(fn: 'touch_player_seen', args: { p_room_code: string; p_player_id: string; p_seen_at: string }): Promise<ArrayResult<RoomRow>>;
}

/** Postgres SQLSTATE for a unique-constraint violation (the `room_code` primary key collision). */
const UNIQUE_VIOLATION = '23505';

/** PostgREST code for ".single() found no matching row" - a plain not-found, not a real error. */
const NO_ROWS_FOUND = 'PGRST116';

export function createSupabaseRoomStore(admin: SupabaseAdminClient): RoomStore {
    return {
        async readRoom(roomCode: string): Promise<RoomRow | null> {
            const { data, error } = await admin.from('rooms').select('*').eq('room_code', roomCode).single();
            if (error) {
                if (error.code === NO_ROWS_FOUND) return null;
                throw new Error(`readRoom failed: ${error.message}`);
            }
            return data;
        },

        async insertRoom(row: RoomRow): Promise<boolean> {
            const { error } = await admin.from('rooms').insert(row);
            if (error) {
                if (error.code === UNIQUE_VIOLATION) return false;
                throw new Error(`insertRoom failed: ${error.message}`);
            }
            return true;
        },

        async updateRoom(roomCode: string, expectedVersion: number, patch: RoomUpdatePatch): Promise<number> {
            const { data, error } = await admin
                .from('rooms')
                .update(patch)
                .eq('room_code', roomCode)
                .eq('version', expectedVersion)
                .select();
            if (error) throw new Error(`updateRoom failed: ${error.message}`);
            return data?.length ?? 0;
        },

        async appendMove(entry: MoveLogEntry): Promise<void> {
            const { error } = await admin.from('moves').insert(entry);
            if (error) throw new Error(`appendMove failed: ${error.message}`);
        },

        async touchPlayerSeen(roomCode: string, playerId: string, seenAt: string): Promise<RoomRow | null> {
            const { data, error } = await admin.rpc('touch_player_seen', {
                p_room_code: roomCode,
                p_player_id: playerId,
                p_seen_at: seenAt,
            });
            if (error) throw new Error(`touchPlayerSeen failed: ${error.message}`);
            return data?.[0] ?? null;
        },

        now(): string {
            return new Date().toISOString();
        },
    };
}
