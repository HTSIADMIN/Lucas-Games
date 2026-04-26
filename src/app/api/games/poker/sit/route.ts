import { NextResponse } from "next/server";
import { readSession } from "@/lib/auth/session";
import { getDefaultTableId, sitDown } from "@/lib/games/poker/scheduler";
import { getBalance } from "@/lib/wallet";

export const runtime = "nodejs";

export async function POST(req: Request) {
  const s = await readSession();
  if (!s) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  let body: { buyIn?: unknown };
  try { body = await req.json(); } catch { return NextResponse.json({ error: "bad_json" }, { status: 400 }); }
  const buyIn = Number(body.buyIn);
  if (!Number.isInteger(buyIn) || buyIn <= 0) return NextResponse.json({ error: "buyin_invalid" }, { status: 400 });
  const tableId = await getDefaultTableId();
  if (!tableId) return NextResponse.json({ error: "no_table" }, { status: 500 });
  const r = await sitDown(tableId, s.user.id, buyIn);
  if (!r.ok) return NextResponse.json({ error: r.error }, { status: 400 });
  return NextResponse.json({ ok: true, seatNo: r.seatNo, balance: await getBalance(s.user.id) });
}
