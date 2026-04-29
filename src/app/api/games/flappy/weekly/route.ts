import { NextResponse } from "next/server";
import { readSession } from "@/lib/auth/session";
import {
  WEEKLY_TOP_REWARD,
  arcadeEnabled,
  lastSettledResult,
  settleStaleWeeks,
  topWeekly,
  weekBounds,
} from "@/lib/arcade/weekly";

export const runtime = "nodejs";

export async function GET() {
  const s = await readSession();
  if (!s) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  if (!arcadeEnabled()) {
    return NextResponse.json({ ok: true, rows: [], lastWeek: null, weekEnd: null, reward: 0 });
  }
  // Settle the previous week (if not already) on every read. The
  // settler is idempotent and reads-only when nothing is stale.
  await settleStaleWeeks("flappy").catch(() => { /* ignore */ });
  const [rows, lastWeek] = await Promise.all([
    topWeekly("flappy", 10),
    lastSettledResult("flappy"),
  ]);
  const { end } = weekBounds();
  return NextResponse.json({
    ok: true,
    rows,
    lastWeek,
    weekEnd: end.toISOString(),
    reward: WEEKLY_TOP_REWARD,
  });
}
