-- ============================================================
-- LUCAS GAMES — 0005 REALTIME + CHAT
-- ============================================================

create table chat_messages (
  id          bigserial primary key,
  user_id     uuid not null references users(id) on delete cascade,
  body        text not null,
  kind        text not null default 'message',  -- 'message' | 'tip' | 'system'
  ref_kind    text,
  ref_id      text,
  created_at  timestamptz not null default now()
);
create index chat_messages_recent_idx on chat_messages (created_at desc);

alter table chat_messages enable row level security;
revoke all on chat_messages from anon;

create or replace view chat_messages_public as
  select m.id, m.user_id, m.body, m.kind, m.ref_kind, m.ref_id, m.created_at,
         u.username, u.avatar_color, u.initials
  from chat_messages m
  join users u on u.id = m.user_id
  order by m.id desc;
grant select on chat_messages_public to anon;

alter publication supabase_realtime add table chat_messages;
alter publication supabase_realtime add table game_sessions;
alter publication supabase_realtime add table wallet_transactions;
