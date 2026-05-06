import { NextResponse } from "next/server";
import { readSession } from "@/lib/auth/session";
import {
  getPennyPinchersState,
  listPennyPinchersUpgrades,
  upsertPennyPinchersState,
  upsertPennyPinchersUpgrade,
} from "@/lib/db";
import { UPGRADES_BY_ID, type UpgradeId } from "@/lib/games/penny-pinchers/catalog";
import { nextUpgradeCost } from "@/lib/games/penny-pinchers/engine";

export const runtime = "nodejs";

// POST /api/earn/penny-pinchers/upgrade  body: { upgradeId }
export async function POST(req: Request) {
  const s = await readSession();
  if (!s) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  let body: { upgradeId?: unknown };
  try { body = await req.json(); }
  catch { return NextResponse.json({ error: "bad_json" }, { status: 400 }); }

  const upgradeId = String(body.upgradeId ?? "") as UpgradeId;
  if (!UPGRADES_BY_ID[upgradeId]) return NextResponse.json({ error: "bad_upgrade" }, { status: 400 });

  const state = await getPennyPinchersState(s.user.id);
  if (!state) return NextResponse.json({ error: "no_state" }, { status: 400 });

  const upgrades = await listPennyPinchersUpgrades(s.user.id);
  const current = upgrades.find((u) => u.upgrade_id === upgradeId);
  const currentLevel = current?.level ?? 0;

  const cost = nextUpgradeCost(upgradeId, currentLevel);
  if (cost == null) return NextResponse.json({ error: "max_level" }, { status: 400 });
  if (state.cents < cost) return NextResponse.json({ error: "insufficient_cents" }, { status: 400 });

  await upsertPennyPinchersState({
    ...state,
    cents: state.cents - cost,
    last_tick_at: new Date().toISOString(),
  });
  const newLevel = currentLevel + 1;
  await upsertPennyPinchersUpgrade({
    user_id: s.user.id,
    upgrade_id: upgradeId,
    level: newLevel,
  });

  return NextResponse.json({
    ok: true,
    cents: state.cents - cost,
    upgradeId,
    newLevel,
    cost,
  });
}
