"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { BetInput } from "@/components/BetInput";
import { GameIcon } from "@/components/GameIcon";
import { GameEvent } from "@/components/GameEvent";
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
  /** Index of the cell that bust the round, so we can pin the
   *  kaboom shake on it instead of repaining every red tile. */
  bustCell: number | null;
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
  bustCell: null,
};

const MINE_PRESETS = [1, 3, 5, 10, 24];

export function MinesClient() {
  const router = useRouter();
  const [bet, setBet] = useState(1_000);
  const [mines, setMines] = useState(3);
  const [game, setGame] = useState<GameState>(EMPTY);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [balance, setBalance] = useState<number | null>(null);
  // Lucky Pickaxe — granted at game start (server roll). Suppressed
  // by the server on 24-mine mode since that board has only one safe
  // tile and a free reveal would auto-win every round.
  const [pickaxe, setPickaxe] = useState<"none" | "available" | "used">("none");
  // Per-cell reveal timestamp drives the flip-in animation. Cells
  // animated once stay revealed without re-animating across re-renders.
  const revealedAtRef = useRef<Map<number, number>>(new Map());
  // When a cashout / bust lands, flip a transient flag on so the
  // multiplier display can pop and the board can shake.
  const [multiPop, setMultiPop] = useState(0);
  // Track sparkle bursts on safe reveals so each gem briefly twinkles.
  const [sparkles, setSparkles] = useState<{ id: number; cell: number }[]>([]);
  const sparkleSeqRef = useRef(0);
  // Pickaxe sweep overlay — shown for ~700ms after using the pickaxe.
  const [pickaxeSweep, setPickaxeSweep] = useState(false);

  useEffect(() => {
    fetch("/api/auth/me").then((r) => r.json()).then((d) => setBalance(d.balance ?? null));
  }, []);

  // Detect newly revealed cells so we can animate them in. We diff
  // the current revealed string against the ref-tracked set; any new
  // 'r' / 'x' gets stamped with `now` and a sparkle queued.
  useEffect(() => {
    const now = Date.now();
    let touched = false;
    const newSparkles: { id: number; cell: number }[] = [];
    for (let i = 0; i < game.revealed.length; i++) {
      const ch = game.revealed[i];
      if ((ch === "r" || ch === "x") && !revealedAtRef.current.has(i)) {
        revealedAtRef.current.set(i, now);
        touched = true;
        if (ch === "r") {
          newSparkles.push({ id: ++sparkleSeqRef.current, cell: i });
        }
      }
    }
    if (newSparkles.length > 0) {
      setSparkles((prev) => [...prev, ...newSparkles]);
      const ids = new Set(newSparkles.map((s) => s.id));
      window.setTimeout(() => {
        setSparkles((prev) => prev.filter((s) => !ids.has(s.id)));
      }, 700);
    }
    if (touched) {
      // Force a re-render so cells with fresh stamps animate.
      // (Setting state we already track elsewhere isn't needed.)
    }
  }, [game.revealed]);

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
    revealedAtRef.current.clear();
    setSparkles([]);
    setGame({
      gameId: data.gameId,
      status: data.status,
      revealed: data.revealed,
      mineCount: data.mineCount,
      multiplier: data.multiplier,
      nextMultiplier: data.nextMultiplier,
      bet: data.bet,
      payout: 0,
      bustCell: null,
    });
    setBalance(data.balance);
    setPickaxe(data.pickaxe ? "available" : "none");
    router.refresh();
  }

  async function usePickaxe() {
    if (!game.gameId || pickaxe !== "available" || busy) return;
    setBusy(true);
    setError(null);
    setPickaxeSweep(true);
    window.setTimeout(() => setPickaxeSweep(false), 700);
    const res = await fetch(`/api/games/mines/${game.gameId}/pickaxe`, { method: "POST" });
    const data = await res.json();
    setBusy(false);
    if (!res.ok) {
      setError(data.error ?? "error");
      return;
    }
    Sfx.play("ui.wood");
    setGame((g) => ({
      ...g,
      revealed: data.revealed,
      multiplier: data.multiplier,
      nextMultiplier: data.nextMultiplier,
    }));
    setPickaxe("used");
    setMultiPop((n) => n + 1);
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
    const bustCell = data.status === "lost" ? cell : null;
    setGame((g) => ({
      ...g,
      status: data.status,
      revealed: data.revealed,
      layout: data.layout ?? g.layout,
      multiplier: data.multiplier,
      nextMultiplier: data.nextMultiplier,
      bustCell: bustCell ?? g.bustCell,
    }));
    setBalance(data.balance);
    if (data.status === "lost") {
      Sfx.play("ui.bomb");
    } else {
      Sfx.play("ui.wood");
      setMultiPop((n) => n + 1);
    }
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
    if ((data.multiplier ?? 0) >= 10) Sfx.play("win.big");
    else if ((data.multiplier ?? 0) >= 3) Sfx.play("win.levelup");
    else Sfx.play("chips.stack");
    router.refresh();
  }

  function newRound() {
    revealedAtRef.current.clear();
    setSparkles([]);
    setGame(EMPTY);
    setError(null);
  }

  const inGame = game.status === "active";
  const settled = game.status === "busted" || game.status === "cashed";
  const safeCount = (game.revealed.match(/r/g) || []).length;
  const potential = Math.floor(game.bet * game.multiplier);
  // Show the next 5 multiplier rungs as a small ladder so the player
  // can see what the next reveals are worth without doing math.
  const ladder = useMemo(() => {
    if (!inGame || game.mineCount <= 0) return [];
    const out: { steps: number; mult: number }[] = [];
    let m = game.nextMultiplier;
    const startSteps = safeCount + 1;
    for (let i = 0; i < 5 && startSteps + i <= 25 - game.mineCount; i++) {
      out.push({ steps: startSteps + i, mult: m });
      // Approximate the next rung from the engine's actuarial
      // formula: m_{n+1}/m_n = (25-n)/(25-n - mineCount). We don't
      // have multiplierFor(n+1) on the client, so approximate with
      // the same ratio. Server-truth is still authoritative.
      const remaining = 25 - (startSteps + i);
      const safe = remaining - game.mineCount;
      if (safe <= 0) break;
      m = Math.round(m * (remaining / safe) * 100) / 100;
    }
    return out;
  }, [inGame, game.mineCount, game.nextMultiplier, safeCount]);

  return (
    <div className="grid grid-2" style={{ alignItems: "start", gap: "var(--sp-5)" }}>
      <div className="panel" style={{ padding: "var(--sp-6)", position: "relative", overflow: "hidden" }}>
        <GameEvent
          active={pickaxe === "available"}
          icon="⛏"
          title="Lucky Pickaxe"
          body="Tap to reveal one safe tile for free. The multiplier still climbs."
          tone="cactus"
          trailing={
            <button
              type="button"
              className="btn btn-sm action-ready"
              onClick={usePickaxe}
              disabled={busy}
            >
              Use Pickaxe
            </button>
          }
        />

        <div
          className="row"
          style={{
            justifyContent: "space-between",
            alignItems: "center",
            marginBottom: "var(--sp-3)",
          }}
        >
          <div className="panel-title" style={{ margin: 0 }}>5 × 5 Field</div>
          <div className="row" style={{ gap: 6, alignItems: "center" }}>
            <div
              title="Mines on the board"
              style={{
                background: "var(--crimson-500)",
                color: "var(--parchment-50)",
                padding: "4px 10px",
                border: "2px solid var(--ink-900)",
                fontFamily: "var(--font-display)",
                fontSize: 13,
                letterSpacing: "var(--ls-loose)",
                textTransform: "uppercase",
                display: "flex",
                alignItems: "center",
                gap: 6,
              }}
            >
              <GameIcon name="mines.bomb" size={14} /> {game.status === "idle" ? mines : game.mineCount}
            </div>
            <div
              title="Safe gems revealed"
              style={{
                background: "var(--cactus-500)",
                color: "var(--parchment-50)",
                padding: "4px 10px",
                border: "2px solid var(--ink-900)",
                fontFamily: "var(--font-display)",
                fontSize: 13,
                letterSpacing: "var(--ls-loose)",
                textTransform: "uppercase",
                display: "flex",
                alignItems: "center",
                gap: 6,
              }}
            >
              <GameIcon name="mines.gem" size={14} /> {safeCount}
            </div>
          </div>
        </div>

        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(5, 1fr)",
            gap: "var(--sp-2)",
            background:
              "linear-gradient(180deg, #2a1810, #1a0f08), repeating-linear-gradient(45deg, rgba(168,117,69,0.05) 0 6px, transparent 6px 12px)",
            backgroundBlendMode: "multiply",
            border: "4px solid var(--ink-900)",
            padding: "var(--sp-4)",
            position: "relative",
            animation: game.status === "busted" ? "mines-board-bust 0.6s var(--ease-out) both" : undefined,
            boxShadow: "inset 0 0 24px rgba(0,0,0,0.55)",
          }}
        >
          {Array.from({ length: 25 }).map((_, i) => {
            const r = game.revealed[i];
            const layoutChar = game.layout?.[i];
            const isRevealedSafe = r === "r";
            const isRevealedMine = r === "x";
            const isHiddenMine = layoutChar === "m" && r === "-"; // post-settlement reveal
            const revealed = isRevealedSafe || isRevealedMine || isHiddenMine;
            const isBustCell = i === game.bustCell;
            const stamp = revealedAtRef.current.get(i);
            const cellSparkles = sparkles.filter((s) => s.cell === i);

            const canClick = inGame && r === "-" && !busy;
            const baseBg = isRevealedMine
              ? "var(--crimson-300)"
              : isHiddenMine
              ? "var(--crimson-500)"
              : isRevealedSafe
              ? "linear-gradient(180deg, #5fa8d3 0%, #2c6a8e 100%)"
              : "linear-gradient(180deg, #6b3f24 0%, #4a2818 100%)";

            const flipAnim = stamp
              ? `mines-flip-in 0.45s cubic-bezier(.4,1.5,.4,1) both${
                  isRevealedSafe ? ", mines-gem-pulse 1.6s ease-in-out 0.45s infinite" : ""
                }${
                  isBustCell ? ", mines-bomb-shake 0.55s ease-in-out 0.45s, mines-bomb-flash 0.6s ease-in-out 0.45s 2" : ""
                }`
              : undefined;

            return (
              <button
                key={i}
                onClick={() => reveal(i)}
                disabled={!canClick}
                style={{
                  position: "relative",
                  aspectRatio: "1 / 1",
                  border: revealed ? "3px solid var(--ink-900)" : "3px solid var(--ink-900)",
                  background: baseBg,
                  cursor: canClick ? "pointer" : "default",
                  fontFamily: "var(--font-display)",
                  fontSize: 32,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  boxShadow: revealed
                    ? "var(--bevel-light), var(--bevel-dark)"
                    : "var(--bevel-light), var(--bevel-dark), inset 0 -4px 0 rgba(0,0,0,0.35), inset 0 4px 0 rgba(255,255,255,0.08)",
                  transition: !revealed ? "transform 80ms var(--ease-snap), filter 120ms" : undefined,
                  transformStyle: "preserve-3d",
                  animation: flipAnim,
                  filter: !revealed && canClick ? undefined : !revealed ? "brightness(0.85)" : undefined,
                  outline: "none",
                  overflow: "visible",
                }}
                onMouseEnter={(e) => {
                  if (canClick) e.currentTarget.style.transform = "translateY(-2px)";
                }}
                onMouseLeave={(e) => {
                  if (canClick) e.currentTarget.style.transform = "translateY(0)";
                }}
              >
                {isRevealedMine || isHiddenMine ? (
                  <GameIcon name="mines.bomb" size={36} />
                ) : isRevealedSafe ? (
                  <GameIcon name="mines.gem" size={32} />
                ) : (
                  // Hidden tile — subtle "?" so it reads as something
                  // to interact with, not just an empty rectangle.
                  <span
                    style={{
                      color: "rgba(254, 246, 228, 0.18)",
                      fontFamily: "var(--font-display)",
                      fontSize: 22,
                      textShadow: "1px 1px 0 rgba(0,0,0,0.6)",
                      userSelect: "none",
                    }}
                  >
                    ?
                  </span>
                )}
                {cellSparkles.map((s) => (
                  <span
                    key={s.id}
                    aria-hidden
                    style={{
                      position: "absolute",
                      top: "50%",
                      left: "50%",
                      width: "120%",
                      height: "120%",
                      borderRadius: "50%",
                      pointerEvents: "none",
                      background:
                        "radial-gradient(circle, rgba(255,255,255,0.85) 0%, rgba(95,220,140,0.6) 30%, transparent 70%)",
                      animation: "mines-sparkle 0.6s ease-out forwards",
                    }}
                  />
                ))}
              </button>
            );
          })}

          {/* Pickaxe sweep — diagonal shimmer drawn on top of the
              board for ~700ms after the player taps Use Pickaxe. */}
          {pickaxeSweep && (
            <div
              aria-hidden
              style={{
                position: "absolute",
                inset: 0,
                pointerEvents: "none",
                background:
                  "linear-gradient(70deg, transparent 35%, rgba(255,255,255,0.55) 50%, transparent 65%)",
                animation: "mines-pickaxe-sweep 0.7s ease-out forwards",
                mixBlendMode: "screen",
              }}
            />
          )}
        </div>

        {settled && (
          <div
            className="sign"
            style={{
              marginTop: "var(--sp-5)",
              display: "block",
              textAlign: "center",
              background: game.status === "cashed" ? "var(--cactus-500)" : "var(--crimson-500)",
              animation: "game-event-slide 0.45s cubic-bezier(.4,1.6,.4,1) both",
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
        <div className="panel-title">{inGame ? "Cash Out?" : settled ? "Round Over" : "Set Up"}</div>

        {inGame ? (
          <div className="stack-lg">
            <div className="grid grid-2">
              <div
                className="panel"
                style={{
                  background: "linear-gradient(180deg, #1a0f08, #2a1810)",
                  color: "var(--gold-300)",
                  padding: "var(--sp-3)",
                  border: "3px solid var(--ink-900)",
                  textAlign: "center",
                }}
              >
                <div className="label" style={{ color: "rgba(245,200,66,0.7)" }}>Multiplier</div>
                <div
                  key={`m-${multiPop}`}
                  style={{
                    fontSize: "var(--fs-h1)",
                    fontFamily: "var(--font-display)",
                    color: "var(--gold-300)",
                    textShadow: "2px 2px 0 var(--ink-900), 0 0 14px rgba(245,200,66,0.6)",
                    animation: "mines-multi-pop 0.45s var(--ease-snap)",
                  }}
                >
                  ×{game.multiplier}
                </div>
              </div>
              <div
                className="panel"
                style={{
                  background: "linear-gradient(180deg, var(--gold-300), #c8941d)",
                  color: "var(--ink-900)",
                  padding: "var(--sp-3)",
                  border: "3px solid var(--ink-900)",
                  textAlign: "center",
                  boxShadow: "var(--glow-gold)",
                }}
              >
                <div className="label" style={{ color: "rgba(26,15,8,0.65)" }}>Cash Out</div>
                <div
                  style={{
                    fontSize: "var(--fs-h1)",
                    fontFamily: "var(--font-display)",
                    color: "var(--ink-900)",
                    textShadow: "1px 1px 0 rgba(255,246,228,0.45)",
                  }}
                >
                  {potential.toLocaleString()} ¢
                </div>
              </div>
            </div>

            {/* Multiplier ladder — preview of the next 5 rungs. */}
            {ladder.length > 0 && (
              <div>
                <div className="label">Next reveals</div>
                <div
                  style={{
                    display: "flex",
                    gap: 6,
                    marginTop: 4,
                    overflowX: "auto",
                    paddingBottom: 2,
                  }}
                >
                  {ladder.map((rung, i) => (
                    <div
                      key={rung.steps}
                      style={{
                        flex: "0 0 auto",
                        minWidth: 60,
                        textAlign: "center",
                        padding: "6px 8px",
                        background: i === 0 ? "var(--gold-300)" : "var(--parchment-200)",
                        color: "var(--ink-900)",
                        border: "2px solid var(--ink-900)",
                        fontFamily: "var(--font-display)",
                        boxShadow: i === 0 ? "var(--glow-gold)" : "var(--bevel-light)",
                      }}
                    >
                      <div style={{ fontSize: 10, opacity: 0.75 }}>{rung.steps} safe</div>
                      <div style={{ fontSize: 16, lineHeight: 1.1 }}>×{rung.mult}</div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <button
              className="btn btn-lg btn-block"
              onClick={cashout}
              disabled={busy || safeCount === 0}
              style={{
                fontSize: "var(--fs-h3)",
                background: "var(--gold-300)",
                color: "var(--ink-900)",
                boxShadow: "var(--glow-gold)",
              }}
            >
              {busy ? "..." : `Cash Out · ${potential.toLocaleString()} ¢`}
            </button>
          </div>
        ) : settled ? (
          <div className="stack-lg">
            <div
              style={{
                padding: "var(--sp-4)",
                background: game.status === "cashed" ? "var(--cactus-500)" : "var(--crimson-500)",
                color: "var(--parchment-50)",
                border: "3px solid var(--ink-900)",
                textAlign: "center",
                fontFamily: "var(--font-display)",
              }}
            >
              <div style={{ fontSize: 12, letterSpacing: "var(--ls-loose)", textTransform: "uppercase", opacity: 0.85 }}>
                {game.status === "cashed" ? "Net" : "Lost"}
              </div>
              <div style={{ fontSize: "var(--fs-h2)", lineHeight: 1.1 }}>
                {game.status === "cashed"
                  ? `+${(game.payout - game.bet).toLocaleString()} ¢`
                  : `−${game.bet.toLocaleString()} ¢`}
              </div>
            </div>
            <button className="btn btn-lg btn-block" onClick={newRound} disabled={busy}>
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
              <div className="row" style={{ flexWrap: "wrap", gap: 4, marginTop: 4 }}>
                {MINE_PRESETS.map((n) => (
                  <button
                    key={n}
                    type="button"
                    className={`btn btn-sm ${mines === n ? "" : "btn-ghost"}`}
                    onClick={() => setMines(n)}
                  >
                    {n === 24 ? "MAX" : n}
                  </button>
                ))}
              </div>
              <p className="text-mute" style={{ fontSize: 11, marginTop: 6 }}>
                Higher mine count = bigger multipliers per safe reveal.
                {mines === 24 ? " (MAX has only one safe tile — no Lucky Pickaxe rolls.)" : ""}
              </p>
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
