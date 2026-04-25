-- ============================================================
-- LUCAS GAMES — 0002 GAMES CORE
-- Single-game session table (jsonb state) + earn-back cooldowns + leaderboard.
-- ============================================================

create table game_sessions (
  id          uuid primary key default uuid_generate_v4(),
  user_id     uuid not null references users(id) on delete cascade,
  game        text not null,                       -- 'blackjack' | 'slots' | 'dice' | 'coinflip' | 'roulette' | 'daily_spin' | 'crossy_road' | ...
  bet         bigint not null default 0,
  payout      bigint not null default 0,
  state       jsonb not null default '{}'::jsonb,  -- per-game payload
  status      text not null default 'open',        -- 'open' | 'settled' | 'void'
  created_at  timestamptz not null default now(),
  settled_at  timestamptz
);
create index game_sessions_user_idx on game_sessions (user_id, created_at desc);
create index game_sessions_game_idx on game_sessions (game, created_at desc);

create table earn_cooldowns (
  user_id        uuid not null references users(id) on delete cascade,
  kind           text not null,                    -- 'daily_spin' | 'monopoly_roll'
  available_at   timestamptz not null,
  primary key (user_id, kind)
);

create or replace view leaderboard as
  select u.id, u.username, u.avatar_color, u.initials, b.balance,
         rank() over (order by b.balance desc) as rank
  from users u
  join wallet_balances b on b.user_id = u.id
  where u.is_active
  order by b.balance desc;

alter table game_sessions   enable row level security;
alter table earn_cooldowns  enable row level security;
revoke all on game_sessions from anon;
revoke all on earn_cooldowns from anon;
grant select on leaderboard to anon;
