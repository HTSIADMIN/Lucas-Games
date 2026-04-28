"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { BetInput } from "@/components/BetInput";
import type { ScratchSymbol, Tier } from "@/lib/games/scratch/engine";

type BuyResponse = {
  ok: true;
  tier: Tier;
  grid: ScratchSymbol[];
  multiplier: 1 | 2 | 5 | 10;
  winLine: number[] | null;
  nearMissLine: number[] | null;
  payout: number;
  balance: number;
};

type Phase = "idle" | "scratching" | "revealing" | "settled";

const TICKET_W = 360;
const TICKET_H = 480;
const COIN_R = 32;
const REVEAL_THRESHOLD = 0.65;

const SYMBOL_LABEL: Record<ScratchSymbol, string> = {
  horseshoe: "U", boot: "B", ace: "A", dice: "D",
  revolver: "R", whiskey: "W", cactus: "C", gold: "G",
  sheriff: "S", dynamite: "X", bandit: "M",
};

const SYMBOL_COLOR: Record<ScratchSymbol, string> = {
  horseshoe: "#a87545",
  boot:      "#4a2818",
  ace:       "#1a0f08",
  dice:      "#fef6e4",
  revolver:  "#2a1810",
  whiskey:   "#7a5510",
  cactus:    "#3d6b2e",
  gold:      "#f5c842",
  sheriff:   "#c8941d",
  dynamite:  "#e05a3c",
  bandit:    "#1a0f08",
};

