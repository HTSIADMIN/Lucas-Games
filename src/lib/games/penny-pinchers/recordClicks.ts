// Server-only helper used by the dedicated /click route AND by every
// spend route (/upgrade, /hire, /perm-upgrade, /bank, /blessing) so a
// purchase can flush the player's pending click queue in the same
// HTTP packet. Eliminates the race where a buy POST overtakes the
// click flush and gets rejected for stale cents.
//
// Sliding-window rate limit lives at module scope so all routes
// share the same per-user budget.

import { createClient } from "@supabase/supabase-js";
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
  prestigePCMultiplier,
  relicEffects,
  traitMultiplier,
} from "@/lib/games/penny-pinchers/engine";

export type ClickInput = {
  coinType: CoinId;
  /** All traits that landed on this coin — empty for a plain spawn,
   *  one entry for a single-trait spawn, multiple for multi-trait
   *  spawns or coins fused via Pile It Up. */
  traits: CoinTrait[];
  mergedPC: number | null;
};

const recentClicks = new Map<string, number[]>();

/**
 * Reserve up to `count` slots in the per-user sliding-window rate limit
 * and return the actual number granted. Anything beyond the budget is
 * silently dropped (spend routes prefer dropping over rejecting so the
 * buy still goes through).
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

/** Validate one raw click body. Returns null if it's malformed.
 *  Accepts either `traits: CoinTrait[]` (preferred) or the legacy
 *  `trait: CoinTrait | null` field for older clients. */
export function parseClickInput(raw: {
  coinType?: unknown;
  trait?: unknown;
  traits?: unknown;
  pc?: unknown;
}): ClickInput | null {
  const coinType = String(raw.coinType ?? "") as CoinId;
  if (!COINS[coinType]) return null;
  // Normalise to CoinTrait[]: prefer the new traits array; fall
  // back to the legacy single trait field; dedupe + cap the size
  // so a tampered client can't pad a coin with 50 trait entries
  // and inflate the click multiplier.
  const traits: CoinTrait[] = [];
  const seen = new Set<string>();
  const push = (val: unknown) => {
    if (typeof val !== "string" || !(val in TRAITS) || seen.has(val)) return;
    seen.add(val);
    traits.push(val as CoinTrait);
  };
  if (Array.isArray(raw.traits)) {
    for (const v of raw.traits as unknown[]) push(v);
  } else if (typeof raw.trait === "string") {
    push(raw.trait);
  }
  // 6 distinct trait types — cap at that.
  if (traits.length > 6) traits.length = 6;
  let mergedPC: number | null = null;
  if (typeof raw.pc === "number" && Number.isFinite(raw.pc) && raw.pc > 0) {
    mergedPC = Math.min(MAX_CLICK_PC, Math.floor(raw.pc));
  }
  return { coinType, traits, mergedPC };
}

/** Pick `clicks` out of an arbitrary request body and validate them. */
export function parseClickArray(input: unknown): ClickInput[] {
  if (!Array.isArray(input)) return [];
  const items = (input as Array<Record<string, unknown>>)
    .map(parseClickInput)
    .filter((x): x is ClickInput => x != null);
  if (items.length > MAX_CLICKS_PER_SEC * 3) {
    return items.slice(0, MAX_CLICKS_PER_SEC * 3);
  }
  return items;
}

export type RecordClicksResult = {
  /** Clicks that were actually persisted (after rate-limit truncation). */
  applied: number;
  /** Total PC credited to the user from this batch. */
  pcEarned: number;
};

/**
 * Persist a batch of clicks for the user. Mirrors what the dedicated
 * /click route used to do inline — split out so spend routes can
 * piggyback on the same call. Returns `{ applied: 0, pcEarned: 0 }`
 * for an empty batch (caller should noop).
 */
export async function recordClicks(
  userId: string,
  inputs: ClickInput[],
): Promise<RecordClicksResult> {
  if (inputs.length === 0) return { applied: 0, pcEarned: 0 };

  const now = Date.now();
  const allowed = reserveClickBudget(userId, now, inputs.length);
  if (allowed <= 0) return { applied: 0, pcEarned: 0 };
  const trimmed = allowed < inputs.length ? inputs.slice(0, allowed) : inputs;

  const state = await getPennyPinchersState(userId);
  if (!state) return { applied: 0, pcEarned: 0 };

  const upgrades = await listPennyPinchersUpgrades(userId);
  const upgradeLevels: Record<string, number> = {};
  for (const u of upgrades) upgradeLevels[u.upgrade_id] = u.level;

  const permRows = await listPennyPinchersPermUpgrades(userId);
  const permLevels: Partial<Record<PermUpgradeId, number>> = {};
  for (const u of permRows) permLevels[u.upgrade_id as PermUpgradeId] = u.level;

  const relicE = relicEffects(state.relics as Parameters<typeof relicEffects>[0]);
  const frugMul = frugalityPCMultiplier(state.frugality);
  const albumMul = albumPCBonus(state.album ?? {});
  const prestigeMul = prestigePCMultiplier(state.prestige_count);

  let totalPC = 0;
  const albumIncrements: Record<string, Record<string, number>> = {};
  for (const inp of trimmed) {
    const baseValue = inp.mergedPC ?? coinPCValue(inp.coinType, upgradeLevels, permLevels, relicE);
    const pc = Math.round(
      baseValue *
        traitMultiplier(inp.traits) *
        frugMul *
        albumMul *
        prestigeMul *
        relicE.clickPCMul,
    );
    totalPC += pc;
    // Multi-trait coins increment EVERY matching album page so
    // catching a shiny+ancient counts for both collections.
    for (const t of inp.traits) {
      const page = (albumIncrements[t] ??= {});
      page[inp.coinType] = (page[inp.coinType] ?? 0) + 1;
    }
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (url && key) {
    const sb = createClient(url, key, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    await sb.rpc("pp_record_clicks", {
      p_user_id: userId,
      p_pc: totalPC,
      p_clicks: trimmed.length,
      p_album_increments: albumIncrements,
      p_tick_at: new Date(now).toISOString(),
    });
  }

  return { applied: trimmed.length, pcEarned: totalPC };
}

/**
 * Convenience for spend routes. Pulls `body.clicks` (if present),
 * validates, and persists them — fire-and-forget from the route's
 * perspective beyond awaiting the RPC. Tolerates failure: if the click
 * batch fails for any reason the spend should still proceed.
 */
export async function applyPendingClicksFromBody(
  userId: string,
  body: { clicks?: unknown },
): Promise<RecordClicksResult> {
  const inputs = parseClickArray(body.clicks);
  if (inputs.length === 0) return { applied: 0, pcEarned: 0 };
  try {
    return await recordClicks(userId, inputs);
  } catch {
    return { applied: 0, pcEarned: 0 };
  }
}
