-- ============================================================
-- LUCAS GAMES — 0041 WALLET LEDGER NUMERIC (remove the bigint wall)
--
-- wallet_transactions.delta was `bigint`, ceiling 9.22 quintillion
-- (9.22 × 10^18). Penny Pinchers banking can realistically push the
-- top player past that in years, not decades, so future-proof the
-- ledger by switching to Postgres `numeric` — arbitrary precision,
-- no ceiling at all (well, 131,072 digits of precision, which is
-- way past any number we'd ever store).
--
-- JS-side picture stays unchanged:
--   · PostgREST returns `numeric` as a string. The wallet helpers
--     in src/lib/db/supabase.ts already coerce via `Number(...)` so
--     the JS layer sees a plain number, same as before.
--   · Past 9 quadrillion JS `number` arithmetic drifts by 1–64 ¢
--     per op — invisible because the named-tier display formatter
--     (`formatAmount`) only renders the leading significant digits.
--   · If precision past 9 quadrillion ever becomes user-visible,
--     swap the JS layer to BigInt (read column as string, parse to
--     BigInt, format via toString). That's a follow-up refactor;
--     it's NOT needed for the storage wall.
--
-- Cascades through:
--   · wallet_balances (view, sums delta)
--   · leaderboard (view, joins wallet_balances)
--   · slots_jackpot_ledger_sum() (function, sums delta with a
--     reason filter) — Postgres won't change a function's return
--     type in place, so the function gets dropped + recreated.
-- ============================================================

drop view if exists leaderboard cascade;
drop view if exists wallet_balances cascade;
drop function if exists public.slots_jackpot_ledger_sum() cascade;

alter table wallet_transactions
  alter column delta type numeric using delta::numeric;

create or replace view wallet_balances as
  select user_id, coalesce(sum(delta), 0)::numeric as balance
  from wallet_transactions
  group by user_id;

create view leaderboard as
  select u.id, u.username, u.avatar_color, u.initials,
         u.equipped_frame, u.equipped_hat,
         b.balance,
         rank() over (order by b.balance desc) as rank
  from users u
  join wallet_balances b on b.user_id = u.id
  where u.is_active
  order by b.balance desc;

grant select on leaderboard to anon;

create function public.slots_jackpot_ledger_sum()
returns numeric
language sql
stable
as $$
  select coalesce(sum(delta), 0)::numeric
  from public.wallet_transactions
  where reason in ('slots_bet', 'slots_jackpot');
$$;

grant execute on function public.slots_jackpot_ledger_sum() to anon, authenticated, service_role;
