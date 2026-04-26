import { NextResponse } from "next/server";
import { readSession } from "@/lib/auth/session";
import {
  clansEnabled,
  getMyClan,
  listClanChat,
  postClanChat,
} from "@/lib/clans/db";

export const runtime = "nodejs";

export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const s = await readSession();
  if (!s) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (!clansEnabled()) return NextResponse.json({ error: "clans_disabled" }, { status: 503 });

  const { id } = await ctx.params;
  // Authorization — must be in this clan
  const { clan } = await getMyClan(s.user.id);
  if (!clan || clan.id !== id) return NextResponse.json({ error: "not_in_clan" }, { status: 403 });

  const messages = await listClanChat(id, 60);
  return NextResponse.json({ messages });
}

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const s = await readSession();
  if (!s) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (!clansEnabled()) return NextResponse.json({ error: "clans_disabled" }, { status: 503 });

  const { id } = await ctx.params;
  let body: { body?: unknown };
  try { body = await req.json(); } catch { return NextResponse.json({ error: "bad_json" }, { status: 400 }); }
  const text = String(body.body ?? "").trim();
  if (text.length === 0) return NextResponse.json({ error: "empty" }, { status: 400 });
  if (text.length > 500) return NextResponse.json({ error: "too_long" }, { status: 400 });

  try {
    await postClanChat({ clanId: id, userId: s.user.id, body: text });
    return NextResponse.json({ ok: true });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "error";
    return NextResponse.json({ error: msg }, { status: 400 });
  }
}
