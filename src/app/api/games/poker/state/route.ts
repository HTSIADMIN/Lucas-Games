import { NextResponse } from "next/server";
import { readSession } from "@/lib/auth/session";
import { getDefaultTableId, getStateView, tableExists } from "@/lib/games/poker/scheduler";
import { getBalance } from "@/lib/wallet";

export const runtime = "nodejs";

// Returns the live state for whichever stakes tier the player is
// looking at. `?table=<id>` overrides the default Saloon table so
// the client can render Frontier / Boomtown / Gold Mine / Tycoon.
export async function GET(req: Request) {
  const s = await readSession();
  if (!s) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const url = new URL(req.url);
  const requested = url.searchParams.get("table");
  let tableId = requested && (await tableExists(requested)) ? requested : null;
  if (!tableId) tableId = await getDefaultTableId();
  if (!tableId) return NextResponse.json({ error: "no_table" }, { status: 500 });
  const view = await getStateView(tableId, s.user.id);
  if (!view) return NextResponse.json({ error: "no_state" }, { status: 500 });
  return NextResponse.json({ ...view, balance: await getBalance(s.user.id) });
}
