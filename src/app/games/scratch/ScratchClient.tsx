"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type { ScratchOutcome, ScratchSymbol } from "@/lib/games/scratch/engine";
import {
  SCRATCH_DESIGNS,
  SCRATCH_DESIGN_ORDER,
  type ScratchDesign,
  type ScratchDesignSpec,
} from "@/lib/games/scratch/designs";
import { ScratchSym, PixelCoin } from "./Symbols";
import { BigWinOverlay } from "./BigWinOverlay";
import { QuickDrawModal } from "./QuickDrawModal";
import * as Sfx from "@/lib/sfx";

type BuyResponse = { ok: true; ticket: ScratchOutcome; balance: number; availableAt?: string };

type Phase = "idle" | "scratching" | "settled";

const TICKET_W = 380;
const TICKET_H = 540;
const COIN_R = 32;
const REVEAL_THRESHOLD = 0.62;
const STARS_PER_BONUS = 5;
const SHERIFF_KEY = "lg.scratch.sheriffStars";

export function ScratchClient() {
  const router = useRouter();
  const [design, setDesign] = useState<ScratchDesign>("golden-bounty");
  const [balance, setBalance] = useState<number | null>(null);
  const [phase, setPhase] = useState<Phase>("idle");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [ticket, setTicket] = useState<ScratchOutcome | null>(null);
  const [streak, setStreak] = useState(0);
  const [scratchedFraction, setScratchedFraction] = useState(0);
  const [bigWinOpen, setBigWinOpen] = useState(false);
  const [stars, setStars] = useState(0);
  const [quickDrawOpen, setQuickDrawOpen] = useState(false);
  /** True after the player has banked 5 stars and the modal has been
      auto-popped this session — prevents re-pop on every settle while
      they're still over the threshold. Cleared once consumed. */
  const autoOpenedRef = useRef<boolean>(false);
  const [dailyReady, setDailyReady] = useState(false);
  const [dailyAt, setDailyAt] = useState<string | null>(null);

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const dustRef = useRef<HTMLCanvasElement>(null);
  const coinElRef = useRef<HTMLDivElement>(null);
  const isDownRef = useRef(false);
  const coinPosRef = useRef<{ x: number; y: number }>({ x: TICKET_W / 2, y: TICKET_H / 2 });
  const pointerPosRef = useRef<{ x: number; y: number } | null>(null);
  const lastSampleRef = useRef<number>(0);
  const rafRef = useRef<number | null>(null);
  const particlesRef = useRef<Particle[]>([]);
  const lastDustAtRef = useRef<number>(0);
  const [revealedCells, setRevealedCells] = useState<Set<string>>(() => new Set());
  const revealedRef = useRef<Set<string>>(new Set());
  const [coinDragging, setCoinDragging] = useState(false);

  const spec: ScratchDesignSpec = SCRATCH_DESIGNS[design];

  // Pull initial balance + stars from localStorage + daily readiness.
  useEffect(() => {
    fetch("/api/wallet/balance").then((r) => r.json()).then((d) => {
      if (typeof d.balance === "number") setBalance(d.balance);
    }).catch(() => {});

    if (typeof window !== "undefined") {
      const raw = window.localStorage.getItem(SHERIFF_KEY);
      const n = raw ? parseInt(raw, 10) : 0;
      setStars(Number.isFinite(n) ? n : 0);
    }

    fetch("/api/games/scratch/daily").then((r) => r.json()).then((d) => {
      setDailyReady(!!d.ready);
      setDailyAt(d.availableAt ?? null);
    }).catch(() => {});
  }, []);

  // Reset the foil layer every time a new ticket is bought.
  useEffect(() => {
    if (!ticket) return;
    paintFoil(canvasRef.current, spec);
    paintDustClear(dustRef.current);
    setScratchedFraction(0);
    particlesRef.current = [];
    revealedRef.current = new Set();
    setRevealedCells(new Set());
  }, [ticket, spec]);

  // RAF loop — coin position interpolates toward the pointer (DOM
  // transform on the coin element so React doesn't re-render every
  // frame); on scratch, mask the foil + spawn dust particles + advance
  // existing particles.
  useEffect(() => {
    function tick(now: number) {
      const c = canvasRef.current;
      const dust = dustRef.current;
      // Coin lerp + DOM transform (smooth, render-free).
      if (pointerPosRef.current) {
        const cur = coinPosRef.current;
        const target = pointerPosRef.current;
        const nx = cur.x + (target.x - cur.x) * 0.35;
        const ny = cur.y + (target.y - cur.y) * 0.35;
        coinPosRef.current = { x: nx, y: ny };
        if (coinElRef.current) {
          coinElRef.current.style.transform = `translate3d(${nx - COIN_R}px, ${ny - COIN_R}px, 0)`;
        }
      }
      // Mask foil if scratching.
      if (c && isDownRef.current && phase === "scratching" && pointerPosRef.current) {
        const ctx = c.getContext("2d");
        if (ctx) {
          const { x: nx, y: ny } = coinPosRef.current;
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
        // Spawn particles ~ every 40ms while dragging.
        if (now - lastDustAtRef.current > 40) {
          lastDustAtRef.current = now;
          spawnDust(particlesRef.current, coinPosRef.current.x, coinPosRef.current.y, spec.foil[1]);
        }
        // Sample scratched-fraction + per-cell reveal every 140ms.
        if (now - lastSampleRef.current > 140) {
          lastSampleRef.current = now;
          const ctx = c.getContext("2d");
          if (ctx) {
            const dpr = window.devicePixelRatio || 1;
            const img = ctx.getImageData(0, 0, c.width, c.height);
            const data = img.data;
            // Total fraction
            let total = 0, cleared = 0;
            const STEP = 18;
            for (let y = 0; y < c.height; y += STEP) {
              for (let x = 0; x < c.width; x += STEP) {
                const idx = (y * c.width + x) * 4 + 3;
                total++;
                if (data[idx] < 32) cleared++;
              }
            }
            const frac = total === 0 ? 0 : cleared / total;
            setScratchedFraction(frac);

            // Per-cell reveal: any cell whose centre alpha is now
            // mostly transparent gets added to revealedRef. New
            // entries trigger the pop animation via React state.
            const root = c.parentElement;
            if (root) {
              const cells = root.querySelectorAll<HTMLElement>("[data-cell-key]");
              const rect = c.getBoundingClientRect();
              const newSet: Set<string> | null = (() => null)();
              let dirty = false;
              const next = new Set(revealedRef.current);
              cells.forEach((el) => {
                const key = el.dataset.cellKey!;
                if (next.has(key)) return;
                const r = el.getBoundingClientRect();
                const cx = Math.floor((r.left + r.width / 2 - rect.left) * dpr);
                const cy = Math.floor((r.top + r.height / 2 - rect.top) * dpr);
                if (cx < 0 || cx >= c.width || cy < 0 || cy >= c.height) return;
                const idx = (cy * c.width + cx) * 4 + 3;
                if (data[idx] < 60) {
                  next.add(key);
                  dirty = true;
                }
              });
              if (dirty) {
                revealedRef.current = next;
                setRevealedCells(next);
              }
              void newSet;
            }

            if (frac >= REVEAL_THRESHOLD) {
              autoReveal(c);
              setScratchedFraction(1);
              // Mark every cell revealed so the under-layer animates
              // them all in for the auto-clear.
              const all = new Set<string>();
              const root2 = c.parentElement;
              root2?.querySelectorAll<HTMLElement>("[data-cell-key]").forEach((el) => {
                all.add(el.dataset.cellKey!);
              });
              revealedRef.current = all;
              setRevealedCells(all);
              settle();
            }
          }
        }
      }
      // Advance + draw dust particles.
      stepParticles(particlesRef.current, dust);

      rafRef.current = requestAnimationFrame(tick);
    }
    rafRef.current = requestAnimationFrame(tick);
    return () => { if (rafRef.current) cancelAnimationFrame(rafRef.current); };
  }, [phase, spec]);

  function pointerXY(e: React.PointerEvent<HTMLDivElement>) {
    const c = canvasRef.current;
    if (!c) return null;
    const rect = c.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  }

  const onPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (phase !== "scratching") return;
    e.currentTarget.setPointerCapture(e.pointerId);
    isDownRef.current = true;
    setCoinDragging(true);
    const p = pointerXY(e);
    if (p) {
      pointerPosRef.current = p;
      coinPosRef.current = p; // jump on initial down so it doesn't lerp from old position
    }
  };
  const onPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    pointerPosRef.current = pointerXY(e);
  };
  const onPointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    isDownRef.current = false;
    setCoinDragging(false);
    e.currentTarget.releasePointerCapture(e.pointerId);
  };

  function settle() {
    setPhase("settled");
    if (!ticket) return;
    setStreak((s) => (ticket.payout > 0 ? s + 1 : 0));
    // Win stinger ladder
    if (ticket.tier === "jackpot") {
      Sfx.play("win.big");
      window.setTimeout(() => Sfx.play("coins.shower"), 600);
    } else if (ticket.tier === "large") {
      Sfx.play("win.levelup");
    } else if (ticket.tier === "medium" || ticket.tier === "small") {
      Sfx.play("win.notify");
    } else if (ticket.bonusPayout > 0) {
      Sfx.play("coins.clink");
    } else {
      Sfx.play("ui.notify");
    }
    if (ticket.tier === "large" || ticket.tier === "jackpot") {
      // Slight delay so the player sees the reveal first.
      window.setTimeout(() => setBigWinOpen(true), 450);
    }
    // Sheriff star meta — write to localStorage and prompt the
    // quick-draw round once when the player first crosses the
    // threshold. Only auto-pops on the threshold-crossing edge, not
    // every subsequent settle while still ≥5.
    if (typeof window !== "undefined" && ticket.sheriffStars > 0) {
      const before = stars;
      const next = before + ticket.sheriffStars;
      setStars(next);
      window.localStorage.setItem(SHERIFF_KEY, String(next));
      if (before < STARS_PER_BONUS && next >= STARS_PER_BONUS && !autoOpenedRef.current) {
        autoOpenedRef.current = true;
        window.setTimeout(
          () => setQuickDrawOpen(true),
          (ticket.tier === "large" || ticket.tier === "jackpot") ? 3200 : 700,
        );
      }
    }
  }

  const buy = useCallback(async (opts?: { daily?: boolean }) => {
    if (busy) return;
    const useDaily = !!opts?.daily;
    if (!useDaily && balance != null && balance < spec.cost) {
      setError("Not enough Coins for this ticket.");
      return;
    }
    setBusy(true);
    setError(null);
    setBigWinOpen(false);
    try {
      const url = useDaily ? "/api/games/scratch/daily" : "/api/games/scratch/buy";
      const init: RequestInit = useDaily
        ? { method: "POST" }
        : {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ cost: spec.cost }),
          };
      const r = await fetch(url, init);
      const data = await r.json();
      if (!r.ok || !data.ok) {
        setError(data.error ?? "couldnt_buy");
        return;
      }
      const t = data as BuyResponse;
      setTicket(t.ticket);
      setPhase("scratching");
      setBalance(t.balance);
      // Re-render the server components (notably <HeaderBalance>) so
      // the header cash pill keeps up with the local balance.
      router.refresh();
      Sfx.play("coins.handle");
      if (useDaily) {
        setDailyReady(false);
        setDailyAt(t.availableAt ?? null);
      }
    } finally {
      setBusy(false);
    }
  }, [balance, busy, spec.cost]);

  /** Consume the 5-star threshold. Called the moment the player
      enters the quick-draw modal so the bonus is one-shot — no
      retry, regardless of whether they false-start or miss. */
  function consumeStars() {
    if (typeof window === "undefined") return;
    const next = Math.max(0, stars - STARS_PER_BONUS);
    setStars(next);
    window.localStorage.setItem(SHERIFF_KEY, String(next));
    autoOpenedRef.current = false;
  }

  return (
    <div className="stack-lg">
      <div className="grid grid-2" style={{ alignItems: "start" }}>
        {/* === Ticket poster === */}
        <div
          className={`panel scratch-poster${streak >= 3 ? " is-hot" : ""}`}
          style={{
            background: spec.paper,
            color: "#2b1810",
            border: `4px solid ${spec.accent}`,
            padding: "var(--sp-4)",
            position: "relative",
          }}
        >
          {/* Header strip */}
          <div style={{ textAlign: "center", marginBottom: "var(--sp-3)" }}>
            <div
              style={{
                fontFamily: "var(--font-display)",
                fontSize: 14,
                letterSpacing: "0.12em",
                color: spec.accent,
                marginBottom: 2,
              }}
            >
              ★ WANTED ★
            </div>
            <div style={{ fontFamily: "var(--font-display)", fontSize: 26, letterSpacing: "0.08em" }}>
              {spec.name}
            </div>
            <div className="text-mute" style={{ fontFamily: "var(--font-display)", fontSize: 11, letterSpacing: "0.08em", marginTop: 2 }}>
              {spec.subtitle}
            </div>
          </div>

          <div
            style={{
              position: "relative",
              width: TICKET_W,
              height: TICKET_H,
              margin: "0 auto",
              border: `3px solid ${spec.accent}`,
              background: spec.paper,
              touchAction: "none",
            }}
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
            onPointerCancel={onPointerUp}
          >
            {/* Revealed under-layer */}
            <UnderLayer ticket={ticket} phase={phase} accent={spec.accent} revealed={revealedCells} />
            {/* Foil canvas */}
            <canvas
              ref={canvasRef}
              width={TICKET_W}
              height={TICKET_H}
              className="scratch-foil"
              style={{
                position: "absolute",
                inset: 0,
                cursor: phase === "scratching" ? "grabbing" : "default",
                pointerEvents: phase === "scratching" ? "auto" : "none",
              }}
            />
            {/* Particle dust layer (above foil so it reads over the silver) */}
            <canvas
              ref={dustRef}
              width={TICKET_W}
              height={TICKET_H}
              style={{ position: "absolute", inset: 0, pointerEvents: "none" }}
            />
            {/* Coin overlay — DOM-translated each frame, no React re-render. */}
            {phase === "scratching" && (
              <div
                ref={coinElRef}
                aria-hidden
                className={`scratch-coin${coinDragging ? " is-dragging" : ""}`}
                style={{
                  position: "absolute",
                  width: COIN_R * 2,
                  height: COIN_R * 2,
                  pointerEvents: "none",
                  willChange: "transform",
                  filter: "drop-shadow(0 3px 0 rgba(0,0,0,0.45))",
                  transform: `translate3d(${TICKET_W / 2 - COIN_R}px, ${TICKET_H / 2 - COIN_R}px, 0)`,
                }}
              >
                <PixelCoin size={COIN_R * 2} dragging={coinDragging} />
              </div>
            )}
          </div>

          <div className="row" style={{ justifyContent: "space-between", marginTop: "var(--sp-3)", fontFamily: "var(--font-display)", fontSize: 11, letterSpacing: "0.06em", color: spec.accent }}>
            <span>BOUNTY: {ticket?.daily ? "FREE" : spec.cost.toLocaleString()} ¢</span>
            <span>SCRATCHED: {Math.round(scratchedFraction * 100)}%</span>
          </div>

          {streak >= 3 && <div aria-hidden className="scratch-flame" />}
        </div>

        {/* === Controls === */}
        <div className="stack-lg">
          {/* Tier picker */}
          <div className="panel">
            <div className="panel-title">Pick a Ticket</div>
            <div className="stack" style={{ gap: "var(--sp-2)" }}>
              {SCRATCH_DESIGN_ORDER.map((id) => {
                const d = SCRATCH_DESIGNS[id];
                const selected = id === design;
                return (
                  <button
                    key={id}
                    type="button"
                    className={`btn btn-block ${selected ? "" : "btn-ghost"}`}
                    style={{ justifyContent: "space-between", textAlign: "left" }}
                    disabled={busy || phase === "scratching"}
                    onClick={() => setDesign(id)}
                  >
                    <span>{d.name}</span>
                    <span style={{ color: "var(--gold-500)" }}>{d.cost.toLocaleString()} ¢</span>
                  </button>
                );
              })}
              <button
                className="btn btn-lg btn-block action-ready"
                disabled={busy || phase === "scratching"}
                onClick={() => buy()}
                style={{ fontSize: "var(--fs-h3)", marginTop: "var(--sp-2)" }}
              >
                {busy ? "..." : phase === "scratching" ? "Keep scratchin'..." : phase === "settled" ? "Buy Another" : "Buy & Scratch"}
              </button>
              <button
                type="button"
                className={`btn btn-success btn-block btn-sm${dailyReady ? " action-ready" : ""}`}
                disabled={busy || phase === "scratching" || !dailyReady}
                onClick={() => buy({ daily: true })}
              >
                {dailyReady
                  ? "★ Daily Free Ticket"
                  : `Daily Free in ${formatCountdownTo(dailyAt)}`}
              </button>
              {error && <p style={{ color: "var(--crimson-500)" }}>{error}</p>}
              {phase === "settled" && ticket && <ResultLine ticket={ticket} />}
            </div>
          </div>

          <div className="panel">
            <div className="panel-title">Sheriff Star Bounty</div>
            <div className="stack" style={{ gap: "var(--sp-2)" }}>
              <div className="row" style={{ gap: 4 }}>
                {Array.from({ length: STARS_PER_BONUS }).map((_, i) => {
                  const filled = i < Math.min(STARS_PER_BONUS, stars);
                  return (
                    <span
                      key={i}
                      style={{
                        width: 26, height: 26,
                        display: "inline-flex",
                        alignItems: "center", justifyContent: "center",
                        background: filled ? "var(--gold-300)" : "var(--parchment-200)",
                        border: "2px solid var(--ink-900)",
                        opacity: filled ? 1 : 0.55,
                      }}
                    >
                      {/* Same sheriff sprite as the ticket symbol so the
                          collection visually matches what the player is
                          looking for. */}
                      <ScratchSym name="sheriff" size={20} />
                    </span>
                  );
                })}
              </div>
              <p className="text-mute" style={{ fontSize: "var(--fs-small)" }}>
                Collect 5 stars across tickets to unlock the quick-draw round.
              </p>
              {stars >= STARS_PER_BONUS && (
                <button className="btn btn-block action-ready" onClick={() => setQuickDrawOpen(true)}>
                  Draw! ({stars} stars)
                </button>
              )}
              {streak >= 1 && (
                <p className="text-mute" style={{ fontSize: "var(--fs-small)" }}>Streak: {streak} 🔥</p>
              )}
            </div>
          </div>

          <div className="panel">
            <div className="panel-title">Prize Legend</div>
            <table style={{ width: "100%", fontFamily: "var(--font-display)", fontSize: 13 }}>
              <tbody>
                <LegendRow tier="Small win" payout="1× cost" odds="14.0%" />
                <LegendRow tier="Medium win" payout="3–5× cost" odds="3.0%" />
                <LegendRow tier="Large win" payout="15× cost" odds="0.95%" />
                <LegendRow tier="Jackpot" payout="300× cost" odds="0.05%" />
              </tbody>
            </table>
            <p className="text-mute" style={{ fontSize: "var(--fs-tiny)", marginTop: "var(--sp-2)" }}>
              3-in-a-row on the main grid pays the prize × multiplier square. Bonus row pays 0.3× cost per match (0.6× for rare lucky symbols).
            </p>
          </div>
        </div>
      </div>

      <BigWinOverlay
        open={bigWinOpen}
        payout={ticket?.payout ?? 0}
        jackpot={ticket?.tier === "jackpot"}
        onClose={() => setBigWinOpen(false)}
      />

      <QuickDrawModal
        open={quickDrawOpen}
        onOpened={consumeStars}
        onClose={() => setQuickDrawOpen(false)}
        onCreditedPayout={(_delta, bal) => { setBalance(bal); router.refresh(); }}
      />
    </div>
  );
}

