-- ============================================================
-- LUCAS GAMES — 0010 COIN FLIP DUELS
-- 1v1 wagered coin flip. Challenger picks a side + stake; first
-- acceptor takes the other side. Server flips on accept.
-- ============================================================

create table coinflip_duels (
  id              uuid primary key default uuid_generate_v4(),
  challenger_id   uuid not null references users(id) on delete cascade,
  challenger_side text not null check (challenger_side in ('heads','tails')),
  wager           bigint not null,
  acceptor_id     uuid references users(id) on delete set null,
  result          text check (result in ('heads','tails')),
  winner_id       uuid references users(id) on delete set null,
  status          text not null default 'open' check (status in ('open','resolved','cancelled')),
  created_at      timestamptz not null default now(),
  resolved_at     timestamptz
);
create index coinflip_duels_open_idx on coinflip_duels (status, created_at desc) where status = 'open';
create index coinflip_duels_recent_idx on coinflip_duels (created_at desc);

alter table coinflip_duels enable row level security;
create policy coinflip_duels_anon_read on coinflip_duels for select to anon using (true);
