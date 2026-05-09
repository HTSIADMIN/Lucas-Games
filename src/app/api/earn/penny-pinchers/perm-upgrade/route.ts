import { NextResponse } from "next/server";
import { readSession } from "@/lib/auth/session";
import {
  getPennyPinchersState,
  listPennyPinchersPermUpgrades,
  upsertPennyPinchersPermUpgrade,
  upsertPennyPinchersState,
} from "@/lib/db";
import { PERM_UPGRADES_BY_ID, type PermUpgradeId } from "@/lib/games/penny-pinchers/catalog";
import { nextPermUpgradeCost } from "@/lib/games/penny-pinchers/engine";
import { applyPendingClicksFromBody } from "@/lib/games/penny-pinchers/recordClicks";

export const runtime = "nodejs";

// POST /api/earn/penny-pinchers/perm-upgrade  body: { upgradeId, clicks? }
//
// Spends Bank Tokens (the prestige currency) on a permanent
// upgrade. These survive every Roll-It-Up, so the cost curve is
// steeper than per-run upgrades.
//
// `clicks` doesn't affect affordability (perm cost is in tokens, not
// cents) but the bundling keeps queued PC moving in the same packet
// instead of stranding it behind a buy.
export async function POST(req: Request) {
  const s = await readSession();
  if (!s) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  let body: { upgradeId?: unknown; clicks?: unknown };
  try { body = await req.json(); }
  catch { return NextResponse.json({ error: "bad_json" }, { status: 400 }); }

  const upgradeId = String(body.upgradeId ?? "") as PermUpgradeId;
  if (!PERM_UPGRADES_BY_ID[upgradeId]) {
    return NextResponse.json({ error: "bad_upgrade" }, { status: 400 });
  }

  await applyPendingClicksFromBody(s.user.id, body);

  const state = await getPennyPinchersState(s.user.id);
  if (!state) return NextResponse.json({ error: "no_state" }, { status: 400 });

  const permRows = await listPennyPinchersPermUpgrades(s.user.id);
  const current = permRows.find((u) => u.upgrade_id === upgradeId);
  const currentLevel = current?.level ?? 0;

  const cost = nextPermUpgradeCost(upgradeId, currentLevel);
  if (cost == null) return NextResponse.json({ error: "max_level" }, { status: 400 });
  if (state.bank_tokens < cost) {
    return NextResponse.json({ error: "insufficient_tokens" }, { status: 400 });
  }

  const newLevel = currentLevel + 1;
  await upsertPennyPinchersPermUpgrade({
    user_id: s.user.id,
    upgrade_id: upgradeId,
    level: newLevel,
  });
  await upsertPennyPinchersState({
    ...state,
    bank_tokens: state.bank_tokens - cost,
  });

  return NextResponse.json({
    ok: true,
    upgradeId,
    newLevel,
    cost,
    bankTokens: state.bank_tokens - cost,
  });
}
