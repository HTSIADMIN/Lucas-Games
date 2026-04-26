import { NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import { readSession } from "@/lib/auth/session";
import { signSession } from "@/lib/auth/jwt";

export const runtime = "nodejs";

export async function POST() {
  const s = await readSession();
  if (!s) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const jti = randomUUID();
  const token = await signSession({ sub: s.user.id, username: `flappy:${jti}`, jti });
  return NextResponse.json({ ok: true, runToken: token, startedAt: Date.now() });
}
