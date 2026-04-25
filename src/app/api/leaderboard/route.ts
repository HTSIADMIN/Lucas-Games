import { NextResponse } from "next/server";
import { leaderboard } from "@/lib/db";

export const runtime = "nodejs";

export async function GET() {
  const rows = leaderboard();
  return NextResponse.json({ rows: rows.slice(0, 50) });
}
