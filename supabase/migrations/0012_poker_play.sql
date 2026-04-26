-- ============================================================
-- LUCAS GAMES — 0012 POKER PLAY
-- Single-table No-Limit Hold'em. Lifecycle:
--   waiting → preflop → flop → turn → river → showdown → cooldown
-- Polling-based (deck stays server-only via RLS — no anon access).
-- ============================================================

create table poker_state (
  table_id           uuid primary key references poker_tables(id) on delete cascade,
  status             text not null default 'waiting',
  hand_no            bigint not null default 0,
  deck               jsonb not null default '[]'::jsonb,
  community          jsonb not null default '[]'::jsonb,
  dealer_seat        int,
  current_seat       int,
  action_deadline_at timestamptz,
  pot                bigint not null default 0,
  current_bet        bigint not null default 0,
  last_raise_amount  bigint not null default 0,
  hand_started_at    timestamptz,
  hand_ended_at      timestamptz,
  showdown           jsonb
);

alter table poker_seats add column if not exists hole_cards            jsonb   not null default '[]'::jsonb;
alter table poker_seats add column if not exists committed_this_round  bigint  not null default 0;
alter table poker_seats add column if not exists committed_total       bigint  not null default 0;
alter table poker_seats add column if not exists is_all_in             boolean not null default false;
alter table poker_seats add column if not exists folded                boolean not null default false;
alter table poker_seats add column if not exists in_hand               boolean not null default false;
alter table poker_seats add column if not exists last_action           text;

insert into poker_tables (name, small_blind, big_blind, max_seats)
  values ('The Saloon', 100, 200, 6)
  on conflict do nothing;

alter table poker_state enable row level security;
