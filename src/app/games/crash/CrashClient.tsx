"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { BetInput } from "@/components/BetInput";
import * as Sfx from "@/lib/sfx";
import { GameEvent } from "@/components/GameEvent";
import { useLive } from "@/components/social/LiveProvider";
import { multiplierAt } from "@/lib/games/crash/engine";
import { getBrowserClient } from "@/lib/supabase/browser";

type RoundView = {
  id: string;
  roundNo: number;
  status: "betting" | "running" | "crashed";
  betCloseAt: string | null;
  startedAt: string | null;
  endedAt: string | null;
  crashAtX: number | null;
};

type BetView = {
  userId: string;
  amount: number;
  cashoutX: number | null;
  payout: number;
};

type HistoryRound = {
  id: string;
  roundNo: number;
  crashAtX: number;
};

const POLL_MS = 1000;
const HISTORY_LEN = 20;

// Y-axis: log-scaled so the curve climbs naturally instead of always being
// pinned to the top of the canvas. yMax is the displayed ceiling — auto-grows
// as the multiplier climbs.
const Y_BASE_MAX = 4.0;

// Particle for the comet trail behind the leading edge.
type Trail = { x: number; y: number; life: number };
// Particle for the crash explosion.
type Spark = { x: number; y: number; vx: number; vy: number; life: number; color: string };

