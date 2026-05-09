-- =============================================================
-- Widen slot_runs.final_payout from integer (int4) to bigint.
--
-- The Boomtown bonus settle computes
--    payout = coinTotal * TIER_MULTIPLIER[tier] * (bet / 20)
-- which on a 200M+ bet with a near-full screen at tier 3+ produces
-- payouts in the multi-billion range. int4 caps at ~2.1B, so the
-- updateSlotRun call inside /api/games/slots/respin throws once a
-- big-bet bonus tries to end — leaving the run permanently 'active'
-- and the player stuck on the last respin.
--
-- bigint matches the wallet ledger (balance / amount are already
-- bigint everywhere), so widening this column closes the gap.
-- =============================================================
alter table public.slot_runs
  alter column final_payout type bigint
  using final_payout::bigint;
