import { NextResponse } from "next/server";
import { readSession } from "@/lib/auth/session";
import { debit, getBalance } from "@/lib/wallet";
import { createClan, clansEnabled, getMyClan } from "@/lib/clans/db";
import { CLAN_ANIMALS, CLAN_EMBLEMS, CLAN_FOUNDING_FEE } from "@/lib/clans/constants";

export const runtime = "nodejs";

// Accept either the legacy animal set or the v3+ emblem set so old
// clients keep working while new clients pick from the new artwork.
const ALLOWED_ANIMALS = new Set<string>([
  ...CLAN_ANIMALS.map((a) => a.key),
  ...CLAN_EMBLEMS.map((e) => e.key),
]);

export async function POST(req: Request) {
  const s = await readSession();
  if (!s) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (!clansEnabled()) return NextResponse.json({ error: "clans_disabled" }, { status: 503 });

  let body: { name?: unknown; tag?: unknown; animalIcon?: unknown };
  try { body = await req.json(); } catch { return NextResponse.json({ error: "bad_json" }, { status: 400 }); }

  const name = String(body.name ?? "").trim();
  const tag = String(body.tag ?? "").trim().toUpperCase();
  const animalIcon = String(body.animalIcon ?? "");

  if (name.length < 2 || name.length > 20) return NextResponse.json({ error: "name_invalid" }, { status: 400 });
  if (tag.length < 2 || tag.length > 4) return NextResponse.json({ error: "tag_invalid" }, { status: 400 });
  if (!ALLOWED_ANIMALS.has(animalIcon)) {
    return NextResponse.json({ error: "animal_invalid" }, { status: 400 });
  }

  // Already in a clan?
  const { clan } = await getMyClan(s.user.id);
  if (clan) return NextResponse.json({ error: "already_in_a_clan" }, { status: 409 });

  // Charge founding fee
  try {
    await debit({
      userId: s.user.id,
      amount: CLAN_FOUNDING_FEE,
      reason: "clan_founding",
      refKind: "clans",
      refId: `${s.user.id}:found:${Date.now()}`,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "error";
    return NextResponse.json({ error: msg }, { status: msg === "insufficient_funds" ? 400 : 500 });
  }

  try {
    const created = await createClan({ name, tag, animalIcon, founderId: s.user.id });
    return NextResponse.json({ ok: true, clan: created, balance: await getBalance(s.user.id) });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "error";
    // Refund the founding fee on failure.
    const { credit } = await import("@/lib/wallet");
    await credit({
      userId: s.user.id,
      amount: CLAN_FOUNDING_FEE,
      reason: "clan_founding_refund",
      refKind: "clans",
      refId: `${s.user.id}:found_refund:${Date.now()}`,
    }).catch(() => { /* ignore */ });
    return NextResponse.json({ error: msg.includes("name") ? "name_taken" : msg }, { status: 400 });
  }
}
