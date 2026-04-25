import { NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import { cookies } from "next/headers";
import { getUserByUsername, insertUser, insertSession, touchUserLastSeen } from "@/lib/db";
import { hashPin } from "@/lib/auth/pin";
import { SESSION_COOKIE, SESSION_TTL_DAYS, signSession } from "@/lib/auth/jwt";
import { credit } from "@/lib/wallet";

export const runtime = "nodejs";

const SIGNUP_BONUS = 500_000;

const AVATAR_PALETTE = [
  "var(--gold-300)",
  "var(--crimson-300)",
  "var(--sky-300)",
  "var(--cactus-300)",
  "var(--saddle-300)",
  "var(--parchment-300)",
];

function makeInitials(username: string): string {
  const cleaned = username.trim();
  const parts = cleaned.split(/\s+/);
  const a = parts[0]?.[0] ?? "?";
  const b = parts[1]?.[0] ?? cleaned[1] ?? cleaned[0] ?? "?";
  return (a + b).toUpperCase();
}

export async function POST(req: Request) {
  let body: { username?: string; pin?: string; avatarColor?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "bad_json" }, { status: 400 });
  }

  const username = (body.username ?? "").trim();
  const pin = body.pin ?? "";

  if (username.length < 2 || username.length > 16) {
    return NextResponse.json({ error: "username_length" }, { status: 400 });
  }
  if (!/^[A-Za-z0-9_ -]+$/.test(username)) {
    return NextResponse.json({ error: "username_chars" }, { status: 400 });
  }
  if (!/^\d{4}$/.test(pin)) {
    return NextResponse.json({ error: "pin_format" }, { status: 400 });
  }
  if (getUserByUsername(username)) {
    return NextResponse.json({ error: "username_taken" }, { status: 409 });
  }

  const id = randomUUID();
  const pin_hash = await hashPin(pin);
  const avatar_color =
    body.avatarColor && AVATAR_PALETTE.includes(body.avatarColor)
      ? body.avatarColor
      : AVATAR_PALETTE[Math.floor(Math.random() * AVATAR_PALETTE.length)];

  insertUser({
    id,
    username,
    avatar_color,
    initials: makeInitials(username),
    pin_hash,
  });

  credit({
    userId: id,
    amount: SIGNUP_BONUS,
    reason: "signup_bonus",
    refKind: "signup",
    refId: id,
  });

  const jti = randomUUID();
  const expiresAt = new Date(Date.now() + SESSION_TTL_DAYS * 24 * 60 * 60 * 1000);
  insertSession({
    jti,
    user_id: id,
    issued_at: new Date().toISOString(),
    expires_at: expiresAt.toISOString(),
    revoked: false,
  });
  touchUserLastSeen(id);

  const token = await signSession({ sub: id, username, jti });
  const jar = await cookies();
  jar.set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: SESSION_TTL_DAYS * 24 * 60 * 60,
  });

  return NextResponse.json({ ok: true, user: { id, username } });
}
