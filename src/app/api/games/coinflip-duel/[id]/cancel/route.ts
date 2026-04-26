import { NextResponse } from "next/server";
import { readSession } from "@/lib/auth/session";
import { credit, getBalance } from "@/lib/wallet";
import { getCoinflipDuel, updateCoinflipDuel } from "@/lib/db";

export const runtime = "nodejs";

export async function POST(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const s = await readSession();
  if (!s) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { id } = await ctx.params;
  const duel = await getCoinflipDuel(id);
  if (!duel) return NextResponse.json({ error: "not_found" }, { status: 404 });
  if (duel.status !== "open") return NextResponse.json({ error: "not_open" }, { status: 400 });
  if (duel.challenger_id !== s.user.id) return NextResponse.json({ error: "not_yours" }, { status: 403 });

  // Refund the escrow.
  await credit({
    userId: s.user.id,
    amount: duel.wager,
    reason: "coinflip_duel_refund",
    refKind: "coinflip_duel",
    refId: `${id}:refund`,
  });
  await updateCoinflipDuel(id, {
    status: "cancelled",
    resolved_at: new Date().toISOString(),
  });

  return NextResponse.json({ ok: true, balance: await getBalance(s.user.id) });
}
