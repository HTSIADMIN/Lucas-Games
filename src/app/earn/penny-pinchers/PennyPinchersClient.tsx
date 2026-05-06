"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useVisibleInterval } from "@/lib/hooks/useVisibleInterval";
import * as Sfx from "@/lib/sfx";
import {
  COINS,
  COIN_ORDER,
  MERGE_MIN_AGE_MS,
  MERGE_RULES,
  STICKY_PICKUP_COUNT,
  STICKY_PICKUP_RADIUS,
  type CoinId,
  type CoinTrait,
  type HelperId,
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
  helperRatePerSec: number;
  offlineAccruedJustNow: number;
  bank: {
    pcPerWalletCent: number;
    cooldownMs: number;
    readyAt: number;
    maxPerBank: number;
    dailyCap: number;
    dailyBanked: number;
  };
  walletBalance: number;
};

type SpawnedCoin = {
  id: number;
  coin: CoinId;
  trait: CoinTrait | null;
  x: number;
  y: number;
  spawnedAt: number;
};

const COIN_LIFETIME_MS = 5500;
const SYNC_POLL_MS = 6000;

export function PennyPinchersClient() {
  const [server, setServer] = useState<StateResponse | null>(null);
  const [localCents, setLocalCents] = useState<number>(0);
  const [coins, setCoins] = useState<SpawnedCoin[]>([]);
  const [tab, setTab] = useState<"upgrades" | "helpers">("upgrades");
  const [welcomeBack, setWelcomeBack] = useState<number | null>(null);

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
      if (d.offlineAccruedJustNow > 0) {
        setWelcomeBack(d.offlineAccruedJustNow);
        window.setTimeout(() => setWelcomeBack(null), 6000);
      }
    } catch {
      /* network blip — try again next tick */
    }
  }, []);
  useVisibleInterval(loadState, SYNC_POLL_MS);

  // Coin spawner
  const upgrades = (server?.upgrades ?? {}) as Record<UpgradeId, number>;
  const intervalMs = useMemo(() => spawnIntervalMs(upgrades), [upgrades]);
  useEffect(() => {
    if (!server) return;
    const t = window.setInterval(() => {
      const playEl = playRef.current;
      if (!playEl) return;
      const rect = playEl.getBoundingClientRect();
      // Pick a random spawn coordinate inside the play area, with
      // padding so the coin is fully visible.
      const pad = 40;
      const x = pad + Math.random() * Math.max(0, rect.width - pad * 2);
      const y = pad + Math.random() * Math.max(0, rect.height - pad * 2);
      const coin = rollSpawn(upgrades);
      const trait = rollTrait(coin, upgrades);
      coinSeqRef.current += 1;
      setCoins((prev) => [
        ...prev,
        { id: coinSeqRef.current, coin, trait, x, y, spawnedAt: Date.now() },
      ]);
    }, intervalMs);
    return () => window.clearInterval(t);
  }, [server, intervalMs, upgrades]);

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
    Sfx.play("coin.drop");
    const traitMul = coin.trait === "shiny" ? 5 : 1;
    const optimisticPC = coinPCValue(coin.coin, upgrades) * traitMul;
    setLocalCents((c) => c + optimisticPC);

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
  const ratePcPerSec = helperRatePcPerSec(server.helpers);
  const now = Date.now();
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
          {coins.length === 0 && (
            <div
              style={{
                position: "absolute",
                inset: 0,
                display: "grid",
                placeItems: "center",
                color: "var(--parchment-100)",
                fontFamily: "var(--font-display)",
                opacity: 0.7,
                fontSize: 14,
              }}
            >
              waiting for coins…
            </div>
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
          <div className="row" style={{ gap: 6 }}>
            <button
              type="button"
              className={`btn btn-sm${tab === "upgrades" ? "" : " btn-ghost"}`}
              style={{ flex: 1 }}
              onClick={() => setTab("upgrades")}
            >
              Upgrades
            </button>
            <button
              type="button"
              className={`btn btn-sm${tab === "helpers" ? "" : " btn-ghost"}`}
              style={{ flex: 1 }}
              onClick={() => setTab("helpers")}
            >
              Helpers
            </button>
          </div>
          {tab === "upgrades" ? (
            <UpgradeShop
              levels={upgrades}
              cents={localCents}
              onBuy={buyUpgrade}
            />
          ) : (
            <HelperRoster
              counts={server.helpers as Record<HelperId, number>}
              cents={localCents}
              onHire={hireHelper}
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
