-- =============================================================
-- 0022 — ARCADE HIGHSCORES
--
-- Persistent personal-best scores for Flappy and Crossy Road, plus
-- a settled-by-week reward table that pays the top scorer 10M coins
-- at the end of each week (Mon→Mon UTC, matching clan_seasons).
-- =============================================================

-- Personal bests live on users so the client can show them on
-- mount without scanning game_sessions every page load.
alter table public.users
  add column if not exists flappy_best int not null default 0
    check (flappy_best >= 0),
  add column if not exists crossy_best int not null default 0
    check (crossy_best >= 0);

-- Weekly winner table — one row per game per settled week. Inserted
-- by the lazy-settle helper the first time the leaderboard is read
-- after the previous week ends. The winner gets 10M coins credited
-- via the wallet ledger (refId = "<game>:<week_start>").
create table if not exists public.weekly_score_results (
  game        text not null check (game in ('flappy', 'crossy_road')),
  week_start  date not null,
  top_user_id uuid references public.users(id) on delete set null,
  top_score   int  not null default 0,
  reward      int  not null default 0,
  settled_at  timestamptz not null default now(),
  primary key (game, week_start)
);
create index if not exists idx_wsr_recent
  on public.weekly_score_results (game, week_start desc);

alter table public.weekly_score_results enable row level security;
