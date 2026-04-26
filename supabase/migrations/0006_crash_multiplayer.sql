-- ============================================================
-- LUCAS GAMES — 0006 CRASH MULTIPLAYER
-- Lifecycle: betting (10s) → running → crashed
-- All players join the same scheduled round.
-- ============================================================

alter table crash_rounds
  add column if not exists bet_close_at timestamptz,
  add column if not exists created_by   uuid references users(id),
  add column if not exists round_no     bigserial;

create index if not exists crash_rounds_active_idx
  on crash_rounds (status) where status in ('betting', 'running');

grant select on crash_rounds to anon;
grant select on crash_bets   to anon;
