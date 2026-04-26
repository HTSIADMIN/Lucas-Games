-- =============================================================
-- Slots v2 — "Boomtown" hold-and-spin slot.
-- Adds:
--   - users.slots_meter   (persistent "Whiskey Barrel" meter)
--   - slot_runs           (active hold-and-spin sessions with locked coin grid)
-- =============================================================

-- Persistent meter — fills slowly over base spins, when full grants a
-- guaranteed bonus on the next spin. Range [0, 1000]; bonus triggers
-- at 1000 and resets to 0.
alter table public.users
  add column if not exists slots_meter integer not null default 0;

-- Hold-and-spin bonus state. One row per active bonus session per user.
-- Only one active row at a time (status = 'active'); when finished the
-- row stays for audit (status = 'settled').
create table if not exists public.slot_runs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  bet integer not null check (bet >= 100),
  -- 5 reels x 4 rows. Stored as a JSON array of 20 cell descriptors:
  --   { value: number | null, locked: boolean }
  -- Cells with value !== null are locked cash coins.
  grid jsonb not null,
  -- Number of respins remaining in the current "3 dud respins" countdown.
  respins_left integer not null default 3,
  -- Coins picked up so far (count, not value). Used to detect screen-full.
  coins_locked integer not null default 0,
  -- Building tier collected on reel 5 in the trigger spin (or upgraded
  -- mid-bonus). 1=Tent, 2=Saloon, 3=Town, 4=Frontier, 5=Boomtown jackpot.
  building_tier integer not null default 1 check (building_tier between 1 and 5),
  -- Final pool when the bonus settles (sum of locked coin values * tier multiplier).
  final_payout integer,
  -- 'active' while spinning, 'settled' once paid out.
  status text not null default 'active' check (status in ('active', 'settled')),
  created_at timestamptz not null default now(),
  ended_at timestamptz
);

create index if not exists idx_slot_runs_user_active
  on public.slot_runs (user_id) where status = 'active';

-- RLS — kept enabled to match the other game tables; the server uses the
-- service role key which bypasses RLS, so no policies are needed.
alter table public.slot_runs enable row level security;
