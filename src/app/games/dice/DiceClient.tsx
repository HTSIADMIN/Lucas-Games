"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { BetInput } from "@/components/BetInput";
import { chanceOfWin, multiplierFor, type DiceDirection } from "@/lib/games/dice/engine";

type Result = {
  roll: number;
  win: boolean;
  multiplier: number;
  payout: number;
  balance: number;
};

export function DiceClient() {
  const router = useRouter();
  const [bet, setBet] = useState(1_000);
  const [target, setTarget] = useState(50);
  const [direction, setDirection] = useState<DiceDirection>("under");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<Result | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [balance, setBalance] = useState<number | null>(null);

  useEffect(() => {
    fetch("/api/auth/me").then((r) => r.json()).then((d) => setBalance(d.balance ?? null));
  }, []);

  const chance = useMemo(() => Math.round(chanceOfWin(target, direction) * 10000) / 100, [target, direction]);
  const mult = useMemo(() => multiplierFor(target, direction), [target, direction]);
  const winAmount = Math.floor(bet * mult);

  async function go() {
    setBusy(true);
    setError(null);
    setResult(null);
    const res = await fetch("/api/games/dice/roll", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ bet, target, direction }),
    });
    const data = await res.json();
    setBusy(false);
    if (!res.ok) {
      setError(data.error ?? "error");
      return;
    }
    setResult(data);
    setBalance(data.balance);
    router.refresh();
  }

  const canRoll = !busy && bet >= 100 && (balance == null || balance >= bet);

  return (
    <div className="grid grid-2" style={{ alignItems: "start" }}>
      <div className="panel" style={{ padding: "var(--sp-6)" }}>
        <div className="panel-title">Roll</div>

        <div
          className="center"
          style={{
            background: "var(--saddle-500)",
            border: "4px solid var(--ink-900)",
            padding: "var(--sp-7)",
            minHeight: 280,
            position: "relative",
            flexDirection: "column",
            gap: "var(--sp-4)",
          }}
        >
          <div
            style={{
              fontFamily: "var(--font-display)",
              fontSize: 120,
              color: result ? (result.win ? "var(--cactus-100)" : "var(--crimson-100)") : "var(--gold-300)",
              textShadow: "4px 4px 0 var(--ink-900)",
              lineHeight: 1,
            }}
          >
            {result ? result.roll : "?"}
          </div>
          <div className="text-mute" style={{ color: "var(--parchment-200)" }}>
            {direction === "under" ? `Roll under ${target}` : `Roll over ${target}`}
          </div>
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
            {result.win ? `+${result.payout.toLocaleString()} ¢ (×${result.multiplier})` : "Bust"}
          </div>
        )}
        {error && (
          <p style={{ color: "var(--crimson-500)", marginTop: "var(--sp-3)" }}>{labelFor(error)}</p>
        )}
      </div>

      <div className="panel" style={{ padding: "var(--sp-6)" }}>
        <div className="panel-title">Pick Your Odds</div>

        <div className="stack-lg">
          <div>
            <label className="label">Direction</label>
            <div className="row" style={{ gap: "var(--sp-3)" }}>
              <button
                type="button"
                className={`btn btn-block ${direction === "under" ? "" : "btn-ghost"}`}
                onClick={() => setDirection("under")}
                disabled={busy}
              >
                Under
              </button>
              <button
                type="button"
                className={`btn btn-block ${direction === "over" ? "" : "btn-ghost"}`}
                onClick={() => setDirection("over")}
                disabled={busy}
              >
                Over
              </button>
            </div>
          </div>

          <div>
            <label className="label">Target ({target})</label>
            <input
              type="range"
              min={2}
              max={99}
              value={target}
              onChange={(e) => setTarget(Number(e.target.value))}
              disabled={busy}
              style={{ width: "100%" }}
            />
          </div>

          <div className="grid grid-3">
            <div className="panel" style={{ background: "var(--parchment-200)", padding: "var(--sp-3)" }}>
              <div className="label">Chance</div>
              <div style={{ fontSize: "var(--fs-h3)", fontFamily: "var(--font-display)" }}>{chance}%</div>
            </div>
            <div className="panel" style={{ background: "var(--parchment-200)", padding: "var(--sp-3)" }}>
              <div className="label">Multi</div>
              <div style={{ fontSize: "var(--fs-h3)", fontFamily: "var(--font-display)" }}>×{mult}</div>
            </div>
            <div className="panel" style={{ background: "var(--gold-100)", padding: "var(--sp-3)" }}>
              <div className="label">Win</div>
              <div className="text-money" style={{ fontSize: "var(--fs-h3)", fontFamily: "var(--font-display)" }}>
                {winAmount.toLocaleString()}
              </div>
            </div>
          </div>

          <BetInput value={bet} onChange={setBet} max={Math.max(100, balance ?? 100)} disabled={busy} />

          <button className="btn btn-lg btn-block" onClick={go} disabled={!canRoll}>
            {busy ? "Rolling..." : "Roll"}
          </button>
        </div>
      </div>
    </div>
  );
}

function labelFor(code: string) {
  const labels: Record<string, string> = {
    insufficient_funds: "Not enough Coins.",
    bet_too_low: "Bet must be at least 100.",
    target_invalid: "Pick a target between 2 and 99.",
    direction_invalid: "Pick over or under.",
  };
  return labels[code] ?? "Something went wrong.";
}
