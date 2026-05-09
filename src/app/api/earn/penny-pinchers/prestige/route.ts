import { NextResponse } from "next/server";
import { readSession } from "@/lib/auth/session";
import {
  clearPennyPinchersRun,
  getPennyPinchersState,
  listPennyPinchersPermUpgrades,
  upsertPennyPinchersState,
} from "@/lib/db";
import { type PermUpgradeId } from "@/lib/games/penny-pinchers/catalog";
import { bankTokensFromCurrentCents, prestigeStartingCents, relicEffects } from "@/lib/games/penny-pinchers/engine";

export const runtime = "nodejs";

// POST /api/earn/penny-pinchers/prestige
//
// Wipes the player's per-run state (cents, run upgrades, helpers)
// and awards Bank Tokens proportional to the current cents the
// player chooses to sacrifice. The cents themselves get reset to
// the Bigger Pockets seed (which scales triangularly with that
// perm upgrade) so the trade is "spend pocket cents → tokens".
// Perm upgrades survive — they're what the new tokens get spent on.
export async function POST() {
  const s = await readSession();
  if (!s) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const state = await getPennyPinchersState(s.user.id);
  if (!state) return NextResponse.json({ error: "no_state" }, { status: 400 });

  const tokens = bankTokensFromCurrentCents(state.cents);
  if (tokens <= 0) {
    return NextResponse.json({ error: "below_threshold" }, { status: 400 });
  }

  // Read current perm upgrades so Bigger Pockets seeds the new run
  // with starting PC.
  const permRows = await listPennyPinchersPermUpgrades(s.user.id);
  const permLevels: Partial<Record<PermUpgradeId, number>> = {};
  for (const u of permRows) permLevels[u.upgrade_id as PermUpgradeId] = u.level;

  await clearPennyPinchersRun(s.user.id);

  const now = new Date().toISOString();
  const updated = await upsertPennyPinchersState({
    ...state,
    cents: prestigeStartingCents(permLevels) +
      relicEffects(state.relics as Parameters<typeof relicEffects>[0]).prestigeStartBonusPC,
    // Reset lifetime tally so the leaderboard's lifetime number
    // tracks the post-prestige cycle.
    lifetime_pc_earned: 0,
    lifetime_clicks: state.lifetime_clicks, // career clicks survive — feels weird to lose them
    last_tick_at: now,
    prestige_count: state.prestige_count + 1,
    bank_tokens: state.bank_tokens + tokens,
    last_prestige_at: now,
  });

  return NextResponse.json({
    ok: true,
    awarded: tokens,
    prestigeCount: updated.prestige_count,
    bankTokens: updated.bank_tokens,
    cents: updated.cents,
  });
}
