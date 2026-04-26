"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { GameIcon, type IconName } from "@/components/GameIcon";
import { BetInput } from "@/components/BetInput";
import {
  METER,
  TIER_LABEL,
  TIER_MULTIPLIER,
} from "@/lib/games/slots/engine";

// =============================================================
// Types — wire shape from server endpoints.
// =============================================================
type Sym = "BOOT" | "GUN" | "STAR" | "GOLD" | "SHERIFF";
type Cell =
  | { kind: Sym }
  | { kind: "COIN"; cashValue: number }
  | { kind: "BUILDING"; tier: number; tierLabel: string };

type SpinResponse = {
  ok: boolean;
  grid: Cell[][];                        // [reel][row]
  lineWins: { lineIndex: number; symbol: Sym; count: number; payout: number }[];
  linePayout: number;
  coinCount: number;
  bonusTriggered: boolean;
  runId: string | null;
  bonusBoard: { value: number | null; locked: boolean }[] | null;
  bonusTier: number | null;
  meter: { value: number; gain: number; forced: boolean };
  balance: number;
};

type RespinResponse = {
  ok: boolean;
  finished: boolean;
  board: { value: number | null; locked: boolean }[];
  newCoins: { idx: number; value: number }[];
  respinsLeft: number;
  coinsLocked: number;
  tier: number;
  filledScreen: boolean;
  payout: number;
  coinTotal?: number;
  balance: number;
};

const SYM_ICON: Record<Sym, IconName> = {
  BOOT: "slot.boot",
  GUN: "slot.gun",
  STAR: "slot.star",
  GOLD: "slot.gold",
  SHERIFF: "slot.sheriff",
};

const COIN_TIER_COLOR = (mult: number): { bg: string; ring: string; fg: string } => {
  if (mult >= 25)  return { bg: "#ffd84d", ring: "#7a5510", fg: "#1a0f08" };  // top-tier
  if (mult >= 10)  return { bg: "#e87a3a", ring: "#4a1a1a", fg: "#fef6e4" };
  if (mult >= 5)   return { bg: "#c93a2c", ring: "#1a0f08", fg: "#fef6e4" };
  if (mult >= 3)   return { bg: "#5fa8d3", ring: "#143348", fg: "#fef6e4" };
  return { bg: "#f5c842", ring: "#7a5510", fg: "#1a0f08" };
};

const TIER_COLOR: Record<number, { bg: string; fg: string }> = {
  1: { bg: "#a87545", fg: "#fef6e4" },
  2: { bg: "#c93a2c", fg: "#fef6e4" },
  3: { bg: "#2c6a8e", fg: "#fef6e4" },
  4: { bg: "#5a3a78", fg: "#fef6e4" },
  5: { bg: "#ffd84d", fg: "#1a0f08" },
};

const ROWS = 4;
const REELS = 5;

