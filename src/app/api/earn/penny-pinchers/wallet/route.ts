import { NextResponse } from "next/server";
import { readSession } from "@/lib/auth/session";
import { getPennyPinchersState, upsertPennyPinchersState } from "@/lib/db";
import {
  FRUGALITY_MAX,
  FRUGALITY_MIN,
  LOST_WALLET_KEEP_FRUGALITY,
  LOST_WALLET_KEEP_MAX_PC,
  LOST_WALLET_KEEP_PC,
  LOST_WALLET_KEEP_WEALTH_PCT,
  LOST_WALLET_RETURN_FRUGALITY,
} from "@/lib/games/penny-pinchers/catalog";
import { relicEffects } from "@/lib/games/penny-pinchers/engine";

export const runtime = "nodejs";

// POST /api/earn/penny-pinchers/wallet  body: { choice: "return" | "keep" }
//
// Resolves a Lost Wallet event. "Return It" raises Frugality and
// pays nothing; "Keep the Change" pays a flat PC bundle and lowers
// Frugality. Frugality is clamped to [FRUGALITY_MIN, FRUGALITY_MAX].
// Spawn-side validation is intentionally light — the wallet sprite
// is a client-side roll, so the worst a tampered client can do is
// claim a wallet that wasn't actually shown. Cap the keep payout
// here and lean on the bank's daily wallet ¢ ceiling for abuse.
export async function POST(req: Request) {
  const s = await readSession();
  if (!s) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  let body: { choice?: unknown };
  try { body = await req.json(); }
  catch { return NextResponse.json({ error: "bad_json" }, { status: 400 }); }

  const choice = body.choice === "return" ? "return" : body.choice === "keep" ? "keep" : null;
  if (choice == null) return NextResponse.json({ error: "bad_choice" }, { status: 400 });

  const state = await getPennyPinchersState(s.user.id);
  if (!state) return NextResponse.json({ error: "no_state" }, { status: 400 });

  // Saint's Mark relic adds extra Frugality on returns — stacks on
  // top of the base +1 from LOST_WALLET_RETURN_FRUGALITY.
  const relicE = relicEffects(state.relics as Parameters<typeof relicEffects>[0]);
  const returnBonus = choice === "return" ? relicE.returnFrugalityBonus : 0;
  const delta =
    choice === "return"
      ? LOST_WALLET_RETURN_FRUGALITY + returnBonus
      : LOST_WALLET_KEEP_FRUGALITY;
  // Keep-the-Change scales with current wealth — finding a fat
  // wallet on the late-game sidewalk should pay better than one
  // by a broke beginner. Floor + 15% of cents, capped 50k PC.
  const pcGain =
    choice === "keep"
      ? Math.min(
          LOST_WALLET_KEEP_MAX_PC,
          LOST_WALLET_KEEP_PC + Math.floor(state.cents * LOST_WALLET_KEEP_WEALTH_PCT),
        )
      : 0;
  const nextFrugality = Math.min(FRUGALITY_MAX, Math.max(FRUGALITY_MIN, state.frugality + delta));

  const updated = await upsertPennyPinchersState({
    ...state,
    cents: state.cents + pcGain,
    lifetime_pc_earned: state.lifetime_pc_earned + pcGain,
    frugality: nextFrugality,
    last_tick_at: new Date().toISOString(),
  });

  return NextResponse.json({
    ok: true,
    choice,
    pcGain,
    frugality: updated.frugality,
    cents: updated.cents,
  });
}
