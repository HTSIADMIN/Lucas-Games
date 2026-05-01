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
  await settleStaleWeeks("snake").catch(() => { /* ignore */ });
  const [rows, lastWeek] = await Promise.all([
    topWeekly("snake", 10),
    lastSettledResult("snake"),
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