export function SlotsClient() {
  const router = useRouter();
  const [bet, setBet] = useState(1_000);
  const [busy, setBusy] = useState(false);
  const [grid, setGrid] = useState<Cell[][]>(() => idleGrid());
  const [meter, setMeter] = useState(0);
  const [balance, setBalance] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [lastResult, setLastResult] = useState<SpinResponse | null>(null);
  const [coinPayout, setCoinPayout] = useState<number | null>(null);
  // Per-reel spin state for stagger animation: 0 = idle, ts = animating since ts.
  const [reelSpin, setReelSpin] = useState<number[]>([0, 0, 0, 0, 0]);
  const [winningCells, setWinningCells] = useState<Set<number>>(new Set());
  // Bonus state
  const [bonus, setBonus] = useState<null | {
    board: { value: number | null; locked: boolean }[];
    respinsLeft: number;
    coinsLocked: number;
    tier: number;
    bet: number;
  }>(null);
  const [bonusBusy, setBonusBusy] = useState(false);
  const [bonusEnded, setBonusEnded] = useState<null | {
    payout: number;
    coinTotal: number;
    tier: number;
    filledScreen: boolean;
  }>(null);
  // Floating "+X" text overlays for newly locked coins.
  const [coinFloats, setCoinFloats] = useState<{ id: number; idx: number; value: number }[]>([]);
  // Autoplay
  const [autoCount, setAutoCount] = useState(0);
  const autoRef = useRef(0);
  useEffect(() => { autoRef.current = autoCount; }, [autoCount]);

  // Initial state load (resumes any active bonus on refresh)
  useEffect(() => {
    fetch("/api/games/slots/state").then((r) => r.json()).then((d) => {
      if (!d.ok) return;
      setBalance(d.balance);
      setMeter(d.meter ?? 0);
      if (d.run) {
        setBonus({
          board: d.run.board,
          respinsLeft: d.run.respinsLeft,
          coinsLocked: d.run.coinsLocked,
          tier: d.run.tier,
          bet: d.run.bet,
        });
      }
    });
  }, []);

  const canSpin = !busy && bet >= 100 && (balance == null || balance >= bet) && !bonus;
  const meterPct = Math.min(100, (meter / METER.full) * 100);

  // Autoplay tick — kicked off after each completed spin if autoCount > 0
  useEffect(() => {
    if (autoCount <= 0 || busy || bonus) return;
    const t = setTimeout(() => {
      if (autoRef.current > 0 && !busy && !bonus) doSpin();
    }, 600);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoCount, busy, bonus]);

  async function doSpin() {
    if (!canSpin) return;
    setError(null);
    setLastResult(null);
    setCoinPayout(null);
    setWinningCells(new Set());
    setBonusEnded(null);
    setBusy(true);

    // Start reel-spin animation (staggered ends)
    const t0 = Date.now();
    setReelSpin([t0, t0, t0, t0, t0]);

    const res = await fetch("/api/games/slots/spin", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ bet }),
    });
    const data = (await res.json()) as SpinResponse & { error?: string };
    if (!res.ok) {
      setBusy(false);
      setReelSpin([0, 0, 0, 0, 0]);
      setError(labelFor(data.error ?? "error"));
      setAutoCount(0);
      return;
    }

    // Anticipation: stop reels with a 220ms stagger; when 4+ coins are
    // showing in the first 4 reels, slow reel 5 down for drama.
    const grid = data.grid;
    const coinsInFirst4 = grid.slice(0, 4).reduce((acc, col) => acc + col.filter((c) => c.kind === "COIN").length, 0);
    const stagger = 220;
    const stops = [800, 800 + stagger, 800 + stagger * 2, 800 + stagger * 3, 800 + stagger * 4];
    if (coinsInFirst4 >= 4) {
      // Anticipation: extra suspense on reel 5
      stops[4] += 1200;
    }

    // Stop each reel at its scheduled time, then settle.
    const stopReel = (reelIdx: number) => {
      setReelSpin((prev) => {
        const next = prev.slice();
        next[reelIdx] = 0;
        return next;
      });
      setGrid((prev) => {
        const next = prev.map((c) => c.slice());
        next[reelIdx] = grid[reelIdx];
        return next;
      });
    };
    for (let r = 0; r < REELS; r++) {
      setTimeout(() => stopReel(r), stops[r]);
    }
    const totalSettle = Math.max(...stops) + 200;

    setTimeout(() => {
      setBusy(false);
      setMeter(data.meter.value);
      setBalance(data.balance);
      setLastResult(data);

      // Highlight winning cells
      if (data.lineWins.length > 0) {
        const cells = new Set<number>();
        for (const w of data.lineWins) {
          // Use payline geometry from engine (mirrored here)
          const line = PAYLINES[w.lineIndex];
          for (let i = 0; i < w.count; i++) {
            const reel = i;
            const row = line[reel];
            cells.add(reel * ROWS + row);
          }
        }
        setWinningCells(cells);
      }

      // Bonus trigger
      if (data.bonusTriggered && data.bonusBoard) {
        setBonus({
          board: data.bonusBoard,
          respinsLeft: 3,
          coinsLocked: data.bonusBoard.filter((c) => c.locked).length,
          tier: data.bonusTier ?? 1,
          bet,
        });
      } else if (autoRef.current > 0) {
        setAutoCount((n) => Math.max(0, n - 1));
      }
      router.refresh();
    }, totalSettle);
  }

  async function doRespin() {
    if (!bonus || bonusBusy) return;
    setBonusBusy(true);
    const res = await fetch("/api/games/slots/respin", { method: "POST" });
    const data = (await res.json()) as RespinResponse & { error?: string };
    setBonusBusy(false);
    if (!res.ok) {
      setError(labelFor(data.error ?? "error"));
      return;
    }

    setBonus({
      board: data.board,
      respinsLeft: data.respinsLeft,
      coinsLocked: data.coinsLocked,
      tier: data.tier,
      bet: bonus.bet,
    });
    setBalance(data.balance);

    // Pop floating "+X" labels for new coins (stamped per-cell)
    if (data.newCoins.length > 0) {
      const baseId = Date.now();
      setCoinFloats((prev) => [
        ...prev,
        ...data.newCoins.map((nc, i) => ({ id: baseId + i, idx: nc.idx, value: nc.value })),
      ]);
      setTimeout(() => {
        setCoinFloats((prev) => prev.filter((p) => p.id < baseId));
      }, 1200);
    }

    if (data.finished) {
      setTimeout(() => {
        setBonusEnded({
          payout: data.payout,
          coinTotal: data.coinTotal ?? 0,
          tier: data.tier,
          filledScreen: data.filledScreen,
        });
      }, 700);
    }
  }

  function closeBonus() {
    setBonus(null);
    setBonusEnded(null);
    router.refresh();
    if (autoRef.current > 0) setAutoCount((n) => Math.max(0, n - 1));
  }

  return (
    <div className="grid grid-2" style={{ alignItems: "start" }}>
      <div className="panel" style={{ padding: "var(--sp-5)" }}>
        <div className="panel-title">Boomtown Reels</div>

        <MeterBar value={meter} max={METER.full} />

        <div
          style={{
            position: "relative",
            background: "linear-gradient(180deg, #2a1810, #1a0f08)",
            border: "4px solid var(--ink-900)",
            padding: "var(--sp-4)",
            marginTop: "var(--sp-3)",
            boxShadow: "inset 0 0 20px rgba(0,0,0,0.6)",
          }}
        >
          {/* Reel strip */}
          <div
            style={{
              display: "grid",
              gridTemplateColumns: `repeat(${REELS}, 1fr)`,
              gap: 6,
              position: "relative",
            }}
          >
            {grid.map((col, reelIdx) => (
              <Reel
                key={reelIdx}
                cells={col}
                spinning={reelSpin[reelIdx] !== 0}
                reelIdx={reelIdx}
                winningCells={winningCells}
                rowsPerReel={ROWS}
              />
            ))}
          </div>

          {/* Result sign (anchored bottom of reels) */}
          {lastResult && !bonus && (
            <ResultSign result={lastResult} bet={bet} />
          )}
        </div>

        {error && <p style={{ color: "var(--crimson-300)", marginTop: "var(--sp-3)" }}>{error}</p>}

        {/* Bottom action bar */}
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "1fr auto auto",
            gap: "var(--sp-3)",
            alignItems: "end",
            marginTop: "var(--sp-4)",
          }}
        >
          <div style={{ minWidth: 0 }}>
            <BetInput
              value={bet}
              onChange={setBet}
              max={Math.max(100, balance ?? 100)}
              disabled={busy || !!bonus}
            />
          </div>
          <button
            className={`btn ${autoCount > 0 ? "" : "btn-ghost"}`}
            onClick={() => {
              if (autoCount > 0) setAutoCount(0);
              else setAutoCount(10);
            }}
            disabled={busy || !!bonus}
            title={autoCount > 0 ? "Stop autoplay" : "Auto 10 spins"}
            style={{ height: "auto", whiteSpace: "nowrap" }}
          >
            {autoCount > 0 ? `Stop (${autoCount})` : "Auto 10"}
          </button>
          <button
            className="btn btn-lg"
            onClick={doSpin}
            disabled={!canSpin}
            style={{
              minWidth: 140,
              fontSize: "var(--fs-h3)",
              background: meter >= METER.full ? "var(--crimson-300)" : undefined,
              color: meter >= METER.full ? "var(--parchment-50)" : undefined,
              boxShadow: meter >= METER.full ? "var(--glow-gold)" : undefined,
            }}
          >
            {busy ? "..." : meter >= METER.full ? "Strike!" : "Spin"}
          </button>
        </div>
      </div>

      {/* Right column: paytable + meter info */}
      <div className="stack-lg">
        <BuildingTiers />
        <Paytable />
        <CoinTable />
      </div>

      {/* Bonus overlay */}
      {bonus && (
        <BonusOverlay
          bonus={bonus}
          bonusBusy={bonusBusy}
          onRespin={doRespin}
          coinFloats={coinFloats}
          ended={bonusEnded}
          onClose={closeBonus}
        />
      )}
    </div>
  );
}

