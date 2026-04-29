-- =============================================================
-- 0020 — DAILY CHALLENGES
--
-- Three randomized challenges per user per day. Progress accrues
-- as the player performs actions (debits/credits/game-starts).
-- Completing a challenge grants:
--   * coin reward (credited via wallet)
--   * "challenge points" that flow into the player's clan_members
--     weekly_xp + their clan's total_xp_week
--
-- Clan weekly leaderboard now derives from challenge points only;
-- raw game wins no longer push weekly_xp directly.
-- =============================================================

create table if not exists public.daily_challenges (
  user_id      uuid not null references public.users(id) on delete cascade,
  -- ISO date stamp (YYYY-MM-DD, UTC) the day this challenge belongs to.
  day          date not null,
  -- Slot index 0..2; identifies which of the 3 daily slots this is.
  slot         smallint not null check (slot between 0 and 2),
  -- Challenge id from the catalog (src/lib/challenges/catalog.ts).
  challenge_id text not null,
  -- Goal — copied at roll time so changes to the catalog don't
  -- retroactively alter active challenges.
  goal         int  not null check (goal > 0),
  progress     int  not null default 0 check (progress >= 0),
  -- Per-challenge reward locked in at roll time.
  coin_reward       int  not null default 0,
  challenge_points  int  not null default 0,
  -- Difficulty tag for UI; informational only (easy/medium/hard).
  difficulty   text not null default 'easy',
  completed_at timestamptz,
  claimed_at   timestamptz,
  created_at   timestamptz not null default now(),
  primary key (user_id, day, slot)
);
create index if not exists idx_daily_challenges_user_day
  on public.daily_challenges (user_id, day);

alter table public.daily_challenges enable row level security;
