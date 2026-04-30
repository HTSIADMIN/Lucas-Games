-- =============================================================
-- 0023 — EQUIPPED COIN FACE
-- Adds a slot for coin-face cosmetics so a player's equipped
-- coin design renders in Coin Flip + Coin Flip Duel. Defaults to
-- NULL = the built-in pixel coin.
-- =============================================================

alter table public.users
  add column if not exists equipped_coin_face text;
