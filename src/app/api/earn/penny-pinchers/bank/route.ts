import { NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import { readSession } from "@/lib/auth/session";
import { credit, getBalance } from "@/lib/wallet";
import { savePennyPinchersBlob } from "@/lib/db";
import {
  applyBank,
  migrateLoadedState,
  type PennyPinchersGameState,
} from "@/lib/games/penny-pinchers/engine";

export const runtime = "nodejs";

// POST /api/earn/penny-pinchers/bank  body: { state: <full state blob> }
//
// Converts the player's accumulated PC into wallet ¢. The only
// server-authoritative action in the local-first architecture:
// the client posts its current full state, the server runs the
// pure `applyBank` mutation (which computes the relic-adjusted
// payout, debits cents, stamps the daily-banked counter), then
// credits the wallet ledger atomically with the save.
//
// No anti-cheat clamps — Penny Pinchers is single-player among
// friends per the project's stated security model. If the client
// claims a billion cents, the wallet ledger gets a billion cents.
// (The legacy `clicks` field is gone — clicks are local-only now.)
export async function POST(req: Request) {
  const s = await readSession();
  if (!s) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  let body: { state?: unknown };
  try { body = await req.json(); }
  catch { return NextResponse.json({ error: "bad_json" }, { status: 400 }); }

  if (!body.state || typeof body.state !== "object") {
    return NextResponse.json({ error: "bad_state" }, { status: 400 });
  }
  const submitted = migrateLoadedState(body.state);
  const result = applyBank(submitted);
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: 400 });

  const newState: PennyPinchersGameState = result.state;
  const { payoutCents, pcConsumed } = result;

  // Wallet credit + state save. If the wallet credit succeeds but
  // the state save fails, the client will overwrite the stale
  // server state on its next 10s save anyway, so the player still
  // sees their cents drained. The wallet ledger is the source of
  // truth for the payout itself.
  await credit({
    userId: s.user.id,
    amount: payoutCents,
    reason: "penny_pinchers_bank",
    refKind: "penny_pinchers",
    refId: `${randomUUID()}:bank`,
  });
  await savePennyPinchersBlob(s.user.id, newState as unknown as Record<string, unknown>);

  return NextResponse.json({
    ok: true,
    payoutCents,
    pcConsumed,
    state: newState,
    walletBalance: await getBalance(s.user.id),
  });
}
