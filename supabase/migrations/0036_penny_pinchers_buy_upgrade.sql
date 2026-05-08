-- ============================================================
-- LUCAS GAMES — 0036 PENNY PINCHERS atomic buy_upgrade RPC
--
-- The previous /api/earn/penny-pinchers/upgrade route did a
-- read-modify-write pair: read state, upsert state with full row
-- (cents reduced), then upsert upgrade row. Two known issues:
--
--   1) Helper PC increments racing in between read and write got
--      clobbered when the route wrote back the stale cents.
--   2) Two non-atomic writes — if the upgrade upsert fails for
--      any transient reason the player loses the cost without
--      gaining a level. Reported in the wild for boardwalk
--      ("debits but doesn't level up").
--
-- pp_buy_upgrade folds both writes into a single PL/pgSQL
-- transaction: atomic decrement on cents (only if affordable)
-- and atomic upsert+increment on the upgrade row. Returns the
-- new cents + level so the route can pass them straight back.
-- ============================================================

create or replace function pp_buy_upgrade(
  p_user_id     uuid,
  p_upgrade_id  text,
  p_cost        bigint
)
returns jsonb
language plpgsql
as $$
declare
  v_cents     bigint;
  v_new_level int;
begin
  -- Atomic debit: only fires when the player has enough cents.
  -- Returns null if insufficient (used as the affordability gate).
  update penny_pinchers_state
  set cents        = cents - p_cost,
      last_tick_at = now()
  where user_id = p_user_id
    and cents >= p_cost
  returning cents into v_cents;

  if v_cents is null then
    return jsonb_build_object('ok', false, 'error', 'insufficient_cents');
  end if;

  -- Either insert at level 1 (new upgrade) or increment the
  -- existing level by 1. Same transaction as the debit, so a
  -- failure here would roll back the cents debit.
  insert into penny_pinchers_upgrades (user_id, upgrade_id, level)
  values (p_user_id, p_upgrade_id, 1)
  on conflict (user_id, upgrade_id)
    do update set level = penny_pinchers_upgrades.level + 1
  returning level into v_new_level;

  return jsonb_build_object(
    'ok', true,
    'cents', v_cents,
    'newLevel', v_new_level
  );
end;
$$;
