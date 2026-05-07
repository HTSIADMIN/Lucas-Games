"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useVisibleInterval } from "@/lib/hooks/useVisibleInterval";
import * as Sfx from "@/lib/sfx";
import {
  ACHIEVEMENTS_BY_ID,
  COINS,
  COIN_ORDER,
  EVENTS,
  EVENT_START_CHANCE_PER_POLL,
  LOST_WALLET_CHANCE_PER_POLL,
  LOST_WALLET_KEEP_PC,
  LOST_WALLET_LIFETIME_MS,
  MERGE_MIN_AGE_MS,
  MERGE_RULES,
  PRESTIGE_THRESHOLD_PC,
  AUTO_PICKER_PER_SEC,
  BLESSINGS,
  COUCH_CHANCE_PER_POLL,
  COUCH_CUSHIONS,
  COUCH_LIFETIME_MS,
  FOUNTAIN_CHANCE_PER_POLL,
  FOUNTAIN_LIFETIME_MS,
  STICKY_PICKUP_COUNT,
  STICKY_PICKUP_RADIUS,
  TRAITS,
  TWO_FINGER_RADIUS,
  type BlessingId,
  type AchievementId,
  type CoinId,
  type CoinTrait,
  type EventId,
  type HelperId,
  type PermUpgradeId,
  type UpgradeId,
} from "@/lib/games/penny-pinchers/catalog";
import {
  coinPCValue,
  findMerge,
  helperRatePcPerSec,
  rollSpawn,
  rollTrait,
  spawnIntervalMs,
  unlockedCoins,
} from "@/lib/games/penny-pinchers/engine";
import { CoinSprite } from "./CoinSprite";
import { UpgradeShop } from "./UpgradeShop";
import { HelperRoster } from "./HelperRoster";
import { BankTokenShop } from "./BankTokenShop";
import { AchievementsPanel } from "./AchievementsPanel";
import { AlbumPanel } from "./AlbumPanel";
import type { AlbumState } from "@/lib/games/penny-pinchers/engine";

// Penny Pinchers — main client. Coins spawn as absolutely-positioned
// DOM elements inside a play area; clicking them dispatches a server
// validate-and-credit, with optimistic local cents updates so the UI
// feels instant even on a flaky connection.
//
// Server is the source of truth for `cents` — we re-poll every ~6s
// (paused on hidden tabs by useVisibleInterval) so any drift between
// optimistic local state and the server settles automatically.

type StateResponse = {
  serverNow: number;
  cents: number;
  lifetimeClicks: number;
  lifetimePCEarned: number;
  upgrades: Record<string, number>;
  helpers: Record<string, number>;
  perm: Partial<Record<PermUpgradeId, number>>;
  helperRatePerSec: number;
  offlineAccruedJustNow: number;
  welcomeBackPC: number;
  offlineCapHours: number;
  bank: {
    pcPerWalletCent: number;
    cooldownMs: number;
    readyAt: number;
    maxPerBank: number;
    dailyCap: number;
    dailyBanked: number;
  };
  prestige: {
    count: number;
    bankTokens: number;
    thresholdPC: number;
    tokensIfRolled: number;
    lifetimeBanked: number;
  };
  achievements: {
    unlocked: AchievementId[];
    newlyUnlocked: AchievementId[];
  };
  frugality: number;
  album: AlbumState;
  walletBalance: number;
};

type ActiveEvent = { id: EventId; endsAt: number };
type LostWallet = { id: number; x: number; y: number; spawnedAt: number };
type Fountain  = { id: number; x: number; y: number; spawnedAt: number };
type Couch     = { id: number; x: number; y: number; spawnedAt: number };
type ActiveBlessing = { id: BlessingId; endsAt: number };
type CushionReveal = { idx: number; lootId: string; label: string; pcGain: number };
type FloatPop = { id: number; x: number; y: number; pc: number; shiny: boolean };

type SpawnedCoin = {
  id: number;
  coin: CoinId;
  trait: CoinTrait | null;
  x: number;
  y: number;
  spawnedAt: number;
};

const COIN_LIFETIME_MS = 11_000;
const SYNC_POLL_MS = 6000;

