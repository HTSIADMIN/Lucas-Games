-- ============================================================
-- LUCAS GAMES — 0043 USER WINNINGS WINDOW
--
-- Helper function that aggregates a player's bet / won / net over
-- any window (today, this week, last 7 days, etc). Used by the
-- daily/weekly winnings ticker (chips under the header balance).
--
-- Exclusions list captures EARN-game payouts and admin buckets
-- that shouldn't count toward "competitive risk-based winnings":
--   · signup_bonus / shop / tipping — economic, not gameplay
--   · daily_spin / monopoly / penny_pinchers_bank / flappy /
--     snake / crossy_road / challenge_reward / arcade_upgrade —
--     free / earn-game payouts; would inflate the number without
--     competitive meaning.
--   · clan_chest_open — passive weekly reward
--
-- net = won - bet (mechanically equal to sum(delta) because
-- bet rows are negative deltas in the ledger; we expose all three
-- so the tooltip can show "bet 12M · won 27M · net +15M").
-- ============================================================

create or replace function public.user_winnings_window(
  p_user_id uuid,
  p_since   timestamptz
) returns table (bet numeric, won numeric, net numeric)
language sql stable as $$
  select
    coalesce(sum(case when reason like '%_bet' then -delta else 0 end), 0)::numeric as bet,
    coalesce(sum(case when reason like '%_win'
                       or reason like '%_payout'
                       or reason like '%_cashout'
                       or reason in ('slots_jackpot','slots_bonus_win',
                                     'roulette_settle','roulette_hot_bonus')
                  then delta else 0 end), 0)::numeric as won,
    coalesce(sum(delta), 0)::numeric as net
  from public.wallet_transactions
  where user_id = p_user_id
    and created_at >= p_since
    and reason not in ('signup_bonus','tip_send','tip_received','shop_buy',
                       'shop_pack_open','shop_pack_buy','clan_create',
                       'penny_pinchers_bank','daily_spin','monopoly_roll',
                       'monopoly_pack','monopoly_mystery_pay','monopoly_upgrade',
                       'flappy_score','snake_score','crossy_road_score',
                       'challenge_reward','clan_chest_open','arcade_upgrade');
$$;

grant execute on function public.user_winnings_window(uuid, timestamptz)
  to anon, authenticated, service_role;