export function ScratchClient() {
  const [bet, setBet] = useState(100);
  const [balance, setBalance] = useState<number | null>(null);
  const [phase, setPhase] = useState<Phase>("idle");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [ticket, setTicket] = useState<BuyResponse | null>(null);
  const [streak, setStreak] = useState(0);
  const [scratchedFraction, setScratchedFraction] = useState(0);

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const isDownRef = useRef(false);
  const coinPosRef = useRef<{ x: number; y: number } | null>(null);
  const pointerPosRef = useRef<{ x: number; y: number } | null>(null);
  const rafRef = useRef<number | null>(null);
  const lastSampleRef = useRef<number>(0);

  // Pull initial balance once.
  useEffect(() => {
    fetch("/api/wallet/balance")
      .then((r) => r.json())
      .then((d) => { if (typeof d.balance === "number") setBalance(d.balance); })
      .catch(() => {});
  }, []);

  // Reset the foil layer every time a new ticket is bought.
  useEffect(() => {
    if (!ticket) return;
    const c = canvasRef.current;
    if (!c) return;
    const ctx = c.getContext("2d");
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    c.width = TICKET_W * dpr;
    c.height = TICKET_H * dpr;
    c.style.width = `${TICKET_W}px`;
    c.style.height = `${TICKET_H}px`;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    // Brushed silver foil.
    const grad = ctx.createLinearGradient(0, 0, TICKET_W, TICKET_H);
    grad.addColorStop(0, "#9a9a9a");
    grad.addColorStop(0.5, "#e5e5e5");
    grad.addColorStop(1, "#9a9a9a");
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, TICKET_W, TICKET_H);

    // "SCRATCH HERE" diagonal text.
    ctx.save();
    ctx.translate(TICKET_W / 2, TICKET_H / 2);
    ctx.rotate(-Math.PI / 16);
    ctx.fillStyle = "rgba(43, 24, 16, 0.45)";
    ctx.font = "bold 36px serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText("SCRATCH HERE", 0, 0);
    ctx.font = "16px serif";
    ctx.fillText("Drag the coin across the foil", 0, 32);
    ctx.restore();

    setScratchedFraction(0);
  }, [ticket]);

  // RAF loop — coin lerps toward the pointer; when scratching, mask
  // the foil canvas in a feathered radial brush.
  useEffect(() => {
    function tick() {
      const c = canvasRef.current;
      if (c && pointerPosRef.current) {
        const cur = coinPosRef.current ?? pointerPosRef.current;
        const nx = cur.x + (pointerPosRef.current.x - cur.x) * 0.25;
        const ny = cur.y + (pointerPosRef.current.y - cur.y) * 0.25;
        coinPosRef.current = { x: nx, y: ny };

        if (isDownRef.current && phase === "scratching") {
          const ctx = c.getContext("2d");
          if (ctx) {
            ctx.save();
            ctx.globalCompositeOperation = "destination-out";
            const r = COIN_R + 2;
            const grad = ctx.createRadialGradient(nx, ny, 0, nx, ny, r);
            grad.addColorStop(0, "rgba(0,0,0,1)");
            grad.addColorStop(0.7, "rgba(0,0,0,0.85)");
            grad.addColorStop(1, "rgba(0,0,0,0)");
            ctx.fillStyle = grad;
            ctx.beginPath();
            ctx.arc(nx, ny, r, 0, Math.PI * 2);
            ctx.fill();
            ctx.restore();
          }

          // Sample scratched-fraction every ~120ms (full sweep is slow).
          const now = performance.now();
          if (now - lastSampleRef.current > 120) {
            lastSampleRef.current = now;
            const frac = computeScratchedFraction(c);
            setScratchedFraction(frac);
            if (frac >= REVEAL_THRESHOLD) {
              autoReveal(c);
              setScratchedFraction(1);
              setPhase("revealing");
              setTimeout(() => setPhase("settled"), 1200);
            }
          }
        }
      }
      rafRef.current = requestAnimationFrame(tick);
    }
    rafRef.current = requestAnimationFrame(tick);
    return () => { if (rafRef.current) cancelAnimationFrame(rafRef.current); };
  }, [phase]);

  function pointerXY(e: React.PointerEvent<HTMLCanvasElement>) {
    const c = canvasRef.current;
    if (!c) return null;
    const rect = c.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  }

  const onPointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (phase !== "scratching") return;
    e.currentTarget.setPointerCapture(e.pointerId);
    isDownRef.current = true;
    pointerPosRef.current = pointerXY(e);
  };
  const onPointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    pointerPosRef.current = pointerXY(e);
  };
  const onPointerUp = (e: React.PointerEvent<HTMLCanvasElement>) => {
    isDownRef.current = false;
    e.currentTarget.releasePointerCapture(e.pointerId);
  };

  const buy = useCallback(async () => {
    if (busy) return;
    if (balance != null && balance < bet) {
      setError("Not enough Coins.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const r = await fetch("/api/games/scratch/buy", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ bet }),
      });
      const data = await r.json();
      if (!r.ok || !data.ok) {
        setError(data.error ?? "couldnt_buy");
        return;
      }
      const t = data as BuyResponse;
      setTicket(t);
      setPhase("scratching");
      setBalance(t.balance);
    } finally {
      setBusy(false);
    }
  }, [balance, bet, busy]);

  // Track the streak on settle.
  useEffect(() => {
    if (phase !== "settled" || !ticket) return;
    setStreak((s) => (ticket.payout > 0 ? s + 1 : 0));
  }, [phase, ticket]);

  const tierBig = ticket?.tier === "large" || ticket?.tier === "jackpot";
  const showJackpot = ticket?.tier === "jackpot" && phase === "settled";

  return (
    <div className="stack-lg">
      <div className="grid grid-2" style={{ alignItems: "start" }}>
        {/* === Ticket === */}
        <div
          className={`panel scratch-poster${streak >= 3 ? " is-hot" : ""}${tierBig && phase === "settled" ? " is-big-win" : ""}`}
          style={{
            background: "#f4e8d0",
            color: "#2b1810",
            border: "4px solid #2b1810",
            padding: "var(--sp-4)",
            position: "relative",
          }}
        >
          <div style={{ textAlign: "center", marginBottom: "var(--sp-3)" }}>
            <div style={{ fontFamily: "var(--font-display)", fontSize: 28, letterSpacing: "0.08em" }}>
              WANTED
            </div>
            <div className="text-mute" style={{ fontFamily: "var(--font-display)", fontSize: 14, letterSpacing: "0.08em" }}>
              GOLDEN BOUNTY · 3-IN-A-ROW
            </div>
          </div>

          <div
            style={{
              position: "relative",
              width: TICKET_W,
              height: TICKET_H,
              margin: "0 auto",
              border: "3px solid #2b1810",
              background: "#f4e8d0",
              touchAction: "none",
            }}
          >
            {/* Revealed under-layer: 3x3 grid + multiplier */}
            <UnderLayer ticket={ticket} phase={phase} />
            {/* Foil canvas */}
            <canvas
              ref={canvasRef}
              onPointerDown={onPointerDown}
              onPointerMove={onPointerMove}
              onPointerUp={onPointerUp}
              onPointerCancel={onPointerUp}
              style={{
                position: "absolute",
                inset: 0,
                cursor: phase === "scratching" ? "grabbing" : "default",
              }}
            />
            {/* Coin overlay tracking the pointer (drawn over the canvas
                so the player sees what they're "holding"). */}
            {phase === "scratching" && coinPosRef.current && (
              <div
                aria-hidden
                style={{
                  position: "absolute",
                  left: (coinPosRef.current?.x ?? -100) - COIN_R,
                  top:  (coinPosRef.current?.y ?? -100) - COIN_R,
                  width: COIN_R * 2,
                  height: COIN_R * 2,
                  borderRadius: "50%",
                  background: "radial-gradient(circle at 30% 30%, #ffe9a8, #c8941d 65%, #7a5510 100%)",
                  border: "3px solid #2b1810",
                  pointerEvents: "none",
                  boxShadow: "0 0 14px rgba(245, 200, 66, 0.6)",
                }}
              />
            )}
          </div>

          <div className="row" style={{ justifyContent: "space-between", marginTop: "var(--sp-3)", fontFamily: "var(--font-display)", fontSize: 12, letterSpacing: "0.06em" }}>
            <span>BOUNTY: {bet.toLocaleString()} ¢</span>
            <span>SCRATCHED: {Math.round(scratchedFraction * 100)}%</span>
          </div>

          {/* Hot streak flame ring */}
          {streak >= 3 && (
            <div aria-hidden className="scratch-flame" />
          )}
        </div>

        {/* === Controls === */}
        <div className="stack-lg">
          <div className="panel">
            <div className="panel-title">Buy a Ticket</div>
            <div className="stack">
              <BetInput value={bet} onChange={setBet} max={Math.max(100, balance ?? 100)} disabled={busy || phase === "scratching"} />
              <button
                className="btn btn-lg btn-block"
                onClick={buy}
                disabled={busy || phase === "scratching"}
                style={{ fontSize: "var(--fs-h3)" }}
              >
                {busy ? "..." : phase === "scratching" ? "Keep scratchin'..." : phase === "settled" ? "Buy Another" : "Buy & Scratch"}
              </button>
              {error && <p style={{ color: "var(--crimson-500)" }}>{error}</p>}
              {phase === "settled" && ticket && <ResultLine ticket={ticket} />}
              {streak >= 1 && <p className="text-mute" style={{ fontSize: "var(--fs-small)" }}>Streak: {streak} 🔥</p>}
            </div>
          </div>

          <div className="panel">
            <div className="panel-title">Prize Legend</div>
            <table style={{ width: "100%", fontFamily: "var(--font-display)", fontSize: 13 }}>
              <tbody>
                <LegendRow tier="Small win" payout="1–2× cost" odds="15.0%" />
                <LegendRow tier="Medium win" payout="5–10× cost" odds="8.0%" />
                <LegendRow tier="Large win" payout="50× cost" odds="1.9%" />
                <LegendRow tier="Jackpot" payout="1,000× cost" odds="0.1%" />
              </tbody>
            </table>
            <p className="text-mute" style={{ fontSize: "var(--fs-tiny)", marginTop: "var(--sp-2)" }}>
              Match 3-in-a-row (any row, column, or diagonal). Multiplier square applies to small/medium wins.
            </p>
          </div>
        </div>
      </div>

      {showJackpot && <JackpotOverlay />}
    </div>
  );
}