export function PennyPinchersClient() {
  const [server, setServer] = useState<StateResponse | null>(null);
  const [localCents, setLocalCents] = useState<number>(0);
  const [coins, setCoins] = useState<SpawnedCoin[]>([]);
  const [tab, setTab] = useState<"upgrades" | "helpers" | "tokens" | "achievements" | "album">("upgrades");
  const [welcomeBack, setWelcomeBack] = useState<number | null>(null);
  const [prestigeOpen, setPrestigeOpen] = useState(false);
  const [achievementToasts, setAchievementToasts] = useState<AchievementId[]>([]);
  const [activeEvent, setActiveEvent] = useState<ActiveEvent | null>(null);
  const [lostWallet, setLostWallet] = useState<LostWallet | null>(null);
  const [walletModalChoice, setWalletModalChoice] = useState<null | "open" | "submitting">(null);
  const [pops, setPops] = useState<FloatPop[]>([]);
  const [fountain, setFountain] = useState<Fountain | null>(null);
  const [couch, setCouch] = useState<Couch | null>(null);
  const [fountainModalOpen, setFountainModalOpen] = useState(false);
  const [couchModalOpen, setCouchModalOpen] = useState(false);
  const [cushionReveals, setCushionReveals] = useState<CushionReveal[]>([]);
  const [activeBlessings, setActiveBlessings] = useState<ActiveBlessing[]>([]);
  const popSeqRef = useRef(0);
  const lostWalletSeqRef = useRef(0);
  const fountainSeqRef = useRef(0);
  const couchSeqRef = useRef(0);

  const spawnPop = useCallback((x: number, y: number, pc: number, shiny: boolean) => {
    popSeqRef.current += 1;
    const id = popSeqRef.current;
    setPops((prev) => [...prev, { id, x, y, pc, shiny }]);
    window.setTimeout(() => {
      setPops((prev) => prev.filter((p) => p.id !== id));
    }, 800);
  }, []);
  /** True until the first /state load resolves — keeps the
   *  welcome-back banner restricted to "you just opened the page"
   *  rather than firing every 60s+ poll. */
  const firstLoadRef = useRef(true);

  const playRef = useRef<HTMLDivElement | null>(null);
  const coinSeqRef = useRef(0);

  // Pull initial state + sync poll
  const loadState = useCallback(async () => {
    try {
      const r = await fetch("/api/earn/penny-pinchers/state");
      if (!r.ok) return;
      const d = (await r.json()) as StateResponse;
      setServer(d);
      // Reconcile optimistic cents toward the server's authoritative value.
      // If the local guess is within 5% of the server, keep it (so a fresh
      // click doesn't get yanked back). Otherwise snap to the server.
      setLocalCents((prev) => {
        if (Math.abs(prev - d.cents) <= Math.max(5, d.cents * 0.05)) return prev;
        return d.cents;
      });
      // Welcome-back banner fires once on page entry only. The
      // server still flags any meaningful gap, but we ignore the
      // flag after the first load so background polls don't pop it.
      if (firstLoadRef.current) {
        firstLoadRef.current = false;
        if (d.welcomeBackPC > 0) {
          setWelcomeBack(d.welcomeBackPC);
          window.setTimeout(() => setWelcomeBack(null), 6000);
        }
      }
      // Achievement unlock toasts — chime + show one card per unlock.
      // Toasts auto-dismiss after 6s. Tokens are already credited
      // server-side (state.prestige.bankTokens reflects the bonus).
      // Event roll — only when nothing's already running. Lost
      // Wallet rolls separately so a Coin Storm and a wallet can
      // coexist (one's an event, one's a sprite).
      const nowMs = Date.now();
      setActiveEvent((current) => {
        if (current && current.endsAt > nowMs) return current;
        if (Math.random() < EVENT_START_CHANCE_PER_POLL) {
          const ids = Object.keys(EVENTS) as EventId[];
          const id = ids[Math.floor(Math.random() * ids.length)];
          const def = EVENTS[id];
          // Distinct stinger so events feel like a Thing — different
          // SFX per event keeps Coin Storm and Rainy Day audibly apart.
          Sfx.play(id === "coin_storm" ? "win.levelup" : "win.notify");
          return { id, endsAt: nowMs + def.durationMs };
        }
        return null;
      });
      // Prune blessings that have expired since last poll.
      setActiveBlessings((bs) => bs.filter((b) => b.endsAt > nowMs));
      setFountain((current) => {
        if (current && nowMs - current.spawnedAt < FOUNTAIN_LIFETIME_MS) return current;
        if (Math.random() < FOUNTAIN_CHANCE_PER_POLL) {
          const playEl = playRef.current;
          if (!playEl) return null;
          const rect = playEl.getBoundingClientRect();
          const pad = 70;
          fountainSeqRef.current += 1;
          return {
            id: fountainSeqRef.current,
            x: pad + Math.random() * Math.max(0, rect.width - pad * 2),
            y: pad + Math.random() * Math.max(0, rect.height - pad * 2),
            spawnedAt: nowMs,
          };
        }
        return null;
      });
      setCouch((current) => {
        if (current && nowMs - current.spawnedAt < COUCH_LIFETIME_MS) return current;
        if (Math.random() < COUCH_CHANCE_PER_POLL) {
          const playEl = playRef.current;
          if (!playEl) return null;
          const rect = playEl.getBoundingClientRect();
          const pad = 80;
          couchSeqRef.current += 1;
          return {
            id: couchSeqRef.current,
            x: pad + Math.random() * Math.max(0, rect.width - pad * 2),
            y: pad + Math.random() * Math.max(0, rect.height - pad * 2),
            spawnedAt: nowMs,
          };
        }
        return null;
      });
      setLostWallet((current) => {
        if (current && nowMs - current.spawnedAt < LOST_WALLET_LIFETIME_MS) return current;
        if (Math.random() < LOST_WALLET_CHANCE_PER_POLL) {
          const playEl = playRef.current;
          if (!playEl) return null;
          const rect = playEl.getBoundingClientRect();
          const pad = 60;
          lostWalletSeqRef.current += 1;
          return {
            id: lostWalletSeqRef.current,
            x: pad + Math.random() * Math.max(0, rect.width - pad * 2),
            y: pad + Math.random() * Math.max(0, rect.height - pad * 2),
            spawnedAt: nowMs,
          };
        }
        return null;
      });
      if (d.achievements.newlyUnlocked.length > 0) {
        Sfx.play("win.levelup");
        const ids = d.achievements.newlyUnlocked;
        setAchievementToasts((prev) => [...prev, ...ids]);
        const dismiss = window.setTimeout(() => {
          setAchievementToasts((prev) => prev.filter((id) => !ids.includes(id)));
        }, 6000);
        // best-effort cleanup — clearing on unmount is overkill for a one-shot
        void dismiss;
      }
    } catch {
      /* network blip — try again next tick */
    }
  }, []);
  useVisibleInterval(loadState, SYNC_POLL_MS);

  // Real-time helper accrual. The server is the source of truth on
  // each /state poll, but in between polls we drip the rate locally
  // so the PC counter visibly ticks instead of jumping every 5s.
  // The next poll's reconcile in `loadState` snaps anything that
  // drifted more than ~5%.
  const helperRate = server?.helperRatePerSec ?? 0;
  useEffect(() => {
    if (helperRate <= 0) return;
    const tickMs = 100;
    const perTick = (helperRate * tickMs) / 1000;
    const t = window.setInterval(() => {
      setLocalCents((c) => c + perTick);
    }, tickMs);
    return () => window.clearInterval(t);
  }, [helperRate]);

  // Coin spawner — applies the active event's spawn-rate multiplier
  // and bonus shiny chance so Coin Storm rains coins and Rainy Day
  // glints with shinies. Wishing Fountain blessings stack on top.
  const upgrades = (server?.upgrades ?? {}) as Record<UpgradeId, number>;
  const baseIntervalMs = useMemo(() => spawnIntervalMs(upgrades), [upgrades]);
  const eventDef = activeEvent ? EVENTS[activeEvent.id] : null;
  const hasSharpEyes = activeBlessings.some((b) => b.id === "sharp_eyes");
  const hasLucky = activeBlessings.some((b) => b.id === "lucky_streak");
  const hasGreedy = activeBlessings.some((b) => b.id === "greedy_spawns");
  const eventInterval = eventDef ? baseIntervalMs * eventDef.spawnMultiplier : baseIntervalMs;
  const intervalMs = Math.max(120, Math.round(eventInterval * (hasSharpEyes ? 0.5 : 1)));
  const burstSize = (eventDef?.extraConcurrent ?? 0) > 0 ? 1 + eventDef!.extraConcurrent : 1;
  const bonusShiny = (eventDef?.bonusShinyChance ?? 0) + (hasLucky ? 0.1 : 0);
  useEffect(() => {
    if (!server) return;
    const t = window.setInterval(() => {
      const playEl = playRef.current;
      if (!playEl) return;
      const rect = playEl.getBoundingClientRect();
      const pad = 40;
      const newSpawns: SpawnedCoin[] = [];
      // Coin Storm spawns a small burst per tick instead of one
      // coin — feels much rainier without halving the interval to
      // sub-100ms territory.
      const count = burstSize;
      for (let i = 0; i < count; i++) {
        const x = pad + Math.random() * Math.max(0, rect.width - pad * 2);
        const y = pad + Math.random() * Math.max(0, rect.height - pad * 2);
        // Greedy Spawns blessing: half the time, force the highest
        // unlocked coin instead of rolling the spawn pool. The
        // other half stays the regular distribution so we don't
        // completely starve out pennies.
        let coin = rollSpawn(upgrades);
        if (hasGreedy && Math.random() < 0.5) {
          const list = unlockedCoins(upgrades);
          coin = list[list.length - 1];
        }
        let trait = rollTrait(coin, upgrades, server.perm, server.album);
        // Rainy Day's bonus shiny — secondary roll only when the
        // base trait roll didn't already land something.
        if (!trait && bonusShiny > 0 && Math.random() < bonusShiny) trait = "shiny";
        coinSeqRef.current += 1;
        newSpawns.push({ id: coinSeqRef.current, coin, trait, x, y, spawnedAt: Date.now() });
      }
      setCoins((prev) => [...prev, ...newSpawns]);
    }, intervalMs);
    return () => window.clearInterval(t);
  }, [server, intervalMs, upgrades, burstSize, bonusShiny, hasGreedy]);

  // Auto-Picker — picks a random coin off the play area every
  // `1000/level` ms. Routes through the same click flow (so PC
  // popups and PC ticks fire) but in silent mode so the wood-tick
  // SFX doesn't machine-gun. Closures over the latest clickCoin
  // via a ref so upgrade changes mid-run don't get stale.
  const clickCoinRef = useRef<typeof clickCoin>(clickCoin);
  clickCoinRef.current = clickCoin;
  const autoPickerLevel = upgrades.auto_picker ?? 0;
  useEffect(() => {
    if (!server || autoPickerLevel <= 0) return;
    const intervalMs = Math.max(150, Math.floor(1000 / (AUTO_PICKER_PER_SEC * autoPickerLevel)));
    const t = window.setInterval(() => {
      let target: SpawnedCoin | null = null;
      setCoins((prev) => {
        if (prev.length > 0) target = prev[Math.floor(Math.random() * prev.length)];
        return prev;
      });
      if (target) void clickCoinRef.current(target, { silent: true });
    }, intervalMs);
    return () => window.clearInterval(t);
  }, [server, autoPickerLevel]);

  // Merge proximity loop — only runs when "pile_it_up" is owned.
  // Walks each merge rule once per tick and fuses one cluster
  // per tick so the animation reads as a chain reaction rather
  // than a single frame disappearance.
  useEffect(() => {
    if (!server) return;
    if ((upgrades.pile_it_up ?? 0) < 1) return;
    const t = window.setInterval(() => {
      setCoins((prev) => {
        const eligibleCutoff = Date.now() - MERGE_MIN_AGE_MS;
        const eligible = prev.filter((c) => c.spawnedAt <= eligibleCutoff);
        for (const rule of MERGE_RULES) {
          const merge = findMerge(eligible, rule);
          if (!merge) continue;
          coinSeqRef.current += 1;
          const fresh: SpawnedCoin = {
            id: coinSeqRef.current,
            coin: merge.to,
            trait: null,
            x: merge.centroid.x,
            y: merge.centroid.y,
            spawnedAt: Date.now(),
          };
          return [...prev.filter((c) => !merge.ids.includes(c.id)), fresh];
        }
        return prev;
      });
    }, 600);
    return () => window.clearInterval(t);
  }, [server, upgrades.pile_it_up]);

  // Coin reaper — drop coins that have aged out
  useEffect(() => {
    const t = window.setInterval(() => {
      const cutoff = Date.now() - COIN_LIFETIME_MS;
      setCoins((prev) => prev.filter((c) => c.spawnedAt > cutoff));
    }, 500);
    return () => window.clearInterval(t);
  }, []);

  // Helpers tick — local optimistic counter so the player sees their
  // PC accrue smoothly while the server reconciles every 6s.
  useEffect(() => {
    if (!server || server.helperRatePerSec <= 0) return;
    const t = window.setInterval(() => {
      setLocalCents((c) => c + server.helperRatePerSec / 4);
    }, 250);
    return () => window.clearInterval(t);
  }, [server]);

  async function clickCoin(coin: SpawnedCoin, opts: { silent?: boolean } = {}) {
    // Slots reel-stop tick — chunky wood click that reads as
    // "the coin landed" without the long melodic tail of coin.drop.
    if (!opts.silent) Sfx.play("ui.wood");
    const traitMul = coin.trait === "shiny" ? 5 : 1;
    const optimisticPC = coinPCValue(coin.coin, upgrades) * traitMul;
    setLocalCents((c) => c + optimisticPC);
    spawnPop(coin.x, coin.y, optimisticPC, coin.trait === "shiny");

    // Two-Finger Pickup + Sticky both add "collateral" pickups —
    // extra coins this single click is going to grab. They share the
    // same downstream code path (optimistic PC + pop + server click)
    // so adding a second source is just adding to the list.
    const collateral: SpawnedCoin[] = [];
    setCoins((prev) => {
      const others = prev.filter((c) => c.id !== coin.id);

      // Sticky — grab the N nearest within radius.
      if (coin.trait === "sticky") {
        const nearby = others
          .map((c) => ({ c, d2: (c.x - coin.x) ** 2 + (c.y - coin.y) ** 2 }))
          .filter((e) => e.d2 <= STICKY_PICKUP_RADIUS * STICKY_PICKUP_RADIUS)
          .sort((a, b) => a.d2 - b.d2)
          .slice(0, STICKY_PICKUP_COUNT)
          .map((e) => e.c);
        collateral.push(...nearby);
      }

      // Two-Finger Pickup — 5% per level chance to grab one extra
      // coin within a generous radius. Independent of sticky, but
      // we exclude anything already grabbed so we don't double-pop.
      const tfLevel = upgrades.two_finger_pickup ?? 0;
      if (tfLevel > 0) {
        const chance = Math.min(0.5, 0.05 * tfLevel);
        if (Math.random() < chance) {
          const taken = new Set(collateral.map((c) => c.id));
          const extra = others
            .filter((c) => !taken.has(c.id))
            .map((c) => ({ c, d2: (c.x - coin.x) ** 2 + (c.y - coin.y) ** 2 }))
            .filter((e) => e.d2 <= TWO_FINGER_RADIUS * TWO_FINGER_RADIUS)
            .sort((a, b) => a.d2 - b.d2)[0];
          if (extra) collateral.push(extra.c);
        }
      }

      const removeIds = new Set([coin.id, ...collateral.map((c) => c.id)]);
      return prev.filter((c) => !removeIds.has(c.id));
    });

    try {
      const r = await fetch("/api/earn/penny-pinchers/click", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ coinType: coin.coin, trait: coin.trait }),
      });
      if (r.ok) {
        const d = (await r.json()) as { cents: number };
        setLocalCents(d.cents);
      }
    } catch { /* ignore */ }

    // Fire-and-forget the collateral pickups so each one is
    // metered + counted toward lifetime_clicks.
    for (const extra of collateral) {
      const extraOptimistic = coinPCValue(extra.coin, upgrades) * (extra.trait === "shiny" ? 5 : 1);
      setLocalCents((c) => c + extraOptimistic);
      spawnPop(extra.x, extra.y, extraOptimistic, extra.trait === "shiny");
      void fetch("/api/earn/penny-pinchers/click", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ coinType: extra.coin, trait: extra.trait }),
      }).catch(() => { /* ignore — sync poll reconciles */ });
    }
  }

  async function buyUpgrade(id: UpgradeId, cost: number) {
    if (localCents < cost) return;
    setLocalCents((c) => c - cost);
    Sfx.play("ui.click");
    try {
      const r = await fetch("/api/earn/penny-pinchers/upgrade", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ upgradeId: id }),
      });
      if (r.ok) await loadState();
      else await loadState(); // refund any optimistic deduction
    } catch { await loadState(); }
  }

  async function hireHelper(id: HelperId, cost: number) {
    if (localCents < cost) return;
    setLocalCents((c) => c - cost);
    Sfx.play("ui.click");
    try {
      const r = await fetch("/api/earn/penny-pinchers/hire", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ helperId: id }),
      });
      if (r.ok) await loadState();
      else await loadState();
    } catch { await loadState(); }
  }

  async function buyPermUpgrade(id: PermUpgradeId, cost: number) {
    if (!server || server.prestige.bankTokens < cost) return;
    Sfx.play("ui.click");
    try {
      const r = await fetch("/api/earn/penny-pinchers/perm-upgrade", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ upgradeId: id }),
      });
      if (r.ok) await loadState();
    } catch { await loadState(); }
  }

  async function buyBlessing(id: BlessingId) {
    const def = BLESSINGS[id];
    if (!def || localCents < def.cost) return;
    setLocalCents((c) => c - def.cost);
    Sfx.play("ui.confirm");
    try {
      const r = await fetch("/api/earn/penny-pinchers/blessing", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ blessingId: id }),
      });
      if (r.ok) {
        const d = (await r.json()) as { durationMs: number; cents: number };
        setLocalCents(d.cents);
        setActiveBlessings((bs) => [...bs, { id, endsAt: Date.now() + d.durationMs }]);
        setFountain(null);
        setFountainModalOpen(false);
      } else {
        // Refund optimistic on rejection.
        setLocalCents((c) => c + def.cost);
      }
    } catch {
      setLocalCents((c) => c + def.cost);
    }
  }

  async function flipCushion(idx: number) {
    if (cushionReveals.some((c) => c.idx === idx)) return;
    Sfx.play("ui.wood");
    try {
      const r = await fetch("/api/earn/penny-pinchers/cushion", { method: "POST" });
      if (!r.ok) return;
      const d = (await r.json()) as { loot: string; label: string; pcGain: number; cents: number };
      setLocalCents(d.cents);
      setCushionReveals((prev) => [...prev, { idx, lootId: d.loot, label: d.label, pcGain: d.pcGain }]);
      if (d.pcGain > 0) Sfx.play("coin.drop");
    } catch { /* ignore */ }
  }

  function closeCouch() {
    setCouchModalOpen(false);
    setCouch(null);
    setCushionReveals([]);
  }

  async function resolveLostWallet(choice: "return" | "keep") {
    if (walletModalChoice === "submitting") return;
    setWalletModalChoice("submitting");
    if (choice === "keep") {
      // Optimistic — server will reconcile on next sync.
      setLocalCents((c) => c + LOST_WALLET_KEEP_PC);
      Sfx.play("coins.shower");
    } else {
      Sfx.play("ui.confirm");
    }
    try {
      await fetch("/api/earn/penny-pinchers/wallet", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ choice }),
      });
    } catch { /* swallow — sync poll reconciles */ }
    setWalletModalChoice(null);
    setLostWallet(null);
    await loadState();
  }

  async function rollItUp() {
    Sfx.play("chips.stack");
    try {
      const r = await fetch("/api/earn/penny-pinchers/prestige", { method: "POST" });
      if (r.ok) {
        setPrestigeOpen(false);
        // Wipe local coin state too — fresh play area, fresh PC.
        setCoins([]);
        await loadState();
      }
    } catch { await loadState(); }
  }

  async function bank() {
    Sfx.play("chips.stack");
    try {
      const r = await fetch("/api/earn/penny-pinchers/bank", { method: "POST" });
      if (r.ok) {
        const d = (await r.json()) as { payoutCents: number; remainingPC: number };
        // Tell the global LiveBalance to refresh
        window.dispatchEvent(new CustomEvent("lg:balance", { detail: undefined }));
        setLocalCents(d.remainingPC);
        await loadState();
      } else {
        await loadState();
      }
    } catch { await loadState(); }
  }

  if (!server) {
    return <p className="text-mute" style={{ padding: "var(--sp-5)" }}>Loading…</p>;
  }

  const unlocked = unlockedCoins(upgrades);
  const ratePcPerSec = helperRatePcPerSec(server.helpers, server.perm);
  const now = Date.now();
  const canRoll = server.lifetimePCEarned >= server.prestige.thresholdPC && server.prestige.tokensIfRolled > 0;
  const lifetimeProgress = Math.min(1, server.lifetimePCEarned / server.prestige.thresholdPC);
  const bankReady = server.bank.readyAt === 0 || now >= server.bank.readyAt;
  const dailyRoom = Math.max(0, server.bank.dailyCap - server.bank.dailyBanked);
  const projectedPayout = Math.min(
    Math.floor(localCents / server.bank.pcPerWalletCent),
    server.bank.maxPerBank,
    dailyRoom,
  );
  const cooldownLeftMs = Math.max(0, server.bank.readyAt - now);

  return (
    <div className="stack" style={{ gap: "var(--sp-4)" }}>
      {welcomeBack != null && (
        <div
          style={{
            background: "var(--gold-100)",
            border: "3px solid var(--gold-300)",
            padding: "var(--sp-2) var(--sp-3)",
            fontFamily: "var(--font-display)",
            fontSize: 13,
            color: "var(--ink-900)",
            textAlign: "center",
          }}
        >
          ★ Welcome back — your helpers earned <b>{welcomeBack.toLocaleString()} PC</b> while you were away.
        </div>
      )}

      {activeEvent && (
        <div
          style={{
            background: activeEvent.id === "coin_storm" ? "var(--gold-300)" : "var(--sky-300)",
            border: "3px solid var(--ink-900)",
            padding: "var(--sp-2) var(--sp-3)",
            fontFamily: "var(--font-display)",
            fontSize: 13,
            color: "var(--ink-900)",
            textAlign: "center",
            letterSpacing: "0.06em",
            textTransform: "uppercase",
            animation: "game-event-pulse 1.6s ease-in-out infinite",
          }}
        >
          {EVENTS[activeEvent.id].label} · {EVENTS[activeEvent.id].blurb} ·{" "}
          {Math.max(0, Math.ceil((activeEvent.endsAt - now) / 1000))}s
        </div>
      )}

      <div
        className="row"
        style={{
          justifyContent: "space-between",
          alignItems: "stretch",
          gap: "var(--sp-3)",
          flexWrap: "wrap",
        }}
      >
        <div
          className="panel"
          style={{
            padding: "var(--sp-3) var(--sp-4)",
            flex: "1 1 220px",
            minWidth: 220,
          }}
        >
          <div className="text-mute" style={{ fontSize: 11, letterSpacing: "0.06em", textTransform: "uppercase" }}>
            Pinch Cents
          </div>
          <div
            style={{
              fontFamily: "var(--font-display)",
              fontSize: 28,
              color: "var(--gold-500)",
              textShadow: "1px 1px 0 var(--gold-100)",
            }}
          >
            {Math.floor(localCents).toLocaleString()} PC
          </div>
          <div className="text-mute" style={{ fontSize: 11 }}>
            Helpers: {ratePcPerSec.toLocaleString()} PC/sec · Lifetime clicks {server.lifetimeClicks.toLocaleString()}
          </div>
          <div
            style={{
              marginTop: 4,
              fontFamily: "var(--font-display)",
              fontSize: 11,
              color: server.frugality > 0
                ? "var(--cactus-500)"
                : server.frugality < 0
                ? "var(--crimson-500)"
                : "var(--saddle-400)",
            }}
          >
            {server.frugality > 0 ? "✓" : server.frugality < 0 ? "✗" : "·"} Frugality {server.frugality > 0 ? `+${server.frugality}` : server.frugality}
          </div>
        </div>
        <div
          className="panel"
          style={{
            padding: "var(--sp-3) var(--sp-4)",
            flex: "1 1 260px",
            minWidth: 260,
            background: bankReady && projectedPayout > 0 ? "var(--gold-100)" : undefined,
            animation: bankReady && projectedPayout > 0 ? "pp-bank-ready 1.6s ease-in-out infinite" : undefined,
          }}
        >
          <div className="row" style={{ justifyContent: "space-between", alignItems: "baseline" }}>
            <div className="text-mute" style={{ fontSize: 11, letterSpacing: "0.06em", textTransform: "uppercase" }}>
              Bank It
            </div>
            <div className="text-mute" style={{ fontSize: 11 }}>
              {server.bank.dailyBanked.toLocaleString()} / {server.bank.dailyCap.toLocaleString()} ¢ today
            </div>
          </div>
          <div style={{ fontFamily: "var(--font-display)", fontSize: 18, color: "var(--ink-900)" }}>
            ≈ {projectedPayout.toLocaleString()} ¢
          </div>
          <button
            type="button"
            className="btn btn-sm"
            disabled={!bankReady || projectedPayout <= 0}
            onClick={bank}
            style={{ marginTop: 6, width: "100%" }}
          >
            {bankReady
              ? projectedPayout > 0
                ? "Bank It"
                : dailyRoom <= 0
                ? "Daily cap reached"
                : "Need more PC"
              : `Cooldown ${formatHMS(cooldownLeftMs)}`}
          </button>
          <style>{`
            @keyframes pp-bank-ready {
              0%, 100% { box-shadow: var(--sh-card-rest, 0 0 0 0 transparent); }
              50%      { box-shadow: 0 0 0 4px rgba(255,196,64,0.55), 0 0 22px rgba(255,196,64,0.7); }
            }
          `}</style>
        </div>
        <div
          className="panel"
          style={{
            padding: "var(--sp-3) var(--sp-4)",
            flex: "1 1 240px",
            minWidth: 240,
            background: canRoll ? "var(--gold-100)" : undefined,
            border: canRoll ? "3px solid var(--gold-300)" : undefined,
          }}
        >
          <div className="row" style={{ justifyContent: "space-between", alignItems: "baseline" }}>
            <div className="text-mute" style={{ fontSize: 11, letterSpacing: "0.06em", textTransform: "uppercase" }}>
              Roll It Up
            </div>
            <div className="text-mute" style={{ fontSize: 11 }}>
              ×{server.prestige.count} · {server.prestige.bankTokens.toLocaleString()} ★
            </div>
          </div>
          <div style={{ fontFamily: "var(--font-display)", fontSize: 16, color: "var(--ink-900)" }}>
            {canRoll
              ? `+${server.prestige.tokensIfRolled.toLocaleString()} ★ Tokens`
              : `${Math.round(lifetimeProgress * 100)}% to next prestige`}
          </div>
          <div
            style={{
              height: 6,
              background: "var(--parchment-200)",
              border: "2px solid var(--ink-900)",
              marginTop: 4,
              marginBottom: 6,
              overflow: "hidden",
            }}
          >
            <div
              style={{
                width: `${Math.round(lifetimeProgress * 100)}%`,
                height: "100%",
                background: canRoll ? "var(--gold-500)" : "var(--cactus-300)",
                transition: "width 400ms var(--ease-out)",
              }}
            />
          </div>
          <button
            type="button"
            className="btn btn-sm"
            disabled={!canRoll}
            onClick={() => setPrestigeOpen(true)}
            style={{ width: "100%" }}
          >
            {canRoll ? "Roll It Up →" : `${(server.lifetimePCEarned / 1000).toFixed(0)}k / ${(PRESTIGE_THRESHOLD_PC / 1000).toFixed(0)}k PC`}
          </button>
        </div>
      </div>

      <div
        className="row"
        style={{
          alignItems: "stretch",
          gap: "var(--sp-3)",
          flexWrap: "wrap",
        }}
      >
        {/* Play area */}
        <div
          ref={playRef}
          className="panel"
          style={{
            position: "relative",
            flex: "2 1 360px",
            minHeight: 420,
            background:
              "radial-gradient(ellipse at center, var(--saddle-200) 0%, var(--saddle-300) 100%)",
            overflow: "hidden",
            border: "3px solid var(--ink-900)",
            cursor: "crosshair",
          }}
        >
          {coins.map((c) => (
            <CoinSprite
              key={c.id}
              coin={c.coin}
              trait={c.trait}
              x={c.x}
              y={c.y}
              spawnedAt={c.spawnedAt}
              lifetimeMs={COIN_LIFETIME_MS}
              onClick={() => clickCoin(c)}
            />
          ))}
          {pops.map((p) => (
            <div
              key={p.id}
              aria-hidden
              style={{
                position: "absolute",
                left: p.x,
                top: p.y,
                transform: "translate(-50%, -50%)",
                fontFamily: "var(--font-display)",
                fontSize: p.shiny ? 22 : 16,
                color: p.shiny ? "var(--gold-300)" : "var(--gold-500)",
                textShadow: p.shiny
                  ? "0 0 6px rgba(255,220,90,0.95), 1px 1px 0 rgba(0,0,0,0.6)"
                  : "1px 1px 0 rgba(0,0,0,0.55)",
                pointerEvents: "none",
                animation: "pp-pop-rise 800ms ease-out forwards",
                whiteSpace: "nowrap",
                zIndex: 10,
              }}
            >
              +{p.pc.toLocaleString()}
            </div>
          ))}
          <style>{`
            @keyframes pp-pop-rise {
              0%   { transform: translate(-50%, -50%) scale(0.7); opacity: 0; }
              20%  { transform: translate(-50%, -60%) scale(1.15); opacity: 1; }
              100% { transform: translate(-50%, -160%) scale(1); opacity: 0; }
            }
          `}</style>
          {fountain && (
            <button
              type="button"
              onClick={() => setFountainModalOpen(true)}
              aria-label="Wishing fountain"
              style={{
                position: "absolute",
                left: fountain.x - 36,
                top: fountain.y - 36,
                width: 72,
                height: 72,
                padding: 0,
                background: "radial-gradient(circle at 50% 35%, #c8e0f5 0%, #6aa3d4 55%, #1f4f88 100%)",
                border: "3px solid #1a0f08",
                borderRadius: "50%",
                cursor: "pointer",
                color: "#fff",
                fontFamily: "var(--font-display)",
                fontSize: 28,
                lineHeight: 1,
                boxShadow: "0 0 0 3px rgba(120,200,255,0.55), 0 0 24px rgba(120,200,255,0.7), 2px 2px 0 rgba(0,0,0,0.4)",
                animation: "pp-coin-spawn 240ms var(--ease-out, ease-out), pp-fountain-bob 1.6s ease-in-out infinite",
              }}
            >
              <span aria-hidden>⛲</span>
              <style>{`
                @keyframes pp-fountain-bob {
                  0%, 100% { transform: translateY(0); }
                  50%      { transform: translateY(-3px); }
                }
              `}</style>
            </button>
          )}
          {couch && (
            <button
              type="button"
              onClick={() => setCouchModalOpen(true)}
              aria-label="Couch"
              style={{
                position: "absolute",
                left: couch.x - 48,
                top: couch.y - 28,
                width: 96,
                height: 56,
                padding: 0,
                background: "linear-gradient(180deg, #8b5a2b 0%, #6b3f24 60%, #3d2418 100%)",
                border: "3px solid #1a0f08",
                borderRadius: "10px 10px 6px 6px",
                cursor: "pointer",
                color: "var(--gold-300)",
                fontFamily: "var(--font-display)",
                fontSize: 14,
                lineHeight: 1,
                letterSpacing: "0.06em",
                textTransform: "uppercase",
                boxShadow: "0 0 0 3px rgba(212,165,116,0.45), 0 0 22px rgba(212,165,116,0.55), 2px 2px 0 rgba(0,0,0,0.4)",
                animation: "pp-coin-spawn 240ms var(--ease-out, ease-out)",
              }}
            >
              Dive!
            </button>
          )}
          {lostWallet && (
            <button
              type="button"
              onClick={() => setWalletModalChoice("open")}
              aria-label="Lost wallet"
              style={{
                position: "absolute",
                left: lostWallet.x - 36,
                top: lostWallet.y - 26,
                width: 72,
                height: 52,
                padding: 0,
                background: "transparent",
                border: "none",
                cursor: "pointer",
                animation: "pp-wallet-bob 1.4s ease-in-out infinite",
              }}
            >
              <svg
                viewBox="0 0 36 26"
                width={72}
                height={52}
                shapeRendering="crispEdges"
                style={{
                  display: "block",
                  filter: "drop-shadow(0 0 8px rgba(255,196,64,0.85)) drop-shadow(2px 2px 0 rgba(0,0,0,0.4))",
                }}
              >
                {/* Outer leather body */}
                <rect x="2"  y="6"  width="32" height="18" fill="#1a0f08" />
                <rect x="3"  y="7"  width="30" height="16" fill="#6b3f24" />
                <rect x="3"  y="7"  width="30" height="2"  fill="#8b5a2b" />
                <rect x="3"  y="21" width="30" height="2"  fill="#3d2418" />
                {/* Top flap fold */}
                <rect x="6"  y="2"  width="24" height="6"  fill="#1a0f08" />
                <rect x="7"  y="3"  width="22" height="4"  fill="#8b5a2b" />
                <rect x="7"  y="3"  width="22" height="1"  fill="#a87545" />
                {/* Cash poking out — gold + green peeks */}
                <rect x="10" y="10" width="16" height="3"  fill="#f5c842" />
                <rect x="10" y="10" width="16" height="1"  fill="#fff8c2" />
                <rect x="11" y="13" width="14" height="2"  fill="#3d8a4d" />
                {/* Center clasp */}
                <rect x="16" y="15" width="4"  height="4"  fill="#1a0f08" />
                <rect x="17" y="16" width="2"  height="2"  fill="#f5c842" />
              </svg>
              <style>{`
                @keyframes pp-wallet-bob {
                  0%, 100% { transform: translateY(0); }
                  50%      { transform: translateY(-3px); }
                }
              `}</style>
            </button>
          )}
        </div>

        {/* Sidebar */}
        <div
          className="panel"
          style={{
            padding: "var(--sp-3)",
            flex: "1 1 280px",
            minWidth: 280,
            display: "flex",
            flexDirection: "column",
            gap: "var(--sp-2)",
          }}
        >
          <div className="row" style={{ gap: 6, flexWrap: "wrap" }}>
            <button
              type="button"
              className={`btn btn-sm${tab === "upgrades" ? "" : " btn-ghost"}`}
              style={{ flex: 1, minWidth: 80 }}
              onClick={() => setTab("upgrades")}
            >
              Upgrades
            </button>
            <button
              type="button"
              className={`btn btn-sm${tab === "helpers" ? "" : " btn-ghost"}`}
              style={{ flex: 1, minWidth: 80 }}
              onClick={() => setTab("helpers")}
            >
              Helpers
            </button>
            <button
              type="button"
              className={`btn btn-sm${tab === "tokens" ? "" : " btn-ghost"}`}
              style={{ flex: 1, minWidth: 80 }}
              onClick={() => setTab("tokens")}
            >
              ★ Tokens
            </button>
            <button
              type="button"
              className={`btn btn-sm${tab === "achievements" ? "" : " btn-ghost"}`}
              style={{ flex: 1, minWidth: 80 }}
              onClick={() => setTab("achievements")}
            >
              Trophies
            </button>
            <button
              type="button"
              className={`btn btn-sm${tab === "album" ? "" : " btn-ghost"}`}
              style={{ flex: 1, minWidth: 80 }}
              onClick={() => setTab("album")}
            >
              Album
            </button>
          </div>
          {tab === "upgrades" ? (
            <UpgradeShop
              levels={upgrades}
              cents={localCents}
              onBuy={buyUpgrade}
            />
          ) : tab === "helpers" ? (
            <HelperRoster
              counts={server.helpers as Record<HelperId, number>}
              cents={localCents}
              onHire={hireHelper}
            />
          ) : tab === "tokens" ? (
            <BankTokenShop
              levels={server.perm}
              bankTokens={server.prestige.bankTokens}
              onBuy={buyPermUpgrade}
            />
          ) : tab === "achievements" ? (
            <AchievementsPanel
              unlocked={new Set(server.achievements.unlocked)}
            />
          ) : (
            <AlbumPanel album={server.album} />
          )}
        </div>
      </div>

      {/* Unlocked coin legend */}
      <div
        className="panel"
        style={{
          padding: "var(--sp-3)",
          display: "flex",
          flexWrap: "wrap",
          gap: "var(--sp-3)",
          alignItems: "center",
        }}
      >
        <span
          className="text-mute"
          style={{ fontSize: 11, letterSpacing: "0.06em", textTransform: "uppercase", marginRight: 4 }}
        >
          Unlocked coins
        </span>
        {COIN_ORDER.map((id) => {
          const isUnlocked = unlocked.includes(id);
          const def = COINS[id];
          const value = id === "penny" ? coinPCValue(id, upgrades) : def.basePC;
          return (
            <div
              key={id}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 6,
                opacity: isUnlocked ? 1 : 0.35,
                fontFamily: "var(--font-display)",
                fontSize: 12,
              }}
            >
              <span
                aria-hidden
                style={{
                  width: 18,
                  height: 18,
                  borderRadius: "50%",
                  background: def.color,
                  border: `2px solid ${def.edge}`,
                }}
              />
              {def.label} <span className="text-mute">·</span> <span style={{ color: "var(--gold-500)" }}>{value} PC</span>
            </div>
          );
        })}
      </div>

      {achievementToasts.length > 0 && (
        <div
          aria-live="polite"
          style={{
            position: "fixed",
            top: 80,
            right: 16,
            zIndex: 200,
            display: "flex",
            flexDirection: "column",
            gap: 8,
            pointerEvents: "none",
          }}
        >
          {achievementToasts.map((id) => {
            const def = ACHIEVEMENTS_BY_ID[id];
            if (!def) return null;
            return (
              <div
                key={id}
                style={{
                  background: "var(--gold-100)",
                  border: "3px solid var(--ink-900)",
                  padding: "8px 12px",
                  fontFamily: "var(--font-display)",
                  minWidth: 240,
                  boxShadow: "var(--sh-card-rest), var(--glow-gold)",
                  color: "var(--ink-900)",
                }}
              >
                <div style={{ fontSize: 10, letterSpacing: "0.06em", textTransform: "uppercase", color: "var(--saddle-400)" }}>
                  Achievement Unlocked{def.reward > 0 ? ` · +${def.reward} ★` : ""}
                </div>
                <div style={{ fontSize: 14, color: "var(--ink-900)" }}>
                  {def.label}
                </div>
                <div className="text-mute" style={{ fontSize: 11 }}>
                  {def.description}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {fountainModalOpen && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Wishing fountain"
          onClick={() => setFountainModalOpen(false)}
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 9_500,
            background: "rgba(26,15,8,0.7)",
            display: "grid",
            placeItems: "center",
            padding: 16,
            backdropFilter: "blur(2px)",
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="panel-wood"
            style={{
              width: "min(480px, 100%)",
              padding: "var(--sp-5)",
              border: "4px solid var(--ink-900)",
              boxShadow: "var(--sh-popover), var(--glow-gold)",
            }}
          >
            <div
              className="uppercase"
              style={{
                fontFamily: "var(--font-display)",
                fontSize: "var(--fs-h3)",
                color: "var(--gold-300)",
                letterSpacing: "var(--ls-loose)",
                textShadow: "2px 2px 0 var(--ink-900)",
                marginBottom: "var(--sp-3)",
                textAlign: "center",
              }}
            >
              Wishing Fountain
            </div>
            <p style={{ marginBottom: "var(--sp-3)", color: "var(--ink-900)" }}>
              Toss in some Pinch Cents — pick your blessing.
            </p>
            <div className="stack" style={{ gap: 8 }}>
              {Object.values(BLESSINGS).map((b) => {
                const affordable = localCents >= b.cost;
                return (
                  <button
                    key={b.id}
                    type="button"
                    disabled={!affordable}
                    onClick={() => buyBlessing(b.id)}
                    style={{
                      textAlign: "left",
                      background: affordable ? "var(--gold-100)" : "var(--parchment-200)",
                      border: `2px solid ${affordable ? "var(--gold-300)" : "var(--saddle-300)"}`,
                      padding: "10px 12px",
                      cursor: affordable ? "pointer" : "default",
                      color: "var(--ink-900)",
                    }}
                  >
                    <div className="row" style={{ justifyContent: "space-between", alignItems: "baseline" }}>
                      <span style={{ fontFamily: "var(--font-display)", fontSize: 13 }}>{b.label}</span>
                      <span style={{ fontFamily: "var(--font-display)", fontSize: 12, color: "var(--gold-500)" }}>
                        {b.cost.toLocaleString()} PC
                      </span>
                    </div>
                    <div className="text-mute" style={{ fontSize: 11 }}>{b.blurb}</div>
                  </button>
                );
              })}
            </div>
            <div className="row" style={{ gap: 8, justifyContent: "center", marginTop: "var(--sp-3)" }}>
              <button
                type="button"
                className="btn btn-ghost"
                onClick={() => setFountainModalOpen(false)}
              >
                Walk away
              </button>
            </div>
          </div>
        </div>
      )}

      {couchModalOpen && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Couch cushion dive"
          onClick={() => closeCouch()}
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 9_500,
            background: "rgba(26,15,8,0.7)",
            display: "grid",
            placeItems: "center",
            padding: 16,
            backdropFilter: "blur(2px)",
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="panel-wood"
            style={{
              width: "min(440px, 100%)",
              padding: "var(--sp-5)",
              border: "4px solid var(--ink-900)",
              boxShadow: "var(--sh-popover), var(--glow-gold)",
            }}
          >
            <div
              className="uppercase"
              style={{
                fontFamily: "var(--font-display)",
                fontSize: "var(--fs-h3)",
                color: "var(--gold-300)",
                letterSpacing: "var(--ls-loose)",
                textShadow: "2px 2px 0 var(--ink-900)",
                marginBottom: "var(--sp-2)",
                textAlign: "center",
              }}
            >
              Couch Cushion Dive
            </div>
            <p className="text-mute" style={{ fontSize: 12, textAlign: "center", marginBottom: "var(--sp-3)" }}>
              Flip {COUCH_CUSHIONS} cushions — keep what you find.
            </p>
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "1fr 1fr",
                gap: 12,
                marginBottom: "var(--sp-3)",
              }}
            >
              {Array.from({ length: COUCH_CUSHIONS }).map((_, idx) => {
                const reveal = cushionReveals.find((r) => r.idx === idx);
                const flipped = !!reveal;
                return (
                  <button
                    key={idx}
                    type="button"
                    onClick={() => flipCushion(idx)}
                    disabled={flipped}
                    style={{
                      aspectRatio: "1.6 / 1",
                      background: flipped
                        ? reveal!.pcGain === 0
                          ? "var(--saddle-200)"
                          : "var(--gold-100)"
                        : "linear-gradient(180deg, #b07a4a 0%, #6b3f24 100%)",
                      border: `3px solid ${flipped ? "var(--gold-300)" : "#1a0f08"}`,
                      borderRadius: 8,
                      color: "var(--ink-900)",
                      fontFamily: "var(--font-display)",
                      cursor: flipped ? "default" : "pointer",
                      padding: 8,
                      textAlign: "center",
                    }}
                  >
                    {flipped ? (
                      <div>
                        <div style={{ fontSize: 13, marginBottom: 2 }}>{reveal!.label}</div>
                        {reveal!.pcGain > 0 ? (
                          <div style={{ fontSize: 12, color: "var(--gold-500)" }}>+{reveal!.pcGain} PC</div>
                        ) : (
                          <div style={{ fontSize: 11, color: "var(--saddle-400)" }}>nothing</div>
                        )}
                      </div>
                    ) : (
                      <div style={{ fontSize: 22, color: "var(--gold-300)" }}>?</div>
                    )}
                  </button>
                );
              })}
            </div>
            <div className="row" style={{ gap: 8, justifyContent: "center" }}>
              <button type="button" className="btn btn-ghost" onClick={closeCouch}>
                {cushionReveals.length >= COUCH_CUSHIONS ? "Done" : "Walk away"}
              </button>
            </div>
          </div>
        </div>
      )}

      {walletModalChoice != null && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Lost wallet"
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 9_500,
            background: "rgba(26,15,8,0.7)",
            display: "grid",
            placeItems: "center",
            padding: 16,
            backdropFilter: "blur(2px)",
          }}
        >
          <div
            className="panel-wood"
            style={{
              width: "min(440px, 100%)",
              padding: "var(--sp-5)",
              border: "4px solid var(--ink-900)",
              boxShadow: "var(--sh-popover), var(--glow-gold)",
            }}
          >
            <div
              className="uppercase"
              style={{
                fontFamily: "var(--font-display)",
                fontSize: "var(--fs-h3)",
                color: "var(--gold-300)",
                letterSpacing: "var(--ls-loose)",
                textShadow: "2px 2px 0 var(--ink-900)",
                marginBottom: "var(--sp-3)",
                textAlign: "center",
              }}
            >
              You Found a Wallet
            </div>
            <p style={{ color: "var(--ink-900)", marginBottom: "var(--sp-2)" }}>
              Lost on the sidewalk, fat with cash. There&rsquo;s an ID inside —
              someone&rsquo;s missing this.
            </p>
            <p className="text-mute" style={{ fontSize: 12, marginBottom: "var(--sp-4)" }}>
              Returning it raises Frugality (unlocks future perks). Keeping the
              change pays {LOST_WALLET_KEEP_PC} PC right now but takes a Frugality
              point with it.
            </p>
            <div className="row" style={{ gap: 8, justifyContent: "center" }}>
              <button
                type="button"
                className="btn btn-primary"
                disabled={walletModalChoice === "submitting"}
                onClick={() => resolveLostWallet("return")}
              >
                Return It
              </button>
              <button
                type="button"
                className="btn btn-ghost"
                disabled={walletModalChoice === "submitting"}
                onClick={() => resolveLostWallet("keep")}
              >
                Keep the Change · +{LOST_WALLET_KEEP_PC} PC
              </button>
            </div>
          </div>
        </div>
      )}

      {prestigeOpen && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Roll It Up"
          onClick={() => setPrestigeOpen(false)}
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 9_500,
            background: "rgba(26,15,8,0.7)",
            display: "grid",
            placeItems: "center",
            padding: 16,
            backdropFilter: "blur(2px)",
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="panel-wood"
            style={{
              width: "min(480px, 100%)",
              padding: "var(--sp-5)",
              border: "4px solid var(--ink-900)",
              boxShadow: "var(--sh-popover), var(--glow-gold)",
            }}
          >
            <div
              className="uppercase"
              style={{
                fontFamily: "var(--font-display)",
                fontSize: "var(--fs-h3)",
                color: "var(--gold-300)",
                letterSpacing: "var(--ls-loose)",
                textShadow: "2px 2px 0 var(--ink-900)",
                marginBottom: "var(--sp-3)",
                textAlign: "center",
              }}
            >
              Roll It Up?
            </div>
            <p style={{ marginBottom: "var(--sp-3)", color: "var(--ink-900)" }}>
              Cash in your career and start fresh. You&rsquo;ll lose:
            </p>
            <ul style={{ margin: "0 0 var(--sp-3) 16px", color: "var(--ink-900)" }}>
              <li>{Math.floor(localCents).toLocaleString()} unbanked Pinch Cents</li>
              <li>Every run upgrade you&rsquo;ve bought this cycle</li>
              <li>Every helper you&rsquo;ve hired this cycle</li>
            </ul>
            <p style={{ marginBottom: "var(--sp-3)", color: "var(--ink-900)" }}>
              You&rsquo;ll keep:
            </p>
            <ul style={{ margin: "0 0 var(--sp-3) 16px", color: "var(--ink-900)" }}>
              <li>Wallet balance + lifetime banked</li>
              <li>Every Permanent upgrade in the Tokens shop</li>
              <li>
                <b>+{server.prestige.tokensIfRolled.toLocaleString()} ★ Bank Tokens</b> to spend on Permanents
              </li>
            </ul>
            <div className="row" style={{ gap: 8, justifyContent: "center" }}>
              <button
                type="button"
                className="btn btn-ghost"
                onClick={() => setPrestigeOpen(false)}
              >
                Not yet
              </button>
              <button
                type="button"
                className="btn btn-primary"
                onClick={rollItUp}
              >
                Roll It Up
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function formatHMS(ms: number): string {
  const total = Math.ceil(ms / 1000);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  if (h > 0) return `${h}h ${m}m`;
  if (m > 0) return `${m}m ${String(s).padStart(2, "0")}s`;
  return `${s}s`;
}
