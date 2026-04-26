import { NextResponse } from "next/server";
import { readSession } from "@/lib/auth/session";
import {
  clansEnabled,
  getMyClan,
  updateClanSettings,
} from "@/lib/clans/db";
import { CLAN_ANIMALS } from "@/lib/clans/constants";

export const runtime = "nodejs";

const ALLOWED_ANIMALS = new Set(CLAN_ANIMALS.map((a) => a.key));

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const s = await readSession();
  if (!s) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (!clansEnabled()) return NextResponse.json({ error: "clans_disabled" }, { status: 503 });

  const { id } = await ctx.params;
  let body: { name?: unknown; tag?: unknown; animalIcon?: unknown; inviteOnly?: unknown };
  try { body = await req.json(); } catch { return NextResponse.json({ error: "bad_json" }, { status: 400 }); }

  // Authorization — must be the leader of this clan
  const { clan, membership } = await getMyClan(s.user.id);
  if (!clan || clan.id !== id) return NextResponse.json({ error: "not_in_clan" }, { status: 403 });
  if (membership?.role !== "leader") return NextResponse.json({ error: "not_leader" }, { status: 403 });

  const patch: { name?: string; tag?: string; animalIcon?: string; inviteOnly?: boolean } = {};
  if (typeof body.name === "string") {
    const n = body.name.trim();
    if (n.length < 2 || n.length > 20) return NextResponse.json({ error: "name_invalid" }, { status: 400 });
    patch.name = n;
  }
  if (typeof body.tag === "string") {
    const t = body.tag.trim().toUpperCase();
    if (t.length < 2 || t.length > 4) return NextResponse.json({ error: "tag_invalid" }, { status: 400 });
    patch.tag = t;
  }
  if (typeof body.animalIcon === "string") {
    if (!ALLOWED_ANIMALS.has(body.animalIcon as (typeof CLAN_ANIMALS)[number]["key"])) {
      return NextResponse.json({ error: "animal_invalid" }, { status: 400 });
    }
    patch.animalIcon = body.animalIcon;
  }
  if (typeof body.inviteOnly === "boolean") patch.inviteOnly = body.inviteOnly;

  try {
    const updated = await updateClanSettings({ clanId: id, ...patch });
    return NextResponse.json({ ok: true, clan: updated });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "error";
    return NextResponse.json({ error: msg.includes("name") ? "name_taken" : msg }, { status: 400 });
  }
}
