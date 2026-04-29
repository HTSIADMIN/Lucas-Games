// Server-only clan datastore. Queries Supabase directly via the service-role
// client. All public callers should be inside `runtime: nodejs` route
// handlers (never imported by client code).

import { createClient, SupabaseClient } from "@supabase/supabase-js";
import type {
  Clan,
  ClanChatMessagePublic,
  ClanChest,
  ClanChestRewards,
  ClanChestTier,
  ClanInvite,
  ClanMember,
  ClanSeason,
} from "@/lib/db";

let _client: SupabaseClient | null = null;
function client(): SupabaseClient {
  if (_client) return _client;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Supabase env not configured");
  _client = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  return _client;
}

export function clansEnabled(): boolean {
  return !!(
    process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY
  );
}

// ============ MEMBERSHIP ============

export async function getMyClan(userId: string): Promise<{
  clan: Clan | null;
  membership: ClanMember | null;
}> {
  const { data: m } = await client()
    .from("clan_members")
    .select("*")
    .eq("user_id", userId)
    .maybeSingle();
  if (!m) return { clan: null, membership: null };
  const { data: c } = await client()
    .from("clans")
    .select("*")
    .eq("id", (m as ClanMember).clan_id)
    .maybeSingle();
  return { clan: (c as Clan) ?? null, membership: m as ClanMember };
}

export async function listClans(limit = 100): Promise<Clan[]> {
  const { data, error } = await client()
    .from("clans")
    .select("*")
    .order("total_xp_week", { ascending: false })
    .limit(limit);
  if (error) throw new Error(`listClans: ${error.message}`);
  return (data ?? []) as Clan[];
}

export async function getClan(id: string): Promise<Clan | null> {
  const { data } = await client().from("clans").select("*").eq("id", id).maybeSingle();
  return (data as Clan | null) ?? null;
}

export async function listClanMembers(clanId: string): Promise<
  (ClanMember & {
    username?: string;
    avatar_color?: string;
    initials?: string;
    equipped_frame?: string | null;
    equipped_hat?: string | null;
  })[]
> {
  const { data, error } = await client()
    .from("clan_members")
    .select(`*, users:users!inner(username, avatar_color, initials, equipped_frame, equipped_hat)`)
    .eq("clan_id", clanId)
    .order("weekly_xp", { ascending: false });
  if (error) throw new Error(`listClanMembers: ${error.message}`);
  type Row = ClanMember & {
    users: {
      username: string;
      avatar_color: string;
      initials: string;
      equipped_frame: string | null;
      equipped_hat: string | null;
    } | null;
  };
  return ((data ?? []) as Row[]).map((r) => ({
    ...r,
    username: r.users?.username,
    avatar_color: r.users?.avatar_color,
    initials: r.users?.initials,
    equipped_frame: r.users?.equipped_frame ?? null,
    equipped_hat: r.users?.equipped_hat ?? null,
  }));
}

export async function createClan(input: {
  name: string;
  tag: string;
  animalIcon: string;
  founderId: string;
}): Promise<Clan> {
  // Insert clan
  const { data: clan, error: cErr } = await client()
    .from("clans")
    .insert({
      name: input.name,
      tag: input.tag,
      animal_icon: input.animalIcon,
      founder_id: input.founderId,
      member_count: 1,
    })
    .select("*")
    .single();
  if (cErr || !clan) throw new Error(`createClan: ${cErr?.message ?? "no row"}`);

  // Founder membership
  const { error: mErr } = await client().from("clan_members").insert({
    clan_id: (clan as Clan).id,
    user_id: input.founderId,
    role: "leader",
  });
  if (mErr) {
    // Roll back clan if membership insert fails (e.g. user already in a clan).
    await client().from("clans").delete().eq("id", (clan as Clan).id);
    throw new Error(`createClan/member: ${mErr.message}`);
  }
  return clan as Clan;
}

