import { NextResponse } from "next/server";
import { readSession } from "@/lib/auth/session";
import { clansEnabled, kickMember } from "@/lib/clans/db";

export const runtime = "nodejs";

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const s = await readSession();
  if (!s) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (!clansEnabled()) return NextResponse.json({ error: "clans_disabled" }, { status: 503 });

  const { id } = await ctx.params;
  let body: { userId?: unknown };
  try { body = await req.json(); } catch { return NextResponse.json({ error: "bad_json" }, { status: 400 }); }

  const targetUserId = String(body.userId ?? "");
  if (!targetUserId) return NextResponse.json({ error: "user_required" }, { status: 400 });

  try {
    await kickMember({ clanId: id, leaderId: s.user.id, targetUserId });
    return NextResponse.json({ ok: true });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "error";
    return NextResponse.json({ error: msg }, { status: 400 });
  }
}
