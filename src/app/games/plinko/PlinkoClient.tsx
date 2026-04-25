"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { BetInput } from "@/components/BetInput";
import { bucketTable, type PlinkoRisk, type PlinkoRows } from "@/lib/games/plinko/engine";

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

export function PlinkoClient() {
  const router = useRouter();
  const [bet, setBet] = useState(1_000);
  const [rows, setRows] = useState<PlinkoRows>(12);
  const [risk, setRisk] = useState<PlinkoRisk>("med");
  const [busy, setBusy] = useState(false);
  const [animating, setAnimating] = useState(false);
  const [animBucket, setAnimBucket] = useState<number | null>(null);
  const [result, setResult] = useState<DropResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [balance, setBalance] = useState<number | null>(null);

  useEffect(() => {
    fetch("/api/auth/me").then((r) => r.json()).then((d) => setBalance(d.balance ?? null));
  }, []);

  const previewTable = bucketTable(rows, risk);

  async function go() {
    setBusy(true);
    setAnimating(true);
    setError(null);
    setResult(null);
    setAnimBucket(null);

    const res = await fetch("/api/games/plinko/drop", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ bet, rows, risk }),
    });
    const data = await res.json();
    setBusy(false);
    if (!res.ok) {
      setAnimating(false);
      setError(data.error ?? "error");
      return;
    }

    // Brief animation then reveal
    setTimeout(() => {
      setAnimBucket(data.bucket);
      setResult(data);
      setBalance(data.balance);
      setAnimating(false);
      router.refresh();
    }, 1200);
  }

  const canDrop = !busy && !animating && bet >= 100 && (balance == null || balance >= bet);

  return (
    <div className="grid grid-2" style={{ alignItems: "start" }}>
      <div className="panel" style={{ padding: "var(--sp-6)" }}>
        <div className="panel-title">The Board</div>

        <div
          style={{
            background: "var(--saddle-500)",
            border: "4px solid var(--ink-900)",
            padding: "var(--sp-5)",
            position: "relative",
            minHeight: 360,
          }}
        >
          {/* Pegs (rendered as a triangle of dots) */}
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 4 }}>
            {Array.from({ length: rows }).map((_, r) => (
              <div key={r} style={{ display: "flex", gap: 8, justifyContent: "center" }}>
                {Array.from({ length: r + 3 }).map((_, c) => (
                  <span
                    key={c}
                    style={{
                      width: 6,
                      height: 6,
                      background: "var(--gold-100)",
                      borderRadius: 999,
                      boxShadow: "0 0 0 1px var(--ink-900)",
                    }}
                  />
                ))}
              </div>
            ))}

            {animating && (
              <div
                style={{
                  position: "absolute",
                  top: 16,
                  left: "50%",
                  width: 14,
                  height: 14,
                  background: "var(--gold-300)",
                  border: "2px solid var(--ink-900)",
                  borderRadius: 999,
                  transform: "translateX(-50%)",
                  animation: `plinkoFall 1.1s linear forwards`,
                }}
              />
            )}
          </div>

          {/* Buckets */}
          <div
            style={{
              display: "grid",
              gridTemplateColumns: `repeat(${previewTable.length}, 1fr)`,
              gap: 4,
              marginTop: "var(--sp-4)",
            }}
          >
            {previewTable.map((m, i) => (
              <div
                key={i}
                style={{
                  background: animBucket === i
                    ? "var(--gold-300)"
                    : multiplierColor(m),
                  color: animBucket === i ? "var(--ink-900)" : "var(--parchment-50)",
                  border: animBucket === i ? "3px solid var(--ink-900)" : "2px solid var(--ink-900)",
                  fontFamily: "var(--font-display)",
                  fontSize: 11,
                  textAlign: "center",
                  padding: "4px 2px",
                  textShadow: animBucket === i ? "1px 1px 0 var(--gold-100)" : "1px 1px 0 var(--ink-900)",
                  transform: animBucket === i ? "translateY(-4px)" : "none",
                  transition: "transform 0.2s",
                }}
              >
                ×{m}
              </div>
            ))}
          </div>

          <style>{`@keyframes plinkoFall {
            0%   { top: 16px; opacity: 1; }
            70%  { opacity: 1; }
            100% { top: calc(100% - 56px); opacity: 0.6; }
          }`}</style>
        </div>

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
            ×{result.multiplier} → {result.payout > 0 ? `+${result.payout.toLocaleString()} ¢` : "Bust"}
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
                  disabled={busy || animating}
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
                  disabled={busy || animating}
                >
                  {r}
                </button>
              ))}
            </div>
          </div>

          <BetInput value={bet} onChange={setBet} max={Math.max(100, balance ?? 100)} disabled={busy || animating} />

          <button className="btn btn-lg btn-block" onClick={go} disabled={!canDrop}>
            {animating ? "Falling..." : busy ? "..." : "Drop"}
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
