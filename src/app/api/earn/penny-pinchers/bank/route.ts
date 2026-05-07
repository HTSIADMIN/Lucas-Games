import { NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import { readSession } from "@/lib/auth/session";
import { credit, getBalance } from "@/lib/wallet";
import {
  getPennyPinchersState,
  upsertPennyPinchersState,
} from "@/lib/db";
import {
  BANK_HOUSE_CUT,
  BANK_PC_PER_WALLET_CENT,
} from "@/lib/games/penny-pinchers/catalog";
import { bankPayoutCents, relicEffects } from "@/lib/games/penny-pinchers/engine";

export const runtime = "nodejs";

// POST /api/earn/penny-pinchers/bank
//
// Converts the player's accumulated PC into wallet ¢ at the fixed
// ratio in catalog.ts. No cooldown, no caps — banking just dumps
// everything in the pocket into the wallet at the conversion rate.
// daily_banked_cents / last_bank_at are still tracked for stats.
export async function POST() {
  const s = await readSession();
  if (!s) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const state = await getPennyPinchersState(s.user.id);
  if (!state) return NextResponse.json({ error: "no_state" }, { status: 400 });

  if (state.cents <= 0) {
    return NextResponse.json({ error: "no_cents" }, { status: 400 });
  }

  const now = Date.now();
  const todayUtc = new Date(now).toISOString().slice(0, 10);

  // Merchant Seal relic — flat multiplier on the conversion.
  const relicE = relicEffects(state.relics as Parameters<typeof relicEffects>[0]);
  const payoutCents = Math.max(
    0,
    Math.round(bankPayoutCents(state.cents) * relicE.bankPayoutMul),
  );

  if (payoutCents <= 0) {
    return NextResponse.json({ error: "no_cents" }, { status: 400 });
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

  const dailyBankedSoFar = state.daily_banked_day === todayUtc ? state.daily_banked_cents : 0;
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
    walletBalance: await getBalance(s.user.id),
  });
}