// =============================================================
// Subcomponents
// =============================================================

function UnderLayer({ ticket, phase }: { ticket: BuyResponse | null; phase: Phase }) {
  if (!ticket) {
    return (
      <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "var(--font-display)", color: "#a87545", fontSize: 18 }}>
        BUY A TICKET TO PLAY
      </div>
    );
  }
  const winSet = new Set(ticket.winLine ?? []);
  const nearSet = new Set(ticket.nearMissLine ?? []);
  const showWin = phase === "settled" && ticket.winLine !== null;
  return (
    <div style={{ position: "absolute", inset: 0, padding: 16, display: "flex", flexDirection: "column", gap: 12 }}>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 6, flex: 1 }}>
        {ticket.grid.map((s, i) => (
          <SymbolCell
            key={i}
            symbol={s}
            isWinning={showWin && winSet.has(i)}
            isNearMiss={!showWin && phase === "settled" && nearSet.has(i)}
          />
        ))}
      </div>
      <div className="row" style={{ justifyContent: "space-between", alignItems: "center" }}>
        <div style={{ fontFamily: "var(--font-display)", fontSize: 13 }}>MULTIPLIER</div>
        <div style={{
          fontFamily: "var(--font-display)",
          fontSize: 28,
          color: "#9b2c2c",
          background: "#f4e8d0",
          border: "3px solid #2b1810",
          padding: "4px 18px",
        }}>
          {ticket.multiplier}×
        </div>
      </div>
    </div>
  );
}

