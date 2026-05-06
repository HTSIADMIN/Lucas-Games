import { NextResponse } from "next/server";
import { readSession } from "@/lib/auth/session";
import {
  getPennyPinchersState,
  listPennyPinchersHelpers,
  upsertPennyPinchersHelper,
  upsertPennyPinchersState,
} from "@/lib/db";
import { HELPERS_BY_ID, type HelperId } from "@/lib/games/penny-pinchers/catalog";
import { nextHelperCost } from "@/lib/games/penny-pinchers/engine";

export const runtime = "nodejs";

// POST /api/earn/penny-pinchers/hire  body: { helperId }
export async function POST(req: Request) {
  const s = await readSession();
  if (!s) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  let body: { helperId?: unknown };
  try { body = await req.json(); }
  catch { return NextResponse.json({ error: "bad_json" }, { status: 400 }); }

  const helperId = String(body.helperId ?? "") as HelperId;
  if (!HELPERS_BY_ID[helperId]) return NextResponse.json({ error: "bad_helper" }, { status: 400 });

  const state = await getPennyPinchersState(s.user.id);
  if (!state) return NextResponse.json({ error: "no_state" }, { status: 400 });

  const helpers = await listPennyPinchersHelpers(s.user.id);
  const current = helpers.find((h) => h.helper_id === helperId);
  const currentCount = current?.count ?? 0;

  const cost = nextHelperCost(helperId, currentCount);
  if (cost == null) return NextResponse.json({ error: "max_owned" }, { status: 400 });
  if (state.cents < cost) return NextResponse.json({ error: "insufficient_cents" }, { status: 400 });

  // Stamp last_tick_at when adding a new helper so offline accrual
  // starts from now (otherwise the brand-new helper would
  // back-credit time when they didn't yet exist).
  await upsertPennyPinchersState({
    ...state,
    cents: state.cents - cost,
    last_tick_at: new Date().toISOString(),
  });
  const newCount = currentCount + 1;
  await upsertPennyPinchersHelper({
    user_id: s.user.id,
    helper_id: helperId,
    count: newCount,
  });

  return NextResponse.json({
    ok: true,
    cents: state.cents - cost,
    helperId,
    newCount,
    cost,
  });
}
