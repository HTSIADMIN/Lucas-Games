-- ============================================================
-- LUCAS GAMES — 0008 BLACKJACK MULTIPLAYER
-- Shared rounds with timer-based action prompts.
--   betting (15s) → dealing → player_turn (15s/seat) → dealer_turn → settled → cooldown
-- Polling-based (no Realtime). Deck stays in the table but never exposed
-- to anon — RLS denies all anon access; clients hit /api/games/blackjack-mp/state.
-- ============================================================

create table blackjack_rounds (
  id                  uuid primary key default uuid_generate_v4(),
  round_no            bigserial,
  status              text not null default 'betting',
  bet_close_at        timestamptz,
  action_deadline_at  timestamptz,
  current_user_id     uuid references users(id),
  dealer_hand         jsonb not null default '[]'::jsonb,
  deck                jsonb not null default '[]'::jsonb,
  started_at          timestamptz,
  ended_at            timestamptz,
  created_at          timestamptz not null default now()
);
create index blackjack_rounds_active_idx on blackjack_rounds (status)
  where status in ('betting', 'dealing', 'player_turn', 'dealer_turn');

create table blackjack_seats (
  id          bigserial primary key,
  round_id    uuid not null references blackjack_rounds(id) on delete cascade,
  user_id     uuid not null references users(id) on delete cascade,
  bet         bigint not null,
  hand        jsonb not null default '[]'::jsonb,
  status      text not null default 'waiting',
  doubled     boolean not null default false,
  payout      bigint not null default 0,
  placed_at   timestamptz not null default now(),
  unique (round_id, user_id)
);
create index blackjack_seats_round_idx on blackjack_seats (round_id);

alter table blackjack_rounds enable row level security;
alter table blackjack_seats  enable row level security;