export async function joinClan(input: {
  userId: string;
  clanId: string;
  /** Set when joining via an accepted invite — bypasses invite_only check. */
  viaInvite?: boolean;
}): Promise<void> {
  // Atomic-ish: insert membership; bump member_count via RPC pattern.
  const clan = await getClan(input.clanId);
  if (!clan) throw new Error("clan_not_found");
  if (clan.member_count >= 8) throw new Error("clan_full");
  if (clan.invite_only && !input.viaInvite) throw new Error("invite_only");
  const { error } = await client().from("clan_members").insert({
    clan_id: input.clanId,
    user_id: input.userId,
    role: "member",
  });
  if (error) {
    if (error.message.includes("duplicate") || (error as { code?: string }).code === "23505") {
      throw new Error("already_in_a_clan");
    }
    throw new Error(`joinClan: ${error.message}`);
  }
  // Bump count (not strictly atomic but fine for friends-game scale).
  await client()
    .from("clans")
    .update({ member_count: clan.member_count + 1 })
    .eq("id", input.clanId);
}

export async function leaveClan(userId: string): Promise<void> {
  const { membership, clan } = await getMyClan(userId);
  if (!membership || !clan) return;
  const isLastMember = clan.member_count <= 1;
  await client().from("clan_members").delete().eq("user_id", userId);
  if (isLastMember) {
    // Delete the clan when the last member leaves.
    await client().from("clans").delete().eq("id", clan.id);
  } else {
    const newCount = Math.max(0, clan.member_count - 1);
    let founderUpdate: { founder_id?: string } = {};
    if (membership.role === "leader") {
      // Promote the next-longest member to leader and reassign founder_id.
      const { data: next } = await client()
        .from("clan_members")
        .select("user_id")
        .eq("clan_id", clan.id)
        .order("joined_at", { ascending: true })
        .limit(1)
        .maybeSingle();
      if (next) {
        founderUpdate = { founder_id: (next as { user_id: string }).user_id };
        await client()
          .from("clan_members")
          .update({ role: "leader" })
          .eq("clan_id", clan.id)
          .eq("user_id", (next as { user_id: string }).user_id);
      }
    }
    await client()
      .from("clans")
      .update({ member_count: newCount, ...founderUpdate })
      .eq("id", clan.id);
  }
}

export async function updateClanSettings(input: {
  clanId: string;
  name?: string;
  tag?: string;
  animalIcon?: string;
  inviteOnly?: boolean;
}): Promise<Clan | null> {
  const patch: Record<string, unknown> = {};
  if (input.name !== undefined) patch.name = input.name;
  if (input.tag !== undefined) patch.tag = input.tag;
  if (input.animalIcon !== undefined) patch.animal_icon = input.animalIcon;
  if (input.inviteOnly !== undefined) patch.invite_only = input.inviteOnly;
  if (Object.keys(patch).length === 0) return getClan(input.clanId);
  const { data, error } = await client()
    .from("clans")
    .update(patch)
    .eq("id", input.clanId)
    .select("*")
    .maybeSingle();
  if (error) throw new Error(`updateClanSettings: ${error.message}`);
  return (data as Clan | null) ?? null;
}

// ============ XP ACCRUAL ============

// Add XP to a user's weekly total + the clan's running total. No-op if the
// user isn't in a clan. Called from credit() on every win-flavored credit.
export async function addClanXp(userId: string, xpDelta: number): Promise<void> {
  if (xpDelta <= 0) return;
  const { data: m } = await client()
    .from("clan_members")
    .select("clan_id, weekly_xp")
    .eq("user_id", userId)
    .maybeSingle();
  if (!m) return;
  const row = m as { clan_id: string; weekly_xp: number };
  await client()
    .from("clan_members")
    .update({ weekly_xp: Number(row.weekly_xp) + xpDelta })
    .eq("user_id", userId);
  // Bump clan total
  const { data: c } = await client()
    .from("clans")
    .select("total_xp_week")
    .eq("id", row.clan_id)
    .maybeSingle();
  if (c) {
    await client()
      .from("clans")
      .update({ total_xp_week: Number((c as { total_xp_week: number }).total_xp_week) + xpDelta })
      .eq("id", row.clan_id);
  }
}

