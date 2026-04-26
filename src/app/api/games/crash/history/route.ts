import { NextResponse } from "next/server";
import { readSession } from "@/lib/auth/session";
import { listRecentCrashRounds } from "@/lib/db";

export const runtime = "nodejs";

export async function GET() {
  const s = await readSession();
  if (!s) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const rounds = await listRecentCrashRounds(20);
  return NextResponse.json({
    rounds: rounds.map((r) => ({
      id: r.id,
      roundNo: r.round_no,
      crashAtX: Number(r.crash_at_x),
      endedAt: r.ended_at,
    })),
  });
}