// =============================================================
// Reels
// =============================================================
function Reel({
  cells,
  spinning,
  reelIdx,
  winningCells,
  rowsPerReel,
}: {
  cells: Cell[];
  spinning: boolean;
  reelIdx: number;
  winningCells: Set<number>;
  rowsPerReel: number;
}) {
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        gap: 4,
        background: "rgba(0,0,0,0.35)",
        padding: 4,
        border: "2px solid var(--ink-900)",
        position: "relative",
        overflow: "hidden",
      }}
    >
      {spinning && (
        // Blur the cells visually while the reel is "spinning". The cell
        // contents already update via state when reels stop.
        <div
          aria-hidden
          style={{
            position: "absolute",
            inset: 0,
            background: "repeating-linear-gradient(0deg, rgba(245,200,66,0.08) 0 8px, rgba(0,0,0,0.4) 8px 16px)",
            animation: "lg-reel-blur 0.18s linear infinite",
            zIndex: 2,
            pointerEvents: "none",
          }}
        />
      )}
      <style>{`
        @keyframes lg-reel-blur {
          0% { transform: translateY(0); }
          100% { transform: translateY(16px); }
        }
        @keyframes lg-cell-pop {
          0% { transform: scale(0.8); opacity: 0; }
          60% { transform: scale(1.08); opacity: 1; }
          100% { transform: scale(1); }
        }
        @keyframes lg-coin-glow {
          0%, 100% { box-shadow: 0 0 0 2px var(--ink-900), 0 0 18px rgba(245,200,66,0.6); }
          50% { box-shadow: 0 0 0 2px var(--ink-900), 0 0 32px rgba(245,200,66,0.95); }
        }
        @keyframes lg-win-pulse {
          0%, 100% { box-shadow: 0 0 0 3px var(--gold-300), 0 0 16px rgba(245,200,66,0.7); transform: scale(1); }
          50% { box-shadow: 0 0 0 4px var(--gold-300), 0 0 26px rgba(245,200,66,1); transform: scale(1.04); }
        }
        @keyframes lg-tier-flash {
          0%, 100% { transform: scale(1); }
          50% { transform: scale(1.12); }
        }
      `}</style>
      {cells.map((c, row) => {
        const cellIdx = reelIdx * rowsPerReel + row;
        const isWinner = winningCells.has(cellIdx);
        return (
          <SymbolCell
            key={`${reelIdx}-${row}`}
            cell={c}
            spinning={spinning}
            winning={isWinner}
            keyId={`${reelIdx}-${row}-${spinning ? "s" : "x"}`}
          />
        );
      })}
    </div>
  );
}

