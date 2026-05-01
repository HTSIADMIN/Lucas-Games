import { NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import { readSession } from "@/lib/auth/session";
import { signSession } from "@/lib/auth/jwt";
import { getPersonalBest } from "@/lib/arcade/weekly";

export const runtime = "nodejs";

// Issue a short-lived signed run token + return the player's
// persisted best so the client can show "Best: N" right away.
export async function POST() {
  const s = await readSession();
  if (!s) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const jti = randomUUID();
  const token = await signSession({ sub: s.user.id, username: `snake:${jti}`, jti });
  const bestScore = await getPersonalBest(s.user.id, "snake").catch(() => 0);
  return NextResponse.json({ ok: true, runToken: token, startedAt: Date.now(), bestScore });
}
