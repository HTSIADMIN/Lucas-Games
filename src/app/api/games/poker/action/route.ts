import { NextResponse } from "next/server";
import { readSession } from "@/lib/auth/session";
import { applyAction, getDefaultTableId, tableExists } from "@/lib/games/poker/scheduler";
import { getBalance } from "@/lib/wallet";

export const runtime = "nodejs";

export async function POST(req: Request) {
  const s = await readSession();
  if (!s) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  let body: { action?: "fold" | "check" | "call" | "raise" | "all_in"; raiseTo?: number; tableId?: string };
  try { body = await req.json(); } catch { return NextResponse.json({ error: "bad_json" }, { status: 400 }); }
  if (!body.action) return NextResponse.json({ error: "no_action" }, { status: 400 });
  const requested = body.tableId ?? null;
  let tableId = requested && (await tableExists(requested)) ? requested : null;
  if (!tableId) tableId = await getDefaultTableId();
  if (!tableId) return NextResponse.json({ error: "no_table" }, { status: 500 });
  const r = await applyAction(tableId, s.user.id, body.action, body.raiseTo);
  if (!r.ok) return NextResponse.json({ error: r.error }, { status: 400 });
  return NextResponse.json({ ok: true, balance: await getBalance(s.user.id) });
}
