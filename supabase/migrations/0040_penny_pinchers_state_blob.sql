-- ============================================================
-- LUCAS GAMES — 0040 PENNY PINCHERS LOCAL-FIRST STATE BLOB
--
-- Penny Pinchers is moving to a client-authoritative model:
--   • The browser owns the live simulation (clicks, helpers, traits,
--     album, relics, blessings, prestige). Every action is instant —
--     zero network round-trips between earning PC and spending it.
--   • The server is dumb persistence + the wallet bridge. It receives
--     the full state as a JSON blob every ~10s (and on tab-hide /
--     beforeunload via sendBeacon) and stores it. Banking is the only
--     server-authoritative action that touches the wallet ledger.
--
-- This migration just adds the blob column + a last-saved timestamp
-- so the same row can persist the entire game state without ripping
-- out the existing normalized tables. The /load route falls back to
-- the normalized rows on first read per user (so existing players
-- keep their progress), then writes through the blob from then on.
-- The normalized tables stay populated by historical data — they're
-- read once at migration time, never written by the new routes.
-- ============================================================

alter table penny_pinchers_state
  add column if not exists state_blob jsonb,
  add column if not exists last_saved_at timestamptz;

-- Lookup index isn't needed (lookups are by user_id PK), but a GIN
-- index on the blob would let us query specific fields later
-- (leaderboards by lifetime PC, etc.). Keeping it lean for now —
-- leaderboard reads still use the normalized columns until the
-- first save lands per user, after which we'll add a generated
-- column or move the leaderboard onto a blob field in a follow-up.
