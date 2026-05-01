import { NextResponse } from "next/server";
import { readSession } from "@/lib/auth/session";
import { listPokerTables } from "@/lib/games/poker/scheduler";

export const runtime = "nodejs";

// Read the available stakes tiers. Used by the poker client's
// table-picker overlay before sitting down.
export async function GET() {
  const s = await readSession();
  if (!s) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const tables = await listPokerTables();
  return NextResponse.json({
    tables: tables.map((t) => ({
      id: t.id,
      name: t.name,
      smallBlind: t.small_blind,
      bigBlind: t.big_blind,
      maxSeats: t.max_seats,
      minBuyIn: t.big_blind * 20,
    })),
  });
}
