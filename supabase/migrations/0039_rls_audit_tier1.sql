-- =============================================================
-- RLS audit Tier 1 — lock down two SECURITY DEFINER RPCs and
-- pin search_path on four legacy functions flagged by the
-- Supabase database linter.
--
-- Findings (lints 0011, 0028, 0029):
--   - rls_auto_enable() and user_profile_stats(uuid) were
--     callable by `anon` + `authenticated` via PostgREST. Both
--     are intended for service-role only (admin maintenance,
--     and the profile route's pre-aggregated stats query). The
--     authenticated/anon GRANTs are dead and an anon-callable
--     SECURITY DEFINER function is the canonical privilege-
--     escalation footgun.
--   - pp_record_click, pp_record_clicks, pp_buy_upgrade,
--     slots_jackpot_ledger_sum had a mutable search_path. An
--     attacker who creates a same-named function in another
--     schema can shadow built-ins these call. Pinning to
--     search_path = public closes that path.
-- =============================================================

-- 1. Revoke unused EXECUTE grants on SECURITY DEFINER RPCs.
--    Postgres grants EXECUTE to PUBLIC by default on every
--    function — anon + authenticated inherit through PUBLIC, so
--    revoking the named roles alone leaves the lint firing. We
--    revoke PUBLIC too so only service_role (+ postgres) keeps
--    access.
revoke execute on function public.rls_auto_enable()                  from PUBLIC, anon, authenticated;
revoke execute on function public.user_profile_stats(p_user_id uuid) from PUBLIC, anon, authenticated;

-- 2. Pin the function search_path on the legacy helpers so a
--    same-named function in another schema can't shadow ours.
alter function public.slots_jackpot_ledger_sum()                                                                                set search_path = public;
alter function public.pp_record_click(p_user_id uuid, p_pc bigint, p_album_page text, p_album_coin text, p_tick_at timestamptz) set search_path = public;
alter function public.pp_record_clicks(p_user_id uuid, p_pc bigint, p_clicks integer, p_album_increments jsonb, p_tick_at timestamptz) set search_path = public;
alter function public.pp_buy_upgrade(p_user_id uuid, p_upgrade_id text, p_cost bigint)                                          set search_path = public;
