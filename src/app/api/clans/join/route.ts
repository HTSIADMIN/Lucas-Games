import { NextResponse } from "next/server";
import { readSession } from "@/lib/auth/session";
import { joinClan, clansEnabled } from "@/lib/clans/db";

export const runtime = "nodejs";

export async function POST(req: Request) {
  const s = await readSession();
  if (!s) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (!clansEnabled()) return NextResponse.json({ error: "clans_disabled" }, { status: 503 });

  let body: { clanId?: unknown };
  try { body = await req.json(); } catch { return NextResponse.json({ error: "bad_json" }, { status: 400 }); }
  const clanId = String(body.clanId ?? "");
  if (!clanId) return NextResponse.json({ error: "clan_required" }, { status: 400 });

  try {
    await joinClan({ userId: s.user.id, clanId });
    return NextResponse.json({ ok: true });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "error";
    return NextResponse.json({ error: msg }, { status: 400 });
  }
}