// =============================================================
// Subcomponents
// =============================================================

function UnderLayer({
  ticket, phase, accent, revealed,
}: {
  ticket: ScratchOutcome | null;
  phase: Phase;
  accent: string;
  revealed: Set<string>;
}) {
  if (!ticket) {
    return (
      <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "var(--font-display)", color: accent, fontSize: 18, letterSpacing: "0.08em" }}>
        BUY A TICKET TO PLAY
      </div>
    );
  }
  const winSet = new Set(ticket.winLine ?? []);
  const nearSet = new Set(ticket.nearMissLine ?? []);
  const showWin = phase === "settled" && ticket.winLine !== null;
  const bonusMatchSet = new Set(ticket.bonusMatches);
  return (
    <div style={{ position: "absolute", inset: 0, padding: 12, display: "flex", flexDirection: "column", gap: 8 }}>
      {/* Lucky symbol corner + bonus row */}
      <div className="row" style={{ alignItems: "stretch", gap: 8 }}>
        <div
          data-cell-key="lucky"
          className={`scratch-cell scratch-cell-lucky${revealed.has("lucky") ? " is-revealed" : ""}`}
          style={{
            flex: "0 0 64px",
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            background: "var(--gold-100)",
            border: `3px solid ${accent}`,
            padding: 4,
          }}
        >
          <div style={{ fontFamily: "var(--font-display)", fontSize: 9, letterSpacing: "0.08em", color: accent }}>LUCKY</div>
          <ScratchSym name={ticket.luckySymbol} size={40} />
        </div>
        <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 4 }}>
          <div style={{ fontFamily: "var(--font-display)", fontSize: 10, letterSpacing: "0.08em", color: accent }}>
            BONUS ROW · MATCH THE LUCKY
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 4, flex: 1 }}>
            {ticket.bonusRow.map((s, i) => (
              <SymbolCell
                key={`b${i}`}
                cellKey={`b${i}`}
                symbol={s}
                accent={accent}
                isWinning={phase === "settled" && bonusMatchSet.has(i)}
                isRevealed={revealed.has(`b${i}`)}
              />
            ))}
          </div>
        </div>
      </div>

      {/* 3x3 main grid */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 6, flex: 1 }}>
        {ticket.grid.map((s, i) => (
          <SymbolCell
            key={`g${i}`}
            cellKey={`g${i}`}
            symbol={s}
            accent={accent}
            isWinning={showWin && winSet.has(i)}
            isNearMiss={!showWin && phase === "settled" && nearSet.has(i)}
            isRevealed={revealed.has(`g${i}`)}
          />
        ))}
      </div>

      {/* Multiplier square */}
      <div className="row" style={{ justifyContent: "space-between", alignItems: "center", paddingTop: 4 }}>
        <div style={{ fontFamily: "var(--font-display)", fontSize: 12, letterSpacing: "0.08em" }}>MULTIPLIER</div>
        <div style={{
          fontFamily: "var(--font-display)",
          fontSize: 26,
          color: "#9b2c2c",
          background: "#fef6e4",
          border: `3px solid ${accent}`,
          padding: "2px 18px",
        }}>
          {ticket.multiplier}×
        </div>
      </div>
    </div>
  );
}

