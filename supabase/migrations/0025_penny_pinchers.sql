-- ============================================================
-- LUCAS GAMES — 0025 PENNY PINCHERS (free incremental / clicker)
--
-- Click coins on a play area to bank in-game "Pinch Cents" (PC).
-- Spend PC on upgrades + helpers. Wallet ¢ payouts happen via the
-- separate "Bank It" action (1h cooldown, daily cap) — PC never
-- touches the wallet ledger directly.
--
-- State lives in three tables:
--   penny_pinchers_state    — one row per user, scalar progression
--   penny_pinchers_upgrades — composite (user, upgrade_id), tracks level
--   penny_pinchers_helpers  — composite (user, helper_id), tracks count
--
-- Phase 1 schema. Future phases (merging, decay, traits, album,
-- prestige, frugality, achievements) extend by adding new tables
-- or appending columns; nothing here needs to change.
-- ============================================================

create table penny_pinchers_state (
  user_id              uuid primary key references users(id) on delete cascade,
  cents                bigint not null default 0,
  lifetime_clicks      bigint not null default 0,
  lifetime_pc_earned   bigint not null default 0,
  -- Anchor for offline-helper accrual. Bumped on click, on
  -- `bank`, and on the `state` GET endpoint when offline cents
  -- are credited.
  last_tick_at         timestamptz,
  -- 1h cooldown enforcement for the bank-it action.
  last_bank_at         timestamptz,
  -- Per-UTC-day wallet payout cap. Reset whenever
  -- daily_banked_day != current UTC date.
  daily_banked_cents   int  not null default 0,
  daily_banked_day     date,
  created_at           timestamptz not null default now()
);

create table penny_pinchers_upgrades (
  user_id     uuid not null references users(id) on delete cascade,
  upgrade_id  text not null,
  level       int  not null default 0,
  primary key (user_id, upgrade_id)
);
create index penny_pinchers_upgrades_user_idx on penny_pinchers_upgrades (user_id);

create table penny_pinchers_helpers (
  user_id    uuid not null references users(id) on delete cascade,
  helper_id  text not null,
  count      int  not null default 0,
  primary key (user_id, helper_id)
);
create index penny_pinchers_helpers_user_idx on penny_pinchers_helpers (user_id);

alter table penny_pinchers_state    enable row level security;
alter table penny_pinchers_upgrades enable row level security;
alter table penny_pinchers_helpers  enable row level security;