// ============ SEASONS ============

// Compute the current ISO week start (Monday 00:00 UTC) for a given date.
function weekBounds(now = new Date()): { start: Date; end: Date } {
  const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  const dow = d.getUTCDay(); // 0 = Sunday
  const offsetToMonday = (dow + 6) % 7; // Monday = 0 offset
  d.setUTCDate(d.getUTCDate() - offsetToMonday);
  const start = new Date(d);
  const end = new Date(d);
  end.setUTCDate(end.getUTCDate() + 7);
  return { start, end };
}

// Lazy season management — call before reading the leaderboard. Creates the
// current season if missing and settles any past-due active seasons.
export async function ensureCurrentSeason(): Promise<ClanSeason> {
  const { start, end } = weekBounds();
  const { data: existing } = await client()
    .from("clan_seasons")
    .select("*")
    .eq("week_start", start.toISOString())
    .maybeSingle();
  if (existing) {
    // Settle any older active seasons before returning.
    await settleStaleActiveSeasons(start);
    return existing as ClanSeason;
  }
  // Settle older seasons first
  await settleStaleActiveSeasons(start);
  // Insert new season
  const { data, error } = await client()
    .from("clan_seasons")
    .insert({ week_start: start.toISOString(), week_end: end.toISOString(), status: "active" })
    .select("*")
    .single();
  if (error || !data) throw new Error(`ensureCurrentSeason: ${error?.message ?? "no row"}`);
  return data as ClanSeason;
}

// Settle every active season whose week_start is before the new week.
async function settleStaleActiveSeasons(currentWeekStart: Date): Promise<void> {
  const { data: stales } = await client()
    .from("clan_seasons")
    .select("*")
    .eq("status", "active")
    .lt("week_start", currentWeekStart.toISOString());
  if (!stales || stales.length === 0) return;

  for (const s of stales as ClanSeason[]) {
    await settleSeason(s);
  }
}

async function settleSeason(season: ClanSeason): Promise<void> {
  // Snapshot current ranking from clans.total_xp_week.
  const { data: clans } = await client()
    .from("clans")
    .select("id, total_xp_week")
    .order("total_xp_week", { ascending: false });
  const ranking = (clans ?? []) as { id: string; total_xp_week: number }[];

  // Insert results + grant chests for top 10
  for (let i = 0; i < ranking.length; i++) {
    const c = ranking[i];
    const rank = i + 1;
    if (Number(c.total_xp_week) <= 0) continue; // skip clans that didn't compete
    await client()
      .from("clan_season_results")
      .upsert({ season_id: season.id, clan_id: c.id, rank, total_xp: c.total_xp_week });

    if (rank > 10) continue;
    const tier: ClanChestTier =
      rank === 1 ? "legendary" : rank <= 3 ? "epic" : "rare";
    // Grant a chest to every member of this clan.
    const { data: members } = await client()
      .from("clan_members")
      .select("user_id")
      .eq("clan_id", c.id);
    if (members) {
      const rows = (members as { user_id: string }[]).map((m) => ({
        user_id: m.user_id,
        season_id: season.id,
        rank,
        tier,
      }));
      if (rows.length > 0) await client().from("clan_chests").insert(rows);
    }
  }

  // Reset weekly XP everywhere, mark season settled.
  await client().from("clans").update({ total_xp_week: 0 }).gt("id", "00000000-0000-0000-0000-000000000000");
  await client().from("clan_members").update({ weekly_xp: 0 }).gt("user_id", "00000000-0000-0000-0000-000000000000");
  await client()
    .from("clan_seasons")
    .update({ status: "settled" })
    .eq("id", season.id);
}

// ============ CHESTS ============

