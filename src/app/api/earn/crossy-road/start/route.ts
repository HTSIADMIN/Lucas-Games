import { NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import { readSession } from "@/lib/auth/session";
import { signSession } from "@/lib/auth/jwt";
import { getPersonalBest } from "@/lib/arcade/weekly";

export const runtime = "nodejs";

export async function POST() {
  const s = await readSession();
  if (!s) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const jti = randomUUID();
  const token = await signSession({ sub: s.user.id, username: `crossy:${jti}`, jti });
  const bestScore = await getPersonalBest(s.user.id, "crossy_road").catch(() => 0);
  return NextResponse.json({ ok: true, runToken: token, startedAt: Date.now(), bestScore });
}
