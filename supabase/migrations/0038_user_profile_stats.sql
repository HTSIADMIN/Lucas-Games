-- =============================================================
-- user_profile_stats(p_user_id uuid) returns jsonb
--
-- Aggregates all the per-user stats the profile modal needs in a
-- single call. Previously the /api/profile/[userId] route ran four
-- separate selects (wallet_transactions, game_sessions, crash_bets,
-- plinko_drops, mines_games) and aggregated in JS — but Supabase's
-- PostgREST default caps each .select() at 1000 rows. Heavy users
-- with 10k+ ledger entries had their totals + per-game counts
-- silently truncated, making it look like history had vanished.
--
-- Doing the math in SQL bypasses the row cap entirely.
-- =============================================================
create or replace function public.user_profile_stats(p_user_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
with wallet_agg as (
  select
    coalesce(sum(case
      when delta < 0
        and (reason like '%\_bet' escape '\' or reason = 'crash_bet')
      then -delta
      else 0
    end), 0)::bigint as total_bet,
    coalesce(sum(case
      when delta > 0
        and (reason like '%\_win' escape '\'
             or reason like '%\_cashout' escape '\'
             or reason like '%\_settle' escape '\'
             or reason in ('daily_spin', 'crossy_road', 'tip_received'))
      then delta
      else 0
    end), 0)::bigint as total_won,
    coalesce(max(case
      when delta > 0
        and (reason like '%\_win' escape '\'
             or reason like '%\_cashout' escape '\'
             or reason like '%\_settle' escape '\'
             or reason in ('daily_spin', 'crossy_road', 'tip_received'))
      then delta
      else 0
    end), 0)::bigint as biggest_win
  from wallet_transactions
  where user_id = p_user_id
),
sessions_agg as (
  select game,
         count(*)::bigint                       as count,
         coalesce(sum(payout - bet), 0)::bigint as net
  from game_sessions
  where user_id = p_user_id and status = 'settled'
  group by game
),
crash_agg as (
  select 'crash'::text as game,
         count(*)::bigint                       as count,
         coalesce(sum(payout - bet), 0)::bigint as net
  from crash_bets
  where user_id = p_user_id and cashout_at_x is not null
  having count(*) > 0
),
plinko_agg as (
  select 'plinko'::text as game,
         count(*)::bigint                       as count,
         coalesce(sum(payout - bet), 0)::bigint as net
  from plinko_drops
  where user_id = p_user_id
  having count(*) > 0
),
mines_agg as (
  select 'mines'::text as game,
         count(*)::bigint                       as count,
         coalesce(sum(payout - bet), 0)::bigint as net
  from mines_games
  where user_id = p_user_id and status <> 'active'
  having count(*) > 0
),
-- Per-game aggregation matches the original JS route: game_sessions
-- counts EVERY game (including plinko/crash/mines that also have a
-- dedicated table), then crash/plinko/mines tables add on top.
combined as (
  select * from sessions_agg
  union all select * from crash_agg
  union all select * from plinko_agg
  union all select * from mines_agg
),
games_agg as (
  select game,
         sum(count)::bigint as count,
         sum(net)::bigint   as net
  from combined
  group by game
  order by sum(count) desc
)
select jsonb_build_object(
  'totalBet',   (select total_bet  from wallet_agg),
  'totalWon',   (select total_won  from wallet_agg),
  'biggestWin', (select biggest_win from wallet_agg),
  'gamesPlayed',
    coalesce(
      (select jsonb_agg(jsonb_build_object('game', game, 'count', count, 'net', net))
       from games_agg),
      '[]'::jsonb
    )
);
$$;

grant execute on function public.user_profile_stats(uuid) to anon, authenticated, service_role;
