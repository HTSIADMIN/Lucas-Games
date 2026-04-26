"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { BetInput } from "@/components/BetInput";

type Side = "heads" | "tails";

type Result = {
  result: Side;
  win: boolean;
  payout: number;
  balance: number;
};

type HistoryEntry = { id: number; result: Side; win: boolean };

const MAX_HISTORY = 12;

export function CoinFlipClient() {
  const router = useRouter();
  const [bet, setBet] = useState(1_000);
  const [pick, setPick] = useState<Side>("heads");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<Result | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [balance, setBalance] = useState<number | null>(null);
  const [history, setHistory] = useState<HistoryEntry[]>([]);

  useEffect(() => {
    fetch("/api/auth/me")
      .then((r) => r.json())
      .then((d) => setBalance(d.balance ?? null));
  }, []);

  async function flip() {
    setBusy(true);
    setError(null);
    setResult(null);
    const res = await fetch("/api/games/coinflip/flip", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ bet, pick }),
    });
    const data = await res.json();
    setBusy(false);
    if (!res.ok) {
      setError(data.error ?? "error");
      return;
    }
    setResult(data);
    setBalance(data.balance);
    setHistory((prev) => {
      const next: HistoryEntry = { id: Date.now(), result: data.result, win: data.win };
      return [next, ...prev].slice(0, MAX_HISTORY);
    });
    router.refresh();
  }

  const canFlip = !busy && bet >= 100 && (balance == null || balance >= bet);

  return (
    <div className="grid grid-2" style={{ alignItems: "start" }}>
      <div className="panel" style={{ padding: "var(--sp-6)" }}>
        <div className="panel-title">The Coin</div>
        <div
          className="center"
          style={{
            background: "var(--saddle-500)",
            border: "4px solid var(--ink-900)",
            padding: "var(--sp-7)",
            minHeight: 280,
            position: "relative",
          }}
        >
          <CoinFace side={result?.result ?? pick} flipping={busy} />
        </div>

        {result && (
          <div
            className="sign"
            style={{
              marginTop: "var(--sp-5)",
              display: "block",
              textAlign: "center",
              background: result.win ? "var(--cactus-500)" : "var(--crimson-500)",
            }}
          >
            {result.win
              ? `Bet ${bet.toLocaleString()} → +${(result.payout - bet).toLocaleString()} ¢`
              : `Bet ${bet.toLocaleString()} · bust`}
          </div>
        )}
        {error && (
          <p style={{ color: "var(--crimson-500)", marginTop: "var(--sp-3)" }}>{errorLabel(error)}</p>
        )}

        {history.length > 0 && (
          <div style={{ marginTop: "var(--sp-5)" }}>
            <div className="label" style={{ marginBottom: "var(--sp-2)" }}>Recent flips</div>
            <div className="row" style={{ gap: 6, flexWrap: "wrap" }}>
              {history.map((h) => (
                <span
                  key={h.id}
                  title={`${h.result.toUpperCase()} · ${h.win ? "win" : "loss"}`}
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    justifyContent: "center",
                    width: 32,
                    height: 32,
                    background: h.win ? "var(--cactus-300)" : "var(--crimson-300)",
                    color: "var(--ink-900)",
                    border: "2px solid var(--ink-900)",
                    fontFamily: "var(--font-display)",
                    fontSize: 18,
                    boxShadow: "var(--bevel-light)",
                    textShadow: "1px 1px 0 var(--parchment-50)",
                  }}
                >
                  {h.result === "heads" ? "H" : "T"}
                </span>
              ))}
            </div>
          </div>
        )}
      </div>

      <div className="panel" style={{ padding: "var(--sp-6)" }}>
        <div className="panel-title">Place Your Bet</div>

        <div className="stack-lg">
          <div>
            <label className="label">Pick a side</label>
            <div className="row" style={{ gap: "var(--sp-3)" }}>
              <button
                type="button"
                className={`btn btn-block ${pick === "heads" ? "" : "btn-ghost"}`}
                onClick={() => setPick("heads")}
                disabled={busy}
              >
                Heads
              </button>
              <button
                type="button"
                className={`btn btn-block ${pick === "tails" ? "" : "btn-ghost"}`}
                onClick={() => setPick("tails")}
                disabled={busy}
              >
                Tails
              </button>
            </div>
          </div>

          <BetInput value={bet} onChange={setBet} max={Math.max(100, balance ?? 100)} disabled={busy} />

          <button className="btn btn-lg btn-block" onClick={flip} disabled={!canFlip}>
            {busy ? "Flipping..." : "Flip"}
          </button>
        </div>
      </div>
    </div>
  );
}

function CoinFace({ side, flipping }: { side: Side; flipping: boolean }) {
  return (
    <div
      style={{
        width: 220,
        height: 220,
        background: "var(--gold-300)",
        border: "6px solid var(--ink-900)",
        borderRadius: "999px",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        boxShadow: "0 12px 0 0 var(--gold-700), 0 0 0 4px var(--gold-700) inset",
        animation: flipping ? "coinSpin 0.6s linear infinite" : "none",
        fontFamily: "var(--font-display)",
        fontSize: 56,
        color: "var(--ink-900)",
        textShadow: "2px 2px 0 var(--gold-100)",
      }}
    >
      {side === "heads" ? "H" : "T"}
      <style>{`@keyframes coinSpin { 0% { transform: rotateY(0deg);} 100% { transform: rotateY(360deg);} }`}</style>
    </div>
  );
}

function errorLabel(code: string) {
  const labels: Record<string, string> = {
    insufficient_funds: "Not enough Coins.",
    bet_too_low: "Bet must be at least 100.",
    bet_invalid: "Invalid bet.",
    pick_invalid: "Pick heads or tails.",
  };
  return labels[code] ?? "Something went wrong.";
}