function SymbolCell({
  cellKey, symbol, accent, isWinning, isNearMiss, isRevealed,
}: {
  cellKey: string;
  symbol: ScratchSymbol;
  accent: string;
  isWinning?: boolean;
  isNearMiss?: boolean;
  isRevealed?: boolean;
}) {
  return (
    <div
      data-cell-key={cellKey}
      className={`scratch-cell${isRevealed ? " is-revealed" : ""}`}
      style={{
        background: "#fef6e4",
        border: `3px solid ${isWinning ? "var(--gold-300)" : accent}`,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        boxShadow: isWinning
          ? "0 0 14px rgba(245,200,66,0.7)"
          : isNearMiss ? "0 0 10px rgba(155,44,44,0.45)"
          : undefined,
        animation: isWinning
          ? "scratch-cell-pulse 0.9s ease-in-out infinite"
          : isNearMiss ? "scratch-cell-near 1.6s ease-in-out infinite"
          : undefined,
        minWidth: 0,
        minHeight: 0,
      }}
    >
      <ScratchSym name={symbol} size={42} />
    </div>
  );
}

function LegendRow({ tier, payout, odds }: { tier: string; payout: string; odds: string }) {
  return (
    <tr style={{ borderBottom: "2px dashed var(--saddle-300)" }}>
      <td style={{ padding: "6px 0" }}>{tier}</td>
      <td style={{ padding: "6px 0", textAlign: "right" }}>{payout}</td>
      <td style={{ padding: "6px 0", textAlign: "right", color: "var(--saddle-400)" }}>{odds}</td>
    </tr>
  );
}

