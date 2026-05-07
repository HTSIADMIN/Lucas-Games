import { NextResponse } from "next/server";
import { randomInt } from "node:crypto";
import { readSession } from "@/lib/auth/session";
import {
  getPennyPinchersState,
  upsertPennyPinchersState,
} from "@/lib/db";
import {
  CHESTS,
  RELICS_BY_ID,
  type ChestTier,
  type RelicId,
} from "@/lib/games/penny-pinchers/catalog";
import { rollRelicFromChest } from "@/lib/games/penny-pinchers/engine";

export const runtime = "nodejs";

// POST /api/earn/penny-pinchers/relic-chest  body: { tier: "bronze"|"silver"|"gold" }
//
// Spends Frugality on a chest and rolls a random relic from the
// tier's weight table. If the player already owns the relic, its
// level increments (capped at maxLevel). Otherwise level 1.
export async function POST(req: Request) {
  const s = await readSession();
  if (!s) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  let body: { tier?: unknown };
  try { body = await req.json(); }
  catch { return NextResponse.json({ error: "bad_json" }, { status: 400 }); }

  const tier = String(body.tier ?? "") as ChestTier;
  const def = CHESTS[tier];
  if (!def) return NextResponse.json({ error: "bad_tier" }, { status: 400 });

  const state = await getPennyPinchersState(s.user.id);
  if (!state) return NextResponse.json({ error: "no_state" }, { status: 400 });
  if (state.frugality < def.cost) {
    return NextResponse.json({ error: "insufficient_frugality" }, { status: 400 });
  }

  // Crypto-grade RNG. randomInt(0, 1_000_000) / 1_000_000 gives a
  // uniform [0,1) without bias the way Math.random does.
  const rand01 = () => randomInt(0, 1_000_000) / 1_000_000;
  const rolled = rollRelicFromChest(tier, rand01);
  if (!rolled) return NextResponse.json({ error: "roll_failed" }, { status: 500 });

  const relics = { ...(state.relics ?? {}) } as Record<string, number>;
  const before = relics[rolled.id] ?? 0;
  const maxedOut = before >= rolled.maxLevel;
  const newLevel = Math.min(rolled.maxLevel, before + 1);
  relics[rolled.id] = newLevel;

  const updated = await upsertPennyPinchersState({
    ...state,
    frugality: state.frugality - def.cost,
    relics,
    last_tick_at: new Date().toISOString(),
  });

  return NextResponse.json({
    ok: true,
    tier,
    relicId: rolled.id satisfies RelicId,
    label: rolled.label,
    rarity: rolled.rarity,
    description: rolled.description,
    newLevel,
    maxLevel: rolled.maxLevel,
    duplicateAtMax: maxedOut,
    frugality: updated.frugality,
  });
}

void RELICS_BY_ID; // referenced only for the type union; keeps import alive