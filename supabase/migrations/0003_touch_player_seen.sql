-- Plan 02-15: a row-atomic, version-exempt write path for a single
-- `player_seen` entry, used by `heartbeat` and `joinRoom`'s D-01 auto-rejoin
-- branch instead of `withVersionRetry`.
--
-- Two properties of the single UPDATE below are the whole point of this
-- function, and both must survive any future "simplification":
--
--   1. The room's version column is deliberately absent from the SET list.
--      That is what makes this write version-exempt: clients already
--      discard a same-version Realtime delivery via
--      `useRoomSubscription`'s `if (version <= lastAppliedVersionRef.current)
--      return;` filter (T-02-29), so no client-side change is needed - the
--      broadcast still goes out, it is simply dropped before it can reach
--      the reconciliation comparison that produced the false "your move
--      didn't stick" toasts documented in 02-UAT.md.
--
--   2. The `||` merge is evaluated server-side under the row lock, which is
--      what keeps it safe under concurrent writers. A read-then-write from
--      the Edge Function would not be: two heartbeats (D-03 same-identity
--      multi-tab, or two different players beating close together) would
--      each read the same `player_seen`, merge only their own key, and the
--      second write would silently clobber the first - a lost update.
--      Conditioning the write on the row's version does not help either,
--      because neither writer changes that column, so both CAS predicates
--      would still match. Under READ COMMITTED, the second UPDATE blocks on
--      the row lock, then re-evaluates `player_seen || ...` against the
--      freshly committed value, so both merges survive. Do not replace this
--      with a PostgREST read-then-write.
--
-- Not given elevated (definer-style) execution rights: `service_role`
-- already bypasses RLS, so running this with the caller's own invoker
-- privileges buys nothing extra and avoids punching a hole through 0001's
-- deny-all-writes-for-authenticated posture. Execute is revoked from
-- `public`/`anon`/`authenticated` below and granted only to `service_role`,
-- following 0002's local-dev-grant precedent of never assuming a grant
-- exists.
create or replace function public.touch_player_seen(
  p_room_code text,
  p_player_id text,
  p_seen_at text
)
returns setof public.rooms
language sql
as $$
  update public.rooms
  set player_seen = coalesce(player_seen, '{}'::jsonb) || jsonb_build_object(p_player_id, p_seen_at),
      updated_at = now()
  where room_code = p_room_code
  returning *;
$$;

revoke execute on function public.touch_player_seen(text, text, text) from public, anon, authenticated;
grant execute on function public.touch_player_seen(text, text, text) to service_role;
