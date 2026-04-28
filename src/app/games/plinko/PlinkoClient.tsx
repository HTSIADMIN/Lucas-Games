"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { BetInput } from "@/components/BetInput";
import { bucketTable, type PlinkoRisk, type PlinkoRows } from "@/lib/games/plinko/engine";
import * as Sfx from "@/lib/sfx";

// Step duration for the ball bouncing through one row of pegs.
const STEP_MS = 130;
// Vertical pixel height per row.
const ROW_H = 30;
// Top padding (above first peg) and bottom padding (peg row → bucket gap).
const TOP_PAD = 28;
const BOT_PAD = 14;

// Build a left/right decision sequence of length `rows` whose count of
// "right" choices equals `targetBucket`. Then return cumulative ball
// positions in normalized [0..1] x and integer y row.
function buildBallPath(rows: number, targetBucket: number) {
  const rights = Math.max(0, Math.min(rows, targetBucket));
  const lefts = rows - rights;
  const decisions: number[] = [];
  for (let i = 0; i < rights; i++) decisions.push(1);
  for (let i = 0; i < lefts; i++) decisions.push(0);
  // Fisher-Yates so the path looks random
  for (let i = decisions.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [decisions[i], decisions[j]] = [decisions[j], decisions[i]];
  }
  // Ball x at step s = ((rows + 1) + 2R - s) / (2 * (rows + 1))
  // (lands at (B + 0.5) / (rows + 1) when s=rows, R=B)
  const denom = 2 * (rows + 1);
  const path: { x: number; y: number }[] = [];
  let R = 0;
  for (let s = 0; s <= rows; s++) {
    const x = ((rows + 1) + 2 * R - s) / denom;
    path.push({ x, y: s });
    if (decisions[s] === 1) R++;
  }
  return path;
}

// Peg position in row r (0-indexed, 0..rows-1), peg index k (0..r), normalized 0..1.
function pegX(rows: number, r: number, k: number) {
  return ((rows - r) / 2 + k + 0.5) / (rows + 1);
}

type DropResult = {
  bucket: number;
  multiplier: number;
  payout: number;
  table: number[];
  rows: PlinkoRows;
  risk: PlinkoRisk;
  balance: number;
};

const ROW_OPTIONS: PlinkoRows[] = [8, 12, 16];
const RISK_OPTIONS: { value: PlinkoRisk; label: string }[] = [
  { value: "low",  label: "LOW" },
  { value: "med",  label: "MED" },
  { value: "high", label: "HIGH" },
];

type Ghost = {
  id: string;
  username: string;
  avatarColor: string;
  initials: string;
  rows: PlinkoRows;
  bucket: number;
  startedAt: number; // when we mounted it locally
};

type FlyingBall = {
  id: string;
  path: { x: number; y: number }[];
  rows: number;
  startedAtMs: number;
  multiplier: number;
  payout: number;
  bet: number;
  bucket: number;
};

