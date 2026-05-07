-- ============================================================
-- LUCAS GAMES — 0035 ARCADE earn-rate upgrades
--
-- Lets players spend wallet ¢ to permanently buy a multiplier on
-- the score-to-cents conversion in the three arcade earn games:
-- crossy_road, flappy, snake. Five levels per game; each level
-- adds +25% on the payout.
--
--   level 0 →  1.00× (default)
--   level 1 →  1.25×  (cost 1,000 ¢)
--   level 2 →  1.50×  (cost 2,500 ¢)
--   level 3 →  1.75×  (cost 6,000 ¢)
--   level 4 →  2.00×  (cost 15,000 ¢)
--   level 5 →  2.25×  (cost 40,000 ¢)
--
-- One row per (user, game). Submit routes look up the level and
-- multiply the raw payout before the per-run cap is applied.
-- ============================================================

create table if not exists arcade_upgrades (
  user_id uuid not null references users(id) on delete cascade,
  game    text not null check (game in ('crossy_road', 'flappy', 'snake')),
  level   int  not null default 0 check (level >= 0 and level <= 5),
  primary key (user_id, game)
);

create index if not exists arcade_upgrades_user_idx
  on arcade_upgrades (user_id);
