-- ============================================================
-- LUCAS GAMES — 0001 INIT
-- Identity + sessions + wallet ledger.
-- ============================================================

create extension if not exists pgcrypto;
create extension if not exists "uuid-ossp";

-- ===== users (avatar-grid sign-in identity) =====
create table users (
  id            uuid primary key default uuid_generate_v4(),
  username      text not null unique,
  avatar_color  text not null default 'var(--gold-300)',
  initials      text not null,
  pin_hash      text not null,
  created_at    timestamptz not null default now(),
  last_seen_at  timestamptz,
  is_active     boolean not null default true
);
create index users_username_lower_idx on users (lower(username));

-- ===== user_sessions (JWT jti tracking for revocation) =====
create table user_sessions (
  jti          uuid primary key,
  user_id      uuid not null references users(id) on delete cascade,
  issued_at    timestamptz not null default now(),
  expires_at   timestamptz not null,
  revoked      boolean not null default false
);
create index user_sessions_user_idx on user_sessions (user_id);

-- ===== pin_attempts (rate-limit brute force) =====
create table pin_attempts (
  user_id           uuid primary key references users(id) on delete cascade,
  count             int not null default 0,
  window_started_at timestamptz not null default now()
);

-- ===== wallet_transactions (append-only ledger) =====
create table wallet_transactions (
  id          bigserial primary key,
  user_id     uuid not null references users(id) on delete cascade,
  delta       bigint not null,                 -- +credit / -debit, in coins
  reason      text not null,                   -- 'signup_bonus' | 'bet' | 'win' | 'shop_purchase' | 'daily_spin' | etc.
  ref_kind    text,                            -- 'blackjack' | 'crash' | 'shop' | ...
  ref_id      text,                            -- session/round id
  created_at  timestamptz not null default now()
);
create index wallet_tx_user_idx on wallet_transactions (user_id, created_at desc);
create unique index wallet_tx_idem on wallet_transactions (ref_kind, ref_id) where ref_id is not null;

create or replace view wallet_balances as
  select user_id, coalesce(sum(delta), 0)::bigint as balance
  from wallet_transactions
  group by user_id;

-- ===== public-safe view for sign-in screen =====
create or replace view users_public as
  select id, username, avatar_color, initials, last_seen_at
  from users
  where is_active;

-- ===== RLS: lock everything; service role bypasses =====
alter table users               enable row level security;
alter table user_sessions       enable row level security;
alter table pin_attempts        enable row level security;
alter table wallet_transactions enable row level security;

revoke all on users from anon;
revoke all on user_sessions from anon;
revoke all on pin_attempts from anon;
revoke all on wallet_transactions from anon;

grant select on users_public to anon;
