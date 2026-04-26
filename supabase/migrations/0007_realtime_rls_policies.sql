-- ============================================================
-- LUCAS GAMES — 0007 REALTIME RLS POLICIES
-- postgres_changes events are filtered through anon's RLS. With RLS
-- enabled and no SELECT policy, anon receives no events. These open
-- SELECT only on tables we deliberately expose to the live UI.
-- ============================================================

create policy chat_messages_read_all on chat_messages
  for select to anon using (true);

-- Only expose settled rows so in-progress mine layouts / shoes don't leak.
create policy game_sessions_settled_read on game_sessions
  for select to anon using (status = 'settled');

create policy crash_rounds_read_all on crash_rounds
  for select to anon using (true);

create policy crash_bets_read_all on crash_bets
  for select to anon using (true);

create policy users_public_for_realtime on users
  for select to anon using (is_active);
