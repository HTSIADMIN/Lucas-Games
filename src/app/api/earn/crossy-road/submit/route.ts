import { NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import { readSession } from "@/lib/auth/session";
import { verifySession } from "@/lib/auth/jwt";
import { credit, getBalance } from "@/lib/wallet";
import { insertGameSession } from "@/lib/db";
import { recordChallengeEvent } from "@/lib/challenges/record";
import { updatePersonalBest } from "@/lib/arcade/weekly";

export const runtime = "nodejs";

// Sanity bounds — server-side only.
const MIN_PAYOUT = 1_000;
const MAX_PAYOUT = 50_000;
const COIN_PER_ROW = 50;          // 50¢ per row crossed
const COIN_PER_PICKUP = 500;      // 500¢ per ground-coin pickup
// Rows-per-second cap. The chicken hops once every ~120ms, so 8/s already
// covers a perfect player.
const MAX_ROWS_PER_SEC = 8;
// Coin pickups are gated by spawn rate (≈6% of rows). 1.5/s is generous.
const MAX_COINS_PER_SEC = 2;

// Track redeemed run tokens to block replay (memory only — fine for friends).
const REDEEMED = new Set<string>();

export async function POST(req: Request) {
  const s = await readSession();
  if (!s) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  let body: { runToken?: string; score?: unknown; coins?: unknown; durationMs?: unknown };
  try { body = await req.json(); } catch { return NextResponse.json({ error: "bad_json" }, { status: 400 }); }

  if (!body.runToken) return NextResponse.json({ error: "no_token" }, { status: 400 });
  const payload = await verifySession(body.runToken);
  if (!payload) return NextResponse.json({ error: "bad_token" }, { status: 400 });
  if (payload.sub !== s.user.id) return NextResponse.json({ error: "token_user_mismatch" }, { status: 400 });
  if (REDEEMED.has(payload.jti)) return NextResponse.json({ error: "token_redeemed" }, { status: 400 });
  if (!payload.username.startsWith("crossy:")) return NextResponse.json({ error: "wrong_token_kind" }, { status: 400 });

  // `score` is now interpreted as rows crossed (no longer rows+coins folded).
  const rows = Math.floor(Number(body.score) || 0);
  const coins = Math.max(0, Math.floor(Number(body.coins) || 0));
  const durationMs = Math.floor(Number(body.durationMs) || 0);
  if (rows < 0 || rows > 10_000) return NextResponse.json({ error: "score_invalid" }, { status: 400 });
  if (coins > 5_000) return NextResponse.json({ error: "coins_invalid" }, { status: 400 });
  if (durationMs < 1000 || durationMs > 30 * 60_000) return NextResponse.json({ error: "duration_invalid" }, { status: 400 });

  // Sanity caps: clamp rows and coins to time-feasible upper bounds.
  const seconds = Math.max(1, Math.floor(durationMs / 1000));
  const effRows  = Math.min(rows, seconds * MAX_ROWS_PER_SEC);
  const effCoins = Math.min(coins, seconds * MAX_COINS_PER_SEC);

  const raw = effRows * COIN_PER_ROW + effCoins * COIN_PER_PICKUP;
  const payout = Math.max(0, Math.min(MAX_PAYOUT, raw));

  // Personal best + score-threshold challenge fire whether the run
  // pays out or not.
  const pb = await updatePersonalBest(s.user.id, "crossy_road", effRows).catch(() => ({ best: effRows, isNew: false }));
  recordChallengeEvent(s.user.id, { kind: "score", game: "crossy_road", score: effRows }).catch(() => { /* ignore */ });

  if (raw <= 0 || payout < MIN_PAYOUT) {
    REDEEMED.add(payload.jti);
    // Even sub-payout runs need to land in game_sessions so the
    // weekly leaderboard can see them. Previously we early-returned
    // without recording, which is why low-payout high-score runs
    // were silently dropped from the standings.
    await insertGameSession({
      id: randomUUID(),
      user_id: s.user.id,
      game: "crossy_road",
      bet: 0,
      payout: 0,
      state: { rows: effRows, coins: effCoins, durationMs },
      status: "settled",
    });
    return NextResponse.json({
      ok: true,
      score: effRows,
      coins: effCoins,
      payout: 0,
      reason: "below_minimum",
      bestScore: pb.best,
      isNewBest: pb.isNew,
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
  // Record for leaderboard + bets feed.
  await insertGameSession({
    id: randomUUID(),
    user_id: s.user.id,
    game: "crossy_road",
    bet: 0,
    payout,
    state: { rows: effRows, coins: effCoins, durationMs },
    status: "settled",
  });

  return NextResponse.json({
    ok: true,
    score: effRows,
    coins: effCoins,
    payout,
    bestScore: pb.best,
    isNewBest: pb.isNew,
    balance: await getBalance(s.user.id),
  });
}
