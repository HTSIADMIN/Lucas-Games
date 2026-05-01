-- =============================================================
-- 0023 — SNAKE ARCADE
--
-- New free-game tier alongside Flappy + Crossy Road. Score is the
-- snake's length-on-death; longer = bigger payout. Same weekly
-- leaderboard / 10M top-1 settle pattern as the other two arcade
-- games.
-- =============================================================

alter table public.users
  add column if not exists snake_best int not null default 0
    check (snake_best >= 0);

-- Widen the weekly_score_results.game check constraint so the
-- existing weekly settle helper can also store snake winners.
alter table public.weekly_score_results
  drop constraint if exists weekly_score_results_game_check;

alter table public.weekly_score_results
  add constraint weekly_score_results_game_check
  check (game in ('flappy', 'crossy_road', 'snake'));
