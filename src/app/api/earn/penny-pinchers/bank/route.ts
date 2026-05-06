import { NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import { readSession } from "@/lib/auth/session";
import { credit, getBalance } from "@/lib/wallet";
import {
  getPennyPinchersState,
  upsertPennyPinchersState,
} from "@/lib/db";
import {
  BANK_COOLDOWN_MS,
  BANK_HOUSE_CUT,
  BANK_PC_PER_WALLET_CENT,
  DAILY_BANK_CAP,
  MAX_BANK_PAYOUT,
} from "@/lib/games/penny-pinchers/catalog";
import { bankPayoutCents } from "@/lib/games/penny-pinchers/engine";

export const runtime = "nodejs";

// POST /api/earn/penny-pinchers/bank
//
// Converts the player's accumulated PC into wallet ¢ at the fixed
// ratio in catalog.ts. Enforces the 1h between-bank cooldown and
// the per-UTC-day wallet payout cap. Banking resets PC to 0 (modulo
// any house-cut residual we want to keep on the books).
export async function POST() {
  const s = await readSession();
  if (!s) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const state = await getPennyPinchersState(s.user.id);
  if (!state) return NextResponse.json({ error: "no_state" }, { status: 400 });

  const now = Date.now();
  const todayUtc = new Date(now).toISOString().slice(0, 10);

  // Cooldown
  const lastBankMs = state.last_bank_at ? new Date(state.last_bank_at).getTime() : 0;
  const readyAt = lastBankMs + BANK_COOLDOWN_MS;
  if (lastBankMs > 0 && now < readyAt) {
    return NextResponse.json(
      { error: "cooldown", readyAt, msRemaining: readyAt - now },
      { status: 429 },
    );
  }

  if (state.cents <= 0) {
    return NextResponse.json({ error: "no_cents" }, { status: 400 });
  }

  // Day rollover for the daily cap.
  const dailyBankedSoFar = state.daily_banked_day === todayUtc ? state.daily_banked_cents : 0;
  const payoutCents = bankPayoutCents(state.cents, dailyBankedSoFar);

  if (payoutCents <= 0) {
    return NextResponse.json({ error: "daily_cap_reached" }, { status: 400 });
  }

  // PC consumed for this payout (round up so we never undercharge).
  const pcConsumed = Math.min(state.cents, payoutCents * BANK_PC_PER_WALLET_CENT);
  const remainingPC = Math.max(BANK_HOUSE_CUT, state.cents - pcConsumed);

  // Credit wallet.
  await credit({
    userId: s.user.id,
    amount: payoutCents,
    reason: "penny_pinchers_bank",
    refKind: "penny_pinchers",
    refId: `${randomUUID()}:bank`,
  });

  await upsertPennyPinchersState({
    ...state,
    cents: remainingPC,
    last_tick_at: new Date(now).toISOString(),
    last_bank_at: new Date(now).toISOString(),
    daily_banked_cents: dailyBankedSoFar + payoutCents,
    daily_banked_day: todayUtc,
    lifetime_banked_cents: state.lifetime_banked_cents + payoutCents,
  });

  return NextResponse.json({
    ok: true,
    payoutCents,
    pcConsumed,
    remainingPC,
    dailyBanked: dailyBankedSoFar + payoutCents,
    dailyCap: DAILY_BANK_CAP,
    maxPerBank: MAX_BANK_PAYOUT,
    nextReadyAt: now + BANK_COOLDOWN_MS,
    walletBalance: await getBalance(s.user.id),
  });
}