export async function listMyUnopenedChests(userId: string): Promise<ClanChest[]> {
  const { data, error } = await client()
    .from("clan_chests")
    .select("*")
    .eq("user_id", userId)
    .is("opened_at", null)
    .order("created_at", { ascending: false });
  if (error) throw new Error(`listMyUnopenedChests: ${error.message}`);
  return (data ?? []) as ClanChest[];
}

export async function openChest(input: {
  userId: string;
  chestId: string;
  rewards: ClanChestRewards;
}): Promise<ClanChest | null> {
  const { data, error } = await client()
    .from("clan_chests")
    .update({ opened_at: new Date().toISOString(), rewards: input.rewards })
    .eq("id", input.chestId)
    .eq("user_id", input.userId)
    .is("opened_at", null)
    .select("*")
    .maybeSingle();
  if (error) throw new Error(`openChest: ${error.message}`);
  return (data as ClanChest | null) ?? null;
}

export async function getChest(userId: string, chestId: string): Promise<ClanChest | null> {
  const { data } = await client()
    .from("clan_chests")
    .select("*")
    .eq("id", chestId)
    .eq("user_id", userId)
    .maybeSingle();
  return (data as ClanChest | null) ?? null;
}

// ============ LEADERBOARD ============

export async function clanLeaderboard(limit = 50): Promise<Clan[]> {
  const { data, error } = await client()
    .from("clans")
    .select("*")
    .order("total_xp_week", { ascending: false })
    .limit(limit);
  if (error) throw new Error(`clanLeaderboard: ${error.message}`);
  return (data ?? []) as Clan[];
}

// ============ BONUS SPIN TOKENS ============

export async function grantBonusSpinTokens(userId: string, n: number): Promise<void> {
  if (n <= 0) return;
  const { data } = await client()
    .from("users")
    .select("bonus_spin_tokens")
    .eq("id", userId)
    .maybeSingle();
  const current = Number((data as { bonus_spin_tokens?: number } | null)?.bonus_spin_tokens ?? 0);
  await client()
    .from("users")
    .update({ bonus_spin_tokens: current + n })
    .eq("id", userId);
}

export async function consumeBonusSpinToken(userId: string): Promise<boolean> {
  const { data } = await client()
    .from("users")
    .select("bonus_spin_tokens")
    .eq("id", userId)
    .maybeSingle();
  const current = Number((data as { bonus_spin_tokens?: number } | null)?.bonus_spin_tokens ?? 0);
  if (current <= 0) return false;
  await client()
    .from("users")
    .update({ bonus_spin_tokens: current - 1 })
    .eq("id", userId);
  return true;
}

export async function getBonusSpinTokens(userId: string): Promise<number> {
  const { data } = await client()
    .from("users")
    .select("bonus_spin_tokens")
    .eq("id", userId)
    .maybeSingle();
  return Number((data as { bonus_spin_tokens?: number } | null)?.bonus_spin_tokens ?? 0);
}

// ============ V2: KICK + SETTINGS ============

export async function kickMember(input: {
  clanId: string;
  leaderId: string;
  targetUserId: string;
}): Promise<void> {
  if (input.targetUserId === input.leaderId) throw new Error("cant_kick_self");
  // Confirm requester is the leader of this clan
  const { data: lead } = await client()
    .from("clan_members")
    .select("role, clan_id")
    .eq("user_id", input.leaderId)
    .maybeSingle();
  if (!lead || (lead as { role: string; clan_id: string }).clan_id !== input.clanId
      || (lead as { role: string }).role !== "leader") {
    throw new Error("not_leader");
  }
  // Confirm target is in the same clan
  const { data: target } = await client()
    .from("clan_members")
    .select("clan_id, role")
    .eq("user_id", input.targetUserId)
    .maybeSingle();
  if (!target || (target as { clan_id: string }).clan_id !== input.clanId) {
    throw new Error("target_not_in_clan");
  }
  if ((target as { role: string }).role === "leader") throw new Error("cant_kick_leader");

  await client().from("clan_members").delete().eq("user_id", input.targetUserId);
  // Decrement member count
  const { data: c } = await client()
    .from("clans")
    .select("member_count")
    .eq("id", input.clanId)
    .maybeSingle();
  if (c) {
    const newCount = Math.max(0, Number((c as { member_count: number }).member_count) - 1);
    await client().from("clans").update({ member_count: newCount }).eq("id", input.clanId);
  }
}

