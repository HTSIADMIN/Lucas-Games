-- ============================================================
-- LUCAS GAMES — 0048 GAME ACHIEVEMENTS
--
-- Unified achievements table for every casino game + cross-game
-- "meta" milestones. Penny Pinchers keeps its own table
-- (penny_pinchers_achievements, migration 0027) for back-compat
-- with the existing PP detection path; new sources land here.
--
-- One row per (user, source, achievement_id). Primary key conflict
-- on duplicate-unlock is silently swallowed by the application
-- helper (see unlockAchievements in src/lib/achievements/db.ts),
-- so achievements are one-shot by construction.
--
-- `source` namespaces the achievement ids so two games can both
-- have e.g. a `first_win` without colliding. Catalog files in
-- src/lib/achievements/catalogs/<source>.ts mirror this convention.
-- ============================================================

create table public.game_achievements (
  user_id        uuid not null references public.users(id) on delete cascade,
  -- Game slug ("slots", "blackjack", "coinflip", ...) or "meta"
  -- for cross-game milestones.
  source         text not null,
  achievement_id text not null,
  unlocked_at    timestamptz not null default now(),
  primary key (user_id, source, achievement_id)
);
create index game_achievements_user_idx
  on public.game_achievements (user_id, unlocked_at desc);
alter table public.game_achievements enable row level security;

-- Replace the user_achievements view with one that includes the new
-- table. The PP table stays as a separate UNION source.
create or replace view public.user_achievements as
  select user_id, 'penny_pinchers'::text as source, achievement_id, unlocked_at
    from public.penny_pinchers_achievements
  union all
  select user_id, source, achievement_id, unlocked_at
    from public.game_achievements;

grant select on public.user_achievements to anon, authenticated, service_role;
