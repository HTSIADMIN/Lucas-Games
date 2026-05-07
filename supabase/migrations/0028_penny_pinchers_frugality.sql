-- ============================================================
-- LUCAS GAMES — 0028 PENNY PINCHERS FRUGALITY (Phase 2b)
--
-- Tracks the player's "Frugality" meter — adjusted by moral-choice
-- events like the Lost Wallet. Positive frugality unlocks future
-- perm upgrades (Phase 2c); negative frugality opens up risky-but-
-- high-reward variants. Bounded ±50 by the wallet endpoint, no
-- wider clamp needed at the schema level.
-- ============================================================

alter table penny_pinchers_state
  add column frugality int not null default 0;
