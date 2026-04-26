import { NextResponse } from "next/server";
import { readSession } from "@/lib/auth/session";
import { clansEnabled, resolveInvite } from "@/lib/clans/db";

export const runtime = "nodejs";

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const s = await readSession();
  if (!s) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (!clansEnabled()) return NextResponse.json({ error: "clans_disabled" }, { status: 503 });

  const { id } = await ctx.params;
  let body: { action?: unknown };
  try { body = await req.json(); } catch { return NextResponse.json({ error: "bad_json" }, { status: 400 }); }
  const action = body.action === "accept" ? "accept" : body.action === "decline" ? "decline" : null;
  if (!action) return NextResponse.json({ error: "action_invalid" }, { status: 400 });

  try {
    const result = await resolveInvite({ inviteId: id, userId: s.user.id, action });
    return NextResponse.json({ ok: true, ...result });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "error";
    return NextResponse.json({ error: msg }, { status: 400 });
  }
}
