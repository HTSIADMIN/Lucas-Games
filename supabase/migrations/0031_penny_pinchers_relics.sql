-- ============================================================
-- LUCAS GAMES — 0031 PENNY PINCHERS RELICS
--
-- Players spend Frugality on chests; chests roll a random relic
-- from a tier-weighted pool. Relics persist (survive Roll-Up) and
-- stack levels — getting the same relic twice ups its level.
--
-- Stored as JSONB on the existing state row, shape:
--   { lucky_charm: 3, midas_thumb: 1, ... }
-- ============================================================

alter table penny_pinchers_state
  add column relics jsonb not null default '{}'::jsonb;
