"use client";

import { useCallback, useEffect, useState } from "react";
import { ARCADE_GAME_LABEL, type ArcadeGame } from "@/lib/games/arcade/upgrades";

// Earn-rate upgrade card rendered inline on each arcade game page
// (Crossy Road, Flappy, Snake). Shows the player's current level,
// the multiplier in effect, and a buy button for the next tier.
// Hits /api/earn/arcade/state on mount + after each purchase.

type GameState = {
  game: ArcadeGame;
  level: number;
  maxLevel: number;
  currentMultiplier: number;
  nextMultiplier: number | null;
  nextCost: number | null;
};

export function ArcadeUpgradePanel({ game }: { game: ArcadeGame }) {
  const [state, setState] = useState<GameState | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      const r = await fetch("/api/earn/arcade/state");
      if (!r.ok) return;
      const d = (await r.json()) as { games: GameState[] };
      const mine = d.games.find((g) => g.game === game) ?? null;
      setState(mine);
    } catch {
      // ignore — panel just stays in its loading state
    }
  }, [game]);

  useEffect(() => { void refresh(); }, [refresh]);

  async function buy() {
    if (busy || !state || state.nextCost == null) return;
    setBusy(true);
    setError(null);
    try {
      const r = await fetch("/api/earn/arcade/upgrade", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ game }),
      });
      const d = await r.json();
      if (!r.ok) {
        setError(labelFor(d.error ?? "error"));
      } else {
        // Re-broadcast balance so the header LiveBalance / snapshot
        // pill updates without waiting for the next 10s poll.
        if (d.balance != null) {
          window.dispatchEvent(new CustomEvent("lg:balance", { detail: d.balance }));
        }
        // Notify the active arcade client (Crossy uses this to
        // refresh its in-game coin spawn rate without a reload).
        window.dispatchEvent(new CustomEvent("lg:arcade-upgrade", {
          detail: { game, level: d.level },
        }));
        await refresh();
      }
    } catch {
      setError("Network error.");
    } finally {
      setBusy(false);
    }
  }

  if (!state) {
    return (
      <section className="panel" style={{ padding: "var(--sp-4)" }}>
        <div className="panel-title">Earn-Rate Upgrade</div>
        <p className="text-mute">Loading...</p>
      </section>
    );
  }

  const atMax = state.nextCost == null;
  const pct = (state.level / state.maxLevel) * 100;

  return (
    <section className="panel" style={{ padding: "var(--sp-4)" }}>
      <div className="row" style={{ justifyContent: "space-between", alignItems: "baseline", marginBottom: "var(--sp-2)" }}>
        <div className="panel-title" style={{ margin: 0 }}>
          Earn-Rate Upgrade
        </div>
        <span
          className="badge"
          style={{
            background: "var(--gold-300)",
            color: "var(--ink-900)",
            border: "2px solid var(--ink-900)",
            fontFamily: "var(--font-display)",
            fontSize: 11,
          }}
        >
          ×{state.currentMultiplier.toFixed(2)}
        </span>
      </div>
      <p className="text-mute" style={{ fontSize: 12, margin: "0 0 var(--sp-3)" }}>
        Spend wallet ¢ to permanently boost the coins you earn from{" "}
        <b>{ARCADE_GAME_LABEL[game]}</b>. Five tiers — each adds +25% on every payout
        {game === "crossy_road" ? " AND +15% to coin pickups spawning on grass rows" : ""}.
      </p>

      {/* Level pip strip */}
      <div
        className="row"
        style={{
          gap: 4,
          marginBottom: "var(--sp-3)",
          padding: 4,
          background: "var(--parchment-200)",
          border: "2px solid var(--ink-900)",
        }}
      >
        {Array.from({ length: state.maxLevel }).map((_, i) => {
          const filled = i < state.level;
          return (
            <div
              key={i}
              style={{
                flex: 1,
                height: 14,
                background: filled ? "var(--gold-300)" : "var(--parchment-50)",
                border: "1px solid var(--ink-900)",
                boxShadow: filled ? "inset 0 -2px 0 rgba(0,0,0,0.3)" : undefined,
                transition: "background 240ms",
              }}
            />
          );
        })}
      </div>
      <div className="text-mute" style={{ fontSize: 11, marginBottom: "var(--sp-3)", textAlign: "right" }}>
        Level {state.level} / {state.maxLevel} · {Math.round(pct)}%
      </div>

      {atMax ? (
        <div
          className="badge"
          style={{
            display: "block",
            textAlign: "center",
            background: "var(--cactus-500)",
            color: "var(--parchment-50)",
            border: "3px solid var(--ink-900)",
            padding: "8px 12px",
            fontFamily: "var(--font-display)",
            letterSpacing: "var(--ls-loose)",
            fontSize: 13,
          }}
        >
          ★ MAXED ★
        </div>
      ) : (
        <button
          type="button"
          className="btn btn-block"
          onClick={buy}
          disabled={busy}
          style={{
            background: "var(--gold-300)",
            color: "var(--ink-900)",
            fontFamily: "var(--font-display)",
            letterSpacing: "var(--ls-loose)",
          }}
        >
          {busy
            ? "..."
            : `Upgrade to ×${state.nextMultiplier!.toFixed(2)} — ${state.nextCost!.toLocaleString()} ¢`}
        </button>
      )}
      {error && (
        <p style={{ color: "var(--crimson-500)", fontSize: 12, marginTop: "var(--sp-2)" }}>
          {error}
        </p>
      )}
    </section>
  );
}

function labelFor(err: string): string {
  if (err === "insufficient_funds") return "Not enough ¢ to buy this tier.";
  if (err === "already_maxed") return "Already at the max tier.";
  if (err === "bad_game") return "Wrong game.";
  if (err === "unauthorized") return "Sign in first.";
  return "Couldn't process upgrade.";
}
