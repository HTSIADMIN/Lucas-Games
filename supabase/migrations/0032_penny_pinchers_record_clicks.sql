-- ============================================================
-- LUCAS GAMES — 0032 PENNY PINCHERS batched click write
--
-- Player clicks were costing one POST + one rpc call apiece. With
-- Auto-Picker bursts and Pinch-Streak frenzies that's easily ~25
-- requests/sec. This function accepts a pre-aggregated batch so
-- the client can queue clicks for ~400ms and flush in a single
-- round-trip.
--
-- p_album_increments shape:
--   {"shiny": {"penny": 3, "nickel": 1}, "sticky": {"penny": 2}}
-- (page → coin → delta). Empty / null is fine — skips the album
-- merge entirely. Keys are caller-validated; we don't try to
-- whitelist them inside the function.
-- ============================================================

create or replace function pp_record_clicks(
  p_user_id           uuid,
  p_pc                bigint,
  p_clicks            int,
  p_album_increments  jsonb,
  p_tick_at           timestamptz
)
returns void
language plpgsql
as $$
declare
  v_album      jsonb;
  outer_rec    record;
  inner_rec    record;
begin
  update penny_pinchers_state
  set
    cents              = cents + p_pc,
    lifetime_clicks    = lifetime_clicks + p_clicks,
    lifetime_pc_earned = lifetime_pc_earned + p_pc,
    last_tick_at       = p_tick_at
  where user_id = p_user_id
  returning coalesce(album, '{}'::jsonb) into v_album;

  if p_album_increments is not null and p_album_increments <> '{}'::jsonb then
    for outer_rec in select key as page_key, value as coins
                     from jsonb_each(p_album_increments) loop
      for inner_rec in select key as coin_key, value as delta_val
                       from jsonb_each(outer_rec.coins) loop
        v_album := jsonb_set(
          v_album,
          array[outer_rec.page_key, inner_rec.coin_key],
          to_jsonb(
            coalesce((v_album->outer_rec.page_key->>inner_rec.coin_key)::int, 0)
            + (inner_rec.delta_val)::text::int
          )
        );
      end loop;
    end loop;
    update penny_pinchers_state set album = v_album where user_id = p_user_id;
  end if;
end;
$$;