// ============ V2: INVITES ============

export async function findUserByUsername(username: string): Promise<{ id: string; username: string } | null> {
  const { data } = await client()
    .from("users_public")
    .select("id, username")
    .ilike("username", username)
    .maybeSingle();
  return (data as { id: string; username: string } | null) ?? null;
}

export async function createClanInvite(input: {
  clanId: string;
  invitedBy: string;
  inviteeId: string;
}): Promise<ClanInvite> {
  // Reject if invitee is already in a clan
  const { data: existing } = await client()
    .from("clan_members")
    .select("user_id")
    .eq("user_id", input.inviteeId)
    .maybeSingle();
  if (existing) throw new Error("user_already_in_clan");

  const { data, error } = await client()
    .from("clan_invites")
    .insert({
      clan_id: input.clanId,
      invitee_id: input.inviteeId,
      invited_by: input.invitedBy,
      status: "pending",
    })
    .select("*")
    .single();
  if (error) {
    if (error.message.includes("duplicate") || (error as { code?: string }).code === "23505") {
      throw new Error("already_invited");
    }
    throw new Error(`createClanInvite: ${error.message}`);
  }
  return data as ClanInvite;
}

export async function listMyPendingInvites(userId: string): Promise<
  (ClanInvite & { clan?: Clan; inviter_username?: string })[]
> {
  const { data } = await client()
    .from("clan_invites")
    .select("*")
    .eq("invitee_id", userId)
    .eq("status", "pending")
    .order("created_at", { ascending: false });
  const invites = (data ?? []) as ClanInvite[];
  if (invites.length === 0) return [];
  // Hydrate with clan + inviter username
  const clanIds = Array.from(new Set(invites.map((i) => i.clan_id)));
  const inviterIds = Array.from(new Set(invites.map((i) => i.invited_by)));
  const [{ data: clansData }, { data: invitersData }] = await Promise.all([
    client().from("clans").select("*").in("id", clanIds),
    client().from("users_public").select("id, username").in("id", inviterIds),
  ]);
  const clansById = new Map(((clansData ?? []) as Clan[]).map((c) => [c.id, c]));
  const invitersById = new Map(
    ((invitersData ?? []) as { id: string; username: string }[]).map((u) => [u.id, u.username]),
  );
  return invites.map((i) => ({
    ...i,
    clan: clansById.get(i.clan_id),
    inviter_username: invitersById.get(i.invited_by),
  }));
}

export async function listClanPendingInvites(clanId: string): Promise<
  (ClanInvite & { invitee_username?: string })[]
> {
  const { data } = await client()
    .from("clan_invites")
    .select("*")
    .eq("clan_id", clanId)
    .eq("status", "pending")
    .order("created_at", { ascending: false });
  const invites = (data ?? []) as ClanInvite[];
  if (invites.length === 0) return [];
  const inviteeIds = Array.from(new Set(invites.map((i) => i.invitee_id)));
  const { data: usersData } = await client()
    .from("users_public")
    .select("id, username")
    .in("id", inviteeIds);
  const byId = new Map(
    ((usersData ?? []) as { id: string; username: string }[]).map((u) => [u.id, u.username]),
  );
  return invites.map((i) => ({ ...i, invitee_username: byId.get(i.invitee_id) }));
}

