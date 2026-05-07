-- ============================================================
-- LUCAS GAMES — 0030 PENNY PINCHERS atomic click write
--
-- The previous click flow was a read-modify-write upsert: each
-- in-flight POST read state.album, mutated it in JS, then wrote
-- it back. Under concurrent clicks (Auto-Picker, Pinch Streak
-- bursts, Frenzy spawns) every later write clobbered the album
-- updates from earlier ones — most visibly: trait coins picked
-- up by Auto-Picker never landed in the Coin Album.
--
-- pp_record_click does the increment server-side in one
-- statement so concurrent calls all add up.
-- ============================================================

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
begin
  if p_album_page is not null and p_album_coin is not null then
    update penny_pinchers_state
    set
      cents              = cents + p_pc,
      lifetime_clicks    = lifetime_clicks + 1,
      lifetime_pc_earned = lifetime_pc_earned + p_pc,
      last_tick_at       = p_tick_at,
      album = jsonb_set(
        coalesce(album, '{}'::jsonb),
        array[p_album_page, p_album_coin],
        to_jsonb(
          coalesce((album->p_album_page->>p_album_coin)::int, 0) + 1
        )
      )
    where user_id = p_user_id;
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
