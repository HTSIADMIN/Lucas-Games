import { NextResponse } from "next/server";
import { readSession } from "@/lib/auth/session";
import { leaveClan, clansEnabled } from "@/lib/clans/db";

export const runtime = "nodejs";

export async function POST() {
  const s = await readSession();
  if (!s) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (!clansEnabled()) return NextResponse.json({ error: "clans_disabled" }, { status: 503 });

  await leaveClan(s.user.id);
  return NextResponse.json({ ok: true });
}
