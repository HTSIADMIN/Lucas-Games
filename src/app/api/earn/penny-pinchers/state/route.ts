import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { readSession } from "@/lib/auth/session";
import { getBalance } from "@/lib/wallet";
import {
  getPennyPinchersState,
  insertPennyPinchersAchievements,
  listPennyPinchersAchievements,
  listPennyPinchersHelpers,
  listPennyPinchersPermUpgrades,
  listPennyPinchersUpgrades,
  upsertPennyPinchersState,
} from "@/lib/db";
import {
  ACHIEVEMENTS_BY_ID,
  BANK_PC_PER_WALLET_CENT,
  PRESTIGE_THRESHOLD_CENTS,
  type AchievementId,
  type HelperId,
  type PermUpgradeId,
  type UpgradeId,
} from "@/lib/games/penny-pinchers/catalog";
import {
  bankTokensFromCurrentCents,
  detectNewUnlocks,
  helperRatePcPerSec,
  offlineCapHours,
  offlinePCAccrued,
  relicEffects,
} from "@/lib/games/penny-pinchers/engine";

export const runtime = "nodejs";

type LeaderboardRow = {
  userId: string;
  username: string;
  avatarColor: string;
  initials: string;
  lifetimePCEarned: number;
  lifetimeClicks: number;
  frugality: number;
  prestigeCount: number;
  walletBalance: number;
  isMe: boolean;
};

// Pulls the top 10 Penny Pinchers — folded into /state so the client
// only makes one round-trip per poll instead of two. Returns [] if
// service-role creds aren't configured (mock-DB / preview envs).
async function fetchLeaderboard(meId: string): Promise<LeaderboardRow[]> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return [];

  const sb = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data: pp, error } = await sb
    .from("penny_pinchers_state")
    .select(
      "user_id, lifetime_pc_earned, lifetime_clicks, frugality, prestige_count, users:users!inner(username, avatar_color, initials)",
    )
    .order("lifetime_pc_earned", { ascending: false })
    .limit(10);
  if (error || !pp) return [];

  const userIds = (pp as Array<{ user_id: string }>).map((r) => r.user_id);
  const balanceById: Record<string, number> = {};
  if (userIds.length > 0) {
    const { data: balances } = await sb
      .from("wallet_balances")
      .select("user_id, balance")
      .in("user_id", userIds);
    for (const row of (balances ?? []) as Array<{ user_id: string; balance: number | string }>) {
      balanceById[row.user_id] = Number(row.balance);
    }
  }

  type UserBlob = { username: string; avatar_color: string; initials: string };
  type Row = {
    user_id: string;
    lifetime_pc_earned: number;
    lifetime_clicks: number;
    frugality: number;
    prestige_count: number;
    users: UserBlob | UserBlob[] | null;
  };
  return (pp as unknown as Row[]).map((r) => {
    const u = Array.isArray(r.users) ? r.users[0] : r.users;
    return {
      userId: r.user_id,
      username: u?.username ?? "?",
      avatarColor: u?.avatar_color ?? "var(--gold-300)",
      initials: u?.initials ?? "??",
      lifetimePCEarned: r.lifetime_pc_earned,
      lifetimeClicks: r.lifetime_clicks,
      frugality: r.frugality,
      prestigeCount: r.prestige_count,
      walletBalance: balanceById[r.user_id] ?? 0,
      isMe: r.user_id === meId,
    };
  });
}

