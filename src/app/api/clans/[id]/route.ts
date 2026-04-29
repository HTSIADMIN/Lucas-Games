import { NextResponse } from "next/server";
import { readSession } from "@/lib/auth/session";
import { clansEnabled, getClan, listClanMembers } from "@/lib/clans/db";

export const runtime = "nodejs";

// Public read of any clan: name/tag/icon + the member roster with
// each member's weekly contribution and last-active timestamp.
// Used by the leaderboard's "click a clan to inspect" modal.
export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const s = await readSession();
  if (!s) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (!clansEnabled()) return NextResponse.json({ error: "clans_disabled" }, { status: 503 });

  const { id } = await ctx.params;
  const clan = await getClan(id);
  if (!clan) return NextResponse.json({ error: "not_found" }, { status: 404 });

  const members = await listClanMembers(id).catch(() => []);
  return NextResponse.json({ ok: true, clan, members });
}
