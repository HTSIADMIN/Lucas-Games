import { NextResponse } from "next/server";
import { readSession } from "@/lib/auth/session";
import { getPennyPinchersState, upsertPennyPinchersState } from "@/lib/db";
import { BLESSINGS, type BlessingId } from "@/lib/games/penny-pinchers/catalog";
import { applyPendingClicksFromBody } from "@/lib/games/penny-pinchers/recordClicks";

export const runtime = "nodejs";

// POST /api/earn/penny-pinchers/blessing  body: { blessingId, clicks? }
//
// Buys a Wishing Fountain blessing — debits the cost in PC and
// hands the duration back. The buff itself runs client-side so we
// don't need to persist anything beyond the cents debit.
//
// Optional `clicks` flushes the queue first so a buy doesn't get
// rejected for stale cents.
export async function POST(req: Request) {
  const s = await readSession();
  if (!s) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  let body: { blessingId?: unknown; clicks?: unknown };
  try { body = await req.json(); }
  catch { return NextResponse.json({ error: "bad_json" }, { status: 400 }); }

  const blessingId = String(body.blessingId ?? "") as BlessingId;
  const def = BLESSINGS[blessingId];
  if (!def) return NextResponse.json({ error: "bad_blessing" }, { status: 400 });

  await applyPendingClicksFromBody(s.user.id, body);

  const state = await getPennyPinchersState(s.user.id);
  if (!state) return NextResponse.json({ error: "no_state" }, { status: 400 });
  if (state.cents < def.cost) {
    return NextResponse.json({ error: "insufficient_pc" }, { status: 400 });
  }

  // Frugality cap matches the catalog's +50 trophy ceiling.
  const FRUGALITY_MAX = 50;
  const frugalityGain = def.frugality ?? 0;
  const newFrugality = Math.min(FRUGALITY_MAX, state.frugality + frugalityGain);

  const updated = await upsertPennyPinchersState({
    ...state,
    cents: state.cents - def.cost,
    frugality: newFrugality,
    last_tick_at: new Date().toISOString(),
  });

  return NextResponse.json({
    ok: true,
    blessingId,
    cost: def.cost,
    durationMs: def.durationMs,
    cents: updated.cents,
    frugality: updated.frugality,
    frugalityGained: newFrugality - state.frugality,
  });
}
