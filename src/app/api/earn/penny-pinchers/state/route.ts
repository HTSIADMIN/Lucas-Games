import { NextResponse } from "next/server";
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
  BANK_COOLDOWN_MS,
  BANK_PC_PER_WALLET_CENT,
  DAILY_BANK_CAP,
  MAX_BANK_PAYOUT,
  PRESTIGE_THRESHOLD_PC,
  type AchievementId,
  type HelperId,
  type PermUpgradeId,
  type UpgradeId,
} from "@/lib/games/penny-pinchers/catalog";
import {
  bankTokensFromPrestige,
  detectNewUnlocks,
  helperRatePcPerSec,
  offlineCapHours,
  offlinePCAccrued,
} from "@/lib/games/penny-pinchers/engine";

export const runtime = "nodejs";

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
      created_at: now.toISOString(),
    });
  }

  const helpers = await listPennyPinchersHelpers(s.user.id);
  const helperCounts: Record<string, number> = {};
  for (const h of helpers) helperCounts[h.helper_id] = h.count;

  const permRows = await listPennyPinchersPermUpgrades(s.user.id);
  const permLevels: Partial<Record<PermUpgradeId, number>> = {};
  for (const u of permRows) permLevels[u.upgrade_id as PermUpgradeId] = u.level;

  // Offline accrual — only credit if we actually owe something.
  const rate = helperRatePcPerSec(helperCounts, permLevels);
  const accrued = offlinePCAccrued(
    rate,
    state.last_tick_at ? new Date(state.last_tick_at) : null,
    permLevels,
    now,
  );

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
      helpers: helperCounts as Partial<Record<HelperId, number>>,
      upgrades: upgradeLevels as Partial<Record<UpgradeId, number>>,
    },
    alreadyUnlocked,
  );
  if (newlyUnlocked.length > 0) {
    await insertPennyPinchersAchievements(s.user.id, newlyUnlocked);
    const tokenReward = newlyUnlocked.reduce(
      (sum, id) => sum + (ACHIEVEMENTS_BY_ID[id]?.reward ?? 0),
      0,
    );
    if (tokenReward > 0) {
      state = await upsertPennyPinchersState({
        ...state,
        bank_tokens: state.bank_tokens + tokenReward,
      });
    }
  }

  // Bank cooldown
  const lastBankMs = state.last_bank_at ? new Date(state.last_bank_at).getTime() : 0;
  const bankReadyAt = lastBankMs > 0 ? lastBankMs + BANK_COOLDOWN_MS : 0;

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
    offlineCapHours: offlineCapHours(permLevels),
    bank: {
      pcPerWalletCent: BANK_PC_PER_WALLET_CENT,
      cooldownMs: BANK_COOLDOWN_MS,
      readyAt: bankReadyAt,
      maxPerBank: MAX_BANK_PAYOUT,
      dailyCap: DAILY_BANK_CAP,
      dailyBanked: state.daily_banked_cents,
    },
    prestige: {
      count: state.prestige_count,
      bankTokens: state.bank_tokens,
      thresholdPC: PRESTIGE_THRESHOLD_PC,
      tokensIfRolled: bankTokensFromPrestige(state.lifetime_pc_earned),
      lifetimeBanked: state.lifetime_banked_cents,
    },
    achievements: {
      unlocked: [...alreadyUnlocked, ...newlyUnlocked],
      newlyUnlocked,
    },
    walletBalance: await getBalance(s.user.id),
  });
}
