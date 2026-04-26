-- =============================================================
-- 0018 — CLANS V1
--
-- Tables:
--   clans              — one row per clan (name, tag, animal icon, weekly XP)
--   clan_members       — membership; one row per user (unique user_id => one clan per user)
--   clan_seasons       — weekly windows for ranking; lazy-settled
--   clan_season_results — settled rankings per season (top N saved)
--   clan_chests        — pending unopened reward chests for top-clan members
--
-- Plus a `bonus_spin_tokens` int on users so the daily-spin chest reward
-- can grant an extra free spin that bypasses the cooldown.
-- =============================================================

create table if not exists public.clans (
  id            uuid primary key default gen_random_uuid(),
  name          text not null unique check (char_length(name) between 2 and 20),
  tag           text not null check (char_length(tag) between 2 and 4),
  animal_icon   text not null check (animal_icon in
                  ('wolf','bear','eagle','snake','bull','coyote','hawk','stag')),
  founder_id    uuid not null references public.users(id) on delete cascade,
  member_count  int  not null default 1 check (member_count >= 0 and member_count <= 8),
  total_xp_week bigint not null default 0,
  created_at    timestamptz not null default now()
);

create table if not exists public.clan_members (
  clan_id    uuid not null references public.clans(id) on delete cascade,
  user_id    uuid not null references public.users(id) on delete cascade,
  role       text not null default 'member' check (role in ('leader', 'member')),
  weekly_xp  bigint not null default 0,
  joined_at  timestamptz not null default now(),
  primary key (clan_id, user_id),
  unique (user_id)
);
create index if not exists idx_clan_members_user on public.clan_members (user_id);

create table if not exists public.clan_seasons (
  id          uuid primary key default gen_random_uuid(),
  week_start  timestamptz not null unique,
  week_end    timestamptz not null,
  status      text not null default 'active' check (status in ('active', 'settled')),
  created_at  timestamptz not null default now()
);

create table if not exists public.clan_season_results (
  season_id  uuid not null references public.clan_seasons(id) on delete cascade,
  clan_id    uuid not null references public.clans(id) on delete cascade,
  rank       int  not null,
  total_xp   bigint not null,
  primary key (season_id, clan_id)
);

create table if not exists public.clan_chests (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references public.users(id) on delete cascade,
  season_id   uuid not null references public.clan_seasons(id) on delete cascade,
  rank        int  not null,
  tier        text not null check (tier in ('rare', 'epic', 'legendary')),
  opened_at   timestamptz,
  rewards     jsonb,
  created_at  timestamptz not null default now()
);
create index if not exists idx_clan_chests_user_unopened
  on public.clan_chests (user_id) where opened_at is null;

alter table public.users
  add column if not exists bonus_spin_tokens int not null default 0
  check (bonus_spin_tokens >= 0);

alter table public.clans               enable row level security;
alter table public.clan_members        enable row level security;
alter table public.clan_seasons        enable row level security;
alter table public.clan_season_results enable row level security;
alter table public.clan_chests         enable row level security;
