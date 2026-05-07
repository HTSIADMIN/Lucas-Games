-- ============================================================
-- LUCAS GAMES — 0034 PENNY PINCHERS album init fix
--
-- jsonb_set is documented to "create the missing item" but only
-- for the LAST path component — if any intermediate object key
-- is missing, the call silently no-ops. The album functions
-- (pp_record_click and pp_record_clicks) both walked into this
-- trap: a fresh album of `{}` would never gain a `bent`/`cursed`/
-- `ancient` page even after picking those traits up, because
-- `jsonb_set('{}', '{bent,penny}', '1')` returns `{}` unchanged.
-- (It happened to work for shiny/sticky/foreign by sheer luck —
-- those keys had been seeded before.)
--
-- Fix: ensure the page-level object exists before writing leaves.
-- Backfill: same idea applied once to existing rows so the next
-- click of any rare trait can land on a real parent key.
-- ============================================================

-- Backfill: every state row gets all six page keys so the next
-- pickup of any trait lands somewhere. Existing keys are kept.
update penny_pinchers_state
set album = coalesce(album, '{}'::jsonb)
            || jsonb_build_object(
                 'shiny',   coalesce(album->'shiny',   '{}'::jsonb),
                 'sticky',  coalesce(album->'sticky',  '{}'::jsonb),
                 'foreign', coalesce(album->'foreign', '{}'::jsonb),
                 'bent',    coalesce(album->'bent',    '{}'::jsonb),
                 'cursed',  coalesce(album->'cursed',  '{}'::jsonb),
                 'ancient', coalesce(album->'ancient', '{}'::jsonb)
               );

-- Single-click rpc rewrite: ensure parent page key exists, then set leaf.
create or replace function pp_record_click(
  p_user_id     uuid,
  p_pc          bigint,
  p_album_page  text,
  p_album_coin  text,
  p_tick_at     timestamptz
)
returns void
language plpgsql
as $$
declare
  v_album jsonb;
begin
  if p_album_page is not null and p_album_coin is not null then
    update penny_pinchers_state
    set
      cents              = cents + p_pc,
      lifetime_clicks    = lifetime_clicks + 1,
      lifetime_pc_earned = lifetime_pc_earned + p_pc,
      last_tick_at       = p_tick_at
    where user_id = p_user_id
    returning coalesce(album, '{}'::jsonb) into v_album;

    if not (v_album ? p_album_page) then
      v_album := jsonb_set(v_album, array[p_album_page], '{}'::jsonb);
    end if;
    v_album := jsonb_set(
      v_album,
      array[p_album_page, p_album_coin],
      to_jsonb(coalesce((v_album->p_album_page->>p_album_coin)::int, 0) + 1)
    );
    update penny_pinchers_state set album = v_album where user_id = p_user_id;
  else
    update penny_pinchers_state
    set
      cents              = cents + p_pc,
      lifetime_clicks    = lifetime_clicks + 1,
      lifetime_pc_earned = lifetime_pc_earned + p_pc,
      last_tick_at       = p_tick_at
    where user_id = p_user_id;
  end if;
end;
$$;

-- Batched rpc rewrite: same fix, applied per outer (page) record.
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
      -- Ensure the page-level object exists before any leaf set —
      -- jsonb_set won't auto-create intermediate keys.
      if not (v_album ? outer_rec.page_key) then
        v_album := jsonb_set(v_album, array[outer_rec.page_key], '{}'::jsonb);
      end if;
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
