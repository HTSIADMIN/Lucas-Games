import { NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import { readSession } from "@/lib/auth/session";
import { verifySession } from "@/lib/auth/jwt";
import { credit, getBalance } from "@/lib/wallet";
import { insertGameSession } from "@/lib/db";

export const runtime = "nodejs";

// Difficulty modes — server is the source of truth for payouts and per-mode
// rate caps. The client physics constants must mirror these for the run to
// feel honest, but they don't affect the payout math.
type ModeKey = "easy" | "normal" | "hard";

const MODES: Record<ModeKey, {
  perPipe: number;
  maxPayout: number;
  // Pipes-per-second cap. Faster modes legitimately scroll faster, so the
  // cap relaxes as difficulty climbs.
  maxScorePerSec: number;
  multiplier: number;
}> = {
  easy:   { perPipe:  100, maxPayout:  10_000, maxScorePerSec: 0.7, multiplier: 1.0 },
  normal: { perPipe:  300, maxPayout:  30_000, maxScorePerSec: 1.0, multiplier: 3.0 },
  hard:   { perPipe:  700, maxPayout:  70_000, maxScorePerSec: 1.4, multiplier: 7.0 },
};

const MIN_PAYOUT = 1_000;

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

  // Token shape is "flappy:<mode>:<jti>" (current) or legacy "flappy:<jti>".
  const parts = payload.username.split(":");
  let mode: ModeKey = "normal";
  if (parts.length >= 3 && (parts[1] === "easy" || parts[1] === "normal" || parts[1] === "hard")) {
    mode = parts[1] as ModeKey;
  }
  const cfg = MODES[mode];

  const score = Math.floor(Number(body.score) || 0);
  const durationMs = Math.floor(Number(body.durationMs) || 0);
  if (score < 0 || score > 1000) return NextResponse.json({ error: "score_invalid" }, { status: 400 });
  if (durationMs < 500 || durationMs > 30 * 60_000) return NextResponse.json({ error: "duration_invalid" }, { status: 400 });

  const seconds = Math.max(1, Math.floor(durationMs / 1000));
  const maxFeasible = Math.floor(seconds * cfg.maxScorePerSec) + 2;
  const effective = Math.min(score, maxFeasible);

  const raw = effective * cfg.perPipe;
  const payout = Math.max(0, Math.min(cfg.maxPayout, raw));

  REDEEMED.add(payload.jti);

  if (effective <= 0 || payout < MIN_PAYOUT) {
    await insertGameSession({
      id: randomUUID(),
      user_id: s.user.id,
      game: "flappy",
      bet: 0,
      payout: 0,
      state: { score: effective, mode, durationMs },
      status: "settled",
    });
    return NextResponse.json({
      ok: true,
      score: effective,
      mode,
      multiplier: cfg.multiplier,
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
    state: { score: effective, mode, durationMs },
    status: "settled",
  });

  return NextResponse.json({
    ok: true,
    score: effective,
    mode,
    multiplier: cfg.multiplier,
    payout,
    balance: await getBalance(s.user.id),
  });
}
