-- ============================================================
-- LUCAS GAMES — 0042 USERS CHAMPION-SINCE
--
-- Tracks when the rank-1 player took the throne, so the catch-me
-- chip / champion-state badge can say "holding #1 for 3d / 12h /
-- 47m". Updated by a server-side helper (bumpChampionSince) on
-- every snapshot poll: when the rank-1 user id changes, the new
-- champion's column is stamped to now() and the previous champion's
-- column is cleared.
--
-- Trade-off considered:
--   · Lazy server tracking → no scheduled job; updates only when
--     somebody actually polls the snapshot. That's fine because
--     champion-state UI only matters while a player is online.
-- ============================================================

alter table public.users
  add column if not exists champion_since timestamptz;

-- Indexed sparsely — only the lone non-null row matters (the
-- current champion's record).
create index if not exists idx_users_champion_since
  on public.users (champion_since)
  where champion_since is not null;
