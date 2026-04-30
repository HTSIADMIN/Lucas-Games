-- =============================================================
-- 0024 — SLOTS JACKPOT LEDGER SUM (server-side aggregation)
--
-- The slots Boomtown jackpot pool is derived from
--   STARTING_POOL - sum(delta)
-- across wallet_transactions where reason IN ('slots_bet',
-- 'slots_jackpot'). Pulling the rows via PostgREST .from(...).select()
-- returns at most 1,000 rows by default, so once the wagered total
-- crossed ~1k spins the displayed pool drifted way under the real
-- ledger value (4M displayed when the truth was 134M).
--
-- This function returns the true sum server-side. Called via
-- client().rpc("slots_jackpot_ledger_sum") in src/lib/db/supabase.ts.
-- =============================================================

create or replace function public.slots_jackpot_ledger_sum()
returns bigint
language sql
stable
as $$
  select coalesce(sum(delta), 0)::bigint
  from public.wallet_transactions
  where reason in ('slots_bet', 'slots_jackpot');
$$;

grant execute on function public.slots_jackpot_ledger_sum() to anon, authenticated, service_role;