function ResultLine({ ticket }: { ticket: ScratchOutcome }) {
  if (ticket.payout > 0) {
    const tone =
      ticket.tier === "jackpot" ? "var(--gold-300)"
      : ticket.tier === "large" ? "var(--gold-500)"
      : "var(--cactus-500)";
    return (
      <div className="sign" style={{ display: "block", textAlign: "center", background: tone, color: "var(--ink-900)" }}>
        +{ticket.payout.toLocaleString()} ¢
        {ticket.bonusPayout > 0 && (
          <div style={{ fontSize: 12, opacity: 0.85, marginTop: 2 }}>
            (incl. {ticket.bonusPayout.toLocaleString()} bonus row)
          </div>
        )}
      </div>
    );
  }
  return (
    <p className="text-mute" style={{ fontFamily: "var(--font-display)", textAlign: "center", letterSpacing: "var(--ls-loose)" }}>
      Better luck, pardner.
    </p>
  );
}

// =============================================================
// Helpers
// =============================================================

type Particle = { x: number; y: number; vx: number; vy: number; life: number; maxLife: number; color: string };

function spawnDust(particles: Particle[], x: number, y: number, color: string) {
  const n = 4 + Math.floor(Math.random() * 5); // 4..8 per tick
  for (let i = 0; i < n; i++) {
    const angle = Math.random() * Math.PI * 2;
    const speed = 30 + Math.random() * 80;
    particles.push({
      x, y,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed - 30,
      life: 0,
      maxLife: 500 + Math.random() * 200,
      color,
    });
  }
  // Cap to avoid runaway accumulation.
  if (particles.length > 240) particles.splice(0, particles.length - 240);
}