export function PlinkoClient() {
  const router = useRouter();
  const [bet, setBet] = useState(1_000);
  const [rows, setRows] = useState<PlinkoRows>(12);
  const [risk, setRisk] = useState<PlinkoRisk>("med");
  const [submitting, setSubmitting] = useState(false);
  const [balls, setBalls] = useState<FlyingBall[]>([]);
  const [bucketFlashes, setBucketFlashes] = useState<{ bucket: number; at: number }[]>([]);
  const [result, setResult] = useState<DropResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [balance, setBalance] = useState<number | null>(null);
  const [ghosts, setGhosts] = useState<(Ghost & { path: { x: number; y: number }[]; startedAtMs: number })[]>([]);
  const [, setTick] = useState(0);

  useEffect(() => {
    fetch("/api/auth/me").then((r) => r.json()).then((d) => setBalance(d.balance ?? null));
  }, []);

  // Poll for other players' recent drops and spawn ghost chips on our board.
  useEffect(() => {
    const seen = new Set<string>();
    let cancelled = false;
    async function poll() {
      try {
        const r = await fetch("/api/games/plinko/recent");
        if (!r.ok) return;
        const d = await r.json();
        if (cancelled || !Array.isArray(d.drops)) return;
        const now = Date.now();
        for (const drop of d.drops as Array<{
          id: string; username: string; avatarColor: string; initials: string;
          rows: number; bucket: number; at: number;
        }>) {
          if (seen.has(drop.id)) continue;
          if (now - drop.at > 5000) {
            seen.add(drop.id);
            continue;
          }
          seen.add(drop.id);
          const path = buildBallPath(drop.rows, drop.bucket);
          setGhosts((prev) => [...prev, {
            id: drop.id,
            username: drop.username,
            avatarColor: drop.avatarColor,
            initials: drop.initials,
            rows: drop.rows as PlinkoRows,
            bucket: drop.bucket,
            startedAt: drop.at,
            path,
            startedAtMs: Date.now(),
          }]);
          const animMs = STEP_MS * (drop.rows + 1) + 300;
          setTimeout(() => {
            setGhosts((prev) => prev.filter((x) => x.id !== drop.id));
          }, animMs);
        }
      } catch { /* ignore */ }
    }
    poll();
    const t = setInterval(poll, 3000);
    return () => { cancelled = true; clearInterval(t); };
  }, []);

  // Re-render every 50ms while balls or ghosts are in flight so their
  // computed step (from elapsed time) advances visually.
  useEffect(() => {
    if (balls.length === 0 && ghosts.length === 0 && bucketFlashes.length === 0) return;
    const t = setInterval(() => {
      setTick((n) => n + 1);
      // Garbage-collect expired bucket flashes (>800ms old).
      setBucketFlashes((prev) => prev.filter((f) => Date.now() - f.at < 800));
    }, 50);
    return () => clearInterval(t);
  }, [balls.length, ghosts.length, bucketFlashes.length]);

  const previewTable = bucketTable(rows, risk);

  async function go() {
    if (bet < 100) return;
    if (balance != null && balance < bet) return;
    setError(null);
    setSubmitting(true);
    // Optimistic balance debit so rapid clicks reflect immediately.
    const stake = bet;
    const localRows = rows;
    setBalance((b) => (b == null ? b : b - stake));

    try {
      const res = await fetch("/api/games/plinko/drop", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ bet: stake, rows: localRows, risk }),
      });
      const data = await res.json();
      setSubmitting(false);
      if (!res.ok) {
        // Roll back optimistic balance on failure.
        setBalance((b) => (b == null ? b : b + stake));
        setError(data.error ?? "error");
        return;
      }

      // Soft UI tick on the drop — the original coin.drop was too
      // weighty for a button press.
      Sfx.play("ui.click");
      // Spawn a new flying ball with its own path.
      const path = buildBallPath(localRows, data.bucket);
      const id = crypto.randomUUID();
      const startedAtMs = Date.now();
      const ball: FlyingBall = {
        id, path, rows: localRows, startedAtMs,
        multiplier: data.multiplier,
        payout: data.payout,
        bet: stake,
        bucket: data.bucket,
      };
      setBalls((prev) => [...prev, ball]);

      const animMs = path.length * STEP_MS;
      // When the ball "lands", flash the bucket + record result + sync balance.
      setTimeout(() => {
        setBucketFlashes((prev) => [...prev, { bucket: data.bucket, at: Date.now() }]);
        setResult(data);
        // Server-truth balance — overrides optimistic if any drift.
        setBalance(data.balance);
        // Tier-scale the landing chime by multiplier. Light hits use
        // the new chips-collide for a quick poker-table clack.
        const m = data.multiplier ?? 0;
        if (m >= 50)      Sfx.play("win.big");
        else if (m >= 5)  Sfx.play("win.levelup");
        else if (m >= 1)  Sfx.play("chips.collide");
        else              Sfx.play("ui.notify");
        // Remove the ball after a small landing pause.
        setTimeout(() => {
          setBalls((prev) => prev.filter((b) => b.id !== id));
        }, 350);
        router.refresh();
      }, animMs);
    } catch (err) {
      setSubmitting(false);
      setBalance((b) => (b == null ? b : b + stake));
      setError("network_error");
    }
  }

  const canDrop = bet >= 100 && (balance == null || balance >= bet);

  return (
    <div className="grid grid-2" style={{ alignItems: "start" }}>
      <div className="panel" style={{ padding: "var(--sp-6)" }}>
        <div className="panel-title">The Board</div>

        {(() => {
          const boardHeight = TOP_PAD + ROW_H * rows + BOT_PAD;
          return (
            <div
              style={{
                background: "var(--saddle-500)",
                border: "4px solid var(--ink-900)",
                padding: 8,
              }}
            >
              {/* Peg field */}
              <div
                style={{
                  position: "relative",
                  width: "100%",
                  height: boardHeight,
                  background: "var(--saddle-600)",
                  border: "2px solid var(--ink-900)",
                  overflow: "hidden",
                }}
              >
                {/* Pegs */}
                {Array.from({ length: rows }).map((_, r) =>
                  Array.from({ length: r + 1 }).map((_, k) => {
                    const xPct = pegX(rows, r, k) * 100;
                    const yPx = TOP_PAD + r * ROW_H;
                    return (
                      <span
                        key={`${r}-${k}`}
                        style={{
                          position: "absolute",
                          left: `${xPct}%`,
                          top: yPx,
                          transform: "translate(-50%, -50%)",
                          width: 12,
                          height: 12,
                          borderRadius: 999,
                          background: "var(--gold-100)",
                          boxShadow:
                            "0 0 0 2px var(--ink-900), inset -1px -2px 0 rgba(26,15,8,0.4), inset 1px 1px 0 rgba(255,255,255,0.6)",
                        }}
                      />
                    );
                  })
                )}

                {/* Player balls */}
                {balls.filter((b) => b.rows === rows).map((b) => {
                  const elapsed = (Date.now() - b.startedAtMs) / STEP_MS;
                  const idx = Math.max(0, Math.min(b.path.length - 1, Math.floor(elapsed)));
                  const frac = elapsed - idx;
                  const cur = b.path[idx];
                  const next = b.path[Math.min(b.path.length - 1, idx + 1)];
                  // Smooth interpolation between path points so the ball doesn't snap.
                  const x = (cur.x + (next.x - cur.x) * Math.min(1, frac)) * 100;
                  const y = TOP_PAD + (cur.y + (next.y - cur.y) * Math.min(1, frac)) * ROW_H;
                  return (
                    <span
                      key={b.id}
                      style={{
                        position: "absolute",
                        left: `${x}%`,
                        top: y,
                        transform: "translate(-50%, -50%)",
                        width: 18,
                        height: 18,
                        borderRadius: 999,
                        background: "var(--gold-300)",
                        border: "2px solid var(--ink-900)",
                        boxShadow:
                          "inset -2px -3px 0 rgba(26,15,8,0.35), inset 1px 2px 0 rgba(255,255,255,0.55), 0 0 8px rgba(245,200,66,0.55)",
                      }}
                    />
                  );
                })}

                {/* Ghost balls — other players' drops, half opacity, no glow */}
                {ghosts.filter((g) => g.rows === rows).map((g) => {
                  const elapsed = (Date.now() - g.startedAtMs) / STEP_MS;
                  const idx = Math.max(0, Math.min(g.path.length - 1, Math.floor(elapsed)));
                  const frac = elapsed - idx;
                  const cur = g.path[idx];
                  const next = g.path[Math.min(g.path.length - 1, idx + 1)];
                  const x = (cur.x + (next.x - cur.x) * Math.min(1, frac)) * 100;
                  const y = TOP_PAD + (cur.y + (next.y - cur.y) * Math.min(1, frac)) * ROW_H;
                  return (
                    <span
                      key={g.id}
                      style={{
                        position: "absolute",
                        left: `${x}%`,
                        top: y,
                        transform: "translate(-50%, -50%)",
                        width: 14,
                        height: 14,
                        borderRadius: 999,
                        background: g.avatarColor,
                        border: "2px solid var(--ink-900)",
                        opacity: 0.6,
                        pointerEvents: "none",
                      }}
                      title={g.username}
                    />
                  );
                })}
              </div>

              {/* Buckets */}
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: `repeat(${previewTable.length}, 1fr)`,
                  gap: 3,
                  marginTop: 6,
                }}
              >
                {previewTable.map((m, i) => {
                  const flashing = bucketFlashes.some((f) => f.bucket === i);
                  return (
                    <div
                      key={i}
                      style={{
                        background: flashing ? "var(--gold-300)" : multiplierColor(m),
                        color: flashing ? "var(--ink-900)" : "var(--parchment-50)",
                        border: flashing ? "3px solid var(--ink-900)" : "2px solid var(--ink-900)",
                        fontFamily: "var(--font-display)",
                        fontSize: 11,
                        textAlign: "center",
                        padding: "5px 2px",
                        textShadow: flashing
                          ? "1px 1px 0 var(--gold-100)"
                          : "1px 1px 0 var(--ink-900)",
                        transform: flashing ? "translateY(-4px)" : "none",
                        transition: "transform 0.18s",
                        boxShadow: flashing ? "var(--glow-gold)" : undefined,
                      }}
                    >
                      ×{m}
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })()}

        {result && (
          <div
            className="sign"
            style={{
              marginTop: "var(--sp-5)",
              display: "block",
              textAlign: "center",
              background: result.payout > result.payout * 0
                ? (result.payout > bet ? "var(--cactus-500)" : "var(--saddle-300)")
                : "var(--crimson-500)",
            }}
          >
            Bet {bet.toLocaleString()} · ×{result.multiplier} →{" "}
            {result.payout > 0
              ? `${result.payout > bet ? "+" : ""}${(result.payout - bet).toLocaleString()} ¢`
              : `-${bet.toLocaleString()} ¢`}
          </div>
        )}

        {error && <p style={{ color: "var(--crimson-500)", marginTop: "var(--sp-3)" }}>{labelFor(error)}</p>}
      </div>

      <div className="panel" style={{ padding: "var(--sp-6)" }}>
        <div className="panel-title">Drop Settings</div>
        <div className="stack-lg">
          <div>
            <label className="label">Risk</label>
            <div className="row">
              {RISK_OPTIONS.map((o) => (
                <button
                  key={o.value}
                  type="button"
                  className={`btn btn-block ${risk === o.value ? "" : "btn-ghost"}`}
                  onClick={() => setRisk(o.value)}
                  disabled={false}
                >
                  {o.label}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="label">Rows</label>
            <div className="row">
              {ROW_OPTIONS.map((r) => (
                <button
                  key={r}
                  type="button"
                  className={`btn btn-block ${rows === r ? "" : "btn-ghost"}`}
                  onClick={() => setRows(r)}
                  disabled={false}
                >
                  {r}
                </button>
              ))}
            </div>
          </div>

          <BetInput value={bet} onChange={setBet} max={Math.max(100, balance ?? 100)} disabled={false} />

          <button className="btn btn-lg btn-block" onClick={go} disabled={!canDrop}>
            {balls.length > 0 ? `Drop (${balls.length} in air)` : submitting ? "..." : "Drop"}
          </button>
        </div>
      </div>
    </div>
  );
}

function multiplierColor(m: number): string {
  if (m >= 10) return "var(--gold-500)";
  if (m >= 3)  return "var(--crimson-500)";
  if (m >= 1)  return "var(--saddle-300)";
  return "var(--ink-900)";
}

function labelFor(code: string) {
  const labels: Record<string, string> = {
    insufficient_funds: "Not enough Coins.",
    bet_too_low: "Bet must be at least 100.",
    rows_invalid: "Pick 8, 12, or 16 rows.",
    risk_invalid: "Pick low / med / high.",
  };
  return labels[code] ?? "Something went wrong.";
}
