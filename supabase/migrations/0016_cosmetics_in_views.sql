-- =============================================================
-- 0016 — Expose equipped_frame + equipped_hat through public views
--
-- Chat lines, presence rail, and big-bet feed avatars all need to know
-- a player's equipped frame and hat to render the cosmetics. Extend
-- the two public views that drive those payloads.
-- =============================================================

create or replace view chat_messages_public as
  select m.id, m.user_id, m.body, m.kind, m.ref_kind, m.ref_id, m.created_at,
         u.username, u.avatar_color, u.initials,
         u.equipped_frame, u.equipped_hat
  from chat_messages m
  join users u on u.id = m.user_id
  order by m.id desc;
grant select on chat_messages_public to anon;

create or replace view users_public as
  select id, username, avatar_color, initials, last_seen_at,
         equipped_frame, equipped_hat
  from users
  where is_active;
grant select on users_public to anon;
