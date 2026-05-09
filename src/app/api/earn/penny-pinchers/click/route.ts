import { NextResponse } from "next/server";
import { readSession } from "@/lib/auth/session";
import {
  parseClickArray,
  parseClickInput,
  recordClicks,
} from "@/lib/games/penny-pinchers/recordClicks";

export const runtime = "nodejs";

// POST /api/earn/penny-pinchers/click
//
// Body shapes:
//   { coinType, trait?, pc? }                     — single click (legacy)
//   { clicks: [{ coinType, trait?, pc? }, ...] }  — batched (preferred)
//
// Spend routes (/upgrade, /hire, /perm-upgrade, /bank, /blessing) also
// accept a `clicks` field so the player's pending queue is flushed in
// the same packet as the purchase, eliminating the stale-cents race.
// All of those funnel into recordClicks() so the rate-limit budget,
// PC math, and album increments stay in sync.
export async function POST(req: Request) {
  const s = await readSession();
  if (!s) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  let body: { coinType?: unknown; trait?: unknown; pc?: unknown; clicks?: unknown };
  try { body = await req.json(); }
  catch { return NextResponse.json({ error: "bad_json" }, { status: 400 }); }

  const inputs = Array.isArray(body.clicks)
    ? parseClickArray(body.clicks)
    : (() => {
        const single = parseClickInput(body);
        return single ? [single] : [];
      })();
  if (inputs.length === 0) return NextResponse.json({ error: "empty_batch" }, { status: 400 });

  const result = await recordClicks(s.user.id, inputs);
  if (result.applied === 0) {
    return NextResponse.json({ error: "rate_limit" }, { status: 429 });
  }
  return NextResponse.json({ ok: true, pcEarned: result.pcEarned, clicks: result.applied });
}
