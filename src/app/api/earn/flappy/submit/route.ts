import { NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import { readSession } from "@/lib/auth/session";
import { verifySession } from "@/lib/auth/jwt";
import { credit, getBalance } from "@/lib/wallet";
import { insertGameSession } from "@/lib/db";

export const runtime = "nodejs";

const MIN_PAYOUT = 1_000;
const MAX_PAYOUT = 10_000;
const COIN_PER_PIPE = 200;
// Each pipe takes ~1.6s to traverse, so the absolute max plausible
// pipes-per-second cap protects against trivially-faked scores.
const MAX_SCORE_PER_SEC = 1.0;

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
  if (!payload.username.startsWith("flappy:")) return NextResponse.json({ error: "wrong_token_kind" }, { status: 400 });

  const score = Math.floor(Number(body.score) || 0);
  const durationMs = Math.floor(Number(body.durationMs) || 0);
  if (score < 0 || score > 1000) return NextResponse.json({ error: "score_invalid" }, { status: 400 });
  if (durationMs < 500 || durationMs > 30 * 60_000) return NextResponse.json({ error: "duration_invalid" }, { status: 400 });

  const seconds = Math.max(1, Math.floor(durationMs / 1000));
  const maxFeasible = Math.floor(seconds * MAX_SCORE_PER_SEC) + 2;
  const effective = Math.min(score, maxFeasible);

  const raw = effective * COIN_PER_PIPE;
  const payout = Math.max(0, Math.min(MAX_PAYOUT, raw));

  REDEEMED.add(payload.jti);

  if (effective <= 0 || payout < MIN_PAYOUT) {
    await insertGameSession({
      id: randomUUID(),
      user_id: s.user.id,
      game: "flappy",
      bet: 0,
      payout: 0,
      state: { score: effective, durationMs },
      status: "settled",
    });
    return NextResponse.json({
      ok: true,
      score: effective,
      payout: 0,
      reason: "below_minimum",
      balance: await getBalance(s.user.id),
    });
  }

  await credit({
    userId: s.user.id,
    amount: payout,
    reason: "flappy",
    refKind: "flappy",
    refId: payload.jti,
  });
  await insertGameSession({
    id: randomUUID(),
    user_id: s.user.id,
    game: "flappy",
    bet: 0,
    payout,
    state: { score: effective, durationMs },
    status: "settled",
  });

  return NextResponse.json({
    ok: true,
    score: effective,
    payout,
    balance: await getBalance(s.user.id),
  });
}
