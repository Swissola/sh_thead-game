-- Rule 3 fix, plan 02-13: explicit table-level grants missing locally for
-- both `service_role` and `authenticated`.
--
-- `0001_rooms_and_rls.sql` enabled RLS, created `authenticated`-only SELECT
-- policies, and revoked write access from `anon`/`authenticated`, on the
-- assumption that the base table-level GRANTs those policies and
-- `service_role`'s writes depend on already exist. That assumption held on
-- the hosted platform (which pre-configures default privileges on every
-- table in `public` for `anon`/`authenticated`/`service_role`) but not on
-- the local Postgres image, which does not. An RLS policy only decides
-- *which rows* a role may see once it is already allowed to touch the
-- table at all; `BYPASSRLS` similarly only skips row-level policies. Both
-- sit downstream of Postgres's separate, more basic table-level GRANT
-- check, which was never satisfied locally for either role. Without this:
--   - every write (`create-room`, `join-room`, `start-game`, `apply-move`,
--     `check-turn-timeout`, `remove-player`, `heartbeat`) failed locally
--     with "permission denied for table rooms" even though the caller
--     correctly held role `service_role`
--   - every authenticated client-side SELECT (including the moves-audit
--     read-back this plan's Task 2 performs) failed identically with
--     "permission denied for table rooms"/"...moves", even though the
--     "authenticated can read rooms"/"...moves" policies were exactly
--     right
-- Both discovered running plan 02-13's smoke suite for real against
-- `supabase functions serve`, which no static check
-- (`scripts/check-edge-wrappers.mjs`) could have caught.
--
-- Scoped to exactly the operations each role actually performs:
-- `service_role` (via `supabase/functions/_shared/db.ts`'s `RoomStore`)
-- reads/inserts/updates `rooms` (never deletes - D-04, a seat is never
-- freed) and reads/inserts `moves`; `authenticated` only ever reads either
-- table, matching the read-only policies already in place.
grant select, insert, update on rooms to service_role;
grant select, insert on moves to service_role;
grant select on rooms to authenticated;
grant select on moves to authenticated;
