-- ============================================================
-- LUCAS GAMES — 0046 WIDEN MONEY COLUMNS TO NUMERIC
--
-- Migration 0041 widened `wallet_transactions.delta` from bigint
-- to numeric so the wallet ledger has effectively no ceiling. But
-- the per-game bet / payout columns and the Penny Pinchers state
-- columns stayed `bigint`. At ~$9.22 quintillion (2^63) those
-- columns reject the insert/upsert with a 400, even though the
-- player's wallet balance is comfortably past it.
--
-- Symptom: a sextillion-balance player can't place any bet that
-- pushes a bigint column past its limit. The wallet_transactions
-- insert lands fine (numeric column), but the companion
-- game_sessions / crash_bets / blackjack_seats / coinflip_duels /
-- slot_runs / penny_pinchers_state row fails — 500 response from
-- the route as the transaction unwinds.
--
-- Fix: alter every money-flavored column to numeric so they match
-- the wallet ledger storage. JS read paths in src/lib/db/supabase.ts
-- already coerce the column value via `Number(...)` where needed
-- (PostgREST returns numeric as a string to preserve precision).
--
-- Side benefits:
--   · slot_runs.bet was `integer` (32-bit max 2.14B) — even players
--     in the millions could trip the bonus-trigger path and fail.
--     Now numeric.
--   · penny_pinchers_state.daily_banked_cents was also int.
--     Promoted for the same reason.
--   · int → numeric on prestige_count / bank_tokens for paranoid
--     consistency. bank_tokens at 78M today is 3.6% of int32 max —
--     not urgent, but cheap to widen now.
--
-- No data loss: numeric is a superset of bigint and int. The
-- alter-with-USING coerces existing rows in place.
-- ============================================================

-- game_sessions: bet / payout
alter table public.game_sessions
  alter column bet    type numeric using bet::numeric,
  alter column payout type numeric using payout::numeric;

-- crash_bets: bet / payout
alter table public.crash_bets
  alter column bet    type numeric using bet::numeric,
  alter column payout type numeric using payout::numeric;

-- blackjack_seats: bet (and payout if present)
alter table public.blackjack_seats
  alter column bet type numeric using bet::numeric;

-- Some deployments have a `payout` column on blackjack_seats; widen
-- it too if it exists. Guarded so the migration is idempotent on
-- environments without it.
do $$
begin
  if exists (
    select 1 from information_schema.columns
     where table_schema = 'public'
       and table_name   = 'blackjack_seats'
       and column_name  = 'payout'
       and data_type    in ('bigint', 'integer')
  ) then
    execute 'alter table public.blackjack_seats alter column payout type numeric using payout::numeric';
  end if;
end $$;

-- coinflip_duels: wager
alter table public.coinflip_duels
  alter column wager type numeric using wager::numeric;

-- slot_runs: bet (was int, max 2.14B!) + final_payout
alter table public.slot_runs
  alter column bet          type numeric using bet::numeric,
  alter column final_payout type numeric using final_payout::numeric;

-- penny_pinchers_state: cents + lifetime_* + daily_banked_cents +
-- bank_tokens / prestige_count for consistency.
alter table public.penny_pinchers_state
  alter column cents                 type numeric using cents::numeric,
  alter column lifetime_clicks       type numeric using lifetime_clicks::numeric,
  alter column lifetime_pc_earned    type numeric using lifetime_pc_earned::numeric,
  alter column lifetime_banked_cents type numeric using lifetime_banked_cents::numeric,
  alter column daily_banked_cents    type numeric using daily_banked_cents::numeric,
  alter column prestige_count        type numeric using prestige_count::numeric,
  alter column bank_tokens           type numeric using bank_tokens::numeric;
