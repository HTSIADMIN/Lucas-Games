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
  STICKY_PICKUP_COUNT,
  STICKY_PICKUP_RADIUS,
  TRAITS,
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
  walletBalance: number;
};

type ActiveEvent = { id: EventId; endsAt: number };
type LostWallet = { id: number; x: number; y: number; spawnedAt: number };
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
  const [tab, setTab] = useState<"upgrades" | "helpers" | "tokens" | "achievements">("upgrades");
  const [welcomeBack, setWelcomeBack] = useState<number | null>(null);
  const [prestigeOpen, setPrestigeOpen] = useState(false);
  const [achievementToasts, setAchievementToasts] = useState<AchievementId[]>([]);
  const [activeEvent, setActiveEvent] = useState<ActiveEvent | null>(null);
  const [lostWallet, setLostWallet] = useState<LostWallet | null>(null);
  const [walletModalChoice, setWalletModalChoice] = useState<null | "open" | "submitting">(null);
  const [pops, setPops] = useState<FloatPop[]>([]);
  const popSeqRef = useRef(0);
  const lostWalletSeqRef = useRef(0);

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
          Sfx.play("ui.confirm");
          return { id, endsAt: nowMs + def.durationMs };
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
  // glints with shinies.
  const upgrades = (server?.upgrades ?? {}) as Record<UpgradeId, number>;
  const baseIntervalMs = useMemo(() => spawnIntervalMs(upgrades), [upgrades]);
  const eventDef = activeEvent ? EVENTS[activeEvent.id] : null;
  const intervalMs = eventDef ? Math.max(120, Math.round(baseIntervalMs * eventDef.spawnMultiplier)) : baseIntervalMs;
  const burstSize = (eventDef?.extraConcurrent ?? 0) > 0 ? 1 + eventDef!.extraConcurrent : 1;
  const bonusShiny = eventDef?.bonusShinyChance ?? 0;
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
        const coin = rollSpawn(upgrades);
        let trait = rollTrait(coin, upgrades);
        // Rainy Day's bonus shiny — secondary roll only when the
        // base trait roll didn't already land something.
        if (!trait && bonusShiny > 0 && Math.random() < bonusShiny) trait = "shiny";
        coinSeqRef.current += 1;
        newSpawns.push({ id: coinSeqRef.current, coin, trait, x, y, spawnedAt: Date.now() });
      }
      setCoins((prev) => [...prev, ...newSpawns]);
    }, intervalMs);
    return () => window.clearInterval(t);
  }, [server, intervalMs, upgrades, burstSize, bonusShiny]);

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

  async function clickCoin(coin: SpawnedCoin) {
    // Slots reel-stop tick — chunky wood click that reads as
    // "the coin landed" without the long melodic tail of coin.drop.
    Sfx.play("ui.wood");
    const traitMul = coin.trait === "shiny" ? 5 : 1;
    const optimisticPC = coinPCValue(coin.coin, upgrades) * traitMul;
    setLocalCents((c) => c + optimisticPC);
    spawnPop(coin.x, coin.y, optimisticPC, coin.trait === "shiny");

    // Sticky-click side effect: also pick up the N nearest coins
    // within radius. Each becomes its own server click so the rate
    // limiter still gates real abuse.
    const collateral: SpawnedCoin[] = [];
    if (coin.trait === "sticky") {
      setCoins((prev) => {
        const others = prev.filter((c) => c.id !== coin.id);
        const nearby = others
          .map((c) => ({ c, d2: (c.x - coin.x) ** 2 + (c.y - coin.y) ** 2 }))
          .filter((e) => e.d2 <= STICKY_PICKUP_RADIUS * STICKY_PICKUP_RADIUS)
          .sort((a, b) => a.d2 - b.d2)
          .slice(0, STICKY_PICKUP_COUNT)
          .map((e) => e.c);
        collateral.push(...nearby);
        const removeIds = new Set([coin.id, ...nearby.map((c) => c.id)]);
        return prev.filter((c) => !removeIds.has(c.id));
      });
    } else {
      setCoins((prev) => prev.filter((c) => c.id !== coin.id));
    }

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

    // Fire-and-forget the sticky collateral pickups so each one is
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
            background: bankReady ? "var(--gold-100)" : undefined,
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
          {lostWallet && (
            <button
              type="button"
              onClick={() => setWalletModalChoice("open")}
              aria-label="Lost wallet"
              style={{
                position: "absolute",
                left: lostWallet.x - 32,
                top: lostWallet.y - 24,
                width: 64,
                height: 48,
                padding: 0,
                background: "linear-gradient(180deg, #6b3f24 0%, #4a2818 70%, #1a0f08 100%)",
                border: "3px solid #1a0f08",
                borderRadius: 4,
                cursor: "pointer",
                color: "var(--gold-300)",
                fontFamily: "var(--font-display)",
                fontSize: 18,
                lineHeight: 1,
                boxShadow: "0 0 0 3px rgba(255,196,64,0.45), 0 0 22px rgba(255,196,64,0.6), 2px 2px 0 rgba(0,0,0,0.4)",
                animation: "pp-wallet-bob 1.4s ease-in-out infinite",
              }}
            >
              <span aria-hidden style={{ fontFamily: "var(--font-display)", fontSize: 22 }}>⛛</span>
              <style>{`
                @keyframes pp-wallet-bob {
                  0%, 100% { transform: translateY(0); }
                  50%      { transform: translateY(-2px); }
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
          ) : (
            <AchievementsPanel
              unlocked={new Set(server.achievements.unlocked)}
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