function SymbolCell({
  cell,
  spinning,
  winning,
  keyId,
}: {
  cell: Cell;
  spinning: boolean;
  winning: boolean;
  keyId: string;
}) {
  const isCoin = cell.kind === "COIN";
  const isBuilding = cell.kind === "BUILDING";
  return (
    <div
      key={keyId}
      style={{
        position: "relative",
        aspectRatio: "1 / 1",
        background:
          isCoin
            ? "radial-gradient(circle at 30% 30%, #ffd84d, #c8941d)"
            : isBuilding
            ? "linear-gradient(180deg, #4a2818, #2a1810)"
            : "linear-gradient(180deg, #fef6e4, #e8c089)",
        border: "3px solid var(--ink-900)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        boxShadow: "var(--bevel-light)",
        animation: !spinning
          ? winning
            ? "lg-win-pulse 0.7s ease-in-out infinite"
            : isCoin
            ? "lg-cell-pop 0.4s var(--ease-snap), lg-coin-glow 1.6s ease-in-out infinite"
            : "lg-cell-pop 0.4s var(--ease-snap)"
          : undefined,
        opacity: spinning ? 0 : 1,
      }}
    >
      <CellContents cell={cell} />
    </div>
  );
}

function CellContents({ cell }: { cell: Cell }) {
  if (cell.kind === "COIN") {
    const c = COIN_TIER_COLOR(cell.cashValue);
    const label = formatCoin(cell.cashValue);
    return (
      <div
        style={{
          width: "78%",
          height: "78%",
          borderRadius: 999,
          background: c.bg,
          border: `3px solid ${c.ring}`,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontFamily: "var(--font-display)",
          fontSize: "calc(min(2.4vw, 22px))",
          color: c.fg,
          textShadow: c.fg === "#1a0f08" ? "1px 1px 0 rgba(255,255,255,0.4)" : "1px 1px 0 rgba(0,0,0,0.5)",
          boxShadow: "inset 0 -3px 0 rgba(0,0,0,0.25), inset 0 3px 0 rgba(255,255,255,0.35)",
        }}
      >
        {label}
      </div>
    );
  }
  if (cell.kind === "BUILDING") {
    const c = TIER_COLOR[cell.tier] ?? TIER_COLOR[1];
    return (
      <div
        style={{
          textAlign: "center",
          fontFamily: "var(--font-display)",
          color: c.fg,
          padding: 4,
          letterSpacing: "var(--ls-loose)",
          textTransform: "uppercase",
        }}
      >
        <div
          style={{
            background: c.bg,
            padding: "2px 8px",
            border: "2px solid var(--ink-900)",
            fontSize: 12,
            display: "inline-block",
            marginBottom: 4,
            animation: "lg-tier-flash 0.9s ease-in-out infinite",
          }}
        >
          T{cell.tier}
        </div>
        <div style={{ fontSize: 11, color: "var(--parchment-200)" }}>
          {cell.tierLabel}
        </div>
        <div style={{ fontSize: 16, color: c.bg, marginTop: 2, textShadow: "1px 1px 0 var(--ink-900)" }}>
          {TIER_MULTIPLIER[cell.tier]}×
        </div>
      </div>
    );
  }
  return <GameIcon name={SYM_ICON[cell.kind]} size={56} />;
}