// GET /api/earn/penny-pinchers/state
//
// Lazy-creates the player's row on first visit, then computes any
// passive PC earned by helpers since `last_tick_at` (capped to a
// reasonable offline window) and persists it. Also resets the
// daily-banked counter when the UTC date rolls over.
export async function GET() {
  const s = await readSession();
  if (!s) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  let state = await getPennyPinchersState(s.user.id);
  const now = new Date();
  const todayUtc = now.toISOString().slice(0, 10);

  if (!state) {
    state = await upsertPennyPinchersState({
      user_id: s.user.id,
      cents: 0,
      lifetime_clicks: 0,
      lifetime_pc_earned: 0,
      last_tick_at: now.toISOString(),
      last_bank_at: null,
      daily_banked_cents: 0,
      daily_banked_day: todayUtc,
      prestige_count: 0,
      bank_tokens: 0,
      lifetime_banked_cents: 0,
      last_prestige_at: null,
      frugality: 0,
      album: {},
      relics: {},
      created_at: now.toISOString(),
    });
  }

  const helpers = await listPennyPinchersHelpers(s.user.id);
  const helperCounts: Record<string, number> = {};
  for (const h of helpers) helperCounts[h.helper_id] = h.count;

  const permRows = await listPennyPinchersPermUpgrades(s.user.id);
  const permLevels: Partial<Record<PermUpgradeId, number>> = {};
  for (const u of permRows) permLevels[u.upgrade_id as PermUpgradeId] = u.level;

  const relics = (state.relics ?? {}) as Record<string, number>;
  const relicE = relicEffects(relics as Parameters<typeof relicEffects>[0]);

  // Offline accrual — only credit if we actually owe something.
  const rate = helperRatePcPerSec(helperCounts, permLevels, relicE);
  const lastTickDate = state.last_tick_at ? new Date(state.last_tick_at) : null;
  const accrued = offlinePCAccrued(rate, lastTickDate, permLevels, now);
  // Welcome-back UI only fires when the player was meaningfully
  // away — not every 5s sync poll. 60s gap is the floor.
  const gapSeconds = lastTickDate ? (now.getTime() - lastTickDate.getTime()) / 1000 : 0;
  const welcomeBackPC = gapSeconds >= 60 ? accrued : 0;

  // Daily-banked rollover
  const needsDayReset = state.daily_banked_day !== todayUtc;

  if (accrued > 0 || needsDayReset || !state.last_tick_at) {
    state = await upsertPennyPinchersState({
      ...state,
      cents: state.cents + accrued,
      lifetime_pc_earned: state.lifetime_pc_earned + accrued,
      last_tick_at: now.toISOString(),
      daily_banked_cents: needsDayReset ? 0 : state.daily_banked_cents,
      daily_banked_day: todayUtc,
    });
  }

  const upgrades = await listPennyPinchersUpgrades(s.user.id);
  const upgradeLevels: Record<string, number> = {};
  for (const u of upgrades) upgradeLevels[u.upgrade_id] = u.level;

  // Achievement detection — runs after the offline-accrual upsert
  // so any one-shot milestones triggered by the catch-up are
  // captured in the same fetch. Newly unlocked rows are inserted
  // and their bank-token rewards are added to state in one upsert.
  const unlockedRows = await listPennyPinchersAchievements(s.user.id);
  const alreadyUnlocked = new Set(unlockedRows.map((r) => r.achievement_id));
  const newlyUnlocked = detectNewUnlocks(
    {
      lifetimeClicks: state.lifetime_clicks,
      prestigeCount: state.prestige_count,
      lifetimeBankedCents: state.lifetime_banked_cents,
      frugality: state.frugality,
      helpers: helperCounts as Partial<Record<HelperId, number>>,
      upgrades: upgradeLevels as Partial<Record<UpgradeId, number>>,
      album: state.album ?? {},
      relics,
    },
    alreadyUnlocked,
  );
  if (newlyUnlocked.length > 0) {
    await insertPennyPinchersAchievements(s.user.id, newlyUnlocked);
    const tokenReward = newlyUnlocked.reduce(
      (sum, id) => sum + (ACHIEVEMENTS_BY_ID[id]?.reward ?? 0),
      0,
    );
    // Frugality tail rewards on Frugal Saver / Saint stack on top of
    // the Bank Token reward. Capped at +50 (the run-side ceiling).
    const FRUGALITY_MAX = 50;
    const frugalityReward = newlyUnlocked.reduce(
      (sum, id) => sum + (ACHIEVEMENTS_BY_ID[id]?.frugalityReward ?? 0),
      0,
    );
    const newFrugality = frugalityReward > 0
      ? Math.min(FRUGALITY_MAX, state.frugality + frugalityReward)
      : state.frugality;
    if (tokenReward > 0 || newFrugality !== state.frugality) {
      state = await upsertPennyPinchersState({
        ...state,
        bank_tokens: state.bank_tokens + tokenReward,
        frugality: newFrugality,
      });
    }
  }

  // Leaderboard piggy-backs on the same poll so the player isn't
  // making a separate /leaderboard request every 30s. Failure is
  // non-fatal — empty array degrades gracefully in the UI.
  const leaderboard = await fetchLeaderboard(s.user.id).catch(() => [] as LeaderboardRow[]);

  return NextResponse.json({
    serverNow: now.getTime(),
    cents: state.cents,
    lifetimeClicks: state.lifetime_clicks,
    lifetimePCEarned: state.lifetime_pc_earned,
    upgrades: upgradeLevels,
    helpers: helperCounts,
    perm: permLevels,
    helperRatePerSec: rate,
    offlineAccruedJustNow: accrued,
    welcomeBackPC,
    offlineCapHours: offlineCapHours(permLevels),
    bank: {
      pcPerWalletCent: BANK_PC_PER_WALLET_CENT,
    },
    prestige: {
      count: state.prestige_count,
      bankTokens: state.bank_tokens,
      // The wire-side `thresholdPC` field name is preserved for
      // compatibility with the existing client; its value is now the
      // cents threshold (the lifetime PC threshold is gone).
      thresholdPC: PRESTIGE_THRESHOLD_CENTS,
      tokensIfRolled: bankTokensFromCurrentCents(state.cents),
      lifetimeBanked: state.lifetime_banked_cents,
    },
    achievements: {
      unlocked: [...alreadyUnlocked, ...newlyUnlocked],
      newlyUnlocked,
    },
    frugality: state.frugality,
    album: state.album ?? {},
    relics,
    relicEffects: relicE,
    walletBalance: await getBalance(s.user.id),
    leaderboard,
  });
}
