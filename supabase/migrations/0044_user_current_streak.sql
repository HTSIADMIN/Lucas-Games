-- ============================================================
-- LUCAS GAMES — 0044 USER CURRENT STREAK
--
-- Returns the current "hot streak" for a user — the number of
-- consecutive RNG-game wins from the most recent settled session,
-- stopping at the first loss. Pushes (payout == bet) are skipped
-- (neither extend nor break a streak). Earn-game payouts (Daily
-- Spin, Monopoly, Flappy, Snake, Crossy Road, Penny Pinchers) don't
-- count — only risk-based wins.
--
-- A streak < 3 doesn't surface in the UI; the function still
-- returns the raw integer so the consumer can decide. Capped at
-- the most-recent 50 sessions so the scan stays tiny even for
-- huge-grinder accounts.
--
-- Plus `current_streaks_for(p_user_ids uuid[])` — batch variant
-- used by the LiveProvider to enrich a presence/feed payload with
-- per-user streak in one query.
-- ============================================================

create or replace function public.current_streak(p_user_id uuid)
returns int language plpgsql stable as $$
declare
  r record;
  cnt int := 0;
begin
  for r in
    select bet, payout
      from public.game_sessions
     where user_id = p_user_id
       and status = 'settled'
       and game in (
         'slots','blackjack','blackjack-mp','coinflip','coinflip-duel',
         'crash','dice','mines','plinko','poker','roulette','scratch'
       )
     order by coalesce(settled_at, created_at) desc
     limit 50
  loop
    if r.payout > r.bet then
      cnt := cnt + 1;
    elsif r.payout = r.bet then
      -- push: doesn't extend, doesn't break
      continue;
    else
      -- loss breaks the streak
      exit;
    end if;
  end loop;
  return cnt;
end;
$$;

grant execute on function public.current_streak(uuid) to anon, authenticated, service_role;

-- Batch helper — call once with an array of user ids, get a
-- {user_id, length} row per user. Cheaper than N separate RPCs
-- when enriching a presence-strip or feed payload.
create or replace function public.current_streaks_for(p_user_ids uuid[])
returns table (user_id uuid, length int)
language sql stable as $$
  select uid as user_id, public.current_streak(uid) as length
  from unnest(p_user_ids) as uid;
$$;

grant execute on function public.current_streaks_for(uuid[])
  to anon, authenticated, service_role;
