import { NextResponse } from "next/server";
import { readSession } from "@/lib/auth/session";
import { getDefaultTableId, sitDown, tableExists } from "@/lib/games/poker/scheduler";
import { getBalance } from "@/lib/wallet";

export const runtime = "nodejs";

export async function POST(req: Request) {
  const s = await readSession();
  if (!s) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  let body: { buyIn?: unknown; tableId?: unknown };
  try { body = await req.json(); } catch { return NextResponse.json({ error: "bad_json" }, { status: 400 }); }
  const buyIn = Number(body.buyIn);
  if (!Number.isInteger(buyIn) || buyIn <= 0) return NextResponse.json({ error: "buyin_invalid" }, { status: 400 });
  // Optional tableId — if missing or unknown we fall back to The
  // Saloon so old clients keep working.
  const requested = typeof body.tableId === "string" ? body.tableId : null;
  let tableId = requested && (await tableExists(requested)) ? requested : null;
  if (!tableId) tableId = await getDefaultTableId();
  if (!tableId) return NextResponse.json({ error: "no_table" }, { status: 500 });
  const r = await sitDown(tableId, s.user.id, buyIn);
  if (!r.ok) return NextResponse.json({ error: r.error }, { status: 400 });
  return NextResponse.json({ ok: true, seatNo: r.seatNo, tableId, balance: await getBalance(s.user.id) });
}
