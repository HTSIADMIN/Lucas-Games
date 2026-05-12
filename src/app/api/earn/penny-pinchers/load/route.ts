import { NextResponse } from "next/server";
import { readSession } from "@/lib/auth/session";
import { getBalance } from "@/lib/wallet";
import {
  getPennyPinchersBlob,
  getPennyPinchersState,
  listPennyPinchersAchievements,
  listPennyPinchersHelpers,
  listPennyPinchersPermUpgrades,
  listPennyPinchersUpgrades,
  savePennyPinchersBlob,
} from "@/lib/db";
import type { AchievementId, HelperId, PermUpgradeId, UpgradeId } from "@/lib/games/penny-pinchers/catalog";
import {
  freshGameState,
  migrateLoadedState,
  type PennyPinchersGameState,
} from "@/lib/games/penny-pinchers/engine";

export const runtime = "nodejs";

// GET /api/earn/penny-pinchers/load
//
// Returns the player's full Penny Pinchers state blob. If the blob
// is null (first read after the local-first migration shipped) we
// seed it from the legacy normalized tables so existing players keep
// their progress; otherwise we just return what's there.
//
// Offline helper accrual is NOT applied here — that's a client-side
// concern now (the engine's applyOfflineAccrual function does it
// once the client has the loaded state in memory). The server's
// only job is faithful persistence.
async function seedBlobFromLegacy(userId: string): Promise<PennyPinchersGameState> {
  const fresh = freshGameState();
  // Read every legacy normalized row in parallel — single round-trip
  // per table. If the player has nothing on file, the freshGameState
  // we built above is what we'll return.
  const [legacy, upgrades, helpers, permRows, achievements] = await Promise.all([
    getPennyPinchersState(userId),
    listPennyPinchersUpgrades(userId),
    listPennyPinchersHelpers(userId),
    listPennyPinchersPermUpgrades(userId),
    listPennyPinchersAchievements(userId),
  ]);
  if (!legacy) return fresh;
  const upgradesMap: Partial<Record<UpgradeId, number>> = {};
  for (const u of upgrades) upgradesMap[u.upgrade_id as UpgradeId] = u.level;
  const helpersMap: Partial<Record<HelperId, number>> = {};
  for (const h of helpers) helpersMap[h.helper_id as HelperId] = h.count;
  const permMap: Partial<Record<PermUpgradeId, number>> = {};
  for (const p of permRows) permMap[p.upgrade_id as PermUpgradeId] = p.level;
  return {
    ...fresh,
    cents: Number(legacy.cents ?? 0),
    lifetimeClicks: Number(legacy.lifetime_clicks ?? 0),
    lifetimePCEarned: Number(legacy.lifetime_pc_earned ?? 0),
    lastTickAt: legacy.last_tick_at ? new Date(legacy.last_tick_at).getTime() : null,
    lastBankAt: legacy.last_bank_at ? new Date(legacy.last_bank_at).getTime() : null,
    dailyBankedCents: Number(legacy.daily_banked_cents ?? 0),
    dailyBankedDay: legacy.daily_banked_day ?? null,
    prestigeCount: Number(legacy.prestige_count ?? 0),
    bankTokens: Number(legacy.bank_tokens ?? 0),
    lifetimeBankedCents: Number(legacy.lifetime_banked_cents ?? 0),
    lastPrestigeAt: legacy.last_prestige_at ? new Date(legacy.last_prestige_at).getTime() : null,
    frugality: Number(legacy.frugality ?? 0),
    upgrades: upgradesMap,
    helpers: helpersMap,
    perm: permMap,
    album: (legacy.album ?? {}) as PennyPinchersGameState["album"],
    relics: (legacy.relics ?? {}) as PennyPinchersGameState["relics"],
    achievementsUnlocked: achievements.map((a) => a.achievement_id as AchievementId),
  };
}

export async function GET() {
  const s = await readSession();
  if (!s) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { blob, lastSavedAt } = await getPennyPinchersBlob(s.user.id);

  let state: PennyPinchersGameState;
  let seeded = false;
  if (blob == null) {
    state = await seedBlobFromLegacy(s.user.id);
    seeded = true;
  } else {
    state = migrateLoadedState(blob);
  }

  // Persist the seeded blob immediately so subsequent /load calls
  // skip the legacy migration path. Failing here is non-fatal —
  // we'll just try again next time the player loads.
  if (seeded) {
    try {
      await savePennyPinchersBlob(s.user.id, state as unknown as Record<string, unknown>);
    } catch (err) {
      console.error("[pp:load] seed save failed", err);
    }
  }

  const walletBalance = await getBalance(s.user.id);

  return NextResponse.json({
    ok: true,
    state,
    lastSavedAt,
    walletBalance,
    serverNow: Date.now(),
  });
}
