-- ============================================================
-- LUCAS GAMES — 0026 PENNY PINCHERS PRESTIGE (Phase 3a)
--
-- Adds the "Roll It Up" prestige system: when a player has banked
-- enough lifetime PC, they can reset their session-level state
-- (cents, upgrades, helpers) for permanent Bank Tokens. Bank
-- Tokens buy entries in penny_pinchers_perm_upgrades — those
-- survive every prestige cycle.
-- ============================================================

alter table penny_pinchers_state
  add column prestige_count int not null default 0,
  add column bank_tokens int not null default 0,
  add column lifetime_banked_cents bigint not null default 0,
  add column last_prestige_at timestamptz;

create table penny_pinchers_perm_upgrades (
  user_id     uuid not null references users(id) on delete cascade,
  upgrade_id  text not null,
  level       int  not null default 0,
  primary key (user_id, upgrade_id)
);
create index penny_pinchers_perm_upgrades_user_idx on penny_pinchers_perm_upgrades (user_id);

alter table penny_pinchers_perm_upgrades enable row level security;