// =============================================================
// Meter bar (Whiskey Barrel)
// =============================================================
function MeterBar({ value, max }: { value: number; max: number }) {
  const pct = Math.min(100, (value / max) * 100);
  const ready = value >= max;
  return (
    <div
      title={ready ? "Next spin guaranteed!" : `${value} / ${max} — fills with each spin`}
      style={{
        background: "var(--saddle-600)",
        border: "3px solid var(--ink-900)",
        padding: "var(--sp-2)",
        position: "relative",
        boxShadow: "var(--bevel-light)",
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          fontFamily: "var(--font-display)",
          fontSize: 12,
          letterSpacing: "var(--ls-loose)",
          textTransform: "uppercase",
          color: "var(--parchment-50)",
          marginBottom: 4,
        }}
      >
        <span>Whiskey Barrel</span>
        <span style={{ color: ready ? "var(--gold-300)" : "var(--parchment-200)" }}>
          {ready ? "READY!" : `${value} / ${max}`}
        </span>
      </div>
      <div
        style={{
          height: 12,
          background: "var(--ink-1000)",
          border: "2px solid var(--ink-900)",
          position: "relative",
          overflow: "hidden",
        }}
      >
        <div
          style={{
            width: `${pct}%`,
            height: "100%",
            background: ready
              ? "linear-gradient(90deg, var(--crimson-300), var(--gold-300))"
              : "linear-gradient(90deg, var(--saddle-300), var(--gold-300))",
            transition: "width 400ms var(--ease-out)",
            boxShadow: ready ? "var(--glow-gold)" : undefined,
          }}
        />
        {ready && (
          <div
            style={{
              position: "absolute",
              inset: 0,
              animation: "lg-cell-pop 0.6s ease-in-out infinite alternate",
              background: "linear-gradient(90deg, transparent, rgba(255,255,255,0.4), transparent)",
            }}
          />
        )}
      </div>
    </div>
  );
}

// =============================================================
// Result sign + line wins
// =============================================================
function ResultSign({ result, bet }: { result: SpinResponse; bet: number }) {
  const big = result.linePayout >= bet * 5;
  const positive = result.linePayout > 0;
  return (
    <div
      style={{
        background: positive ? (big ? "var(--gold-300)" : "var(--cactus-500)") : "transparent",
        color: positive ? "var(--ink-900)" : "var(--parchment-200)",
        fontFamily: "var(--font-display)",
        fontSize: positive ? 20 : 13,
        textAlign: "center",
        padding: positive ? "6px 12px" : "4px 8px",
        textTransform: "uppercase",
        letterSpacing: "var(--ls-loose)",
        textShadow: positive ? "1px 1px 0 var(--gold-100)" : undefined,
        animation: big ? "lg-cell-pop 0.5s var(--ease-snap)" : undefined,
        marginTop: "var(--sp-3)",
        border: positive ? "3px solid var(--ink-900)" : undefined,
      }}
    >
      {positive
        ? big
          ? `BIG WIN! +${result.linePayout.toLocaleString()} ¢`
          : `+${result.linePayout.toLocaleString()} ¢ on ${result.lineWins.length} line${result.lineWins.length === 1 ? "" : "s"}`
        : result.coinCount >= 4
        ? `${result.coinCount} coins — so close...`
        : "Spin again."}
    </div>
  );
}

