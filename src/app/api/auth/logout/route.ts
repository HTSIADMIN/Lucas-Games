import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { revokeSession } from "@/lib/db";
import { SESSION_COOKIE, verifySession } from "@/lib/auth/jwt";

export const runtime = "nodejs";

export async function POST() {
  const jar = await cookies();
  const token = jar.get(SESSION_COOKIE)?.value;
  if (token) {
    const payload = await verifySession(token);
    if (payload) await revokeSession(payload.jti);
  }
  jar.delete(SESSION_COOKIE);
  return NextResponse.json({ ok: true });
}
