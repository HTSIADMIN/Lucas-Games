import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { readSession } from "@/lib/auth/session";
import { listPennyPinchersPermUpgrades, listPennyPinchersUpgrades } from "@/lib/db";
import {
  UPGRADES_BY_ID,
  type PermUpgradeId,
  type UpgradeId,
} from "@/lib/games/penny-pinchers/catalog";
import { effectiveUpgradeMaxLevel, nextUpgradeCost } from "@/lib/games/penny-pinchers/engine";

export const runtime = "nodejs";

// POST /api/earn/penny-pinchers/upgrade  body: { upgradeId }
//
// Switched off the old read-modify-write upsert pattern (which
// could debit cents without leveling up if the second write
// failed — e.g. the boardwalk "took my money but didn't level
// up" report). Now calls the pp_buy_upgrade RPC which folds
// both writes into a single transaction: atomic cents debit +
// atomic level increment, or both rolled back. The route still
// validates the upgrade id + max-level + cost client-side so
// the RPC payload matches the catalog constraints.
export async function POST(req: Request) {
  const s = await readSession();
  if (!s) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  let body: { upgradeId?: unknown };
  try { body = await req.json(); }
  catch { return NextResponse.json({ error: "bad_json" }, { status: 400 }); }

  const upgradeId = String(body.upgradeId ?? "") as UpgradeId;
  const def = UPGRADES_BY_ID[upgradeId];
  if (!def) return NextResponse.json({ error: "bad_upgrade" }, { status: 400 });

  // Read perm upgrades + run upgrades to compute the EFFECTIVE max
  // level (Higher Ceilings adds +10 per level). The RPC itself does
  // the atomic debit + level-up; we just gate it here.
  const [upgrades, permRows] = await Promise.all([
    listPennyPinchersUpgrades(s.user.id),
    listPennyPinchersPermUpgrades(s.user.id),
  ]);
  const permLevels: Partial<Record<PermUpgradeId, number>> = {};
  for (const u of permRows) permLevels[u.upgrade_id as PermUpgradeId] = u.level;

  const currentLevel = upgrades.find((u) => u.upgrade_id === upgradeId)?.level ?? 0;
  if (currentLevel >= effectiveUpgradeMaxLevel(def, permLevels)) {
    return NextResponse.json({ error: "max_level" }, { status: 400 });
  }
  const cost = nextUpgradeCost(upgradeId, currentLevel, permLevels);
  if (cost == null) return NextResponse.json({ error: "max_level" }, { status: 400 });

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    return NextResponse.json({ error: "config_missing" }, { status: 500 });
  }
  const sb = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data, error } = await sb.rpc("pp_buy_upgrade", {
    p_user_id: s.user.id,
    p_upgrade_id: upgradeId,
    p_cost: cost,
  });
  if (error) {
    console.error("[pp_buy_upgrade]", error);
    return NextResponse.json({ error: "rpc_failed", detail: error.message }, { status: 500 });
  }

  type RpcResult = { ok: true; cents: number; newLevel: number } | { ok: false; error: string };
  const result = data as RpcResult;
  if (!result?.ok) {
    return NextResponse.json({ error: result?.error ?? "unknown" }, { status: 400 });
  }

  return NextResponse.json({
    ok: true,
    cents: result.cents,
    upgradeId,
    newLevel: result.newLevel,
    cost,
  });
}
