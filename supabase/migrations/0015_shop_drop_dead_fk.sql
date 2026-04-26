-- =============================================================
-- 0015 — Shop: drop dead FK on player_inventory.item_id
--
-- The cosmetic_items table is dead: the in-app catalog lives in
-- src/lib/shop/catalog.ts and the table is never seeded. The FK on
-- player_inventory.item_id was rejecting every legitimate buy with
-- a 23503 violation, but only AFTER the wallet had been debited —
-- so the player lost money and never received the item.
--
-- Drop the FK; player_inventory.item_id is now just a plain text
-- column referencing whatever id the in-code catalog publishes.
-- =============================================================

alter table public.player_inventory
  drop constraint if exists player_inventory_item_id_fkey;
