import { NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import { readSession } from "@/lib/auth/session";
import { credit, getBalance } from "@/lib/wallet";
import { getCooldown, setCooldown, insertGameSession, settleGameSession } from "@/lib/db";
import { generateTicket } from "@/lib/games/scratch/engine";

export const runtime = "nodejs";

const DAILY_COOLDOWN_HOURS = 24;
const COOLDOWN_KEY = "scratch_daily";
const DAILY_DESIGN = "golden-bounty" as const;

// GET — readiness probe used by the client.
export async function GET() {
  const s = await readSession();
  if (!s) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const cd = await getCooldown(s.user.id, COOLDOWN_KEY);
  const availableAt = cd ? cd.available_at : null;
  const ready = !cd || new Date(cd.available_at).getTime() <= Date.now();
  return NextResponse.json({ ready, availableAt });
}

// POST — claim today's free ticket. Elevated odds, no jackpot, no cost.
export async function POST() {
  const s = await readSession();
  if (!s) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const cd = await getCooldown(s.user.id, COOLDOWN_KEY);
  if (cd && new Date(cd.available_at).getTime() > Date.now()) {
    return NextResponse.json({ error: "cooldown", availableAt: cd.available_at }, { status: 429 });
  }

  const sessionId = randomUUID();
  const ticket = generateTicket({ cost: 0, design: DAILY_DESIGN, daily: true });

  await insertGameSession({
    id: sessionId,
    user_id: s.user.id,
    game: "scratch",
    bet: 0,
    payout: 0,
    state: { design: DAILY_DESIGN, daily: true },
    status: "open",
  });

  if (ticket.payout > 0) {
    await credit({
      userId: s.user.id,
      amount: ticket.payout,
      reason: "scratch_daily_win",
      refKind: "scratch",
      refId: `${sessionId}:daily`,
    });
  }

  await settleGameSession(sessionId, ticket.payout, { ...ticket, design: DAILY_DESIGN, daily: true });

  const next = new Date(Date.now() + DAILY_COOLDOWN_HOURS * 60 * 60 * 1000);
  await setCooldown(s.user.id, COOLDOWN_KEY, next);

  return NextResponse.json({
    ok: true,
    ticket,
    availableAt: next.toISOString(),
    balance: await getBalance(s.user.id),
  });
}
