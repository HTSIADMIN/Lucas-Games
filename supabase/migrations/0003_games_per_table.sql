-- ============================================================
-- LUCAS GAMES — 0003 PER-GAME TABLES
-- Games where state is too rich for jsonb or needs cross-user joins:
-- crash, plinko, mines, poker.
-- ============================================================

-- ===== CRASH =====
create table crash_rounds (
  id           uuid primary key default uuid_generate_v4(),
  seed         text not null,
  crash_at_x   numeric(10,4) not null,
  started_at   timestamptz,
  ended_at     timestamptz,
  status       text not null default 'pending'    -- 'pending' | 'running' | 'crashed'
);
create index crash_rounds_status_idx on crash_rounds (status, started_at desc);

create table crash_bets (
  id              bigserial primary key,
  round_id        uuid not null references crash_rounds(id) on delete cascade,
  user_id         uuid not null references users(id) on delete cascade,
  bet             bigint not null,
  cashout_at_x    numeric(10,4),
  payout          bigint not null default 0,
  placed_at       timestamptz not null default now(),
  cashed_out_at   timestamptz,
  unique (round_id, user_id)
);

-- ===== PLINKO =====
create table plinko_drops (
  id           uuid primary key default uuid_generate_v4(),
  user_id      uuid not null references users(id) on delete cascade,
  bet          bigint not null,
  rows         int not null,
  risk         text not null,                       -- 'low' | 'med' | 'high'
  bucket       int not null,
  multiplier   numeric(8,4) not null,
  payout       bigint not null,
  seed         text not null,
  created_at   timestamptz not null default now()
);
create index plinko_drops_user_idx on plinko_drops (user_id, created_at desc);

-- ===== MINES =====
create table mines_games (
  id                  uuid primary key default uuid_generate_v4(),
  user_id             uuid not null references users(id) on delete cascade,
  bet                 bigint not null,
  mine_count          int not null,
  layout              text not null,                 -- 25-char string of 'm'/'-' (server-only, never sent)
  revealed            text not null default '-------------------------',
  status              text not null default 'active', -- 'active' | 'busted' | 'cashed'
  current_multiplier  numeric(8,4) not null default 1.0000,
  payout              bigint not null default 0,
  created_at          timestamptz not null default now(),
  ended_at            timestamptz
);
create index mines_games_user_status_idx on mines_games (user_id, status);

-- ===== POKER =====
create table poker_tables (
  id            uuid primary key default uuid_generate_v4(),
  name          text not null,
  small_blind   bigint not null,
  big_blind     bigint not null,
  max_seats     int not null default 6,
  created_at    timestamptz not null default now()
);

create table poker_seats (
  table_id      uuid not null references poker_tables(id) on delete cascade,
  seat_no       int not null,
  user_id       uuid references users(id) on delete set null,
  stack         bigint not null default 0,
  sitting_out   boolean not null default false,
  primary key (table_id, seat_no)
);

create table poker_hands (
  id            uuid primary key default uuid_generate_v4(),
  table_id      uuid not null references poker_tables(id) on delete cascade,
  hand_no       bigserial,
  state         jsonb not null,
  status        text not null default 'active',     -- 'active' | 'complete'
  created_at    timestamptz not null default now(),
  completed_at  timestamptz
);

-- Public-safe views for Realtime
create or replace view crash_current as
  select id, status, started_at,
         case when status = 'crashed' then crash_at_x else null end as crash_at_x
  from crash_rounds
  where status in ('pending', 'running', 'crashed')
  order by started_at desc nulls last
  limit 1;

create or replace view poker_table_public as
  select t.id as table_id, t.name, t.small_blind, t.big_blind,
         s.seat_no, u.id as user_id, u.username, u.avatar_color, u.initials,
         s.stack, s.sitting_out
  from poker_tables t
  left join poker_seats s on s.table_id = t.id
  left join users u on u.id = s.user_id;

alter table crash_rounds   enable row level security;
alter table crash_bets     enable row level security;
alter table plinko_drops   enable row level security;
alter table mines_games    enable row level security;
alter table poker_tables   enable row level security;
alter table poker_seats    enable row level security;
alter table poker_hands    enable row level security;

revoke all on crash_rounds, crash_bets, plinko_drops, mines_games,
              poker_tables, poker_seats, poker_hands from anon;

grant select on crash_current      to anon;
grant select on poker_table_public to anon;
