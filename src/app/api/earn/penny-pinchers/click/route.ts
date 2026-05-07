import { NextResponse } from "next/server";
import { readSession } from "@/lib/auth/session";
import {
  getPennyPinchersState,
  listPennyPinchersPermUpgrades,
  listPennyPinchersUpgrades,
  upsertPennyPinchersState,
} from "@/lib/db";
import {
  COINS,
  MAX_CLICKS_PER_SEC,
  TRAITS,
  type CoinId,
  type CoinTrait,
  type PermUpgradeId,
} from "@/lib/games/penny-pinchers/catalog";
import { coinPCValue, frugalityPCMultiplier, traitMultiplier } from "@/lib/games/penny-pinchers/engine";

export const runtime = "nodejs";

// In-process sliding-window rate limiter for clicks. Maps user-id →
// timestamp queue of the most-recent ~25 click times. Cheap, lasts
// the lifetime of the Vercel function instance, and that's fine —
// the daily-bank cap is the load-bearing throttle for actual abuse.
const recentClicks = new Map<string, number[]>();

function noteClickAndCheck(userId: string, now: number): boolean {
  const queue = recentClicks.get(userId) ?? [];
  // Drop entries older than 1 second.
  const cutoff = now - 1000;
  while (queue.length > 0 && queue[0] < cutoff) queue.shift();
  if (queue.length >= MAX_CLICKS_PER_SEC) {
    recentClicks.set(userId, queue);
    return false;
  }
  queue.push(now);
  recentClicks.set(userId, queue);
  return true;
}

// POST /api/earn/penny-pinchers/click  body: { coinType, trait? }
export async function POST(req: Request) {
  const s = await readSession();
  if (!s) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  let body: { coinType?: unknown; trait?: unknown };
  try { body = await req.json(); }
  catch { return NextResponse.json({ error: "bad_json" }, { status: 400 }); }

  const coinType = String(body.coinType ?? "") as CoinId;
  if (!COINS[coinType]) return NextResponse.json({ error: "bad_coin" }, { status: 400 });

  // Optional trait. The client tells us; we trust but cap via
  // traitMultiplier so a tampered request can't claim a 1000× shiny.
  let trait: CoinTrait | null = null;
  if (typeof body.trait === "string" && body.trait in TRAITS) {
    trait = body.trait as CoinTrait;
  }

  const now = Date.now();
  if (!noteClickAndCheck(s.user.id, now)) {
    return NextResponse.json({ error: "rate_limit" }, { status: 429 });
  }

  let state = await getPennyPinchersState(s.user.id);
  if (!state) return NextResponse.json({ error: "no_state" }, { status: 400 });

  const upgrades = await listPennyPinchersUpgrades(s.user.id);
  const upgradeLevels: Record<string, number> = {};
  for (const u of upgrades) upgradeLevels[u.upgrade_id] = u.level;

  const permRows = await listPennyPinchersPermUpgrades(s.user.id);
  const permLevels: Partial<Record<PermUpgradeId, number>> = {};
  for (const u of permRows) permLevels[u.upgrade_id as PermUpgradeId] = u.level;

  const baseValue = coinPCValue(coinType, upgradeLevels, permLevels);
  const pc = Math.round(
    baseValue * traitMultiplier(trait) * frugalityPCMultiplier(state.frugality),
  );

  // Trait pickups go into the Coin Album. We deep-clone the
  // existing album object so the upsert sees a fresh shape.
  let album = state.album ?? {};
  if (trait === "shiny" || trait === "sticky") {
    const page = trait;
    const before = album[page] ?? {};
    album = { ...album, [page]: { ...before, [coinType]: (before[coinType] ?? 0) + 1 } };
  }

  state = await upsertPennyPinchersState({
    ...state,
    cents: state.cents + pc,
    lifetime_clicks: state.lifetime_clicks + 1,
    lifetime_pc_earned: state.lifetime_pc_earned + pc,
    album,
    last_tick_at: new Date(now).toISOString(),
  });

  return NextResponse.json({ ok: true, cents: state.cents, pcEarned: pc, trait });
}
