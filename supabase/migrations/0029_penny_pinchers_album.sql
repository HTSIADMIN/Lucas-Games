-- ============================================================
-- LUCAS GAMES — 0029 PENNY PINCHERS COIN ALBUM (Phase 2d)
--
-- Tracks lifetime counts of trait-coin combos (shiny penny,
-- sticky nickel, etc.). Stored as JSONB on the existing state
-- row rather than a new table — small fixed shape, always read
-- alongside the rest of state, no need for indexes.
--
-- Shape: { shiny: { penny: 12, nickel: 3, ... }, sticky: { penny: 4 } }
--
-- Filled slots + completed pages both grant trait-spawn-chance
-- bonuses computed in the engine.
-- ============================================================

alter table penny_pinchers_state
  add column album jsonb not null default '{}'::jsonb;
