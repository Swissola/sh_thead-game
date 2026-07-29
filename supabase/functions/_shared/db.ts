/**
 * RoomStore port and the withVersionRetry optimistic-concurrency helper.
 *
 * RoomStore is the narrow interface every Edge Function operation depends on
 * instead of a concrete Supabase client, so this retry/compute logic is
 * unit-testable in Vitest without a Deno runtime or a live database
 * (src/__tests__/edge/db.test.ts uses an in-memory fake implementing it).
 */
import type { GameState } from '../../../src/types.ts';
import type { EdgeError, EdgeResult, RoomRow } from '../../../src/supabase/roomTypes.ts';
import { EDGE_ERROR_CODES } from '../../../src/supabase/roomTypes.ts';

/** A single row appended to the `moves` audit table (T-02-09). */
export interface MoveLogEntry {
    room_code: string;
    player_id: string;
    move: unknown;
    resulting_version: number;
}

/** Fields `withVersionRetry` writes back on a successful update. */
export interface RoomUpdatePatch {
    state: GameState;
    version: number;
    updated_at: string;
    turn_started_at?: string;
    player_seen?: Record<string, string>;
}

/**
 * Narrow port every Edge Function operation depends on instead of a concrete
 * Supabase client.
 */
export interface RoomStore {
    readRoom(roomCode: string): Promise<RoomRow | null>;
    /** Returns false on a unique-violation collision (room_code already exists). */
    insertRoom(row: RoomRow): Promise<boolean>;
    /** Conditioned on the row's current version; returns the affected row count (0 or 1). */
    updateRoom(roomCode: string, expectedVersion: number, patch: RoomUpdatePatch): Promise<number>;
    appendMove(entry: MoveLogEntry): Promise<void>;
    /**
     * Merges a single `player_seen[playerId] = seenAt` entry, row-atomically,
     * without touching the room's version. Version-exempt by design:
     * `withVersionRetry` above remains the only version-bumping write path -
     * this member exists specifically for callers (heartbeat, joinRoom's D-01
     * auto-rejoin) whose write does not change `state` and must not be
     * mistaken for one by a client's reconciliation check. Returns the
     * updated row, or `null` if no room matched `roomCode`.
     */
    touchPlayerSeen(roomCode: string, playerId: string, seenAt: string): Promise<RoomRow | null>;
    /** Server clock as an ISO string - never a client-supplied timestamp. */
    now(): string;
}

/** What `compute` returns on success: the next state plus any optional server-set fields. */
export interface ComputeSuccess {
    state: GameState;
    turnStartedAt?: string;
    playerSeen?: Record<string, string>;
}

export type ComputeResult = ComputeSuccess | EdgeError;

/** Optional audit-log context; when supplied, a successful write is also appended to `moves`. */
export interface VersionRetryOptions {
    playerId: string;
    move: unknown;
}

/** Maximum read-compute-write attempts before withVersionRetry gives up with CONFLICT. */
export const MAX_WRITE_ATTEMPTS = 3;

function isComputeSuccess(result: ComputeResult): result is ComputeSuccess {
    return 'state' in result;
}

/**
 * Reads the room, runs `compute(row)`, and writes the result conditioned on
 * the row's current version. Zero affected rows means a concurrent writer won
 * the race (D-03's multi-tab case, or D-05's auto-pickup racing a live
 * reconnect move) - re-read and recompute, up to MAX_WRITE_ATTEMPTS attempts,
 * then resolve to an EdgeError with code CONFLICT.
 */
export async function withVersionRetry(
    store: RoomStore,
    roomCode: string,
    compute: (row: RoomRow) => ComputeResult | Promise<ComputeResult>,
    options?: VersionRetryOptions
): Promise<EdgeResult> {
    for (let attempt = 0; attempt < MAX_WRITE_ATTEMPTS; attempt++) {
        const row = await store.readRoom(roomCode);
        if (!row) {
            return { error: { code: EDGE_ERROR_CODES.ROOM_NOT_FOUND, message: `Room ${roomCode} not found` } };
        }

        const result = await compute(row);
        if (!isComputeSuccess(result)) {
            return { error: result };
        }

        const nextVersion = row.version + 1;
        const turnStartedAt = result.turnStartedAt ?? row.turn_started_at;
        const playerSeen = result.playerSeen ?? row.player_seen;

        const affected = await store.updateRoom(roomCode, row.version, {
            state: result.state,
            version: nextVersion,
            updated_at: store.now(),
            turn_started_at: turnStartedAt,
            player_seen: playerSeen,
        });

        if (affected > 0) {
            if (options) {
                await store.appendMove({
                    room_code: roomCode,
                    player_id: options.playerId,
                    move: options.move,
                    resulting_version: nextVersion,
                });
            }
            return {
                room: {
                    roomCode,
                    state: result.state,
                    version: nextVersion,
                    turnStartedAt,
                    playerSeen,
                },
            };
        }
        // affected === 0: a concurrent writer won the race - loop to re-read and recompute.
    }

    return {
        error: {
            code: EDGE_ERROR_CODES.CONFLICT,
            message: `Could not update room ${roomCode} after ${MAX_WRITE_ATTEMPTS} attempts`,
        },
    };
}
