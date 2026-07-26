-- Phase 2 (MPLAY-01/02/04): the rooms/moves schema and its deny-by-default RLS.
--
-- This migration is the actual MPLAY-04 enforcement mechanism: RLS grants
-- `authenticated` clients read-only access to both tables and creates no
-- write policy at all. The only writer is the service-role client used
-- inside Edge Functions (Wave 3), which bypasses RLS entirely.
--
-- Deliberately no separate "host player id" column: `state->>'host'` (part of
-- the stored GameState jsonb) is the single source of truth for host
-- identity, because `GameState.host` already exists and `LobbyScreen.tsx`
-- renders from it. A mirrored column here would be a second, drift-prone
-- truth.

create table rooms (
  room_code text primary key,
  state jsonb not null,
  version bigint not null default 0,
  turn_started_at timestamptz not null default now(),
  player_seen jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on column rooms.player_seen is
  'playerId -> last-seen ISO timestamp, written only with the server''s now(), never a client-supplied time. Server-verified disconnect signal for D-06/D-07/D-08 - Realtime Presence is ephemeral/client-reported and must not be used for those decisions instead.';

-- Append-only audit log of every applied move, so a disputed/reconciled move
-- (D-11/D-12) can be debugged after the fact.
create table moves (
  id bigint generated always as identity primary key,
  room_code text not null references rooms(room_code) on delete cascade,
  player_id uuid not null,
  move jsonb not null,
  resulting_version bigint not null,
  created_at timestamptz not null default now()
);

-- D-05's lazy timeout sweep looks up in-progress rooms by turn_started_at;
-- a partial index keeps that lookup cheap without indexing finished/lobby rows.
create index rooms_turn_started_at_playing_idx
  on rooms (turn_started_at)
  where (state->>'phase' = 'playing');

-- Realtime: clients subscribe to `rooms` for the authoritative game-state
-- stream (Pattern 1). `moves` is an audit log only - clients never subscribe
-- to it, so it is deliberately not added to the publication. `replica
-- identity full` is not set: this phase's subscription only ever reads
-- `new.state`/`new.version`/`new.turn_started_at`, never `old.*`.
alter publication supabase_realtime add table rooms;

-- RLS is the MPLAY-04 enforcement mechanism - get it exactly right.
alter table rooms enable row level security;
alter table moves enable row level security;

create policy "authenticated can read rooms"
on rooms for select
to authenticated
using (true);
-- `using (true)` deliberately preserves the existing trust posture: the
-- 36^6 room code is the access boundary, same as the localStorage design
-- being replaced (RESEARCH.md Open Question 2, Assumption A4) - not a new
-- gap introduced by this migration.

create policy "authenticated can read moves"
on moves for select
to authenticated
using (true);

-- NO insert, update or delete policy exists for `authenticated` on either
-- table, and none should ever be added. The service-role client used only
-- inside Edge Functions bypasses RLS and is the sole writer. If you are
-- reading this because direct client writes are failing: that failure is
-- the feature, not a bug - route the write through an Edge Function instead
-- of adding a write policy here.
revoke insert, update, delete on rooms, moves from anon, authenticated;