// =============================================================
// Bonus overlay
// =============================================================
function BonusOverlay({
  bonus,
  bonusBusy,
  onRespin,
  coinFloats,
  ended,
  onClose,
}: {
  bonus: {
    board: { value: number | null; locked: boolean }[];
    respinsLeft: number;
    coinsLocked: number;
    tier: number;
    bet: number;
  };
  bonusBusy: boolean;
  onRespin: () => void;
  coinFloats: { id: number; idx: number; value: number }[];
  ended: null | { payout: number; coinTotal: number; tier: number; filledScreen: boolean };
  onClose: () => void;
}) {
  const tierLabel = TIER_LABEL[bonus.tier] ?? "Tent";
  const tierColor = TIER_COLOR[bonus.tier] ?? TIER_COLOR[1];

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 200,
        background: "rgba(26, 15, 8, 0.84)",
        backdropFilter: "blur(3px)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: "var(--sp-4)",
      }}
    >
      <div
        className="panel panel-wood"
        style={{
          width: "min(720px, 100%)",
          maxHeight: "calc(100vh - 32px)",
          overflowY: "auto",
          padding: "var(--sp-5)",
          background: "var(--saddle-500)",
          color: "var(--parchment-50)",
          border: "4px solid var(--ink-900)",
          boxShadow: "var(--glow-gold), var(--bevel-light)",
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            marginBottom: "var(--sp-4)",
            flexWrap: "wrap",
            gap: 8,
          }}
        >
          <div>
            <div
              style={{
                fontFamily: "var(--font-display)",
                fontSize: "var(--fs-h2)",
                color: "var(--gold-300)",
                textShadow: "3px 3px 0 var(--ink-900)",
              }}
            >
              ROUND 'EM UP
            </div>
            <div className="text-mute" style={{ fontSize: 13 }}>
              Coins lock. Each new coin resets the 3-respin counter.
            </div>
          </div>
          <div
            style={{
              fontFamily: "var(--font-display)",
              padding: "8px 14px",
              background: tierColor.bg,
              color: tierColor.fg,
              border: "3px solid var(--ink-900)",
              boxShadow: "var(--bevel-light)",
              fontSize: 16,
              letterSpacing: "var(--ls-loose)",
              textTransform: "uppercase",
              animation: "lg-tier-flash 1s ease-in-out infinite",
            }}
          >
            {tierLabel} · {TIER_MULTIPLIER[bonus.tier]}×
          </div>
        </div>

        {/* The bonus grid — 5 reels × 4 rows. */}
        <BonusGrid board={bonus.board} coinFloats={coinFloats} />

        {/* Stat row */}
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(3, 1fr)",
            gap: "var(--sp-2)",
            margin: "var(--sp-4) 0",
          }}
        >
          <BonusStat label="Respins" value={`${bonus.respinsLeft}`} tone="parchment" />
          <BonusStat label="Coins" value={`${bonus.coinsLocked} / 20`} tone="gold" />
          <BonusStat
            label="Pool"
            value={`${Math.floor(
              bonus.board.reduce((s, c) => s + (c.value ?? 0), 0) *
                TIER_MULTIPLIER[bonus.tier] *
                (bonus.bet / 20)
            ).toLocaleString()} ¢`}
            tone="cactus"
          />
        </div>

        {!ended ? (
          <button
            className="btn btn-lg btn-block"
            onClick={onRespin}
            disabled={bonusBusy}
            style={{ fontSize: "var(--fs-h3)" }}
          >
            {bonusBusy ? "Respinning..." : `Respin (${bonus.respinsLeft} left)`}
          </button>
        ) : (
          <div className="stack" style={{ gap: 12 }}>
            <div
              style={{
                background: ended.filledScreen ? "var(--gold-300)" : "var(--cactus-500)",
                color: "var(--ink-900)",
                fontFamily: "var(--font-display)",
                fontSize: 28,
                textAlign: "center",
                padding: "var(--sp-4)",
                border: "3px solid var(--ink-900)",
                textShadow: "2px 2px 0 var(--gold-100)",
                boxShadow: "var(--glow-gold)",
              }}
            >
              {ended.filledScreen
                ? `BOOMTOWN! +${ended.payout.toLocaleString()} ¢`
                : `+${ended.payout.toLocaleString()} ¢`}
            </div>
            <div className="text-mute" style={{ fontSize: 13, textAlign: "center" }}>
              {ended.coinTotal}× coin total · {TIER_LABEL[ended.tier]} · {TIER_MULTIPLIER[ended.tier]}×
            </div>
            <button className="btn btn-block" onClick={onClose}>
              Collect & Continue
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

function BonusGrid({
  board,
  coinFloats,
}: {
  board: { value: number | null; locked: boolean }[];
  coinFloats: { id: number; idx: number; value: number }[];
}) {
  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: `repeat(${REELS}, 1fr)`,
        gap: 4,
        background: "linear-gradient(180deg, #2a1810, #1a0f08)",
        border: "4px solid var(--ink-900)",
        padding: 6,
      }}
    >
      {Array.from({ length: REELS }).map((_, reelIdx) => (
        <div key={reelIdx} style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          {Array.from({ length: ROWS }).map((_, row) => {
            const idx = reelIdx * ROWS + row;
            const cell = board[idx];
            const c = cell.locked && cell.value ? COIN_TIER_COLOR(cell.value) : null;
            const floats = coinFloats.filter((f) => f.idx === idx);
            return (
              <div
                key={row}
                style={{
                  position: "relative",
                  aspectRatio: "1 / 1",
                  background: cell.locked
                    ? c!.bg
                    : "rgba(255, 246, 228, 0.04)",
                  border: cell.locked ? `3px solid ${c!.ring}` : "2px dashed var(--saddle-300)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontFamily: "var(--font-display)",
                  fontSize: 20,
                  color: c?.fg ?? "var(--saddle-300)",
                  textShadow: cell.locked && c?.fg === "#1a0f08" ? "1px 1px 0 rgba(255,255,255,0.4)" : "1px 1px 0 rgba(0,0,0,0.5)",
                  boxShadow: cell.locked ? "inset 0 -3px 0 rgba(0,0,0,0.25), inset 0 3px 0 rgba(255,255,255,0.35), var(--glow-gold)" : undefined,
                  animation: cell.locked ? "lg-cell-pop 0.5s var(--ease-snap)" : undefined,
                  overflow: "hidden",
                }}
              >
                {cell.locked && cell.value ? formatCoin(cell.value) : ""}
                {floats.map((f) => (
                  <span
                    key={f.id}
                    style={{
                      position: "absolute",
                      top: "50%",
                      left: "50%",
                      transform: "translate(-50%, -50%)",
                      fontFamily: "var(--font-display)",
                      fontSize: 18,
                      color: "var(--gold-300)",
                      textShadow: "2px 2px 0 var(--ink-900)",
                      animation: "lg-cell-pop 0.6s var(--ease-snap)",
                    }}
                  >
                    +{formatCoin(f.value)}
                  </span>
                ))}
              </div>
            );
          })}
        </div>
      ))}
    </div>
  );
}

