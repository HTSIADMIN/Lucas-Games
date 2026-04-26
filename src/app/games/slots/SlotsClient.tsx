"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { BetInput } from "@/components/BetInput";
import { GameIcon, type IconName } from "@/components/GameIcon";
import { SYMBOLS, PAYTABLE, type SlotSymbol } from "@/lib/games/slots/engine";

const ICON: Record<SlotSymbol, IconName> = {
  BOOT: "slot.boot",
  GUN: "slot.gun",
  STAR: "slot.star",
  GOLD: "slot.gold",
  SHERIFF: "slot.sheriff",
};

const COLOR: Record<SlotSymbol, string> = {
  BOOT: "var(--saddle-300)",
  GUN: "var(--ink-800)",
  STAR: "var(--gold-300)",
  GOLD: "var(--gold-500)",
  SHERIFF: "var(--crimson-300)",
};

type Result = {
  reels: [SlotSymbol, SlotSymbol, SlotSymbol];
  kind: "three" | "two" | "none";
  symbol: SlotSymbol | null;
  multiplier: number;
  payout: number;
  balance: number;
};

export function SlotsClient() {
  const router = useRouter();
  const [bet, setBet] = useState(1_000);
  const [busy, setBusy] = useState(false);
  const [reels, setReels] = useState<[SlotSymbol, SlotSymbol, SlotSymbol]>(["BOOT", "GUN", "STAR"]);
  const [result, setResult] = useState<Result | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [balance, setBalance] = useState<number | null>(null);

  useEffect(() => {
    fetch("/api/auth/me").then((r) => r.json()).then((d) => setBalance(d.balance ?? null));
  }, []);

  async function spin() {
    setBusy(true);
    setError(null);
    setResult(null);

    // Brief reel-spinning animation: cycle random symbols for 700ms then snap to result.
    const cycler = setInterval(() => {
      setReels([
        SYMBOLS[Math.floor(Math.random() * SYMBOLS.length)],
        SYMBOLS[Math.floor(Math.random() * SYMBOLS.length)],
        SYMBOLS[Math.floor(Math.random() * SYMBOLS.length)],
      ]);
    }, 80);

    const res = await fetch("/api/games/slots/spin", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ bet }),
    });
    const data = await res.json();
    await new Promise((r) => setTimeout(r, 600));
    clearInterval(cycler);

    setBusy(false);
    if (!res.ok) {
      setError(data.error ?? "error");
      return;
    }
    setReels(data.reels);
    setResult(data);
    setBalance(data.balance);
    router.refresh();
  }

  const canSpin = !busy && bet >= 100 && (balance == null || balance >= bet);

  return (
    <div className="grid grid-2" style={{ alignItems: "start" }}>
      <div className="panel" style={{ padding: "var(--sp-6)" }}>
        <div className="panel-title">Reels</div>

        <div
          style={{
            background: "var(--saddle-500)",
            border: "4px solid var(--ink-900)",
            padding: "var(--sp-6)",
            display: "grid",
            gridTemplateColumns: "repeat(3, 1fr)",
            gap: "var(--sp-3)",
          }}
        >
          {reels.map((sym, i) => (
            <div
              key={i}
              style={{
                aspectRatio: "1 / 1",
                background: COLOR[sym],
                border: "4px solid var(--ink-900)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                boxShadow: "var(--bevel-light), var(--bevel-dark)",
              }}
            >
              <GameIcon name={ICON[sym]} size={88} />
            </div>
          ))}
        </div>

        {result && (
          <div
            className="sign"
            style={{
              marginTop: "var(--sp-5)",
              display: "block",
              textAlign: "center",
              background:
                result.kind === "three"
                  ? "var(--gold-300)"
                  : result.kind === "two"
                  ? "var(--cactus-500)"
                  : "var(--crimson-500)",
              color: result.kind === "three" ? "var(--ink-900)" : "var(--parchment-50)",
            }}
          >
            {result.kind === "three"
              ? `JACKPOT! Bet ${bet.toLocaleString()} · ×${result.multiplier} → +${(result.payout - bet).toLocaleString()} ¢`
              : result.kind === "two"
              ? `Pair · Bet ${bet.toLocaleString()} · ×${result.multiplier} → +${(result.payout - bet).toLocaleString()} ¢`
              : `Bet ${bet.toLocaleString()} · no match`}
          </div>
        )}
        {error && (
          <p style={{ color: "var(--crimson-500)", marginTop: "var(--sp-3)" }}>{labelFor(error)}</p>
        )}
      </div>

      <div className="stack-lg">
        <div className="panel" style={{ padding: "var(--sp-6)" }}>
          <div className="panel-title">Place Your Bet</div>
          <div className="stack-lg">
            <BetInput value={bet} onChange={setBet} max={Math.max(100, balance ?? 100)} disabled={busy} />
            <button className="btn btn-lg btn-block" onClick={spin} disabled={!canSpin}>
              {busy ? "Spinning..." : "Spin"}
            </button>
          </div>
        </div>

        <div className="panel" style={{ padding: "var(--sp-6)" }}>
          <div className="panel-title">Paytable</div>
          <table style={{ width: "100%", borderCollapse: "collapse", fontFamily: "var(--font-display)" }}>
            <thead>
              <tr style={{ borderBottom: "2px dashed var(--saddle-300)" }}>
                <th style={{ textAlign: "left", padding: "var(--sp-2)" }}>Symbol</th>
                <th style={{ textAlign: "right", padding: "var(--sp-2)" }}>×3</th>
                <th style={{ textAlign: "right", padding: "var(--sp-2)" }}>×2</th>
              </tr>
            </thead>
            <tbody>
              {SYMBOLS.map((sym) => (
                <tr key={sym} style={{ borderBottom: "2px dashed var(--saddle-300)" }}>
                  <td style={{ padding: "var(--sp-2)" }}>
                    <GameIcon name={ICON[sym]} size={28} style={{ marginRight: 8 }} />
                    {sym}
                  </td>
                  <td style={{ textAlign: "right", padding: "var(--sp-2)" }} className="text-money">
                    ×{PAYTABLE.THREE_OF[sym]}
                  </td>
                  <td style={{ textAlign: "right", padding: "var(--sp-2)" }} className="text-mute">
                    ×{PAYTABLE.TWO_OF[sym]}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function labelFor(code: string) {
  const labels: Record<string, string> = {
    insufficient_funds: "Not enough Coins.",
    bet_too_low: "Bet must be at least 100.",
    bet_invalid: "Invalid bet.",
  };
  return labels[code] ?? "Something went wrong.";
}
