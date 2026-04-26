import { NextResponse } from "next/server";
import { readSession } from "@/lib/auth/session";
import { getDefaultTableId, getStateView } from "@/lib/games/poker/scheduler";
import { getBalance } from "@/lib/wallet";

export const runtime = "nodejs";

export async function GET() {
  const s = await readSession();
  if (!s) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const tableId = await getDefaultTableId();
  if (!tableId) return NextResponse.json({ error: "no_table" }, { status: 500 });
  const view = await getStateView(tableId, s.user.id);
  if (!view) return NextResponse.json({ error: "no_state" }, { status: 500 });
  return NextResponse.json({ ...view, balance: await getBalance(s.user.id) });
}