export async function resolveInvite(input: {
  inviteId: string;
  userId: string;
  action: "accept" | "decline";
}): Promise<{ accepted: boolean; clanId?: string }> {
  const { data: inv } = await client()
    .from("clan_invites")
    .select("*")
    .eq("id", input.inviteId)
    .eq("invitee_id", input.userId)
    .eq("status", "pending")
    .maybeSingle();
  if (!inv) throw new Error("invite_not_found");
  const invite = inv as ClanInvite;

  if (input.action === "decline") {
    await client()
      .from("clan_invites")
      .update({ status: "declined", resolved_at: new Date().toISOString() })
      .eq("id", input.inviteId);
    return { accepted: false };
  }

  // Accept — try to join the clan first (bypass invite_only via viaInvite)
  await joinClan({ userId: input.userId, clanId: invite.clan_id, viaInvite: true });
  await client()
    .from("clan_invites")
    .update({ status: "accepted", resolved_at: new Date().toISOString() })
    .eq("id", input.inviteId);
  // Cancel any other pending invites for this user
  await client()
    .from("clan_invites")
    .update({ status: "cancelled", resolved_at: new Date().toISOString() })
    .eq("invitee_id", input.userId)
    .eq("status", "pending");
  return { accepted: true, clanId: invite.clan_id };
}

// ============ V2: CHAT ============

export async function listClanChat(clanId: string, limit = 60): Promise<ClanChatMessagePublic[]> {
  const { data, error } = await client()
    .from("clan_chat_messages")
    .select(`*, users:users!inner(username, avatar_color, initials, equipped_frame, equipped_hat)`)
    .eq("clan_id", clanId)
    .order("id", { ascending: false })
    .limit(limit);
  if (error) throw new Error(`listClanChat: ${error.message}`);
  type Row = {
    id: number;
    clan_id: string;
    user_id: string;
    body: string;
    created_at: string;
    users: {
      username: string;
      avatar_color: string;
      initials: string;
      equipped_frame: string | null;
      equipped_hat: string | null;
    } | null;
  };
  const rows = (data ?? []) as Row[];
  return rows.reverse().map((r) => ({
    id: r.id,
    clan_id: r.clan_id,
    user_id: r.user_id,
    body: r.body,
    created_at: r.created_at,
    username: r.users?.username ?? "?",
    avatar_color: r.users?.avatar_color ?? "var(--gold-300)",
    initials: r.users?.initials ?? "??",
    equipped_frame: r.users?.equipped_frame ?? null,
    equipped_hat: r.users?.equipped_hat ?? null,
  }));
}

export async function postClanChat(input: {
  clanId: string;
  userId: string;
  body: string;
}): Promise<void> {
  // Confirm membership
  const { data: m } = await client()
    .from("clan_members")
    .select("clan_id")
    .eq("user_id", input.userId)
    .maybeSingle();
  if (!m || (m as { clan_id: string }).clan_id !== input.clanId) {
    throw new Error("not_in_clan");
  }
  const { error } = await client().from("clan_chat_messages").insert({
    clan_id: input.clanId,
    user_id: input.userId,
    body: input.body,
  });
  if (error) throw new Error(`postClanChat: ${error.message}`);
}

// ============ V2: HISTORY ============

export async function listClanHistory(clanId: string, limit = 12): Promise<
  { season_id: string; week_start: string; rank: number; total_xp: number }[]
> {
  const { data, error } = await client()
    .from("clan_season_results")
    .select(`*, clan_seasons:clan_seasons!inner(week_start)`)
    .eq("clan_id", clanId)
    .order("season_id", { ascending: false })
    .limit(limit);
  if (error) throw new Error(`listClanHistory: ${error.message}`);
  type Row = {
    season_id: string;
    rank: number;
    total_xp: number;
    clan_seasons: { week_start: string } | null;
  };
  return ((data ?? []) as Row[]).map((r) => ({
    season_id: r.season_id,
    week_start: r.clan_seasons?.week_start ?? "",
    rank: r.rank,
    total_xp: Number(r.total_xp),
  }));
}
