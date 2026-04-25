"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { colorOf, type RouletteBet, type RouletteBetType } from "@/lib/games/roulette/engine";

type Result = {
  winning: number;
  color: "red" | "black" | "green";
  rows: { type: RouletteBetType; value?: number; amount: number; win: boolean; payout: number }[];
  totalBet: number;
  totalPayout: number;
  balance: number;
};

const CHIP_VALUES = [100, 500, 1_000, 5_000, 25_000];

export function RouletteClient() {
  const router = useRouter();
  const [chip, setChip] = useState(1_000);
  const [bets, setBets] = useState<RouletteBet[]>([]);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<Result | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [balance, setBalance] = useState<number | null>(null);

  useEffect(() => {
    fetch("/api/auth/me").then((r) => r.json()).then((d) => setBalance(d.balance ?? null));
  }, []);

  function addBet(type: RouletteBetType, value?: number) {
    setBets((prev) => {
      const idx = prev.findIndex((b) => b.type === type && b.value === value);
      if (idx >= 0) {
        const next = prev.slice();
        next[idx] = { ...next[idx], amount: next[idx].amount + chip };
        return next;
      }
      return [...prev, { type, value, amount: chip }];
    });
    setResult(null);
  }

  function clearBets() {
    setBets([]);
    setResult(null);
  }

  function totalStake() {
    return bets.reduce((s, b) => s + b.amount, 0);
  }

  function findBet(type: RouletteBetType, value?: number) {
    return bets.find((b) => b.type === type && b.value === value);
  }

  async function spin() {
    if (bets.length === 0) return;
    setBusy(true);
    setError(null);
    setResult(null);
    const res = await fetch("/api/games/roulette/spin", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ bets }),
    });
    const data = await res.json();
    setBusy(false);
    if (!res.ok) {
      setError(data.error ?? "error");
      return;
    }
    setResult(data);
    setBalance(data.balance);
    setBets([]);
    router.refresh();
  }

  const stake = totalStake();
  const canSpin = !busy && stake > 0 && (balance == null || balance >= stake);

  return (
    <div className="grid grid-2" style={{ alignItems: "start" }}>
      <div className="panel" style={{ padding: "var(--sp-6)" }}>
        <div className="panel-title">The Wheel</div>

        <div
          className="center"
          style={{
            background: "var(--cactus-700)",
            border: "4px solid var(--ink-900)",
            padding: "var(--sp-7)",
            minHeight: 240,
            flexDirection: "column",
            gap: "var(--sp-4)",
          }}
        >
          {result ? (
            <>
              <div
                style={{
                  width: 160,
                  height: 160,
                  borderRadius: 999,
                  background: result.color === "red"
                    ? "var(--crimson-300)"
                    : result.color === "black"
                    ? "var(--ink-900)"
                    : "var(--cactus-300)",
                  border: "6px solid var(--ink-900)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontFamily: "var(--font-display)",
                  fontSize: 64,
                  color: "var(--parchment-50)",
                  textShadow: "3px 3px 0 var(--ink-900)",
                  boxShadow: "var(--bevel-light), var(--bevel-dark), 0 12px 0 0 var(--ink-900)",
                }}
              >
                {result.winning}
              </div>
              <div
                className="sign"
                style={{
                  background: result.totalPayout > result.totalBet
                    ? "var(--cactus-500)"
                    : result.totalPayout > 0
                    ? "var(--saddle-300)"
                    : "var(--crimson-500)",
                }}
              >
                {result.totalPayout > 0
                  ? `+${(result.totalPayout - result.totalBet).toLocaleString()} ¢`
                  : "House wins"}
              </div>
            </>
          ) : (
            <p className="text-mute" style={{ color: "var(--parchment-200)" }}>
              Place bets and spin.
            </p>
          )}
        </div>

        <div style={{ marginTop: "var(--sp-5)" }}>
          <div className="label">Number Grid</div>
          <NumberGrid onPick={(n) => addBet("straight", n)} highlight={result?.winning} />
        </div>

        <div className="row" style={{ marginTop: "var(--sp-4)", flexWrap: "wrap" }}>
          <button className="btn btn-ghost btn-sm" onClick={() => addBet("low")}>1–18</button>
          <button className="btn btn-ghost btn-sm" onClick={() => addBet("even")}>EVEN</button>
          <button className="btn btn-ghost btn-sm" onClick={() => addBet("red")} style={{ background: "var(--crimson-300)", color: "var(--parchment-50)" }}>RED</button>
          <button className="btn btn-ghost btn-sm" onClick={() => addBet("black")} style={{ background: "var(--ink-900)", color: "var(--parchment-50)" }}>BLACK</button>
          <button className="btn btn-ghost btn-sm" onClick={() => addBet("odd")}>ODD</button>
          <button className="btn btn-ghost btn-sm" onClick={() => addBet("high")}>19–36</button>
        </div>

        <div className="row" style={{ marginTop: "var(--sp-3)", flexWrap: "wrap" }}>
          <button className="btn btn-wood btn-sm" onClick={() => addBet("dozen", 1)}>1st 12</button>
          <button className="btn btn-wood btn-sm" onClick={() => addBet("dozen", 2)}>2nd 12</button>
          <button className="btn btn-wood btn-sm" onClick={() => addBet("dozen", 3)}>3rd 12</button>
          <button className="btn btn-wood btn-sm" onClick={() => addBet("column", 1)}>Col 1</button>
          <button className="btn btn-wood btn-sm" onClick={() => addBet("column", 2)}>Col 2</button>
          <button className="btn btn-wood btn-sm" onClick={() => addBet("column", 3)}>Col 3</button>
        </div>

        {error && <p style={{ color: "var(--crimson-500)", marginTop: "var(--sp-3)" }}>{labelFor(error)}</p>}
      </div>

      <div className="stack-lg">
        <div className="panel" style={{ padding: "var(--sp-6)" }}>
          <div className="panel-title">Chip</div>
          <div className="row" style={{ flexWrap: "wrap" }}>
            {CHIP_VALUES.map((v) => (
              <button
                key={v}
                type="button"
                className={`btn btn-sm ${chip === v ? "" : "btn-ghost"}`}
                onClick={() => setChip(v)}
              >
                {v.toLocaleString()}
              </button>
            ))}
          </div>
        </div>

        <div className="panel" style={{ padding: "var(--sp-6)" }}>
          <div className="panel-title">Your Bets</div>
          {bets.length === 0 ? (
            <p className="text-mute">Click numbers or outside bets to place chips.</p>
          ) : (
            <div className="stack">
              {bets.map((b, i) => (
                <div key={i} className="between" style={{ padding: "var(--sp-2) 0", borderBottom: "2px dashed var(--saddle-300)" }}>
                  <span style={{ fontFamily: "var(--font-display)", textTransform: "uppercase" }}>
                    {labelBet(b)}
                  </span>
                  <span className="text-money">{b.amount.toLocaleString()} ¢</span>
                </div>
              ))}
              <div className="between" style={{ marginTop: "var(--sp-3)" }}>
                <span className="uppercase">Total</span>
                <span className="text-money" style={{ fontFamily: "var(--font-display)", fontSize: "var(--fs-h3)" }}>
                  {stake.toLocaleString()} ¢
                </span>
              </div>
            </div>
          )}

          <div className="row" style={{ marginTop: "var(--sp-5)" }}>
            <button className="btn btn-ghost btn-block" onClick={clearBets} disabled={busy || bets.length === 0}>
              Clear
            </button>
            <button className="btn btn-block" onClick={spin} disabled={!canSpin}>
              {busy ? "Spinning..." : "Spin"}
            </button>
          </div>
        </div>

        {result && (
          <div className="panel" style={{ padding: "var(--sp-6)" }}>
            <div className="panel-title">Last Spin</div>
            <p className="text-mute" style={{ marginBottom: "var(--sp-3)" }}>
              Winning: <b>{result.winning}</b> ({result.color})
            </p>
            {result.rows.map((r, i) => (
              <div key={i} className="between" style={{ padding: "var(--sp-2) 0", borderBottom: "2px dashed var(--saddle-300)" }}>
                <span style={{ fontFamily: "var(--font-display)" }}>
                  {labelBet(r as RouletteBet)}
                </span>
                <span style={{ color: r.win ? "var(--cactus-500)" : "var(--crimson-500)" }}>
                  {r.win ? `+${r.payout.toLocaleString()}` : `-${r.amount.toLocaleString()}`}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );

  function findStake(type: RouletteBetType, value?: number) {
    const b = findBet(type, value);
    return b?.amount ?? 0;
  }

  function NumberGrid({
    onPick,
    highlight,
  }: {
    onPick: (n: number) => void;
    highlight?: number;
  }) {
    const numbers = Array.from({ length: 36 }, (_, i) => i + 1);
    return (
      <div style={{ display: "flex", gap: "var(--sp-1)" }}>
        <button
          type="button"
          className="tile"
          onClick={() => onPick(0)}
          style={{
            padding: 0,
            width: 56,
            height: 168,
            background: "var(--cactus-300)",
            color: "var(--parchment-50)",
            fontFamily: "var(--font-display)",
            fontSize: 32,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            border: highlight === 0 ? "4px solid var(--gold-300)" : "3px solid var(--ink-900)",
            cursor: "pointer",
          }}
        >
          0
          {findStake("straight", 0) > 0 && (
            <span style={{ position: "absolute", fontSize: 12, marginTop: 32 }}>·</span>
          )}
        </button>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(12, 1fr)",
            gridTemplateRows: "repeat(3, 1fr)",
            gap: "var(--sp-1)",
            flex: 1,
          }}
        >
          {/* Rows go 3,6,9... / 2,5,8... / 1,4,7... — top is highest number (3) */}
          {[3, 2, 1].flatMap((rowOffset) =>
            numbers
              .filter((_, i) => (i % 3) + 1 === rowOffset)
              .map((n) => {
                const c = colorOf(n);
                const stake = findStake("straight", n);
                const isWinner = highlight === n;
                return (
                  <button
                    key={n}
                    type="button"
                    className="tile"
                    onClick={() => onPick(n)}
                    style={{
                      padding: 0,
                      height: 52,
                      background: c === "red" ? "var(--crimson-300)" : "var(--ink-900)",
                      color: "var(--parchment-50)",
                      fontFamily: "var(--font-display)",
                      fontSize: 22,
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      border: isWinner ? "4px solid var(--gold-300)" : "2px solid var(--ink-900)",
                      cursor: "pointer",
                      position: "relative",
                    }}
                  >
                    {n}
                    {stake > 0 && (
                      <span
                        style={{
                          position: "absolute",
                          top: 2,
                          right: 4,
                          fontSize: 10,
                          background: "var(--gold-300)",
                          color: "var(--ink-900)",
                          padding: "1px 4px",
                          border: "1px solid var(--ink-900)",
                        }}
                      >
                        {fmtChip(stake)}
                      </span>
                    )}
                  </button>
                );
              })
          )}
        </div>
      </div>
    );
  }
}

function labelBet(b: RouletteBet | { type: RouletteBetType; value?: number }) {
  switch (b.type) {
    case "straight":
      return `# ${b.value}`;
    case "dozen":
      return ["1st 12", "2nd 12", "3rd 12"][((b.value ?? 1) - 1)] || "Dozen";
    case "column":
      return `Col ${b.value}`;
    default:
      return b.type.toUpperCase();
  }
}

function fmtChip(n: number) {
  if (n >= 1000) return `${Math.floor(n / 1000)}k`;
  return String(n);
}

function labelFor(code: string) {
  const labels: Record<string, string> = {
    insufficient_funds: "Not enough Coins.",
    no_bets: "Place at least one bet.",
    bet_too_low: "Each bet must be at least 100.",
    bet_too_high: "Total stake too high.",
    too_many_bets: "Too many bets in one spin.",
  };
  return labels[code] ?? "Something went wrong.";
}
