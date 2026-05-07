import { NextResponse } from "next/server";
import { randomInt } from "node:crypto";
import { readSession } from "@/lib/auth/session";
import { getPennyPinchersState, upsertPennyPinchersState } from "@/lib/db";
import { CUSHION_LOOT, type CushionLootId } from "@/lib/games/penny-pinchers/catalog";
import { frugalityPCMultiplier } from "@/lib/games/penny-pinchers/engine";

export const runtime = "nodejs";

// POST /api/earn/penny-pinchers/cushion
//
// Resolves one cushion-flip from the Couch Cushion Dive event.
// Server rolls the loot table (so the client can't refresh-dodge
// a Lint outcome), credits PC, and bumps lifetime_clicks. The
// modal closes after COUCH_CUSHIONS reveals; we don't track that
// server-side — same trust model as the wallet event.
export async function POST() {
  const s = await readSession();
  if (!s) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const state = await getPennyPinchersState(s.user.id);
  if (!state) return NextResponse.json({ error: "no_state" }, { status: 400 });

  // Weighted roll using crypto-grade RNG.
  const totalWeight = CUSHION_LOOT.reduce((s, e) => s + e.weight, 0);
  let r = randomInt(0, totalWeight);
  let pick: typeof CUSHION_LOOT[number] = CUSHION_LOOT[0];
  for (const entry of CUSHION_LOOT) {
    r -= entry.weight;
    if (r < 0) { pick = entry; break; }
  }

  const pcGain = Math.round(pick.pc * frugalityPCMultiplier(state.frugality));
  const updated = await upsertPennyPinchersState({
    ...state,
    cents: state.cents + pcGain,
    lifetime_pc_earned: state.lifetime_pc_earned + pcGain,
    lifetime_clicks: state.lifetime_clicks + 1,
    last_tick_at: new Date().toISOString(),
  });

  return NextResponse.json({
    ok: true,
    loot: pick.id satisfies CushionLootId,
    label: pick.label,
    pcGain,
    cents: updated.cents,
  });
}
