-- ============================================================
-- LUCAS GAMES — 0011 MONOPOLY (free hourly earn-back)
-- Roll dice once per hour, advance on a 20-space board, collect
-- the property's payout. Upgrade properties with cards earned
-- from card packs to scale up future payouts.
-- ============================================================

create table monopoly_states (
  user_id      uuid primary key references users(id) on delete cascade,
  position     int not null default 0,
  next_roll_at timestamptz,
  total_rolls  int not null default 0,
  total_earned bigint not null default 0,
  created_at   timestamptz not null default now()
);

create table monopoly_owned (
  user_id     uuid not null references users(id) on delete cascade,
  property_id text not null,
  level       int  not null default 0,
  card_count  int  not null default 0,
  primary key (user_id, property_id)
);
create index monopoly_owned_user_idx on monopoly_owned (user_id);

alter table monopoly_states enable row level security;
alter table monopoly_owned  enable row level security;