function stepParticles(particles: Particle[], canvas: HTMLCanvasElement | null) {
  if (!canvas) return;
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  const dt = 16; // ~ms per frame; we don't time-correct since particles are visual only.
  for (let i = particles.length - 1; i >= 0; i--) {
    const p = particles[i];
    p.life += dt;
    if (p.life > p.maxLife) { particles.splice(i, 1); continue; }
    p.vy += 320 * (dt / 1000); // gravity
    p.x += p.vx * (dt / 1000);
    p.y += p.vy * (dt / 1000);
    const a = 1 - p.life / p.maxLife;
    ctx.fillStyle = withAlpha(p.color, a * 0.85);
    ctx.fillRect(p.x | 0, p.y | 0, 2, 2);
  }
}

function withAlpha(hex: string, a: number): string {
  // Accept #rgb or #rrggbb; fall back to silver if unparseable.
  let h = hex.startsWith("#") ? hex.slice(1) : hex;
  if (h.length === 3) h = h.split("").map((c) => c + c).join("");
  if (h.length !== 6) h = "c4c4c4";
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${a.toFixed(3)})`;
}

// Lazy-loaded foil texture. Saved at /textures/scratch-foil.jpg —
// shared across every ticket buy. We start the load on module init
// so the first ticket isn't waiting on the round-trip.
const FOIL_TEXTURE_SRC = "/textures/scratch-foil.jpg";
let _foilTextureImg: HTMLImageElement | null = null;
let _foilTextureLoaded = false;

function ensureFoilTexture(onReady?: () => void) {
  if (typeof window === "undefined") return null;
  if (!_foilTextureImg) {
    _foilTextureImg = new Image();
    _foilTextureImg.crossOrigin = "anonymous";
    _foilTextureImg.onload = () => {
      _foilTextureLoaded = true;
      onReady?.();
    };
    _foilTextureImg.src = FOIL_TEXTURE_SRC;
  } else if (_foilTextureLoaded) {
    // Already loaded — caller can paint immediately.
    onReady?.();
  }
  return _foilTextureImg;
}

function paintFoil(c: HTMLCanvasElement | null, spec: ScratchDesignSpec) {
  if (!c) return;
  const ctx = c.getContext("2d");
  if (!ctx) return;
  const dpr = window.devicePixelRatio || 1;
  c.width = TICKET_W * dpr;
  c.height = TICKET_H * dpr;
  c.style.width = `${TICKET_W}px`;
  c.style.height = `${TICKET_H}px`;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

  function paintWithTexture() {
    // Re-fetch ctx in case caller called multiple times (it's the
    // same context so this is just a guard).
    const cx = c!.getContext("2d");
    if (!cx) return;
    cx.setTransform(dpr, 0, 0, dpr, 0, 0);
    cx.imageSmoothingEnabled = true;

    // 1) Lay the grey foil texture down as the base. Tile it so the
    //    grain reads at full resolution regardless of canvas aspect.
    const tex = _foilTextureImg!;
    const tw = tex.naturalWidth || 320;
    const th = tex.naturalHeight || 240;
    // Cover the canvas with whole-tile copies, no scaling, so the
    // grain stays sharp.
    for (let y = 0; y < TICKET_H; y += th) {
      for (let x = 0; x < TICKET_W; x += tw) {
        cx.drawImage(tex, x, y);
      }
    }

    // 2) Multiply-tint with the design's mid foil colour. The
    //    `multiply` blend keeps the texture grain visible while
    //    pulling the entire surface toward the target hue.
    cx.globalCompositeOperation = "multiply";
    cx.fillStyle = spec.foil[1];
    cx.fillRect(0, 0, TICKET_W, TICKET_H);

    // 3) Edge vignette — same blend mode but using the darker stop
    //    keeps corners feeling slightly weather-worn.
    const vg = cx.createRadialGradient(
      TICKET_W / 2, TICKET_H / 2, Math.min(TICKET_W, TICKET_H) * 0.35,
      TICKET_W / 2, TICKET_H / 2, Math.max(TICKET_W, TICKET_H) * 0.7,
    );
    vg.addColorStop(0, "rgba(255,255,255,0)");
    vg.addColorStop(1, spec.foil[0]);
    cx.fillStyle = vg;
    cx.fillRect(0, 0, TICKET_W, TICKET_H);

    cx.globalCompositeOperation = "source-over";

    // 4) "SCRATCH HERE" pixel-font heading + subline.
    cx.save();
    cx.translate(TICKET_W / 2, TICKET_H / 2);
    cx.rotate(-Math.PI / 16);
    cx.fillStyle = "rgba(26,15,8,0.55)";
    cx.textAlign = "center";
    cx.textBaseline = "middle";
    cx.font = "bold 36px M6X11, monospace";
    cx.fillText("SCRATCH HERE", 0, 0);
    cx.font = "16px M6X11, monospace";
    cx.fillText("DRAG THE COIN", 0, 26);
    cx.restore();
  }

  // Lay a quick fallback fill so the canvas isn't transparent in the
  // tiny window between mount and image-loaded.
  ctx.fillStyle = spec.foil[1];
  ctx.fillRect(0, 0, TICKET_W, TICKET_H);

  ensureFoilTexture(paintWithTexture);
  if (_foilTextureLoaded) paintWithTexture();
}

function paintDustClear(c: HTMLCanvasElement | null) {
  if (!c) return;
  const dpr = window.devicePixelRatio || 1;
  c.width = TICKET_W * dpr; c.height = TICKET_H * dpr;
  c.style.width = `${TICKET_W}px`; c.style.height = `${TICKET_H}px`;
  const ctx = c.getContext("2d");
  if (ctx) ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
}

/**
 * Read the alpha channel of a single getImageData call covering the
 * whole foil canvas, sample on a coarse grid. One read is way cheaper
 * than 18×18 single-pixel reads.
 */
function computeScratchedFraction(c: HTMLCanvasElement): number {
  const ctx = c.getContext("2d");
  if (!ctx) return 0;
  const STEP = 18;
  const w = c.width, h = c.height;
  const img = ctx.getImageData(0, 0, w, h);
  const data = img.data;
  let total = 0, cleared = 0;
  for (let y = 0; y < h; y += STEP) {
    for (let x = 0; x < w; x += STEP) {
      const idx = (y * w + x) * 4 + 3;
      total++;
      if (data[idx] < 32) cleared++;
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

function formatCountdownTo(iso: string | null): string {
  if (!iso) return "...";
  const ms = Math.max(0, new Date(iso).getTime() - Date.now());
  const total = Math.floor(ms / 1000);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  if (h > 0) return `${h}h ${m}m`;
  if (m > 0) return `${m}m`;
  return `${s}s`;
}
