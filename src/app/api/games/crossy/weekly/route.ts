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
  await settleStaleWeeks("crossy_road").catch(() => { /* ignore */ });
  const [rows, lastWeek] = await Promise.all([
    topWeekly("crossy_road", 10),
    lastSettledResult("crossy_road"),
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
