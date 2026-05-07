-- ============================================================
-- LUCAS GAMES — 0027 PENNY PINCHERS ACHIEVEMENTS (Phase 3b)
--
-- Persistent record of which achievement ids a player has unlocked.
-- The state endpoint detects newly-met conditions on each fetch
-- and inserts a row + credits the achievement's Bank Token reward.
-- One-shot: no row → newly unlocked; row exists → already paid.
-- ============================================================

create table penny_pinchers_achievements (
  user_id        uuid not null references users(id) on delete cascade,
  achievement_id text not null,
  unlocked_at    timestamptz not null default now(),
  primary key (user_id, achievement_id)
);
create index penny_pinchers_achievements_user_idx on penny_pinchers_achievements (user_id);

alter table penny_pinchers_achievements enable row level security;
