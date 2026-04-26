import { NextResponse } from "next/server";
import { readSession } from "@/lib/auth/session";
import {
  clansEnabled,
  createClanInvite,
  findUserByUsername,
  getMyClan,
} from "@/lib/clans/db";

export const runtime = "nodejs";

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const s = await readSession();
  if (!s) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (!clansEnabled()) return NextResponse.json({ error: "clans_disabled" }, { status: 503 });

  const { id } = await ctx.params;
  let body: { username?: unknown };
  try { body = await req.json(); } catch { return NextResponse.json({ error: "bad_json" }, { status: 400 }); }

  const username = String(body.username ?? "").trim();
  if (!username) return NextResponse.json({ error: "username_required" }, { status: 400 });

  // Authorization — must be leader of this clan
  const { clan, membership } = await getMyClan(s.user.id);
  if (!clan || clan.id !== id) return NextResponse.json({ error: "not_in_clan" }, { status: 403 });
  if (membership?.role !== "leader") return NextResponse.json({ error: "not_leader" }, { status: 403 });

  const target = await findUserByUsername(username);
  if (!target) return NextResponse.json({ error: "user_not_found" }, { status: 404 });
  if (target.id === s.user.id) return NextResponse.json({ error: "cant_invite_self" }, { status: 400 });

  try {
    const invite = await createClanInvite({
      clanId: id,
      invitedBy: s.user.id,
      inviteeId: target.id,
    });
    return NextResponse.json({ ok: true, invite, username: target.username });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "error";
    return NextResponse.json({ error: msg }, { status: 400 });
  }
}
