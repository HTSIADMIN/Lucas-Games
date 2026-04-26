import { NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import { readSession } from "@/lib/auth/session";
import { signSession } from "@/lib/auth/jwt";

export const runtime = "nodejs";

const VALID_MODES = new Set(["easy", "normal", "hard"]);

export async function POST(req: Request) {
  const s = await readSession();
  if (!s) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  let mode = "normal";
  try {
    const body = await req.json();
    if (typeof body?.mode === "string" && VALID_MODES.has(body.mode)) mode = body.mode;
  } catch {
    // Body is optional; default to normal.
  }

  const jti = randomUUID();
  // Stamp the mode into `username` so the submit endpoint can verify it
  // without a separate datastore lookup.
  const token = await signSession({ sub: s.user.id, username: `flappy:${mode}:${jti}`, jti });
  return NextResponse.json({ ok: true, runToken: token, startedAt: Date.now(), mode });
}
