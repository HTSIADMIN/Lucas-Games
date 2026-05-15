-- ============================================================
-- LUCAS GAMES — 0045 ACHIEVEMENT SHOWCASE
--
-- Unified view + helper functions so the profile modal can render
-- a "trophies" panel across any game's achievement system.
--
-- Today the only source is `penny_pinchers_achievements`; as other
-- games add their own systems, append their per-game tables here:
--   union all
--     select user_id, 'slots'      as source, achievement_id, unlocked_at
--       from public.slots_achievements
--   union all
--     select user_id, 'blackjack'  as source, achievement_id, unlocked_at
--       from public.blackjack_achievements
-- (and grant select per-table accordingly).
-- ============================================================

create or replace view public.user_achievements as
  select user_id, 'penny_pinchers'::text as source, achievement_id, unlocked_at
    from public.penny_pinchers_achievements;

grant select on public.user_achievements to anon, authenticated, service_role;

create or replace function public.recent_achievements(
  p_user_id uuid,
  p_limit   int default 5
) returns table (source text, achievement_id text, unlocked_at timestamptz)
language sql stable as $$
  select source, achievement_id, unlocked_at
    from public.user_achievements
   where user_id = p_user_id
   order by unlocked_at desc
   limit greatest(1, p_limit);
$$;
grant execute on function public.recent_achievements(uuid, int)
  to anon, authenticated, service_role;

create or replace function public.achievement_count(p_user_id uuid)
returns int language sql stable as $$
  select count(*)::int from public.user_achievements where user_id = p_user_id;
$$;
grant execute on function public.achievement_count(uuid)
  to anon, authenticated, service_role;
