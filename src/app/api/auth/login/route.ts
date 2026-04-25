import { NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import { cookies } from "next/headers";
import {
  bumpPinAttempts,
  getUserById,
  insertSession,
  resetPinAttempts,
  touchUserLastSeen,
} from "@/lib/db";
import { verifyPin } from "@/lib/auth/pin";
import { SESSION_COOKIE, SESSION_TTL_DAYS, signSession } from "@/lib/auth/jwt";

export const runtime = "nodejs";

const MAX_ATTEMPTS = 5;

export async function POST(req: Request) {
  let body: { userId?: string; pin?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "bad_json" }, { status: 400 });
  }

  const userId = body.userId ?? "";
  const pin = body.pin ?? "";

  if (!userId || !/^\d{4}$/.test(pin)) {
    return NextResponse.json({ error: "bad_input" }, { status: 400 });
  }

  const user = await getUserById(userId);
  if (!user || !user.is_active) {
    return NextResponse.json({ error: "unknown_user" }, { status: 401 });
  }

  const attempts = await bumpPinAttempts(userId);
  if (attempts.count > MAX_ATTEMPTS) {
    return NextResponse.json({ error: "too_many_attempts" }, { status: 429 });
  }

  const ok = await verifyPin(user.pin_hash, pin);
  if (!ok) {
    return NextResponse.json({ error: "wrong_pin" }, { status: 401 });
  }

  await resetPinAttempts(userId);

  const jti = randomUUID();
  const expiresAt = new Date(Date.now() + SESSION_TTL_DAYS * 24 * 60 * 60 * 1000);
  await insertSession({
    jti,
    user_id: user.id,
    issued_at: new Date().toISOString(),
    expires_at: expiresAt.toISOString(),
    revoked: false,
  });
  await touchUserLastSeen(user.id);

  const token = await signSession({
    sub: user.id,
    username: user.username,
    jti,
  });
  const jar = await cookies();
  jar.set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: SESSION_TTL_DAYS * 24 * 60 * 60,
  });

  return NextResponse.json({ ok: true, user: { id: user.id, username: user.username } });
}