function BonusStat({ label, value, tone }: { label: string; value: string; tone: "parchment" | "gold" | "cactus" }) {
  const bg =
    tone === "gold" ? "var(--gold-300)" :
    tone === "cactus" ? "var(--cactus-500)" :
    "var(--parchment-200)";
  const fg = tone === "cactus" ? "var(--parchment-50)" : "var(--ink-900)";
  return (
    <div
      style={{
        background: bg,
        color: fg,
        padding: "var(--sp-3)",
        border: "3px solid var(--ink-900)",
        textAlign: "center",
      }}
    >
      <div className="label" style={{ color: fg, opacity: 0.7 }}>{label}</div>
      <div style={{ fontFamily: "var(--font-display)", fontSize: 22, lineHeight: 1, marginTop: 2 }}>
        {value}
      </div>
    </div>
  );
}

// =============================================================
// Right column tables
// =============================================================
function BuildingTiers() {
  const tiers = [1, 2, 3, 4, 5];
  return (
    <div className="panel" style={{ padding: "var(--sp-5)" }}>
      <div className="panel-title">Buildings (Reel 5)</div>
      <p className="text-mute" style={{ fontSize: 12, marginBottom: "var(--sp-3)" }}>
        Land a building during a bonus to upgrade the multiplier on your locked coin pool.
      </p>
      <div className="stack" style={{ gap: 6 }}>
        {tiers.map((t) => {
          const c = TIER_COLOR[t];
          return (
            <div
              key={t}
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                padding: "var(--sp-2) var(--sp-3)",
                background: c.bg,
                color: c.fg,
                border: "2px solid var(--ink-900)",
              }}
            >
              <span style={{ fontFamily: "var(--font-display)", letterSpacing: "var(--ls-loose)", textTransform: "uppercase" }}>
                T{t} · {TIER_LABEL[t]}
              </span>
              <span style={{ fontFamily: "var(--font-display)", fontSize: 18 }}>
                {TIER_MULTIPLIER[t]}×
              </span>
            </div>
          );
        })}
      </div>
      <p className="text-mute" style={{ fontSize: 11, marginTop: "var(--sp-3)" }}>
        Filling all 20 cells = automatic Boomtown jackpot.
      </p>
    </div>
  );
}

