-- =============================================================
-- 0017 — Expose equipped_frame + equipped_hat on the leaderboard view
-- so the leaderboard page can render full cosmetic loadouts.
-- =============================================================

drop view if exists leaderboard;
create view leaderboard as
  select u.id, u.username, u.avatar_color, u.initials,
         u.equipped_frame, u.equipped_hat,
         b.balance,
         rank() over (order by b.balance desc) as rank
  from users u
  join wallet_balances b on b.user_id = u.id
  where u.is_active
  order by b.balance desc;
grant select on leaderboard to anon;
