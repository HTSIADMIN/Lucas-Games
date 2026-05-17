-- ============================================================
-- LUCAS GAMES — 0047 USER XP INPUTS
--
-- Single read for everything the XP/level system cares about:
--   · games_played     — count of settled game_sessions
--   · play_seconds     — sum of session durations across all
--                        user_sessions rows
--                        (coalesce(last_active_at, issued_at) - issued_at)
--   · achievements_unlocked — count via the existing user_achievements view
--
-- XP is then computed in JS via xpFromActivity() in src/lib/xp.ts.
-- The level system used to reward big-coin net wins; the new system
-- rewards SHOWING UP — playing games + spending time — and (future)
-- earning achievements.
-- ============================================================

create or replace function public.user_xp_inputs(p_user_id uuid)
returns jsonb language sql stable as $$
  select jsonb_build_object(
    'games_played', (
      select coalesce(count(*), 0)::int
        from public.game_sessions
       where user_id = p_user_id
         and status = 'settled'
    ),
    'play_seconds', (
      select coalesce(
        floor(extract(epoch from sum(
          greatest(
            coalesce(last_active_at, issued_at) - issued_at,
            interval '0'
          )
        ))),
        0
      )::int
        from public.user_sessions
       where user_id = p_user_id
    ),
    'achievements_unlocked', (
      select coalesce(count(*), 0)::int
        from public.user_achievements
       where user_id = p_user_id
    )
  );
$$;

grant execute on function public.user_xp_inputs(uuid) to anon, authenticated, service_role;
