"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { BetInput } from "@/components/BetInput";
import { GROWTH, multiplierAt } from "@/lib/games/crash/engine";

type Phase = "idle" | "rising" | "cashed" | "busted";

type Result = {
  busted: boolean;
  cashoutX?: number;
  crashAtX: number;
  payout: number;
  balance: number;
};

export function CrashClient() {
  const router = useRouter();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [bet, setBet] = useState(1_000);
  const [autoCashAt, setAutoCashAt] = useState<number>(2);
  const [autoEnabled, setAutoEnabled] = useState(false);
  const [busy, setBusy] = useState(false);
  const [phase, setPhase] = useState<Phase>("idle");
  const [liveX, setLiveX] = useState(1.0);
  const [result, setResult] = useState<Result | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [balance, setBalance] = useState<number | null>(null);

  const sessionRef = useRef<string | null>(null);
  const startedRef = useRef<number>(0);
  const phaseRef = useRef<Phase>("idle");
  const autoRef = useRef<{ on: boolean; at: number }>({ on: false, at: 2 });

  useEffect(() => {
    fetch("/api/auth/me").then((r) => r.json()).then((d) => setBalance(d.balance ?? null));
  }, []);
  useEffect(() => { phaseRef.current = phase; }, [phase]);
  useEffect(() => { autoRef.current = { on: autoEnabled, at: autoCashAt }; }, [autoEnabled, autoCashAt]);

  // Animation: track live multiplier + draw curve
  useEffect(() => {
    let raf = 0;
    const points: { t: number; x: number }[] = [];

    function frame() {
      if (phaseRef.current !== "rising") {
        raf = requestAnimationFrame(frame);
        return;
      }
      const elapsed = (Date.now() - startedRef.current) / 1000;
      const m = multiplierAt(elapsed);
      setLiveX(m);
      points.push({ t: elapsed, x: m });
      if (points.length > 800) points.shift();

      // Auto-cashout
      if (autoRef.current.on && m >= autoRef.current.at) {
        autoRef.current.on = false;
        cashoutNow();
      }

      drawCurve(points);
      raf = requestAnimationFrame(frame);
    }

    function drawCurve(pts: { t: number; x: number }[]) {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const ctx = canvas.getContext("2d");
      if (!ctx) return;
      const W = canvas.width;
      const H = canvas.height;
      ctx.clearRect(0, 0, W, H);

      // Background
      ctx.fillStyle = "#4a2818";
      ctx.fillRect(0, 0, W, H);

      // Grid
      ctx.strokeStyle = "rgba(244, 219, 160, 0.15)";
      ctx.lineWidth = 1;
      for (let i = 1; i < 6; i++) {
        const y = (H * i) / 6;
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(W, y);
        ctx.stroke();
      }

      if (pts.length < 2) return;
      const lastT = pts[pts.length - 1].t;
      const tMax = Math.max(8, lastT * 1.1);
      const lastX = pts[pts.length - 1].x;
      const xMax = Math.max(2, lastX * 1.1);

      // Curve
      ctx.strokeStyle = phaseRef.current === "busted" ? "#e05a3c" : "#f5c842";
      ctx.lineWidth = 4;
      ctx.beginPath();
      for (let i = 0; i < pts.length; i++) {
        const px = (pts[i].t / tMax) * W;
        const py = H - ((pts[i].x - 1) / (xMax - 1)) * H;
        if (i === 0) ctx.moveTo(px, py);
        else ctx.lineTo(px, py);
      }
      ctx.stroke();

      // Filled area below curve
      ctx.lineTo((lastT / tMax) * W, H);
      ctx.lineTo(0, H);
      ctx.closePath();
      ctx.fillStyle = "rgba(245, 200, 66, 0.15)";
      ctx.fill();
    }

    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
  }, []);

  async function startRound() {
    setBusy(true);
    setError(null);
    setResult(null);
    const res = await fetch("/api/games/crash/start", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ bet }),
    });
    const data = await res.json();
    setBusy(false);
    if (!res.ok) {
      setError(data.error ?? "error");
      return;
    }
    sessionRef.current = data.sessionId;
    startedRef.current = data.startedAt;
    setLiveX(1.0);
    setPhase("rising");
    setBalance(data.balance);
    autoRef.current = { on: autoEnabled, at: autoCashAt };
    router.refresh();
  }

  async function cashoutNow() {
    if (!sessionRef.current || phaseRef.current !== "rising") return;
    const sid = sessionRef.current;
    sessionRef.current = null; // prevent double call
    const res = await fetch(`/api/games/crash/${sid}/cashout`, { method: "POST" });
    const data = await res.json();
    if (!res.ok) {
      setError(data.error ?? "error");
      return;
    }
    if (data.busted) {
      setPhase("busted");
      setResult({ busted: true, crashAtX: data.crashAtX, payout: 0, balance: data.balance });
      setLiveX(data.crashAtX);
    } else {
      setPhase("cashed");
      setResult({
        busted: false,
        cashoutX: data.cashoutX,
        crashAtX: data.crashAtX,
        payout: data.payout,
        balance: data.balance,
      });
      setLiveX(data.cashoutX);
    }
    setBalance(data.balance);
    router.refresh();
  }

  // When client animation crosses crash point with no cashout, ask server to confirm bust.
  useEffect(() => {
    if (phase !== "rising") return;
    // After ~30s with no cashout, force a reveal call to settle bust on server.
    const t = setTimeout(async () => {
      if (phaseRef.current !== "rising" || !sessionRef.current) return;
      const sid = sessionRef.current;
      const res = await fetch(`/api/games/crash/${sid}/reveal`, { method: "POST" });
      const data = await res.json();
      if (res.ok && data.crashAtX) {
        // Force-bust the UI if the server says it has crashed.
        setPhase("busted");
        setResult({ busted: true, crashAtX: data.crashAtX, payout: 0, balance: data.balance });
        sessionRef.current = null;
      }
    }, 30_000);
    return () => clearTimeout(t);
  }, [phase]);

  function newRound() {
    setPhase("idle");
    setResult(null);
    sessionRef.current = null;
    setLiveX(1.0);
  }

  const canStart = phase === "idle" && !busy && bet >= 100 && (balance == null || balance >= bet);
  const isRising = phase === "rising";

  return (
    <div className="grid grid-2" style={{ alignItems: "start" }}>
      <div className="panel" style={{ padding: "var(--sp-6)" }}>
        <div className="panel-title">Multiplier</div>

        <div
          className="center"
          style={{
            background: "var(--saddle-500)",
            border: "4px solid var(--ink-900)",
            padding: "var(--sp-5)",
            position: "relative",
            flexDirection: "column",
            gap: "var(--sp-3)",
          }}
        >
          <div
            style={{
              fontFamily: "var(--font-display)",
              fontSize: 96,
              lineHeight: 1,
              color: phase === "busted"
                ? "var(--crimson-300)"
                : phase === "cashed"
                ? "var(--cactus-300)"
                : "var(--gold-300)",
              textShadow: "4px 4px 0 var(--ink-900)",
            }}
          >
            {liveX.toFixed(2)}×
          </div>
          <canvas
            ref={canvasRef}
            width={520}
            height={220}
            style={{
              imageRendering: "pixelated",
              border: "3px solid var(--ink-900)",
              maxWidth: "100%",
              height: "auto",
            }}
          />
        </div>

        {result && (
          <div
            className="sign"
            style={{
              marginTop: "var(--sp-5)",
              display: "block",
              textAlign: "center",
              background: result.busted ? "var(--crimson-500)" : "var(--cactus-500)",
            }}
          >
            {result.busted
              ? `Crashed at ${result.crashAtX.toFixed(2)}× — ride over`
              : `Cashed at ${result.cashoutX!.toFixed(2)}× → +${result.payout.toLocaleString()} ¢ (crash was ${result.crashAtX.toFixed(2)}×)`}
          </div>
        )}

        {error && <p style={{ color: "var(--crimson-500)", marginTop: "var(--sp-3)" }}>{labelFor(error)}</p>}
      </div>

      <div className="panel" style={{ padding: "var(--sp-6)" }}>
        <div className="panel-title">{isRising ? "Pull the Cord" : "Place Your Bet"}</div>

        {isRising ? (
          <div className="stack-lg">
            <p className="text-mute">
              Multiplier doubles every ~{(Math.log(2) / GROWTH).toFixed(1)}s. Cash out before the crash.
            </p>
            <button className="btn btn-lg btn-block btn-danger" onClick={cashoutNow}>
              Cash Out at {liveX.toFixed(2)}× (+{Math.floor(bet * liveX).toLocaleString()} ¢)
            </button>
            <p className="text-mute" style={{ fontSize: "var(--fs-small)" }}>
              {autoEnabled ? `Auto cashout armed at ${autoCashAt.toFixed(2)}×` : "Auto cashout off"}
            </p>
          </div>
        ) : phase === "cashed" || phase === "busted" ? (
          <div className="stack-lg">
            <button className="btn btn-block" onClick={newRound}>New Round</button>
          </div>
        ) : (
          <div className="stack-lg">
            <BetInput value={bet} onChange={setBet} max={Math.max(100, balance ?? 100)} disabled={busy} />

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

            <button className="btn btn-lg btn-block" onClick={startRound} disabled={!canStart}>
              {busy ? "..." : "Place Bet"}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

function labelFor(code: string) {
  const labels: Record<string, string> = {
    insufficient_funds: "Not enough Coins.",
    bet_too_low: "Bet must be at least 100.",
    not_found: "Round not found.",
    already_settled: "This round already ended.",
  };
  return labels[code] ?? "Something went wrong.";
}
