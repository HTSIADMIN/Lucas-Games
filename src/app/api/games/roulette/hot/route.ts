import { NextResponse } from "next/server";
import { readSession } from "@/lib/auth/session";
import { getHotNumber, HOT_PAYOUT, STRAIGHT_PAYOUT } from "@/lib/games/roulette/hot";

export const runtime = "nodejs";

// Lightweight read used by the roulette client to display the
// glowing "hot number" cell on the bet grid. Polled every 5s while
// the player is at the table.
export async function GET() {
  const s = await readSession();
  if (!s) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const hot = getHotNumber();
  return NextResponse.json({
    value: hot.value,
    expiresAt: hot.expiresAt,
    straightPayout: STRAIGHT_PAYOUT,
    hotPayout: HOT_PAYOUT,
  });
}
