import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { readSession } from "@/lib/auth/session";
import {
  getPennyPinchersState,
  listPennyPinchersPermUpgrades,
  listPennyPinchersUpgrades,
} from "@/lib/db";
import {
  COINS,
  MAX_CLICK_PC,
  MAX_CLICKS_PER_SEC,
  TRAITS,
  type CoinId,
  type CoinTrait,
  type PermUpgradeId,
} from "@/lib/games/penny-pinchers/catalog";
import {
  albumPCBonus,
  coinPCValue,
  frugalityPCMultiplier,
  relicEffects,
  traitMultiplier,
} from "@/lib/games/penny-pinchers/engine";

export const runtime = "nodejs";

// In-process sliding-window rate limiter for clicks. Maps user-id →
// timestamp queue of the most-recent ~25 click times. Cheap, lasts
// the lifetime of the Vercel function instance, and that's fine —
// the daily-bank cap is the load-bearing throttle for actual abuse.
//
// Batched clicks each get their own timestamp pushed; if a single
// batch exceeds the per-second budget we trim it to fit (clicks past
// the budget get dropped server-side, which is functionally
// equivalent to the previous "rate_limit 429" behavior on a single
// click but lets the rest of the batch through).
const recentClicks = new Map<string, number[]>();

/**
 * Returns how many of the requested `count` clicks fit inside the
 * sliding-window rate limit, and pushes that many timestamps. Any
 * remainder is silently dropped.
 */
function reserveClickBudget(userId: string, now: number, count: number): number {
  const queue = recentClicks.get(userId) ?? [];
  const cutoff = now - 1000;
  while (queue.length > 0 && queue[0] < cutoff) queue.shift();
  const remaining = Math.max(0, MAX_CLICKS_PER_SEC - queue.length);
  const allowed = Math.min(count, remaining);
  for (let i = 0; i < allowed; i++) queue.push(now);
  recentClicks.set(userId, queue);
  return allowed;
}

type ClickInput = { coinType: CoinId; trait: CoinTrait | null; mergedPC: number | null };

function parseSingle(body: { coinType?: unknown; trait?: unknown; pc?: unknown }): ClickInput | null {
  const coinType = String(body.coinType ?? "") as CoinId;
  if (!COINS[coinType]) return null;
  let trait: CoinTrait | null = null;
  if (typeof body.trait === "string" && body.trait in TRAITS) trait = body.trait as CoinTrait;
  let mergedPC: number | null = null;
  if (typeof body.pc === "number" && Number.isFinite(body.pc) && body.pc > 0) {
    mergedPC = Math.min(MAX_CLICK_PC, Math.floor(body.pc));
  }
  return { coinType, trait, mergedPC };
}

// POST /api/earn/penny-pinchers/click
//
// Body shapes:
//   { coinType, trait?, pc? }                     — single click (legacy)
//   { clicks: [{ coinType, trait?, pc? }, ...] }  — batched (new)
//
// Batched form is preferred — the client queues clicks for ~400ms
// and flushes them in a single round-trip. Server credits the total
// PC, increments lifetime_clicks by the batch size, and merges all
// album updates in one transaction.
export async function POST(req: Request) {
  const s = await readSession();
  if (!s) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  let body: { coinType?: unknown; trait?: unknown; pc?: unknown; clicks?: unknown };
  try { body = await req.json(); }
  catch { return NextResponse.json({ error: "bad_json" }, { status: 400 }); }

  // Normalize: always work with an array of validated inputs.
  let inputs: ClickInput[];
  if (Array.isArray(body.clicks)) {
    inputs = (body.clicks as Array<Record<string, unknown>>)
      .map(parseSingle)
      .filter((x): x is ClickInput => x != null);
    // Defensive cap — a single batch shouldn't ever exceed a couple
    // seconds of clicks. Anything wildly larger is suspect; trim it.
    if (inputs.length > MAX_CLICKS_PER_SEC * 3) {
      inputs = inputs.slice(0, MAX_CLICKS_PER_SEC * 3);
    }
  } else {
    const single = parseSingle(body);
    if (!single) return NextResponse.json({ error: "bad_coin" }, { status: 400 });
    inputs = [single];
  }
  if (inputs.length === 0) return NextResponse.json({ error: "empty_batch" }, { status: 400 });

  const now = Date.now();
  const allowed = reserveClickBudget(s.user.id, now, inputs.length);
  if (allowed <= 0) return NextResponse.json({ error: "rate_limit" }, { status: 429 });
  if (allowed < inputs.length) inputs = inputs.slice(0, allowed);

  const state = await getPennyPinchersState(s.user.id);
  if (!state) return NextResponse.json({ error: "no_state" }, { status: 400 });

  const upgrades = await listPennyPinchersUpgrades(s.user.id);
  const upgradeLevels: Record<string, number> = {};
  for (const u of upgrades) upgradeLevels[u.upgrade_id] = u.level;

  const permRows = await listPennyPinchersPermUpgrades(s.user.id);
  const permLevels: Partial<Record<PermUpgradeId, number>> = {};
  for (const u of permRows) permLevels[u.upgrade_id as PermUpgradeId] = u.level;

  const relicE = relicEffects(state.relics as Parameters<typeof relicEffects>[0]);
  const frugMul = frugalityPCMultiplier(state.frugality);
  const albumMul = albumPCBonus(state.album ?? {});

  // Compute total PC + per-(page,coin) album increments. The same
  // PC math as the old single-click endpoint, applied to each item.
  let totalPC = 0;
  const albumIncrements: Record<string, Record<string, number>> = {};
  for (const inp of inputs) {
    const baseValue = inp.mergedPC ?? coinPCValue(inp.coinType, upgradeLevels, permLevels, relicE);
    const pc = Math.round(
      baseValue *
        traitMultiplier(inp.trait) *
        frugMul *
        albumMul *
        relicE.clickPCMul,
    );
    totalPC += pc;
    const albumPage =
      inp.trait === "shiny"   ? "shiny" :
      inp.trait === "sticky"  ? "sticky" :
      inp.trait === "foreign" ? "foreign" :
      inp.trait === "bent"    ? "bent" :
      inp.trait === "cursed"  ? "cursed" :
      inp.trait === "ancient" ? "ancient" :
      null;
    if (albumPage) {
      const page = (albumIncrements[albumPage] ??= {});
      page[inp.coinType] = (page[inp.coinType] ?? 0) + 1;
    }
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (url && key) {
    const sb = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
    await sb.rpc("pp_record_clicks", {
      p_user_id: s.user.id,
      p_pc: totalPC,
      p_clicks: inputs.length,
      p_album_increments: albumIncrements,
      p_tick_at: new Date(now).toISOString(),
    });
  }

  return NextResponse.json({ ok: true, pcEarned: totalPC, clicks: inputs.length });
}
