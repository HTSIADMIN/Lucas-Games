"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { BetInput } from "@/components/BetInput";
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

const POLL_MS = 1000;

export function CrashClient() {
  const router = useRouter();
  const { presence } = useLive();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [bet, setBet] = useState(1_000);
  const [autoCashAt, setAutoCashAt] = useState(2);
  const [autoEnabled, setAutoEnabled] = useState(false);
  const [round, setRound] = useState<RoundView | null>(null);
  const [bets, setBets] = useState<BetView[]>([]);
  const [serverOffsetMs, setServerOffsetMs] = useState(0);
  const [liveX, setLiveX] = useState(1.0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [balance, setBalance] = useState<number | null>(null);

  const meRef = useRef<string | null>(null);
  const phaseRef = useRef<RoundView["status"] | null>(null);
  const autoRef = useRef<{ on: boolean; at: number }>({ on: false, at: 2 });
  const cashedThisRoundRef = useRef(false);
  useEffect(() => { autoRef.current = { on: autoEnabled, at: autoCashAt }; }, [autoEnabled, autoCashAt]);
  useEffect(() => { phaseRef.current = round?.status ?? null; }, [round?.status]);

  // Get my user id once
  useEffect(() => {
    fetch("/api/auth/me").then((r) => r.json()).then((d) => {
      meRef.current = d.user?.id ?? null;
      setBalance(d.balance ?? null);
    });
  }, []);

  // Reset cash-this-round flag when round id changes
  useEffect(() => { cashedThisRoundRef.current = false; }, [round?.id]);

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

  useEffect(() => {
    refreshState();
    const t = setInterval(refreshState, POLL_MS);
    return () => clearInterval(t);
  }, []);

  // Realtime: react instantly to crash_rounds + crash_bets changes (without waiting for poll)
  useEffect(() => {
    const supa = getBrowserClient();
    if (!supa) return;
    const ch = supa.channel("lg-crash-feed");
    ch.on("postgres_changes", { event: "*", schema: "public", table: "crash_rounds" }, () => refreshState())
      .on("postgres_changes", { event: "*", schema: "public", table: "crash_bets" }, () => refreshState())
      .subscribe();
    return () => { supa.removeChannel(ch); };
  }, []);

  // Animation loop — pure function of started_at + serverOffset
  useEffect(() => {
    let raf = 0;
    const points: { t: number; x: number }[] = [];

    function frame() {
      const r = round;
      if (r?.status === "running" && r.startedAt) {
        const startMs = new Date(r.startedAt).getTime();
        const elapsed = (Date.now() + serverOffsetMs - startMs) / 1000;
        const m = multiplierAt(elapsed);
        setLiveX(m);
        points.push({ t: elapsed, x: m });
        if (points.length > 800) points.shift();

        // Auto-cashout
        if (autoRef.current.on && !cashedThisRoundRef.current) {
          const myBet = bets.find((b) => b.userId === meRef.current);
          if (myBet && myBet.cashoutX === null && m >= autoRef.current.at) {
            cashedThisRoundRef.current = true;
            cashout();
          }
        }
      } else if (r?.status === "crashed" && r.crashAtX !== null) {
        setLiveX(r.crashAtX);
      } else {
        setLiveX(1.0);
      }
      drawCurve(points);
      raf = requestAnimationFrame(frame);
    }

    function drawCurve(pts: { t: number; x: number }[]) {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const ctx = canvas.getContext("2d");
      if (!ctx) return;
      const W = canvas.width, H = canvas.height;
      ctx.clearRect(0, 0, W, H);
      ctx.fillStyle = "#4a2818";
      ctx.fillRect(0, 0, W, H);

      ctx.strokeStyle = "rgba(244, 219, 160, 0.15)";
      ctx.lineWidth = 1;
      for (let i = 1; i < 6; i++) {
        const y = (H * i) / 6;
        ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke();
      }

      if (pts.length < 2) return;
      const last = pts[pts.length - 1];
      const tMax = Math.max(8, last.t * 1.1);
      const xMax = Math.max(2, last.x * 1.1);

      ctx.strokeStyle = round?.status === "crashed" ? "#e05a3c" : "#f5c842";
      ctx.lineWidth = 4;
      ctx.beginPath();
      for (let i = 0; i < pts.length; i++) {
        const px = (pts[i].t / tMax) * W;
        const py = H - ((pts[i].x - 1) / (xMax - 1)) * H;
        if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
      }
      ctx.stroke();
      ctx.lineTo((last.t / tMax) * W, H);
      ctx.lineTo(0, H);
      ctx.closePath();
      ctx.fillStyle = "rgba(245, 200, 66, 0.15)";
      ctx.fill();
    }

    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
  }, [round?.status, round?.startedAt, round?.crashAtX, serverOffsetMs, bets]);

  async function placeBet() {
    setBusy(true);
    setError(null);
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
    setBusy(true);
    const res = await fetch("/api/games/crash/cashout", { method: "POST" });
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
    <div className="grid grid-2" style={{ alignItems: "start" }}>
      <div className="panel" style={{ padding: "var(--sp-6)" }}>
        <div className="panel-title">
          {isBetting ? `Round #${round?.roundNo ?? "—"} · Betting opens` :
           isRunning ? `Round #${round?.roundNo ?? "—"} · LIVE` :
           isCrashed ? `Round #${round?.roundNo ?? "—"} · Crashed` :
           "Loading..."}
        </div>

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
              color: isCrashed ? "var(--crimson-300)" : (myCashedOut ? "var(--cactus-300)" : "var(--gold-300)"),
              textShadow: isCrashed
                ? "4px 4px 0 var(--ink-900), 0 0 20px rgba(224, 90, 60, 0.6)"
                : "4px 4px 0 var(--ink-900)",
            }}
          >
            {isBetting ? `${secondsLeft}s` : `${liveX.toFixed(2)}×`}
          </div>
          {isCrashed && (
            <div
              style={{
                fontFamily: "var(--font-display)",
                fontSize: 28,
                color: "var(--crimson-300)",
                textShadow: "2px 2px 0 var(--ink-900)",
                letterSpacing: "var(--ls-loose)",
                textTransform: "uppercase",
              }}
            >
              💥 Crashed
            </div>
          )}
          <div style={{ fontFamily: "var(--font-display)", fontSize: 14, color: "var(--parchment-200)" }}>
            {isBetting ? "Place your bet" :
             isRunning ? (myCashedOut ? `Cashed at ${myBet?.cashoutX?.toFixed(2)}×` : myBet ? "Cash out before bust" : "Watching this round") :
             isCrashed ? `Bust at ${round?.crashAtX?.toFixed(2)}× — next round in ${nextRoundIn}s` : "..."}
          </div>
          <canvas
            ref={canvasRef}
            width={520}
            height={200}
            style={{
              imageRendering: "pixelated",
              border: "3px solid var(--ink-900)",
              maxWidth: "100%",
              height: "auto",
            }}
          />
        </div>

        {error && <p style={{ color: "var(--crimson-500)", marginTop: "var(--sp-3)" }}>{error}</p>}
      </div>

      <div className="stack-lg">
        {/* Bet placement / cashout panel */}
        <div className="panel" style={{ padding: "var(--sp-6)" }}>
          <div className="panel-title">
            {myBet
              ? isRunning && !myCashedOut ? "Cash Out" : "This Round"
              : "Place Your Bet"}
          </div>

          {myBet && isRunning && !myCashedOut && (
            <div className="stack-lg">
              <p className="text-mute">Your bet: {myBet.amount.toLocaleString()} ¢</p>
              <button className="btn btn-lg btn-block btn-danger" onClick={cashout} disabled={busy}>
                Cash Out at {liveX.toFixed(2)}× (+{Math.floor(myBet.amount * liveX).toLocaleString()} ¢)
              </button>
            </div>
          )}

          {myBet && (myCashedOut || isCrashed) && (
            <div className="stack-lg">
              <p className="text-mute">Bet: {myBet.amount.toLocaleString()} ¢</p>
              {myCashedOut ? (
                <p style={{ color: "var(--cactus-500)" }}>
                  Cashed at {myBet.cashoutX!.toFixed(2)}× → +{myBet.payout.toLocaleString()} ¢
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
                        {b.cashoutX!.toFixed(2)}× +{b.payout.toLocaleString()}
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
