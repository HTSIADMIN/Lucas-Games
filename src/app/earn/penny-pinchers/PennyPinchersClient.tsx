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
  LOST_WALLET_KEEP_MAX_PC,
  LOST_WALLET_KEEP_PC,
  LOST_WALLET_KEEP_WEALTH_PCT,
  LOST_WALLET_LIFETIME_MS,
  MERGE_MIN_AGE_MS,
  PRESTIGE_THRESHOLD_PC,
  AUTO_PICKER_PER_SEC,
  BENT_LUCKY_MS,
  BENT_LUCKY_SHINY_BOOST,
  BLESSINGS,
  COUCH_CHANCE_PER_POLL,
  COUCH_CUSHIONS,
  COUCH_LIFETIME_MS,
  CURSED_PAUSE_MS,
  FOUNTAIN_CHANCE_PER_POLL,
  FOUNTAIN_LIFETIME_MS,
  FRENZY_BURST_SIZE,
  FRENZY_DURATION_MS,
  FRENZY_SPAWN_MULTIPLIER,
  FRENZY_THRESHOLD,
  STREAK_TIERS,
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
  findMergePair,
  pruneStreakWindow,
  streakTierFor,
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
import { FaqModal } from "./FaqModal";
import { RelicShop } from "./RelicShop";
import { PennyLeaderboard } from "./PennyLeaderboard";
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
  relics: Record<string, number>;
  relicEffects: {
    shinyChanceBonus: number;
    helperRateMul: number;
    clickPCMul: number;
    spawnSpeedMul: number;
    prestigeStartBonusPC: number;
    bankPayoutMul: number;
    stormChanceBonus: number;
    ancientChanceBonus: number;
    coinBaseBonus: number;
  };
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
  /** Original spawn denomination — drives the sprite's base colour. */
  coin: CoinId;
  /** Combined PC value of this coin (post any merges). */
  mergedPC: number;
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
  const [tab, setTab] = useState<"upgrades" | "helpers" | "tokens" | "achievements" | "album" | "relics">("upgrades");
  const [welcomeBack, setWelcomeBack] = useState<number | null>(null);
  const [prestigeOpen, setPrestigeOpen] = useState(false);
  const [faqOpen, setFaqOpen] = useState(false);
  /** When set, shows the celebratory full-screen flash for ~2.5s after a Roll-Up succeeds. */
  const [prestigeCelebration, setPrestigeCelebration] = useState<number | null>(null);
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
  const streakClicksRef = useRef<number[]>([]);
  const [streakCount, setStreakCount] = useState(0);
  const [frenzyEndsAt, setFrenzyEndsAt] = useState<number | null>(null);
  /** Bent's lucky-window timer — boosts shiny chance for BENT_LUCKY_MS. */
  const [bentLuckyUntil, setBentLuckyUntil] = useState<number | null>(null);
  /** Cursed's spawn-pause timer — pauses spawns for CURSED_PAUSE_MS. */
  const [cursedPauseUntil, setCursedPauseUntil] = useState<number | null>(null);
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
        // Rainmaker relic adds a flat per-poll chance for ANY
        // event to start (it's tagged as Coin Storm in the
        // selection logic below — that's the relic's flavour).
        const stormBonus = d.relicEffects.stormChanceBonus ?? 0;
        if (Math.random() < EVENT_START_CHANCE_PER_POLL + stormBonus) {
          const ids = Object.keys(EVENTS) as EventId[];
          // Bias toward Coin Storm proportional to the bonus so a
          // maxed-Rainmaker player actually sees more storms,
          // not just more Rainy Days.
          const id: EventId =
            stormBonus > 0 && Math.random() < 0.5 + stormBonus * 5
              ? "coin_storm"
              : ids[Math.floor(Math.random() * ids.length)];
          const def = EVENTS[id];
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
  const frenzyActive = frenzyEndsAt != null && frenzyEndsAt > Date.now();
  const bentLucky = bentLuckyUntil != null && bentLuckyUntil > Date.now();
  const cursedPause = cursedPauseUntil != null && cursedPauseUntil > Date.now();
  const eventInterval = eventDef ? baseIntervalMs * eventDef.spawnMultiplier : baseIntervalMs;
  const intervalMs = Math.max(
    100,
    Math.round(
      eventInterval *
        (hasSharpEyes ? 0.5 : 1) *
        (frenzyActive ? FRENZY_SPAWN_MULTIPLIER : 1) *
        (server?.relicEffects.spawnSpeedMul ?? 1),
    ),
  );
  const burstSize =
    ((eventDef?.extraConcurrent ?? 0) > 0 ? 1 + eventDef!.extraConcurrent : 1) +
    (frenzyActive ? FRENZY_BURST_SIZE : 0);
  const bonusShiny =
    (eventDef?.bonusShinyChance ?? 0) +
    (hasLucky ? 0.1 : 0) +
    (bentLucky ? BENT_LUCKY_SHINY_BOOST : 0);
  useEffect(() => {
    if (!server) return;
    const t = window.setInterval(() => {
      // Cursed coin pause — skip spawn ticks entirely. The play
      // area sits silent for 5s after collecting one.
      if (cursedPauseUntil != null && cursedPauseUntil > Date.now()) return;
      const playEl = playRef.current;
      if (!playEl) return;
      const rect = playEl.getBoundingClientRect();
      const pad = 40;
      const newSpawns: SpawnedCoin[] = [];
      // Coin Storm spawns a small burst per tick instead of one
      // coin — feels much rainier without halving the interval to
      // sub-100ms territory.
      const count = burstSize;
      // Extra Hands: each base spawn has a level*5% chance to
      // also drop a bonus coin alongside it. We model that as
      // an extra iteration of the regular spawn for-loop so the
      // bonus coin also benefits from Greedy Spawns / shiny rolls.
      const extraHandsLevel = upgrades.extra_hands ?? 0;
      const baseCount = count;
      let total = baseCount;
      for (let k = 0; k < baseCount; k++) {
        if (Math.random() < Math.min(0.5, 0.05 * extraHandsLevel)) total++;
      }
      for (let i = 0; i < total; i++) {
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
        const mergedPC = coinPCValue(coin, upgrades, server.perm, server.relicEffects);
        newSpawns.push({ id: coinSeqRef.current, coin, mergedPC, trait, x, y, spawnedAt: Date.now() });
      }
      setCoins((prev) => [...prev, ...newSpawns]);
    }, intervalMs);
    return () => window.clearInterval(t);
  }, [server, intervalMs, upgrades, burstSize, bonusShiny, hasGreedy, cursedPauseUntil]);

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
  // Any two coins within MERGE_PROXIMITY_PX fuse into a single
  // coin whose PC value is the sum of both inputs. The fused coin
  // gets a fresh spawnedAt so chains can keep growing — watch a
  // 1¢ + 1¢ become 2¢, then meet a fresh 1¢ to become 3¢, etc.
  // One pair per tick reads as a chain reaction.
  useEffect(() => {
    if (!server) return;
    if ((upgrades.pile_it_up ?? 0) < 1) return;
    const t = window.setInterval(() => {
      setCoins((prev) => {
        const eligibleCutoff = Date.now() - MERGE_MIN_AGE_MS;
        const eligible = prev
          .filter((c) => c.spawnedAt <= eligibleCutoff)
          .map((c) => ({ id: c.id, pc: c.mergedPC, x: c.x, y: c.y, spawnedAt: c.spawnedAt }));
        const pair = findMergePair(eligible);
        if (!pair) return prev;
        const [aId, bId] = pair.ids;
        const a = prev.find((c) => c.id === aId);
        const b = prev.find((c) => c.id === bId);
        if (!a || !b) return prev;
        coinSeqRef.current += 1;
        // Pick whichever input had the bigger denom — keeps the
        // sprite size scaling in step with PC growth. Trait is
        // preserved if either input had one (shiny wins).
        const baseCoin = a.mergedPC >= b.mergedPC ? a.coin : b.coin;
        const trait = a.trait === "shiny" || b.trait === "shiny" ? "shiny"
          : a.trait ?? b.trait;
        const fresh: SpawnedCoin = {
          id: coinSeqRef.current,
          coin: baseCoin,
          mergedPC: pair.pc,
          trait,
          x: pair.centroid.x,
          y: pair.centroid.y,
          spawnedAt: Date.now(),
        };
        return [...prev.filter((c) => c.id !== aId && c.id !== bId), fresh];
      });
    }, 350);
    return () => window.clearInterval(t);
  }, [server, upgrades.pile_it_up]);

  // Streak-window pruner — trims expired clicks + clears
  // expired client-side timers (Frenzy, Bent's lucky window,
  // Cursed's spawn pause). Drives meters shrinking even when
  // the player isn't clicking.
  useEffect(() => {
    const t = window.setInterval(() => {
      const nowMs = Date.now();
      streakClicksRef.current = pruneStreakWindow(streakClicksRef.current, nowMs);
      setStreakCount(streakClicksRef.current.length);
      setFrenzyEndsAt((cur) => (cur != null && cur < nowMs ? null : cur));
      setBentLuckyUntil((cur) => (cur != null && cur < nowMs ? null : cur));
      setCursedPauseUntil((cur) => (cur != null && cur < nowMs ? null : cur));
    }, 250);
    return () => window.clearInterval(t);
  }, []);

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

    // Pinch Streak tracking — record the click + recompute the
    // active tier. Frenzy ignites once we cross the top threshold.
    const nowClick = Date.now();
    const window = pruneStreakWindow([...streakClicksRef.current, nowClick], nowClick);
    streakClicksRef.current = window;
    setStreakCount(window.length);
    const tier = streakTierFor(window, nowClick);
    if (tier.threshold >= FRENZY_THRESHOLD && (frenzyEndsAt == null || frenzyEndsAt < nowClick)) {
      Sfx.play("coins.shower");
      setFrenzyEndsAt(nowClick + FRENZY_DURATION_MS);
    }

    // Rare-coin pickups all share one understated chime — the
    // halo / sparkle / colour animations carry the standout
    // weight, sound just punctuates. Bent's lucky window and
    // Cursed's spawn pause still fire on click.
    if (
      coin.trait === "bent"   || coin.trait === "cursed" ||
      coin.trait === "ancient" || coin.trait === "foreign" ||
      coin.trait === "shiny"
    ) {
      Sfx.play("win.notify");
    }
    if (coin.trait === "bent") setBentLuckyUntil(Date.now() + BENT_LUCKY_MS);
    if (coin.trait === "cursed") setCursedPauseUntil(Date.now() + CURSED_PAUSE_MS);

    const traitMul =
      coin.trait === "shiny" ? 5
      : coin.trait === "ancient" ? 50
      : coin.trait === "cursed" ? 3
      : coin.trait === "bent" ? 0.5
      : 1;
    // Mirror the server's click-side multiplier stack so the
    // optimistic counter doesn't undercount what the server is
    // about to credit.
    const clickMul = server?.relicEffects.clickPCMul ?? 1;
    const optimisticPC = Math.round(coin.mergedPC * traitMul * tier.multiplier * clickMul);
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

    // We send the *streak-multiplied merged PC* as the `pc` field;
    // server clamps to MAX_CLICK_PC and stacks trait + frugality
    // on top so a tampered client can't cheese the cap.
    //
    // Important: we do NOT snap localCents to the server response
    // on click. The local helper-tick interval is moving forward
    // every 100ms, so snapping would visibly bounce the counter
    // backwards (helpers had already credited PC the server hadn't
    // seen yet). The /state poll reconciles drift on its own
    // schedule, with the >5% threshold guard in loadState().
    const sentPC = Math.round(coin.mergedPC * tier.multiplier);
    void fetch("/api/earn/penny-pinchers/click", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ coinType: coin.coin, trait: coin.trait, pc: sentPC }),
    }).catch(() => { /* ignore — sync poll reconciles */ });

    // Fire-and-forget the collateral pickups so each one is
    // metered + counted toward lifetime_clicks.
    for (const extra of collateral) {
      const extraOptimistic = Math.round(extra.mergedPC * (extra.trait === "shiny" ? 5 : 1) * tier.multiplier * clickMul);
      setLocalCents((c) => c + extraOptimistic);
      spawnPop(extra.x, extra.y, extraOptimistic, extra.trait === "shiny");
      void fetch("/api/earn/penny-pinchers/click", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          coinType: extra.coin,
          trait: extra.trait,
          pc: Math.round(extra.mergedPC * tier.multiplier),
        }),
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
      setLocalCents((c) => c + Math.min(
        LOST_WALLET_KEEP_MAX_PC,
        LOST_WALLET_KEEP_PC + Math.floor(c * LOST_WALLET_KEEP_WEALTH_PCT),
      ));
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
        const d = (await r.json()) as { awarded?: number };
        setPrestigeOpen(false);
        // Wipe local coin state too — fresh play area, fresh PC.
        setCoins([]);
        // Celebration flash + coin-shower sfx so a Roll-Up feels
        // like the milestone it is. Auto-dismisses after 2.5s.
        Sfx.play("coins.shower");
        setPrestigeCelebration(d.awarded ?? 0);
        window.setTimeout(() => setPrestigeCelebration(null), 2500);
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

      {frenzyEndsAt != null && frenzyEndsAt > now && (
        <div
          style={{
            background: "linear-gradient(90deg, var(--gold-300), var(--gold-500), var(--gold-300))",
            backgroundSize: "200% 100%",
            border: "3px solid var(--ink-900)",
            padding: "var(--sp-2) var(--sp-3)",
            fontFamily: "var(--font-display)",
            fontSize: 14,
            color: "var(--ink-900)",
            textAlign: "center",
            letterSpacing: "0.08em",
            textTransform: "uppercase",
            textShadow: "1px 1px 0 var(--gold-100)",
            animation: "pp-frenzy-shine 1.4s linear infinite, game-event-pulse 1.4s ease-in-out infinite",
          }}
        >
          ★ Money Frenzy! · 2× clicks · {Math.max(0, Math.ceil((frenzyEndsAt - now) / 1000))}s
          <style>{`
            @keyframes pp-frenzy-shine {
              0%   { background-position: 0% 50%; }
              100% { background-position: 200% 50%; }
            }
          `}</style>
        </div>
      )}

      {activeBlessings.length > 0 && (
        <div
          className="row"
          style={{
            gap: 8,
            flexWrap: "wrap",
            padding: "var(--sp-2)",
            background: "var(--parchment-100)",
            border: "2px solid var(--saddle-300)",
          }}
        >
          {activeBlessings.map((b) => {
            const def = BLESSINGS[b.id];
            const left = Math.max(0, Math.ceil((b.endsAt - now) / 1000));
            return (
              <span
                key={b.id}
                style={{
                  fontFamily: "var(--font-display)",
                  fontSize: 11,
                  letterSpacing: "0.05em",
                  textTransform: "uppercase",
                  background: "var(--gold-100)",
                  border: "2px solid var(--gold-300)",
                  padding: "2px 8px",
                  color: "var(--ink-900)",
                }}
              >
                ✦ {def.label} · {left}s
              </span>
            );
          })}
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
          <div className="row" style={{ justifyContent: "space-between", alignItems: "baseline" }}>
            <div className="text-mute" style={{ fontSize: 11, letterSpacing: "0.06em", textTransform: "uppercase" }}>
              Pinch Cents
            </div>
            <button
              type="button"
              onClick={() => setFaqOpen(true)}
              aria-label="How to play"
              title="How to play"
              style={{
                width: 22,
                height: 22,
                padding: 0,
                background: "var(--saddle-200)",
                border: "2px solid var(--ink-900)",
                borderRadius: "50%",
                fontFamily: "var(--font-display)",
                fontSize: 12,
                color: "var(--ink-900)",
                cursor: "pointer",
                lineHeight: "18px",
              }}
            >
              ?
            </button>
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
          {streakCount > 0 && (() => {
            const tier = streakTierFor(streakClicksRef.current, now);
            const nextTier = STREAK_TIERS.find((t) => t.threshold > tier.threshold);
            const max = nextTier ? nextTier.threshold : tier.threshold;
            const pct = nextTier ? Math.min(100, (streakCount / max) * 100) : 100;
            const isFrenzy = frenzyEndsAt != null && frenzyEndsAt > now;
            return (
              <div
                style={{
                  marginTop: 6,
                  padding: "4px 6px",
                  border: `2px solid ${isFrenzy ? "var(--gold-300)" : "var(--saddle-300)"}`,
                  background: isFrenzy ? "var(--gold-100)" : "var(--parchment-200)",
                  fontFamily: "var(--font-display)",
                  fontSize: 10,
                  color: "var(--ink-900)",
                  letterSpacing: "0.05em",
                  textTransform: "uppercase",
                }}
              >
                <div className="row" style={{ justifyContent: "space-between" }}>
                  <span>Pinch Streak · {tier.label}</span>
                  <span style={{ color: "var(--gold-500)" }}>{tier.multiplier}×</span>
                </div>
                <div
                  style={{
                    height: 4,
                    marginTop: 3,
                    background: "var(--saddle-200)",
                    border: "1px solid var(--ink-900)",
                  }}
                >
                  <div
                    style={{
                      width: `${pct}%`,
                      height: "100%",
                      background: isFrenzy ? "var(--gold-500)" : "var(--cactus-300)",
                      transition: "width 200ms linear",
                    }}
                  />
                </div>
              </div>
            );
          })()}
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
        {/* Play area — sidewalk concrete texture: a faint diagonal
            tile-crack grid + speckled aggregate dots, layered over
            a gentle warm gradient so coins still pop against it. */}
        <div
          ref={playRef}
          className="panel"
          style={{
            position: "relative",
            flex: "2 1 360px",
            minHeight: 420,
            backgroundColor: "var(--saddle-200)",
            backgroundImage: `
              radial-gradient(ellipse at center, transparent 0%, rgba(0,0,0,0.18) 100%),
              repeating-linear-gradient(135deg,
                transparent 0,
                transparent 56px,
                rgba(0,0,0,0.06) 56px,
                rgba(0,0,0,0.06) 60px),
              repeating-linear-gradient(45deg,
                transparent 0,
                transparent 56px,
                rgba(0,0,0,0.06) 56px,
                rgba(0,0,0,0.06) 60px),
              radial-gradient(circle at 25% 25%, rgba(0,0,0,0.08) 1px, transparent 2px),
              radial-gradient(circle at 75% 60%, rgba(0,0,0,0.06) 1px, transparent 2px),
              radial-gradient(circle at 40% 80%, rgba(255,255,255,0.05) 1px, transparent 2px)
            `,
            backgroundSize: "100% 100%, 60px 60px, 60px 60px, 8px 8px, 12px 12px, 10px 10px",
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
              pc={c.mergedPC}
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
            <button
              type="button"
              className={`btn btn-sm${tab === "relics" ? "" : " btn-ghost"}`}
              style={{ flex: 1, minWidth: 80 }}
              onClick={() => setTab("relics")}
            >
              Relics
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
          ) : tab === "album" ? (
            <AlbumPanel album={server.album} />
          ) : (
            <RelicShop
              frugality={server.frugality}
              relics={server.relics}
              onPurchased={() => void loadState()}
            />
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

      <PennyLeaderboard />

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

      {faqOpen && <FaqModal onClose={() => setFaqOpen(false)} />}

      {prestigeCelebration != null && (
        <div
          aria-hidden
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 9_800,
            pointerEvents: "none",
            background:
              "radial-gradient(circle at 50% 40%, rgba(255,200,60,0.45) 0%, rgba(255,200,60,0) 60%)",
            animation: "pp-prestige-celebrate 2.5s ease-out forwards",
            display: "grid",
            placeItems: "center",
          }}
        >
          <div
            style={{
              fontFamily: "var(--font-display)",
              fontSize: "var(--fs-h1, 36px)",
              color: "var(--gold-300)",
              letterSpacing: "0.08em",
              textTransform: "uppercase",
              textShadow: "3px 3px 0 var(--ink-900), 0 0 22px rgba(255,200,60,0.85)",
              animation: "pp-prestige-pop 800ms cubic-bezier(.2,1,.25,1)",
            }}
          >
            ★ +{prestigeCelebration.toLocaleString()} Tokens ★
          </div>
          {/* 24 coin sprites raining down */}
          {Array.from({ length: 24 }).map((_, i) => {
            const left = (i * 4.16) % 100;
            const delay = (i * 0.07) % 1.4;
            return (
              <span
                key={i}
                style={{
                  position: "absolute",
                  top: -32,
                  left: `${left}%`,
                  width: 22,
                  height: 22,
                  borderRadius: "50%",
                  background: "radial-gradient(circle at 35% 30%, #fff8c2, var(--gold-300) 60%, var(--gold-500) 100%)",
                  border: "2px solid var(--gold-500)",
                  boxShadow: "0 0 8px rgba(255,196,64,0.8)",
                  animation: `pp-prestige-coin 1.8s ${delay}s ease-in forwards`,
                }}
              />
            );
          })}
          <style>{`
            @keyframes pp-prestige-celebrate {
              0%   { opacity: 0;   transform: scale(0.95); }
              10%  { opacity: 1;   transform: scale(1); }
              80%  { opacity: 1; }
              100% { opacity: 0; }
            }
            @keyframes pp-prestige-pop {
              0%   { transform: scale(0.6) rotate(-6deg); opacity: 0; }
              60%  { transform: scale(1.15) rotate(2deg); opacity: 1; }
              100% { transform: scale(1) rotate(0); opacity: 1; }
            }
            @keyframes pp-prestige-coin {
              0%   { transform: translateY(0) rotate(0deg); opacity: 1; }
              100% { transform: translateY(110vh) rotate(720deg); opacity: 0.4; }
            }
          `}</style>
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
              change pays {Math.min(LOST_WALLET_KEEP_MAX_PC, LOST_WALLET_KEEP_PC + Math.floor(localCents * LOST_WALLET_KEEP_WEALTH_PCT)).toLocaleString()} PC right now (15% of your stack on top of a 500 PC floor) but takes a Frugality
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
                Keep the Change · +{Math.min(LOST_WALLET_KEEP_MAX_PC, LOST_WALLET_KEEP_PC + Math.floor(localCents * LOST_WALLET_KEEP_WEALTH_PCT)).toLocaleString()} PC
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
