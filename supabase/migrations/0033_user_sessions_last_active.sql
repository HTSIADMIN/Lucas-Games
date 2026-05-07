-- ============================================================
-- LUCAS GAMES — 0033 user_sessions.last_active_at
--
-- Sessions are JWT-cookie-backed with a 30-day TTL. There's no
-- existing idle-revocation, which means a tab that's force-closed
-- (or whose client-side IdleTimeout was bypassed by stationary-
-- mouse jiggle events) authenticates again the next day even
-- though the user clearly walked away.
--
-- This adds a server-tracked last_active_at column. readSession
-- bumps it (rate-limited per process) on every authenticated
-- request and refuses sessions where the column is older than the
-- idle-revocation window. Existing sessions get backfilled to the
-- current time so no one is force-logged-out by the deploy.
--
-- IMPORTANT: backfill must use now(), NOT issued_at — sessions
-- have a 30-day TTL, so most outstanding rows have an issued_at
-- much older than the 8h idle window. Backfilling from issued_at
-- would mark them as already-stale and the very next readSession
-- would revoke them, kicking every active user. (We hit this bug
-- on the first deploy of this migration; fix is captured here.)
-- ============================================================

alter table user_sessions
  add column if not exists last_active_at timestamptz;

update user_sessions
set last_active_at = now()
where last_active_at is null and revoked = false;

create index if not exists user_sessions_last_active_idx
  on user_sessions (last_active_at);