function Paytable() {
  const SYMS: Sym[] = ["BOOT", "GUN", "STAR", "GOLD", "SHERIFF"];
  const PAYS: Record<Sym, { 3: number; 4: number; 5: number }> = {
    BOOT:    { 3: 1, 4: 3,   5: 8 },
    GUN:     { 3: 1, 4: 5,   5: 14 },
    STAR:    { 3: 2, 4: 8,   5: 25 },
    GOLD:    { 3: 4, 4: 15,  5: 60 },
    SHERIFF: { 3: 8, 4: 30,  5: 150 },
  };
  return (
    <div className="panel" style={{ padding: "var(--sp-5)" }}>
      <div className="panel-title">Paytable (per line)</div>
      <table style={{ width: "100%", borderCollapse: "collapse", fontFamily: "var(--font-display)", fontSize: 14 }}>
        <thead>
          <tr style={{ borderBottom: "2px dashed var(--saddle-300)" }}>
            <th style={{ textAlign: "left", padding: "var(--sp-2)" }}>Symbol</th>
            <th style={{ textAlign: "right", padding: "var(--sp-2)" }}>×3</th>
            <th style={{ textAlign: "right", padding: "var(--sp-2)" }}>×4</th>
            <th style={{ textAlign: "right", padding: "var(--sp-2)" }}>×5</th>
          </tr>
        </thead>
        <tbody>
          {SYMS.map((sym) => (
            <tr key={sym} style={{ borderBottom: "2px dashed var(--saddle-300)" }}>
              <td style={{ padding: "var(--sp-2)", display: "flex", alignItems: "center", gap: 8 }}>
                <GameIcon name={SYM_ICON[sym]} size={24} />
                {sym}
              </td>
              <td style={{ textAlign: "right", padding: "var(--sp-2)" }}>{PAYS[sym][3]}×</td>
              <td style={{ textAlign: "right", padding: "var(--sp-2)" }}>{PAYS[sym][4]}×</td>
              <td style={{ textAlign: "right", padding: "var(--sp-2)" }} className="text-money">{PAYS[sym][5]}×</td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="text-mute" style={{ fontSize: 11, marginTop: "var(--sp-2)" }}>
        20 paylines, all played each spin. Sheriff is wild and substitutes for any payable symbol.
      </p>
    </div>
  );
}

function CoinTable() {
  const COINS = [1, 2, 3, 5, 10, 25];
  return (
    <div className="panel" style={{ padding: "var(--sp-5)" }}>
      <div className="panel-title">Cash Coins</div>
      <p className="text-mute" style={{ fontSize: 12, marginBottom: "var(--sp-3)" }}>
        Land 6+ coins to trigger Round 'Em Up. Each coin's value is collected at the end.
      </p>
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
        {COINS.map((m) => {
          const c = COIN_TIER_COLOR(m);
          return (
            <span
              key={m}
              style={{
                width: 44,
                height: 44,
                borderRadius: 999,
                background: c.bg,
                border: `3px solid ${c.ring}`,
                color: c.fg,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontFamily: "var(--font-display)",
                fontSize: 14,
                boxShadow: "inset 0 -3px 0 rgba(0,0,0,0.25), inset 0 3px 0 rgba(255,255,255,0.35)",
              }}
            >
              {m}×
            </span>
          );
        })}
      </div>
      <p className="text-mute" style={{ fontSize: 11, marginTop: "var(--sp-3)" }}>
        Each coin pays its multiplier × bet/20. 25× is the jackpot coin.
      </p>
    </div>
  );
}

// =============================================================
// Helpers
// =============================================================
function formatCoin(mult: number): string {
  return `${mult}×`;
}

function idleGrid(): Cell[][] {
  // Deterministic placeholder shown before first spin / when nothing has loaded.
  const order: Sym[] = ["BOOT", "GUN", "STAR", "GOLD", "SHERIFF"];
  const out: Cell[][] = [];
  for (let r = 0; r < REELS; r++) {
    const col: Cell[] = [];
    for (let row = 0; row < ROWS; row++) {
      col.push({ kind: order[(r + row) % order.length] });
    }
    out.push(col);
  }
  return out;
}

const PAYLINES: number[][] = [
  [0, 0, 0, 0, 0], [1, 1, 1, 1, 1], [2, 2, 2, 2, 2], [3, 3, 3, 3, 3],
  [0, 1, 2, 1, 0], [3, 2, 1, 2, 3], [1, 0, 0, 0, 1], [2, 3, 3, 3, 2],
  [0, 0, 1, 2, 3], [3, 3, 2, 1, 0], [1, 0, 1, 0, 1], [2, 3, 2, 3, 2],
  [1, 1, 2, 1, 1], [2, 2, 1, 2, 2], [0, 1, 0, 1, 0], [3, 2, 3, 2, 3],
  [1, 2, 1, 2, 1], [2, 1, 2, 1, 2], [0, 1, 1, 1, 0], [3, 2, 2, 2, 3],
];

function labelFor(code: string) {
  const labels: Record<string, string> = {
    insufficient_funds: "Not enough Coins.",
    bet_too_low: "Bet must be at least 100.",
    bet_invalid: "Invalid bet.",
    bonus_in_progress: "Finish your bonus respin first.",
    no_active_bonus: "No active bonus.",
  };
  return labels[code] ?? "Something went wrong.";
}
