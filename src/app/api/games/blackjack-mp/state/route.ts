import { NextResponse } from "next/server";
import { readSession } from "@/lib/auth/session";
import { getBlackjackState } from "@/lib/games/blackjack-mp/scheduler";

export const runtime = "nodejs";

export async function GET() {
  const s = await readSession();
  if (!s) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const state = await getBlackjackState();
  return NextResponse.json(state);
}
