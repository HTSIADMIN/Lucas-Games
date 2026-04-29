import { NextResponse } from "next/server";
import { readSession } from "@/lib/auth/session";
import { credit, getBalance } from "@/lib/wallet";
import { listDailyChallenges, markDailyChallengeClaimed } from "@/lib/db";
import { addClanXp, clansEnabled } from "@/lib/clans/db";
import { dayKey } from "@/lib/challenges/engine";

export const runtime = "nodejs";

export async function POST(req: Request) {
  const s = await readSession();
  if (!s) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  let body: { slot?: unknown };
  try { body = await req.json(); } catch { return NextResponse.json({ error: "bad_json" }, { status: 400 }); }
  const slot = Number(body.slot);
  if (!Number.isInteger(slot) || slot < 0 || slot > 2) {
    return NextResponse.json({ error: "bad_slot" }, { status: 400 });
  }

  const day = dayKey();
  const rows = await listDailyChallenges(s.user.id, day);
  const row = rows.find((r) => r.slot === slot);
  if (!row) return NextResponse.json({ error: "not_found" }, { status: 404 });
  if (!row.completed_at) return NextResponse.json({ error: "not_complete" }, { status: 400 });
  if (row.claimed_at) return NextResponse.json({ error: "already_claimed" }, { status: 400 });

  const claimed = await markDailyChallengeClaimed(s.user.id, day, slot);
  if (!claimed) return NextResponse.json({ error: "race" }, { status: 409 });

  // Credit the coin reward and (if the player is in a clan) push the
  // challenge-point amount into clan weekly XP. Clan weekly XP is
  // now sourced exclusively from challenge claims.
  if (claimed.coin_reward > 0) {
    await credit({
      userId: s.user.id,
      amount: claimed.coin_reward,
      reason: "challenge_reward",
      refKind: "challenge",
      refId: `${day}:${slot}`,
    });
  }
  if (clansEnabled() && claimed.challenge_points > 0) {
    addClanXp(s.user.id, claimed.challenge_points).catch(() => { /* ignore */ });
  }

  return NextResponse.json({
    ok: true,
    coinsAwarded: claimed.coin_reward,
    pointsAwarded: claimed.challenge_points,
    balance: await getBalance(s.user.id),
  });
}
