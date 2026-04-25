import { NextResponse } from "next/server";
import { readSession } from "@/lib/auth/session";
import { verifySession } from "@/lib/auth/jwt";
import { credit, getBalance } from "@/lib/wallet";

export const runtime = "nodejs";

// Sanity bounds — server-side only.
const MIN_PAYOUT = 1_000;
const MAX_PAYOUT = 10_000;
const COIN_PER_POINT = 100;       // 100 coins per row crossed
const MAX_SCORE_PER_SEC = 6;      // can't cross more than ~6 rows per second

// Track redeemed run tokens to block replay (memory only — fine for friends).
const REDEEMED = new Set<string>();

export async function POST(req: Request) {
  const s = await readSession();
  if (!s) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  let body: { runToken?: string; score?: unknown; durationMs?: unknown };
  try { body = await req.json(); } catch { return NextResponse.json({ error: "bad_json" }, { status: 400 }); }

  if (!body.runToken) return NextResponse.json({ error: "no_token" }, { status: 400 });
  const payload = await verifySession(body.runToken);
  if (!payload) return NextResponse.json({ error: "bad_token" }, { status: 400 });
  if (payload.sub !== s.user.id) return NextResponse.json({ error: "token_user_mismatch" }, { status: 400 });
  if (REDEEMED.has(payload.jti)) return NextResponse.json({ error: "token_redeemed" }, { status: 400 });
  if (!payload.username.startsWith("crossy:")) return NextResponse.json({ error: "wrong_token_kind" }, { status: 400 });

  const score = Math.floor(Number(body.score) || 0);
  const durationMs = Math.floor(Number(body.durationMs) || 0);
  if (score < 0 || score > 5000) return NextResponse.json({ error: "score_invalid" }, { status: 400 });
  if (durationMs < 1000 || durationMs > 30 * 60_000) return NextResponse.json({ error: "duration_invalid" }, { status: 400 });

  // Sanity cap: clamp to time-feasible score.
  const seconds = Math.max(1, Math.floor(durationMs / 1000));
  const maxFeasible = seconds * MAX_SCORE_PER_SEC;
  const effective = Math.min(score, maxFeasible);

  const raw = effective * COIN_PER_POINT;
  const payout = Math.max(0, Math.min(MAX_PAYOUT, raw));
  if (effective <= 0 || payout < MIN_PAYOUT) {
    REDEEMED.add(payload.jti);
    return NextResponse.json({
      ok: true,
      score: effective,
      payout: 0,
      reason: "below_minimum",
      balance: await getBalance(s.user.id),
    });
  }

  REDEEMED.add(payload.jti);
  await credit({
    userId: s.user.id,
    amount: payout,
    reason: "crossy_road",
    refKind: "crossy_road",
    refId: payload.jti,
  });

  return NextResponse.json({
    ok: true,
    score: effective,
    payout,
    balance: await getBalance(s.user.id),
  });
}
