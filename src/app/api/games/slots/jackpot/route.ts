import { NextResponse } from "next/server";
import { readSession } from "@/lib/auth/session";
import { getJackpotPool } from "@/lib/games/slots/jackpot";

export const runtime = "nodejs";

// Lightweight read of the current Boomtown jackpot pool. Polled by
// the slots client to keep the marquee number above the machine
// current while the player isn't spinning.
export async function GET() {
  const s = await readSession();
  if (!s) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  return NextResponse.json({ pool: getJackpotPool() });
}