export function CrashClient() {
  const router = useRouter();
  const { presence } = useLive();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [bet, setBet] = useState(1_000);
  const [autoCashAt, setAutoCashAt] = useState(2);
  const [autoEnabled, setAutoEnabled] = useState(false);
  const [round, setRound] = useState<RoundView | null>(null);
  const [bets, setBets] = useState<BetView[]>([]);
  const [history, setHistory] = useState<HistoryRound[]>([]);
  const [serverOffsetMs, setServerOffsetMs] = useState(0);
  const [liveX, setLiveX] = useState(1.0);
  // Random "engine sputter" event — purely visual: when active, the
  // displayed multiplier freezes for 1.5s mid-flight. EV unchanged
  // (the bust point was committed when the round opened) — it just
  // adds a spike of tension. Rolled per round.
  const [sputterUntil, setSputterUntil] = useState<number | null>(null);
  const sputterFrozenRef = useRef<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [balance, setBalance] = useState<number | null>(null);

  const meRef = useRef<string | null>(null);
  const phaseRef = useRef<RoundView["status"] | null>(null);
  const autoRef = useRef<{ on: boolean; at: number }>({ on: false, at: 2 });
  const cashedThisRoundRef = useRef(false);
  // Optimistic cashout lock — populated the instant the player taps
  // (or the auto-cashout rule fires), before the server has confirmed.
  // Cleared once myBet.cashoutX comes back from the server, or on
  // round change.
  const [pendingCashoutAt, setPendingCashoutAt] = useState<number | null>(null);
  // Refs for the render loop so it always sees the freshest values without
  // re-creating its closure (the rAF loop is now mounted once).
  const roundRef = useRef<RoundView | null>(null);
  const offsetRef = useRef(0);
  const betsRef = useRef<BetView[]>([]);
  useEffect(() => { autoRef.current = { on: autoEnabled, at: autoCashAt }; }, [autoEnabled, autoCashAt]);
  useEffect(() => { phaseRef.current = round?.status ?? null; roundRef.current = round; }, [round]);
  useEffect(() => { offsetRef.current = serverOffsetMs; }, [serverOffsetMs]);
  useEffect(() => { betsRef.current = bets; }, [bets]);

  // Get my user id once
  useEffect(() => {
    fetch("/api/auth/me").then((r) => r.json()).then((d) => {
      meRef.current = d.user?.id ?? null;
      setBalance(d.balance ?? null);
    });
  }, []);

  // Reset cash-this-round flag + pending optimistic lock when round id changes.
  useEffect(() => {
    cashedThisRoundRef.current = false;
    setPendingCashoutAt(null);
  }, [round?.id]);

  // Poll round state
  async function refreshState() {
    try {
      const res = await fetch("/api/games/crash/state");
      if (!res.ok) return;
      const data = await res.json();
      const localNow = Date.now();
      const offset = (data.serverNow ?? localNow) - localNow;
      setServerOffsetMs(offset);
      setRound(data.round ?? null);
      setBets(data.bets ?? []);
    } catch {
      // ignore
    }
  }

  async function refreshHistory() {
    try {
      const res = await fetch("/api/games/crash/history");
      if (!res.ok) return;
      const data = await res.json();
      setHistory(data.rounds ?? []);
    } catch {
      // ignore
    }
  }

  useEffect(() => {
    refreshState();
    refreshHistory();
    const t = setInterval(refreshState, POLL_MS);
    return () => clearInterval(t);
  }, []);

  // Refresh history whenever a round transitions out of "crashed".
  useEffect(() => {
    if (round?.status === "crashed") {
      refreshHistory();
      Sfx.play("ui.notify");
    }
  }, [round?.status, round?.id]);

  // Realtime: react instantly to crash_rounds + crash_bets changes.
  useEffect(() => {
    const supa = getBrowserClient();
    if (!supa) return;
    const ch = supa.channel("lg-crash-feed");
    ch.on("postgres_changes", { event: "*", schema: "public", table: "crash_rounds" }, () => { refreshState(); refreshHistory(); })
      .on("postgres_changes", { event: "*", schema: "public", table: "crash_bets" }, () => refreshState())
      .subscribe();
    return () => { supa.removeChannel(ch); };
  }, []);

  // Animation loop — mounted once, reads everything via refs.
  useEffect(() => {
    let raf = 0;
    const points: { t: number; x: number }[] = [];
    const trail: Trail[] = [];
    const sparks: Spark[] = [];
    let yMax = Y_BASE_MAX;
    let lastFrameMs = performance.now();
    let lastSeenRoundId: string | null = null;
    let crashHandled = false;
    let shake = 0;

    function frame(now: number) {
      const dt = Math.min(0.05, (now - lastFrameMs) / 1000);
      lastFrameMs = now;
      const r = roundRef.current;

      // Reset on round change
      if (r?.id !== lastSeenRoundId) {
        lastSeenRoundId = r?.id ?? null;
        points.length = 0;
        trail.length = 0;
        sparks.length = 0;
        yMax = Y_BASE_MAX;
        crashHandled = false;
        shake = 0;
        // Roll engine-sputter for this round. ~8% chance, fires once
        // somewhere between t=2s and t=8s (skip the very start; skip
        // post-bust). Cleared on next round.
        if (r?.status === "betting" || r?.status === "running") {
          if (Math.random() < 0.08) {
            const fireAt = Date.now() + 2000 + Math.random() * 6000;
            window.setTimeout(() => {
              sputterFrozenRef.current = liveX;
              setSputterUntil(Date.now() + 1500);
              window.setTimeout(() => {
                sputterFrozenRef.current = null;
                setSputterUntil(null);
              }, 1500);
            }, Math.max(0, fireAt - Date.now()));
          }
        }
      }

      if (r?.status === "running" && r.startedAt) {
        const startMs = new Date(r.startedAt).getTime();
        const elapsed = (Date.now() + offsetRef.current - startMs) / 1000;
        const m = multiplierAt(elapsed);
        // Sputter freezes the *displayed* multiplier; the underlying
        // m keeps climbing so auto-cashout + curve geometry stay
        // truthful. EV unchanged.
        if (sputterFrozenRef.current === null) setLiveX(m);
        points.push({ t: elapsed, x: m });
        if (points.length > 1200) points.shift();
        // Grow yMax smoothly so the curve has headroom.
        const wanted = Math.max(Y_BASE_MAX, m * 1.25);
        yMax += (wanted - yMax) * Math.min(1, dt * 4);

        // Auto-cashout. cashout() itself flips cashedThisRoundRef so
        // we don't pre-set it here — doing so caused cashout()'s
        // re-entry guard to early-return without firing the request.
        if (autoRef.current.on && !cashedThisRoundRef.current) {
          const myBet = betsRef.current.find((b) => b.userId === meRef.current);
          if (myBet && myBet.cashoutX === null && m >= autoRef.current.at) {
            cashout();
          }
        }
      } else if (r?.status === "crashed" && r.crashAtX !== null) {
        setLiveX(r.crashAtX);
        if (!crashHandled && points.length > 0) {
          crashHandled = true;
          shake = 1;
          // Spawn an explosion at the crash point.
          const last = points[points.length - 1];
          const W = canvasRef.current?.width ?? 520;
          const H = canvasRef.current?.height ?? 200;
          const tMax = Math.max(8, last.t * 1.05);
          const px = (last.t / tMax) * W;
          const py = projectY(last.x, yMax, H);
          for (let i = 0; i < 26; i++) {
            const angle = Math.random() * Math.PI * 2;
            const speed = 80 + Math.random() * 220;
            sparks.push({
              x: px,
              y: py,
              vx: Math.cos(angle) * speed,
              vy: Math.sin(angle) * speed,
              life: 0.7 + Math.random() * 0.5,
              color: Math.random() < 0.5 ? "#ff5544" : "#f5c842",
            });
          }
        }
        // Apply gravity + decay to sparks
        for (const s of sparks) {
          s.x += s.vx * dt;
          s.y += s.vy * dt;
          s.vy += 240 * dt;
          s.life -= dt;
        }
        for (let i = sparks.length - 1; i >= 0; i--) if (sparks[i].life <= 0) sparks.splice(i, 1);
        shake = Math.max(0, shake - dt * 1.4);
      } else {
        setLiveX(1.0);
      }

      // Trail behind leading edge — only when running
      if (r?.status === "running" && points.length > 0) {
        const last = points[points.length - 1];
        trail.push({ x: last.t, y: last.x, life: 0.6 });
      }
      for (const t of trail) t.life -= dt;
      for (let i = trail.length - 1; i >= 0; i--) if (trail[i].life <= 0) trail.splice(i, 1);

      drawCurve(points, trail, sparks, yMax, shake);
      raf = requestAnimationFrame(frame);
    }

    function projectY(x: number, max: number, H: number): number {
      // Log-mapped y so 1× sits at bottom and yMax sits near top.
      const minLog = 0; // log(1) = 0
      const span = Math.log(max);
      const v = Math.log(Math.max(1, x));
      const ratio = (v - minLog) / Math.max(0.001, span);
      const margin = 14;
      return H - margin - ratio * (H - margin * 2);
    }

    function drawCurve(
      pts: { t: number; x: number }[],
      trailList: Trail[],
      sparksList: Spark[],
      curYMax: number,
      shakeAmt: number,
    ) {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const ctx = canvas.getContext("2d");
      if (!ctx) return;
      const W = canvas.width, H = canvas.height;
      const r = roundRef.current;
      const isRunning = r?.status === "running";
      const isCrashed = r?.status === "crashed";

      // Apply shake
      ctx.save();
      if (shakeAmt > 0.01) {
        const a = shakeAmt * 8;
        ctx.translate((Math.random() - 0.5) * a, (Math.random() - 0.5) * a);
      }

      // Background (vertical gradient saddle → ink)
      const bg = ctx.createLinearGradient(0, 0, 0, H);
      bg.addColorStop(0, "#3d2418");
      bg.addColorStop(1, "#1a0f08");
      ctx.fillStyle = bg;
      ctx.fillRect(0, 0, W, H);

      // Subtle starfield (deterministic from canvas size, looks ambient)
      ctx.fillStyle = "rgba(255, 246, 228, 0.18)";
      for (let i = 0; i < 18; i++) {
        const sx = (i * 73) % W;
        const sy = (i * 41) % H;
        ctx.fillRect(sx, sy, 1, 1);
      }

      // Y-axis multiplier guidelines (log-spaced)
      const guidelines = [1.5, 2, 3, 5, 10, 20, 50, 100].filter((g) => g <= curYMax * 1.2);
      ctx.strokeStyle = "rgba(244, 219, 160, 0.12)";
      ctx.lineWidth = 1;
      ctx.font = "11px 'M6X11', monospace";
      ctx.fillStyle = "rgba(244, 219, 160, 0.45)";
      ctx.textAlign = "left";
      ctx.textBaseline = "middle";
      for (const g of guidelines) {
        if (g > curYMax) continue;
        const y = projectY(g, curYMax, H);
        ctx.beginPath(); ctx.moveTo(28, y); ctx.lineTo(W, y); ctx.stroke();
        ctx.fillText(`${g}×`, 4, y);
      }

      // Time tick marks every 2s
      const last = pts[pts.length - 1];
      const tMax = Math.max(8, last ? last.t * 1.05 : 8);
      ctx.strokeStyle = "rgba(244, 219, 160, 0.08)";
      for (let s = 2; s <= tMax; s += 2) {
        const x = (s / tMax) * W;
        ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, H); ctx.stroke();
      }

      if (pts.length < 2) {
        ctx.restore();
        return;
      }

      // Build the curve path once (used for both fill and stroke).
      const path = new Path2D();
      path.moveTo(0, H);
      for (let i = 0; i < pts.length; i++) {
        const px = (pts[i].t / tMax) * W;
        const py = projectY(pts[i].x, curYMax, H);
        if (i === 0) path.moveTo(px, py); else path.lineTo(px, py);
      }

      // Filled area under the curve
      const fillPath = new Path2D();
      fillPath.moveTo(0, H);
      const startY = projectY(pts[0].x, curYMax, H);
      fillPath.lineTo((pts[0].t / tMax) * W, startY);
      for (let i = 1; i < pts.length; i++) {
        fillPath.lineTo((pts[i].t / tMax) * W, projectY(pts[i].x, curYMax, H));
      }
      const lastPx = (last.t / tMax) * W;
      fillPath.lineTo(lastPx, H);
      fillPath.closePath();
      const fillGrad = ctx.createLinearGradient(0, 0, 0, H);
      if (isCrashed) {
        fillGrad.addColorStop(0, "rgba(224, 90, 60, 0.45)");
        fillGrad.addColorStop(1, "rgba(224, 90, 60, 0.00)");
      } else {
        fillGrad.addColorStop(0, "rgba(245, 200, 66, 0.45)");
        fillGrad.addColorStop(1, "rgba(245, 200, 66, 0.00)");
      }
      ctx.fillStyle = fillGrad;
      ctx.fill(fillPath);

      // Glow pass (line, wider + soft)
      const lineColor = isCrashed ? "#ff5544" : tierColor(last.x);
      ctx.strokeStyle = lineColor;
      ctx.lineCap = "round";
      ctx.lineJoin = "round";
      ctx.shadowColor = lineColor;
      ctx.shadowBlur = isRunning ? 16 : 8;
      ctx.lineWidth = 6;
      ctx.stroke(path);
      // Sharp pass over the top
      ctx.shadowBlur = 0;
      ctx.lineWidth = 3;
      ctx.strokeStyle = isCrashed ? "#ffb8a8" : "#ffe9a8";
      ctx.stroke(path);

      // Trail dots fading behind the leading edge
      for (const t of trailList) {
        const tx = (t.x / tMax) * W;
        const ty = projectY(t.y, curYMax, H);
        const a = Math.max(0, t.life / 0.6);
        ctx.fillStyle = `rgba(245, 200, 66, ${a * 0.45})`;
        ctx.beginPath();
        ctx.arc(tx, ty, 2 + a * 2, 0, Math.PI * 2);
        ctx.fill();
      }

      // Comet head (only while running)
      if (isRunning) {
        const px = lastPx;
        const py = projectY(last.x, curYMax, H);
        const pulse = (Math.sin(performance.now() / 120) + 1) / 2;
        ctx.shadowColor = lineColor;
        ctx.shadowBlur = 18 + pulse * 8;
        ctx.fillStyle = "#fef6e4";
        ctx.beginPath();
        ctx.arc(px, py, 5 + pulse * 1.4, 0, Math.PI * 2);
        ctx.fill();
        ctx.shadowBlur = 0;
        // Inner core
        ctx.fillStyle = lineColor;
        ctx.beginPath();
        ctx.arc(px, py, 3, 0, Math.PI * 2);
        ctx.fill();
      }

      // Sparks (crash explosion)
      for (const s of sparksList) {
        const a = Math.max(0, s.life);
        ctx.fillStyle = s.color;
        ctx.globalAlpha = a;
        ctx.fillRect(s.x - 1.5, s.y - 1.5, 3, 3);
        ctx.globalAlpha = 1;
      }

      // CRASHED stamp
      if (isCrashed) {
        ctx.fillStyle = "rgba(224, 90, 60, 0.18)";
        ctx.fillRect(0, 0, W, H);
        ctx.fillStyle = "#ff5544";
        ctx.font = "bold 28px 'M6X11', monospace";
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.shadowColor = "rgba(0,0,0,0.8)";
        ctx.shadowBlur = 6;
        ctx.fillText(`✕ ${r?.crashAtX?.toFixed(2)}×`, W / 2, H / 2);
        ctx.shadowBlur = 0;
      }

      ctx.restore();
    }

    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
    // Mount once — refs supply current state to the loop.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function placeBet() {
    setBusy(true);
    setError(null);
    Sfx.play("chip.lay");
    const res = await fetch("/api/games/crash/bet", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ bet }),
    });
    const data = await res.json();
    setBusy(false);
    if (!res.ok) {
      setError(labelFor(data.error ?? "error"));
      return;
    }
    setBalance(data.balance);
    refreshState();
    router.refresh();
  }

  async function cashout() {
    // Optimistic lock — flip the local state instantly so the readout
    // stops climbing, the cashout button disables, and the win SFX
    // fires the moment the player taps. The fetch is fire-and-forget
    // for the UI; we still await it to grab the server's authoritative
    // balance and roll back on failure.
    if (cashedThisRoundRef.current) return;
    cashedThisRoundRef.current = true;
    const lockedAt = liveX;
    setPendingCashoutAt(lockedAt);
    Sfx.play("chips.stack");
    setBusy(true);
    const res = await fetch("/api/games/crash/cashout", { method: "POST" });
    const data = await res.json();
    setBusy(false);
    if (!res.ok) {
      // Bust between click and server. Revert the optimistic lock.
      cashedThisRoundRef.current = false;
      setPendingCashoutAt(null);
      setError(labelFor(data.error ?? "error"));
      return;
    }
    setBalance(data.balance);
    refreshState();
    router.refresh();
  }

  // Compute betting countdown
  const myBet = bets.find((b) => b.userId === meRef.current);
  const myCashedOut = myBet?.cashoutX !== null && myBet?.cashoutX !== undefined;
  const isBetting = round?.status === "betting";
  const isRunning = round?.status === "running";
  const isCrashed = round?.status === "crashed";
  const secondsLeft = isBetting && round?.betCloseAt
    ? Math.max(0, Math.ceil((new Date(round.betCloseAt).getTime() - Date.now() - serverOffsetMs) / 1000))
    : 0;

  // Cooldown countdown after a crash. Mirrors COOLDOWN_AFTER_CRASH_MS in the scheduler.
  const COOLDOWN_MS = 7_000;
  const nextRoundIn = isCrashed && round?.endedAt
    ? Math.max(0, Math.ceil((new Date(round.endedAt).getTime() + COOLDOWN_MS - Date.now() - serverOffsetMs) / 1000))
    : 0;

  // Player tag lookup from presence
  function tagFor(userId: string) {
    return presence.find((p) => p.userId === userId);
  }

  return (
    <div className="grid grid-2 crash-grid" style={{ alignItems: "start" }}>
      <div className="panel crash-stage" style={{ padding: "var(--sp-6)" }}>
        <GameEvent
          active={sputterUntil !== null}
          icon="⚙"
          title="Engine Sputter"
          body="The multiplier froze for a second. The bust point hasn't moved."
          tone="crimson"
        />
        <div className="panel-title">
          {isBetting ? `Round #${round?.roundNo ?? "—"} · Betting opens` :
           isRunning ? `Round #${round?.roundNo ?? "—"} · LIVE` :
           isCrashed ? `Round #${round?.roundNo ?? "—"} · Crashed` :
           "Loading..."}
        </div>

        {/* History strip */}
        <HistoryStrip history={history} liveCrashAt={isCrashed ? round?.crashAtX ?? null : null} />

        <div
          className="center"
          style={{
            background: "var(--saddle-500)",
            border: "4px solid var(--ink-900)",
            padding: "var(--sp-5)",
            position: "relative",
            flexDirection: "column",
            gap: "var(--sp-3)",
            overflow: "hidden",
          }}
        >
          {/* Big multiplier readout — keeps ticking up live until
              bust, even after the player has cashed out, so they can
              see whether they left money on the table. The cashout
              point is shown separately as a smaller sub-line below. */}
          {(() => {
            const lockedAt = myBet?.cashoutX ?? pendingCashoutAt ?? null;
            const cashed = lockedAt !== null;
            return (
              <div
                className="crash-readout"
                style={{
                  fontFamily: "var(--font-display)",
                  fontSize: 88,
                  lineHeight: 1,
                  color: isCrashed ? "var(--crimson-300)" : (cashed ? "var(--cactus-300)" : tierColor(liveX)),
                  textShadow: isCrashed
                    ? "4px 4px 0 var(--ink-900), 0 0 24px rgba(255, 85, 68, 0.8)"
                    : `4px 4px 0 var(--ink-900), 0 0 ${Math.min(40, 8 + liveX * 2)}px ${tierGlow(liveX)}`,
                  transform: isRunning ? `scale(${1 + Math.min(0.04, liveX * 0.005)})` : "none",
                  transition: "transform 120ms var(--ease-snap), color 200ms var(--ease-out)",
                }}
              >
                {isBetting ? `${secondsLeft}s` : `${liveX.toFixed(2)}×`}
              </div>
            );
          })()}
          {/* Cashout indicator — separate sub-line so the live
              multiplier above stays uninterrupted. */}
          {!isBetting && (myBet?.cashoutX !== null && myBet?.cashoutX !== undefined || pendingCashoutAt !== null) && (
            <div
              style={{
                fontFamily: "var(--font-display)",
                fontSize: 22,
                color: "var(--cactus-300)",
                textShadow: "2px 2px 0 var(--ink-900)",
                letterSpacing: "var(--ls-loose)",
                textTransform: "uppercase",
              }}
            >
              ✓ Cashed at {(myBet?.cashoutX ?? pendingCashoutAt ?? 0).toFixed(2)}×
            </div>
          )}
          {isCrashed && (
            <div
              style={{
                fontFamily: "var(--font-display)",
                fontSize: 24,
                color: "var(--crimson-300)",
                textShadow: "2px 2px 0 var(--ink-900)",
                letterSpacing: "var(--ls-loose)",
                textTransform: "uppercase",
                animation: "crashShake 0.5s var(--ease-snap)",
              }}
            >
              ✕ BUSTED
            </div>
          )}
          <div style={{ fontFamily: "var(--font-display)", fontSize: 14, color: "var(--parchment-200)" }}>
            {isBetting ? "Place your bet" :
             isRunning ? (myCashedOut ? `Cashed at ${myBet?.cashoutX?.toFixed(2)}×` : myBet ? "Cash out before bust" : "Watching this round") :
             isCrashed ? `Bust at ${round?.crashAtX?.toFixed(2)}× — next round in ${nextRoundIn}s` : "..."}
          </div>
          <canvas
            ref={canvasRef}
            className="crash-canvas"
            width={520}
            height={220}
            style={{
              imageRendering: "auto",
              border: "3px solid var(--ink-900)",
              maxWidth: "100%",
              width: "100%",
              height: "auto",
              display: "block",
            }}
          />
          <style>{`
            @keyframes crashShake {
              0% { transform: translateX(0); }
              25% { transform: translateX(-6px); }
              50% { transform: translateX(6px); }
              75% { transform: translateX(-3px); }
              100% { transform: translateX(0); }
            }
          `}</style>
        </div>

        {error && <p style={{ color: "var(--crimson-500)", marginTop: "var(--sp-3)" }}>{error}</p>}
      </div>

      <div className="stack-lg crash-side">
        {/* Bet placement / cashout panel */}
        <div className="panel crash-controls" style={{ padding: "var(--sp-6)" }}>
          <div className="panel-title">
            {myBet
              ? isRunning && !myCashedOut ? "Cash Out" : "This Round"
              : "Place Your Bet"}
          </div>

          {myBet && isRunning && !myCashedOut && pendingCashoutAt === null && (
            <div className="stack-lg">
              <p className="text-mute">Your bet: {myBet.amount.toLocaleString()} ¢</p>
              <button className="btn btn-lg btn-block btn-danger" onClick={cashout} disabled={busy}>
                Cash Out at {liveX.toFixed(2)}× (+{Math.floor(myBet.amount * liveX).toLocaleString()} ¢)
              </button>
            </div>
          )}

          {myBet && pendingCashoutAt !== null && !myCashedOut && !isCrashed && (
            <div className="stack-lg">
              <p style={{ color: "var(--cactus-500)" }}>
                Cashed at {pendingCashoutAt.toFixed(2)}× → +{(Math.floor(myBet.amount * pendingCashoutAt) - myBet.amount).toLocaleString()} ¢
              </p>
              <p className="text-mute" style={{ fontSize: 12 }}>Confirming…</p>
            </div>
          )}

          {myBet && (myCashedOut || isCrashed) && (
            <div className="stack-lg">
              <p className="text-mute">Bet: {myBet.amount.toLocaleString()} ¢</p>
              {myCashedOut ? (
                <p style={{ color: "var(--cactus-500)" }}>
                  Cashed at {myBet.cashoutX!.toFixed(2)}× → +{(myBet.payout - myBet.amount).toLocaleString()} ¢
                </p>
              ) : (
                <p style={{ color: "var(--crimson-500)" }}>Busted at {round?.crashAtX?.toFixed(2)}×</p>
              )}
              <p className="text-mute" style={{ fontSize: 12 }}>Next round opens shortly...</p>
            </div>
          )}

          {!myBet && (
            <div className="stack-lg">
              <BetInput value={bet} onChange={setBet} max={Math.max(100, balance ?? 100)} disabled={busy || !isBetting} />
              <div>
                <label className="label">Auto Cashout</label>
                <div className="row">
                  <button
                    type="button"
                    className={`btn btn-sm ${autoEnabled ? "" : "btn-ghost"}`}
                    onClick={() => setAutoEnabled((x) => !x)}
                  >
                    {autoEnabled ? "ON" : "OFF"}
                  </button>
                  <input
                    type="number"
                    step="0.1"
                    min="1.01"
                    max="100"
                    value={autoCashAt}
                    onChange={(e) => setAutoCashAt(Math.max(1.01, Number(e.target.value) || 2))}
                    style={{ width: 100 }}
                  />
                  <span className="text-mute">×</span>
                </div>
              </div>
              <button
                className="btn btn-lg btn-block"
                onClick={placeBet}
                disabled={busy || !isBetting || bet < 100 || (balance != null && balance < bet)}
              >
                {!isBetting
                  ? isCrashed
                    ? `Next round in ${nextRoundIn}s`
                    : "Wait for next round..."
                  : `Bet ${bet.toLocaleString()} ¢`}
              </button>
            </div>
          )}
        </div>

        {/* Players in this round */}
        <div className="panel" style={{ padding: "var(--sp-6)" }}>
          <div className="panel-title">Players ({bets.length})</div>
          {bets.length === 0 ? (
            <p className="text-mute">No bets yet this round.</p>
          ) : (
            <div className="stack" style={{ gap: 6 }}>
              {bets.map((b) => {
                const tag = tagFor(b.userId);
                const out = b.cashoutX !== null && b.cashoutX !== undefined;
                const busted = isCrashed && !out;
                return (
                  <div
                    key={b.userId}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 8,
                      padding: "6px 8px",
                      background: busted ? "var(--crimson-100)" : out ? "var(--cactus-100)" : "var(--parchment-200)",
                      border: "2px solid var(--ink-900)",
                    }}
                  >
                    <div
                      className="avatar avatar-sm"
                      style={{
                        background: tag?.avatarColor ?? "var(--gold-300)",
                        fontSize: 11,
                        width: 24,
                        height: 24,
                        borderWidth: 2,
                      }}
                    >
                      {tag?.initials ?? "??"}
                    </div>
                    <div style={{ flex: 1, minWidth: 0, fontFamily: "var(--font-display)", fontSize: 13 }}>
                      <span>{tag?.username ?? b.userId.slice(0, 6)}</span>
                      <span style={{ color: "var(--saddle-400)" }}> · {b.amount.toLocaleString()}</span>
                    </div>
                    {out ? (
                      <span style={{ fontFamily: "var(--font-display)", fontSize: 14, color: "var(--cactus-500)" }}>
                        {b.cashoutX!.toFixed(2)}× +{(b.payout - b.amount).toLocaleString()}
                      </span>
                    ) : busted ? (
                      <span style={{ fontFamily: "var(--font-display)", fontSize: 14, color: "var(--crimson-500)" }}>
                        BUST
                      </span>
                    ) : (
                      <span style={{ fontFamily: "var(--font-display)", fontSize: 14, color: "var(--saddle-400)" }}>
                        ⋯
                      </span>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// Color the multiplier text by tier — gold → amber → crimson as it climbs.
function tierColor(x: number): string {
  if (x < 1.5) return "#fef6e4";
  if (x < 2)   return "#f5c842";
  if (x < 3)   return "#ffd84d";
  if (x < 5)   return "#ffb04a";
  if (x < 10)  return "#e87a3a";
  return "#ff5544";
}
function tierGlow(x: number): string {
  if (x < 2)  return "rgba(245, 200, 66, 0.55)";
  if (x < 5)  return "rgba(255, 176, 74, 0.65)";
  if (x < 10) return "rgba(232, 122, 58, 0.75)";
  return "rgba(255, 85, 68, 0.85)";
}
function pillBg(x: number): string {
  if (x < 1.5) return "var(--crimson-300)";
  if (x < 2)   return "var(--saddle-300)";
  if (x < 5)   return "var(--gold-300)";
  if (x < 10)  return "#ff9a3a";
  return "var(--crimson-500)";
}
function pillFg(x: number): string {
  if (x < 1.5) return "var(--parchment-50)";
  if (x < 2)   return "var(--ink-900)";
  if (x < 5)   return "var(--ink-900)";
  if (x < 10)  return "var(--ink-900)";
  return "var(--gold-300)";
}

function HistoryStrip({
  history,
  liveCrashAt,
}: {
  history: HistoryRound[];
  liveCrashAt: number | null;
}) {
  // Most recent on the right. If a crash is currently displayed but hasn't
  // landed in /history yet, prepend it visually so the player sees it.
  const merged: HistoryRound[] = [...history];
  if (
    liveCrashAt !== null &&
    (merged.length === 0 || merged[0].crashAtX !== liveCrashAt)
  ) {
    merged.unshift({ id: "live", roundNo: 0, crashAtX: liveCrashAt });
  }
  if (merged.length === 0) return null;

  return (
    <div
      style={{
        display: "flex",
        gap: 4,
        flexWrap: "wrap",
        alignItems: "center",
        margin: "0 0 var(--sp-3)",
        padding: "var(--sp-2)",
        background: "var(--saddle-600)",
        border: "3px solid var(--ink-900)",
        boxShadow: "var(--bevel-light)",
      }}
      aria-label="Recent crash multipliers"
    >
      <span
        style={{
          fontFamily: "var(--font-display)",
          fontSize: 11,
          color: "var(--parchment-200)",
          letterSpacing: "var(--ls-loose)",
          textTransform: "uppercase",
          alignSelf: "center",
          padding: "0 6px",
          flexShrink: 0,
        }}
      >
        Last {Math.min(merged.length, HISTORY_LEN)}:
      </span>
      {merged.slice(0, HISTORY_LEN).map((r, i) => (
        <span
          key={`${r.id}-${i}`}
          title={`Round #${r.roundNo} crashed at ${r.crashAtX.toFixed(2)}×`}
          style={{
            fontFamily: "var(--font-display)",
            fontSize: 12,
            background: pillBg(r.crashAtX),
            color: pillFg(r.crashAtX),
            padding: "3px 8px",
            border: "2px solid var(--ink-900)",
            letterSpacing: "var(--ls-loose)",
            whiteSpace: "nowrap",
            flexShrink: 0,
            textShadow: r.crashAtX >= 10 ? "1px 1px 0 var(--ink-900)" : undefined,
            boxShadow: r.crashAtX >= 10 ? "0 0 8px rgba(255, 85, 68, 0.6)" : undefined,
          }}
        >
          {r.crashAtX.toFixed(2)}×
        </span>
      ))}
    </div>
  );
}

function labelFor(code: string) {
  const labels: Record<string, string> = {
    insufficient_funds: "Not enough Coins.",
    bet_too_low: "Bet must be at least 100.",
    no_active_round: "No active round.",
    betting_closed: "Betting closed for this round.",
    already_bet_this_round: "You're already in this round.",
    no_bet: "You haven't bet this round.",
    not_running: "Round isn't live.",
    already_cashed: "You already cashed out.",
  };
  return labels[code] ?? "Something went wrong.";
}
