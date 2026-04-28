"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { BetInput } from "@/components/BetInput";
import { GameIcon } from "@/components/GameIcon";
import * as Sfx from "@/lib/sfx";

type Status = "idle" | "active" | "busted" | "cashed";

type GameState = {
  gameId: string | null;
  status: Status;
  revealed: string;
  layout?: string;
  mineCount: number;
  multiplier: number;
  nextMultiplier: number;
  bet: number;
  payout: number;
};

const EMPTY: GameState = {
  gameId: null,
  status: "idle",
  revealed: "-".repeat(25),
  mineCount: 3,
  multiplier: 1,
  nextMultiplier: 1,
  bet: 0,
  payout: 0,
};

export function MinesClient() {
  const router = useRouter();
  const [bet, setBet] = useState(1_000);
  const [mines, setMines] = useState(3);
  const [game, setGame] = useState<GameState>(EMPTY);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [balance, setBalance] = useState<number | null>(null);

  useEffect(() => {
    fetch("/api/auth/me").then((r) => r.json()).then((d) => setBalance(d.balance ?? null));
  }, []);

  async function start() {
    setBusy(true);
    setError(null);
    Sfx.play("coins.handle");
    const res = await fetch("/api/games/mines/start", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ bet, mineCount: mines }),
    });
    const data = await res.json();
    setBusy(false);
    if (!res.ok) {
      setError(data.error ?? "error");
      return;
    }
    setGame({
      gameId: data.gameId,
      status: data.status,
      revealed: data.revealed,
      mineCount: data.mineCount,
      multiplier: data.multiplier,
      nextMultiplier: data.nextMultiplier,
      bet: data.bet,
      payout: 0,
    });
    setBalance(data.balance);
    router.refresh();
  }

  async function reveal(cell: number) {
    if (!game.gameId || game.status !== "active" || busy) return;
    if (game.revealed[cell] !== "-") return;
    setBusy(true);
    setError(null);
    const res = await fetch(`/api/games/mines/${game.gameId}/reveal`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ cell }),
    });
    const data = await res.json();
    setBusy(false);
    if (!res.ok) {
      setError(data.error ?? "error");
      return;
    }
    setGame((g) => ({
      ...g,
      status: data.status,
      revealed: data.revealed,
      layout: data.layout ?? g.layout,
      multiplier: data.multiplier,
      nextMultiplier: data.nextMultiplier,
    }));
    setBalance(data.balance);
    if (data.status === "lost") Sfx.play("ui.notify");
    else Sfx.play("coins.clink");
    router.refresh();
  }

  async function cashout() {
    if (!game.gameId || game.status !== "active") return;
    setBusy(true);
    setError(null);
    const res = await fetch(`/api/games/mines/${game.gameId}/cashout`, { method: "POST" });
    const data = await res.json();
    setBusy(false);
    if (!res.ok) {
      setError(data.error ?? "error");
      return;
    }
    setGame((g) => ({
      ...g,
      status: data.status,
      revealed: data.revealed,
      layout: data.layout,
      payout: data.payout,
      multiplier: data.multiplier,
    }));
    setBalance(data.balance);
    // Tier-scale the cashout stinger by multiplier reached.
    if ((data.multiplier ?? 0) >= 10) Sfx.play("win.big");
    else if ((data.multiplier ?? 0) >= 3) Sfx.play("win.levelup");
    else Sfx.play("win.notify");
    router.refresh();
  }

  function newRound() {
    setGame(EMPTY);
    setError(null);
  }

  const inGame = game.status === "active";
  const settled = game.status === "busted" || game.status === "cashed";
  const safeCount = (game.revealed.match(/r/g) || []).length;
  const potential = Math.floor(game.bet * game.multiplier);

  return (
    <div className="grid grid-2" style={{ alignItems: "start" }}>
      <div className="panel" style={{ padding: "var(--sp-6)" }}>
        <div className="panel-title">5 × 5</div>

        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(5, 1fr)",
            gap: "var(--sp-2)",
            background: "var(--saddle-500)",
            border: "4px solid var(--ink-900)",
            padding: "var(--sp-4)",
          }}
        >
          {Array.from({ length: 25 }).map((_, i) => {
            const r = game.revealed[i];
            const layoutChar = game.layout?.[i];
            const isRevealedSafe = r === "r";
            const isRevealedMine = r === "x";
            const isHiddenMine = layoutChar === "m" && r === "-"; // shown only after settlement

            const canClick = inGame && r === "-" && !busy;
            return (
              <button
                key={i}
                onClick={() => reveal(i)}
                disabled={!canClick}
                style={{
                  aspectRatio: "1 / 1",
                  border: "3px solid var(--ink-900)",
                  background: isRevealedMine || isHiddenMine
                    ? "var(--crimson-300)"
                    : isRevealedSafe
                    ? "var(--cactus-300)"
                    : "var(--parchment-100)",
                  cursor: canClick ? "pointer" : "default",
                  fontFamily: "var(--font-display)",
                  fontSize: 32,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  boxShadow: isRevealedSafe || isRevealedMine || isHiddenMine
                    ? "var(--bevel-light), var(--bevel-dark)"
                    : "var(--bevel-light), var(--bevel-dark), var(--sh-card-rest)",
                  transition: "transform 0.1s",
                  transform: isRevealedMine ? "scale(1.05)" : "scale(1)",
                }}
              >
                {isRevealedMine || isHiddenMine ? (
                  <GameIcon name="mines.bomb" size={36} />
                ) : isRevealedSafe ? (
                  <GameIcon name="mines.gem" size={32} />
                ) : null}
              </button>
            );
          })}
        </div>

        {settled && (
          <div
            className="sign"
            style={{
              marginTop: "var(--sp-5)",
              display: "block",
              textAlign: "center",
              background: game.status === "cashed" ? "var(--cactus-500)" : "var(--crimson-500)",
            }}
          >
            {game.status === "cashed"
              ? `Cashed · Bet ${game.bet.toLocaleString()} · ×${game.multiplier} → +${(game.payout - game.bet).toLocaleString()} ¢`
              : "Boom!"}
          </div>
        )}

        {error && <p style={{ color: "var(--crimson-500)", marginTop: "var(--sp-3)" }}>{labelFor(error)}</p>}
      </div>

      <div className="panel" style={{ padding: "var(--sp-6)" }}>
        <div className="panel-title">{inGame ? "Cash Out?" : "Set Up"}</div>

        {inGame ? (
          <div className="stack-lg">
            <div className="grid grid-2">
              <div className="panel" style={{ background: "var(--parchment-200)", padding: "var(--sp-3)" }}>
                <div className="label">Multi</div>
                <div className="text-money" style={{ fontSize: "var(--fs-h2)", fontFamily: "var(--font-display)" }}>
                  ×{game.multiplier}
                </div>
              </div>
              <div className="panel" style={{ background: "var(--gold-100)", padding: "var(--sp-3)" }}>
                <div className="label">Cash Out</div>
                <div className="text-money" style={{ fontSize: "var(--fs-h2)", fontFamily: "var(--font-display)" }}>
                  {potential.toLocaleString()}
                </div>
              </div>
            </div>
            <p className="text-mute">
              {safeCount} safe revealed · next reveal would be ×{game.nextMultiplier}
            </p>
            <button className="btn btn-lg btn-block" onClick={cashout} disabled={busy || safeCount === 0}>
              {busy ? "..." : `Cash Out (${potential.toLocaleString()} ¢)`}
            </button>
          </div>
        ) : settled ? (
          <div className="stack-lg">
            <p className="text-mute">
              {game.status === "cashed"
                ? `You bet ${game.bet.toLocaleString()} and walked away with ${(game.payout - game.bet).toLocaleString()} ¢ profit.`
                : "The mine got you. Want another go?"}
            </p>
            <button className="btn btn-block" onClick={newRound} disabled={busy}>
              New Round
            </button>
          </div>
        ) : (
          <div className="stack-lg">
            <div>
              <label className="label">Mines ({mines})</label>
              <input
                type="range"
                min={1}
                max={24}
                value={mines}
                onChange={(e) => setMines(Number(e.target.value))}
                style={{ width: "100%" }}
              />
              <div className="row" style={{ flexWrap: "wrap" }}>
                {[1, 3, 5, 10, 24].map((n) => (
                  <button
                    key={n}
                    type="button"
                    className={`btn btn-sm ${mines === n ? "" : "btn-ghost"}`}
                    onClick={() => setMines(n)}
                  >
                    {n}
                  </button>
                ))}
              </div>
            </div>

            <BetInput value={bet} onChange={setBet} max={Math.max(100, balance ?? 100)} disabled={busy} />

            <button
              className="btn btn-lg btn-block"
              onClick={start}
              disabled={busy || bet < 100 || (balance != null && balance < bet)}
            >
              {busy ? "..." : "Plant Mines"}
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
    mine_count_invalid: "Pick 1–24 mines.",
    not_found: "Game not found.",
    not_active: "Game already finished.",
    no_reveals: "Reveal at least one cell first.",
  };
  return labels[code] ?? "Something went wrong.";
}