function SymbolCell({ symbol, isWinning, isNearMiss }: { symbol: ScratchSymbol; isWinning: boolean; isNearMiss: boolean }) {
  return (
    <div
      style={{
        background: "#fef6e4",
        border: `3px solid ${isWinning ? "#c8941d" : "#2b1810"}`,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        fontFamily: "var(--font-display)",
        fontSize: 32,
        color: SYMBOL_COLOR[symbol],
        boxShadow: isWinning ? "0 0 16px rgba(245,200,66,0.7)" : isNearMiss ? "0 0 10px rgba(155,44,44,0.45)" : undefined,
        animation: isWinning ? "scratch-cell-pulse 0.9s ease-in-out infinite" : isNearMiss ? "scratch-cell-near 1.6s ease-in-out infinite" : undefined,
      }}
    >
      {SYMBOL_LABEL[symbol]}
    </div>
  );
}

function LegendRow({ tier, payout, odds }: { tier: string; payout: string; odds: string }) {
  return (
    <tr style={{ borderBottom: "2px dashed #d4a574" }}>
      <td style={{ padding: "6px 0" }}>{tier}</td>
      <td style={{ padding: "6px 0", textAlign: "right" }}>{payout}</td>
      <td style={{ padding: "6px 0", textAlign: "right", color: "#a87545" }}>{odds}</td>
    </tr>
  );
}

function ResultLine({ ticket }: { ticket: BuyResponse }) {
  if (ticket.payout > 0) {
    const tone =
      ticket.tier === "jackpot" ? "var(--gold-300)"
      : ticket.tier === "large" ? "var(--gold-500)"
      : "var(--cactus-500)";
    return (
      <div className="sign" style={{ display: "block", textAlign: "center", background: tone, color: "var(--ink-900)" }}>
        +{ticket.payout.toLocaleString()} ¢
      </div>
    );
  }
  return (
    <p className="text-mute" style={{ fontFamily: "var(--font-display)", textAlign: "center", letterSpacing: "var(--ls-loose)" }}>
      Better luck, pardner.
    </p>
  );
}

function JackpotOverlay() {
  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(26,15,8,0.78)",
        backdropFilter: "blur(2px)",
        zIndex: 250,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        animation: "scratch-shake 0.4s ease",
        pointerEvents: "none",
      }}
    >
      <div
        style={{
          fontFamily: "var(--font-display)",
          fontSize: 88,
          color: "var(--gold-300)",
          textShadow: "4px 4px 0 var(--ink-900), 0 0 24px rgba(245, 200, 66, 0.8)",
          transform: "rotate(-12deg)",
          padding: "var(--sp-7) var(--sp-9)",
          background: "var(--crimson-500)",
          border: "6px solid var(--ink-900)",
          letterSpacing: "0.06em",
        }}
      >
        WINNER!
      </div>
    </div>
  );
}

// =============================================================
// Helpers
// =============================================================

/** Sample alpha across an 18×18 grid; return fraction with alpha < 32. */
function computeScratchedFraction(c: HTMLCanvasElement): number {
  const ctx = c.getContext("2d");
  if (!ctx) return 0;
  const STEP = 18;
  const w = c.width, h = c.height;
  const cols = STEP, rows = STEP;
  let cleared = 0;
  let total = 0;
  for (let y = 0; y < rows; y++) {
    for (let x = 0; x < cols; x++) {
      const px = Math.floor((x + 0.5) * (w / cols));
      const py = Math.floor((y + 0.5) * (h / rows));
      const data = ctx.getImageData(px, py, 1, 1).data;
      total++;
      if (data[3] < 32) cleared++;
    }
  }
  return total === 0 ? 0 : cleared / total;
}

function autoReveal(c: HTMLCanvasElement) {
  const ctx = c.getContext("2d");
  if (!ctx) return;
  ctx.save();
  ctx.globalCompositeOperation = "destination-out";
  ctx.fillStyle = "rgba(0,0,0,1)";
  ctx.fillRect(0, 0, c.width, c.height);
  ctx.restore();
}
