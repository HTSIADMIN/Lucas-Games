-- =============================================================
-- 0019 — CLANS V2: invite-only mode, invites, clan chat
-- =============================================================

-- Add invite-only toggle to existing clans table
alter table public.clans
  add column if not exists invite_only boolean not null default false;

-- Pending / resolved invites between a clan and a user
create table if not exists public.clan_invites (
  id           uuid primary key default gen_random_uuid(),
  clan_id      uuid not null references public.clans(id) on delete cascade,
  invitee_id   uuid not null references public.users(id) on delete cascade,
  invited_by   uuid not null references public.users(id) on delete cascade,
  status       text not null default 'pending'
                 check (status in ('pending', 'accepted', 'declined', 'cancelled')),
  created_at   timestamptz not null default now(),
  resolved_at  timestamptz
);

-- Only one pending invite at a time per (clan, invitee)
create unique index if not exists uniq_clan_invites_pending
  on public.clan_invites (clan_id, invitee_id) where status = 'pending';

create index if not exists idx_clan_invites_invitee_pending
  on public.clan_invites (invitee_id) where status = 'pending';

-- Per-clan chat (separate from the global chat drawer)
create table if not exists public.clan_chat_messages (
  id          bigserial primary key,
  clan_id     uuid not null references public.clans(id) on delete cascade,
  user_id     uuid not null references public.users(id) on delete cascade,
  body        text not null check (char_length(body) between 1 and 500),
  created_at  timestamptz not null default now()
);

create index if not exists idx_clan_chat_recent
  on public.clan_chat_messages (clan_id, id desc);

alter table public.clan_invites       enable row level security;
alter table public.clan_chat_messages enable row level security;
