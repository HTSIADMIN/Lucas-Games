-- =============================================================
-- 0021 — CLANS V3
-- Swap the animal-themed icon set for the new themed clan emblems
-- (aces-eights, blood-moon-riders, etc.). The check constraint on
-- clans.animal_icon is widened to accept either set, and we add a
-- last_active_at column for the per-member panel.
-- =============================================================

-- Drop the old check constraint and replace with one that accepts
-- both the legacy animals (existing rows stay valid) and the new
-- themed icon ids. Using a single permissive set means we don't have
-- to backfill historical rows.
do $$ begin
  alter table public.clans drop constraint if exists clans_animal_icon_check;
exception when others then null; end $$;

alter table public.clans
  add constraint clans_animal_icon_check
  check (animal_icon in (
    -- Legacy animal set (kept for any pre-v3 rows)
    'wolf','bear','eagle','snake','bull','coyote','hawk','stag',
    -- New themed emblem set
    'aces_eights','blood_moon_riders','dead_mans_hand','golden_compass',
    'iron_horseshoe','phantom_posse','prospectors_guild','rattlesnake_gang',
    'saguaro_brotherhood','sheriffs_badge','thunderhoof_cavalry','train_barons'
  ));

-- Per-member "last active" timestamp drives the member-panel
-- "active 3h ago" line. Touched on every API call by readSession.
alter table public.clan_members
  add column if not exists last_active_at timestamptz;
