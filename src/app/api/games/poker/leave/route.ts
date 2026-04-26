import { NextResponse } from "next/server";
import { readSession } from "@/lib/auth/session";
import { getDefaultTableId, leaveTable } from "@/lib/games/poker/scheduler";
import { getBalance } from "@/lib/wallet";

export const runtime = "nodejs";

export async function POST() {
  const s = await readSession();
  if (!s) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const tableId = await getDefaultTableId();
  if (!tableId) return NextResponse.json({ error: "no_table" }, { status: 500 });
  const r = await leaveTable(tableId, s.user.id);
  if (!r.ok) return NextResponse.json({ error: r.error }, { status: 400 });
  return NextResponse.json({ ok: true, cashedOut: r.cashedOut, balance: await getBalance(s.user.id) });
}
