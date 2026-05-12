import { NextResponse } from "next/server";
import { readSession } from "@/lib/auth/session";
import { savePennyPinchersBlob } from "@/lib/db";

export const runtime = "nodejs";

// POST /api/earn/penny-pinchers/save  body: { state: <full state blob> }
//
// Local-first persistence — the client owns the simulation, this
// route just stores whatever it sends. No validation beyond schema
// shape (we trust the player; Penny Pinchers is single-player /
// among-friends only). The wallet bridge lives on /bank, which is
// the only server-authoritative action.
//
// Called every 10s while the tab is visible AND on every meaningful
// action (bank, prestige) AND on tab-hide / beforeunload via
// sendBeacon. localStorage on the client mirrors the same blob, so
// if a save POST fails the next mount picks the newer of the two.
export async function POST(req: Request) {
  const s = await readSession();
  if (!s) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  let body: { state?: unknown };
  try { body = await req.json(); }
  catch { return NextResponse.json({ error: "bad_json" }, { status: 400 }); }

  if (!body.state || typeof body.state !== "object") {
    return NextResponse.json({ error: "bad_state" }, { status: 400 });
  }

  try {
    const nowIso = new Date().toISOString();
    await savePennyPinchersBlob(s.user.id, body.state as Record<string, unknown>, nowIso);
    return NextResponse.json({ ok: true, lastSavedAt: nowIso });
  } catch (err) {
    console.error("[pp:save] write failed", err);
    return NextResponse.json({ error: "save_failed" }, { status: 500 });
  }
}
