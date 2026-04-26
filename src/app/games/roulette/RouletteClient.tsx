"use client";

import { useEffect, useMemo, useRef, useState } from "react";
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

// European single-zero wheel order — used for the random strip filler so
// the distribution of colors is correct on the rolling reel.
const WHEEL_ORDER = [
  0, 32, 15, 19, 4, 21, 2, 25, 17, 34, 6, 27, 13, 36, 11, 30, 8, 23, 10, 5,
  24, 16, 33, 1, 20, 14, 31, 9, 22, 18, 29, 7, 28, 12, 35, 3, 26,
];

const HISTORY_LEN = 12;
const SPIN_MS = 5500;       // CSGO-style openings feel right around 5–6s
const REEL_TILE_W = 56;     // px — each slot tile width
const REEL_TILE_H = 70;
const REEL_GAP = 4;
const REEL_STEP = REEL_TILE_W + REEL_GAP;
// How many tiles fly past before stopping (in addition to the index of the
// winning tile from the strip start). More = longer scroll.
const REEL_PAD_TILES = 60;
// Extra random tiles tacked on after the winning tile so the reel doesn't
// reveal where it stops.
const REEL_TAIL_TILES = 20;

const CHIP_COLORS: Record<number, { bg: string; ring: string; fg: string }> = {
  100:    { bg: "#fef6e4", ring: "#1a0f08", fg: "#1a0f08" },
  500:    { bg: "#5fa8d3", ring: "#143348", fg: "#fef6e4" },
  1_000:  { bg: "#6ba84f", ring: "#1f3818", fg: "#fef6e4" },
  5_000:  { bg: "#e05a3c", ring: "#4a1a1a", fg: "#fef6e4" },
  25_000: { bg: "#1a0f08", ring: "#3d2418", fg: "#f5c842" },
};

export function RouletteClient() {
  const router = useRouter();
  const reelContainerRef = useRef<HTMLDivElement>(null);
  const reelStripRef = useRef<HTMLDivElement>(null);
  const [chip, setChip] = useState(1_000);
  const [bets, setBets] = useState<RouletteBet[]>([]);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<Result | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [balance, setBalance] = useState<number | null>(null);
  const [history, setHistory] = useState<{ n: number; color: "red" | "black" | "green" }[]>([]);
  const [spinning, setSpinning] = useState(false);
  const [hoverPreview, setHoverPreview] = useState<{ label: string; payout: number } | null>(null);
  // Tile strip for the current spin. Regenerated per spin so each open is
  // visually fresh.
  const [reelTiles, setReelTiles] = useState<number[]>(() => idleStrip());
  // Index of the winning tile in the strip (where the pointer should land).
  const [reelTargetIdx, setReelTargetIdx] = useState<number | null>(null);

  useEffect(() => {
    fetch("/api/auth/me").then((r) => r.json()).then((d) => setBalance(d.balance ?? null));
  }, []);

  function addBet(type: RouletteBetType, value?: number) {
    if (spinning) return;
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

  function removeBet(type: RouletteBetType, value?: number) {
    setBets((prev) => prev.filter((b) => !(b.type === type && b.value === value)));
  }

  function clearBets() {
    setBets([]);
    setResult(null);
  }

  function totalStake() {
    return bets.reduce((s, b) => s + b.amount, 0);
  }

  function findStake(type: RouletteBetType, value?: number) {
    return bets.find((b) => b.type === type && b.value === value)?.amount ?? 0;
  }

  async function spin() {
    if (bets.length === 0 || spinning) return;
    setBusy(true);
    setError(null);
    setResult(null);

    const res = await fetch("/api/games/roulette/spin", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ bets }),
    });
    const data = await res.json();
    if (!res.ok) {
      setBusy(false);
      setError(data.error ?? "error");
      return;
    }

    // Build a fresh strip: a long run of random fillers, then the winning
    // tile at index `targetIdx`, then a few more random tiles after so the
    // reel doesn't visibly stop at the end.
    const targetIdx = REEL_PAD_TILES;
    const strip: number[] = [];
    for (let i = 0; i < targetIdx; i++) strip.push(randomReelNumber());
    strip.push(data.winning);
    for (let i = 0; i < REEL_TAIL_TILES; i++) strip.push(randomReelNumber());

    // Snap to start position (no transition), then trigger the eased slide
    // on the next frame so the browser actually animates.
    const stripEl = reelStripRef.current;
    const containerEl = reelContainerRef.current;
    if (stripEl && containerEl) {
      stripEl.style.transition = "none";
      stripEl.style.transform = "translateX(0px)";
      // Force reflow to commit the snap before re-applying the transition.
      // (eslint-disable-next-line)
      void stripEl.offsetWidth;
    }

    setReelTiles(strip);
    setReelTargetIdx(targetIdx);
    setSpinning(true);

    // Compute the final translateX to land the target tile under the pointer.
    // Pointer sits at the horizontal center of the container. We want the
    // CENTER of the target tile to align with that point.
    requestAnimationFrame(() => {
      const cw = containerEl?.clientWidth ?? 720;
      const targetCenter = targetIdx * REEL_STEP + REEL_TILE_W / 2;
      // Add ±35% of a tile-width of jitter so the pointer never lands dead
      // center — the small offset reads as "just barely landed on" the tile.
      const jitter = (Math.random() - 0.5) * REEL_TILE_W * 0.7;
      const finalX = -(targetCenter - cw / 2) + jitter;
      if (stripEl) {
        stripEl.style.transition = `transform ${SPIN_MS}ms cubic-bezier(0.08, 0.82, 0.17, 1)`;
        stripEl.style.transform = `translateX(${finalX}px)`;
      }
    });

    // Resolve UI after the slide completes.
    setTimeout(() => {
      setBusy(false);
      setSpinning(false);
      setResult(data);
      setBalance(data.balance);
      setBets([]);
      setHistory((h) => [{ n: data.winning, color: data.color }, ...h].slice(0, HISTORY_LEN));
      router.refresh();
    }, SPIN_MS + 200);
  }

  const stake = totalStake();
  const canSpin = !busy && stake > 0 && (balance == null || balance >= stake);

  return (
    <div className="grid grid-2" style={{ alignItems: "start", gap: "var(--sp-4)" }}>
      <div className="stack-lg">
        {/* Wheel */}
        <div className="panel" style={{ padding: "var(--sp-4)" }}>
          <div className="panel-title">The Wheel</div>

          <HistoryStrip
            history={history}
            currentResult={result ? { n: result.winning, color: result.color } : null}
          />

          <ReelStrip
            tiles={reelTiles}
            containerRef={reelContainerRef}
            stripRef={reelStripRef}
            spinning={spinning}
            targetIdx={reelTargetIdx}
            result={result}
          />

          {result && !spinning && (
            <div
              className="sign"
              style={{
                background: result.totalPayout > result.totalBet
                  ? "var(--cactus-500)"
                  : result.totalPayout > 0
                  ? "var(--saddle-300)"
                  : "var(--crimson-500)",
                marginTop: "var(--sp-3)",
                display: "block",
                textAlign: "center",
              }}
            >
              {result.totalPayout > 0
                ? `${result.winning} ${result.color.toUpperCase()} · +${(result.totalPayout - result.totalBet).toLocaleString()} ¢`
                : `${result.winning} ${result.color.toUpperCase()} · House wins`}
            </div>
          )}
        </div>

        {/* Felt betting table */}
        <div className="panel" style={{ padding: "var(--sp-3)", background: "#1f3818", borderColor: "var(--ink-900)" }}>
          <FeltTable
            onPick={addBet}
            onRemove={removeBet}
            findStake={findStake}
            highlight={result?.winning ?? null}
            disabled={spinning}
            chip={chip}
            setHover={setHoverPreview}
          />
          {error && <p style={{ color: "var(--crimson-300)", marginTop: "var(--sp-3)" }}>{labelFor(error)}</p>}
        </div>
      </div>

      <div className="stack-lg">
        <div className="panel" style={{ padding: "var(--sp-5)" }}>
          <div className="panel-title">Pick a Chip</div>
          <div className="row" style={{ flexWrap: "wrap", gap: "var(--sp-2)" }}>
            {CHIP_VALUES.map((v) => (
              <ChipSwatch key={v} amount={v} active={chip === v} onClick={() => setChip(v)} />
            ))}
          </div>
          <p className="text-mute" style={{ marginTop: "var(--sp-3)", fontSize: "var(--fs-small)" }}>
            Click any cell on the felt to drop a chip. Right-click or shift-click to remove a stack.
          </p>
        </div>

        <div className="panel" style={{ padding: "var(--sp-5)" }}>
          <div className="panel-title">Your Bets</div>
          {bets.length === 0 ? (
            <p className="text-mute">
              {hoverPreview
                ? <>Hovering <b>{hoverPreview.label}</b> — pays {hoverPreview.payout}× stake.</>
                : "Drop a chip on the felt to begin."}
            </p>
          ) : (
            <div className="stack">
              {bets.map((b, i) => (
                <div
                  key={i}
                  className="between"
                  style={{ padding: "var(--sp-2) 0", borderBottom: "2px dashed var(--saddle-300)" }}
                >
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

          <div className="row" style={{ marginTop: "var(--sp-5)", gap: "var(--sp-2)" }}>
            <button className="btn btn-ghost btn-block" onClick={clearBets} disabled={busy || bets.length === 0 || spinning}>
              Clear
            </button>
            <button className="btn btn-block" onClick={spin} disabled={!canSpin || spinning}>
              {spinning ? "Spinning..." : "Spin"}
            </button>
          </div>
        </div>

        {result && !spinning && (
          <div className="panel" style={{ padding: "var(--sp-5)" }}>
            <div className="panel-title">Last Spin</div>
            <p className="text-mute" style={{ marginBottom: "var(--sp-3)" }}>
              Winning: <b>{result.winning}</b> ({result.color})
            </p>
            {result.rows.map((r, i) => (
              <div
                key={i}
                className="between"
                style={{ padding: "var(--sp-2) 0", borderBottom: "2px dashed var(--saddle-300)" }}
              >
                <span style={{ fontFamily: "var(--font-display)" }}>{labelBet(r)}</span>
                <span style={{ color: r.win ? "var(--cactus-500)" : "var(--crimson-500)" }}>
                  {r.win ? `+${(r.payout - r.amount).toLocaleString()}` : `-${r.amount.toLocaleString()}`}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ============================================================
// CSGO-style horizontal reel strip
// ============================================================

function ReelStrip({
  tiles,
  containerRef,
  stripRef,
  spinning,
  targetIdx,
  result,
}: {
  tiles: number[];
  containerRef: React.RefObject<HTMLDivElement | null>;
  stripRef: React.RefObject<HTMLDivElement | null>;
  spinning: boolean;
  targetIdx: number | null;
  result: Result | null;
}) {
  return (
    <div
      ref={containerRef}
      style={{
        position: "relative",
        background: "linear-gradient(180deg, #2a1810, #1a0f08)",
        border: "3px solid var(--ink-900)",
        padding: "var(--sp-2)",
        overflow: "hidden",
        boxShadow: "inset 0 0 18px rgba(0, 0, 0, 0.8)",
      }}
    >
      {/* Center pointer — bright vertical bar with arrows. Sits on top of
          everything via z-index so it never disappears behind a tile. */}
      <div
        aria-hidden
        style={{
          position: "absolute",
          left: "50%",
          top: 0,
          bottom: 0,
          width: 4,
          transform: "translateX(-50%)",
          background: "var(--gold-300)",
          boxShadow: "0 0 8px var(--gold-300), 0 0 16px var(--gold-300)",
          zIndex: 7,
          pointerEvents: "none",
        }}
      />
      {/* Top arrow */}
      <div
        aria-hidden
        style={{
          position: "absolute",
          top: -1,
          left: "50%",
          transform: "translateX(-50%)",
          width: 0,
          height: 0,
          borderLeft: "10px solid transparent",
          borderRight: "10px solid transparent",
          borderTop: "12px solid var(--gold-300)",
          filter: "drop-shadow(0 0 4px var(--gold-300))",
          zIndex: 8,
          pointerEvents: "none",
        }}
      />
      {/* Bottom arrow */}
      <div
        aria-hidden
        style={{
          position: "absolute",
          bottom: -1,
          left: "50%",
          transform: "translateX(-50%)",
          width: 0,
          height: 0,
          borderLeft: "10px solid transparent",
          borderRight: "10px solid transparent",
          borderBottom: "12px solid var(--gold-300)",
          filter: "drop-shadow(0 0 4px var(--gold-300))",
          zIndex: 8,
          pointerEvents: "none",
        }}
      />

      {/* Edge fades — soft mask on either end so tiles fade in/out smoothly */}
      <div
        aria-hidden
        style={{
          position: "absolute",
          left: 0,
          top: 0,
          bottom: 0,
          width: 56,
          background: "linear-gradient(90deg, rgba(26, 15, 8, 0.95), transparent)",
          zIndex: 4,
          pointerEvents: "none",
        }}
      />
      <div
        aria-hidden
        style={{
          position: "absolute",
          right: 0,
          top: 0,
          bottom: 0,
          width: 56,
          background: "linear-gradient(270deg, rgba(26, 15, 8, 0.95), transparent)",
          zIndex: 4,
          pointerEvents: "none",
        }}
      />

      {/* The sliding strip */}
      <div
        ref={stripRef}
        style={{
          display: "flex",
          gap: REEL_GAP,
          willChange: "transform",
          // The transform is applied imperatively in spin().
        }}
      >
        {tiles.map((n, i) => (
          <ReelTile
            key={i}
            n={n}
            highlight={!spinning && targetIdx !== null && i === targetIdx && result !== null}
          />
        ))}
      </div>

    </div>
  );
}

function ReelTile({ n, highlight }: { n: number; highlight: boolean }) {
  const c = colorOf(n);
  const bg = c === "red" ? "#c93a2c" : c === "black" ? "#1a0f08" : "#3d6b2e";
  return (
    <div
      style={{
        flexShrink: 0,
        width: REEL_TILE_W,
        height: REEL_TILE_H,
        background: bg,
        border: highlight ? "3px solid var(--gold-300)" : "2px solid var(--ink-900)",
        boxShadow: highlight
          ? "var(--glow-gold), inset 0 0 0 1px rgba(255,255,255,0.2)"
          : "inset 0 -2px 0 rgba(0,0,0,0.4), inset 0 2px 0 rgba(255,255,255,0.18)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        fontFamily: "var(--font-display)",
        fontSize: 22,
        color: "#fef6e4",
        letterSpacing: "var(--ls-tight)",
        textShadow: "2px 2px 0 rgba(0, 0, 0, 0.7)",
        position: "relative",
        animation: highlight ? "lg-rl-pulse 0.9s ease-in-out infinite" : undefined,
      }}
    >
      <style>{`
        @keyframes lg-rl-pulse {
          0%, 100% { box-shadow: var(--glow-gold), inset 0 0 0 1px rgba(255,255,255,0.2); transform: scale(1); }
          50% { box-shadow: 0 0 28px rgba(245, 200, 66, 1), inset 0 0 0 2px rgba(255,255,255,0.4); transform: scale(1.04); }
        }
      `}</style>
      {n}
    </div>
  );
}

// =============================================================
// Reel strip helpers
// =============================================================

// Pick a random number in a way that matches a real European wheel's
// red/black/green distribution (since that's what `WHEEL_ORDER` represents).
function randomReelNumber(): number {
  return WHEEL_ORDER[Math.floor(Math.random() * WHEEL_ORDER.length)];
}

// Idle filler — just a slice of the wheel order so the static strip looks
// like a real strip even before any spin has happened.
function idleStrip(): number[] {
  const out: number[] = [];
  for (let i = 0; i < 24; i++) out.push(WHEEL_ORDER[i % WHEEL_ORDER.length]);
  return out;
}

// ============================================================
// History strip
// ============================================================

function HistoryStrip({
  history,
  currentResult,
}: {
  history: { n: number; color: "red" | "black" | "green" }[];
  currentResult: { n: number; color: "red" | "black" | "green" } | null;
}) {
  // If the latest result hasn't been pushed into history yet (e.g. we just
  // showed it and the next render is queued), show it on the left.
  const merged: { n: number; color: "red" | "black" | "green" }[] = [];
  if (currentResult && (history.length === 0 || history[0].n !== currentResult.n)) {
    merged.push(currentResult);
  }
  merged.push(...history);
  if (merged.length === 0) return null;

  return (
    <div
      style={{
        display: "flex",
        gap: 4,
        flexWrap: "wrap",
        alignItems: "center",
        marginBottom: "var(--sp-3)",
        padding: "var(--sp-2)",
        background: "var(--saddle-600)",
        border: "3px solid var(--ink-900)",
      }}
      aria-label="Recent winning numbers"
    >
      <span
        style={{
          fontFamily: "var(--font-display)",
          fontSize: 11,
          color: "var(--parchment-200)",
          letterSpacing: "var(--ls-loose)",
          textTransform: "uppercase",
          padding: "0 6px",
        }}
      >
        Last:
      </span>
      {merged.slice(0, HISTORY_LEN).map((h, i) => (
        <span
          key={i}
          title={`${h.n} (${h.color})`}
          style={{
            fontFamily: "var(--font-display)",
            fontSize: 11,
            width: 22,
            height: 22,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            background:
              h.color === "red" ? "#c93a2c" :
              h.color === "black" ? "#1a0f08" :
              "#3d6b2e",
            color: "#fef6e4",
            border: "2px solid var(--ink-900)",
            textShadow: "1px 1px 0 rgba(0,0,0,0.6)",
          }}
        >
          {h.n}
        </span>
      ))}
    </div>
  );
}

// ============================================================
// Felt table
// ============================================================

function FeltTable({
  onPick,
  onRemove,
  findStake,
  highlight,
  disabled,
  chip,
  setHover,
}: {
  onPick: (type: RouletteBetType, value?: number) => void;
  onRemove: (type: RouletteBetType, value?: number) => void;
  findStake: (type: RouletteBetType, value?: number) => number;
  highlight: number | null;
  disabled: boolean;
  chip: number;
  setHover: (h: { label: string; payout: number } | null) => void;
}) {
  // Numbers laid out in 3 rows × 12 cols. Top row = highest of each column (3, 6, ..., 36).
  // Column index 0..11 maps to dozens of 1..12.
  function numberAt(row: number, col: number) {
    // row 0 = top (3, 6, 9, ...), row 2 = bottom (1, 4, 7, ...)
    const base = col * 3;
    return base + (3 - row);
  }

  const cellStyle = (bg: string): React.CSSProperties => ({
    position: "relative",
    background: bg,
    color: "#fef6e4",
    fontFamily: "var(--font-display)",
    fontSize: 13,
    border: "2px solid var(--ink-900)",
    cursor: disabled ? "not-allowed" : "pointer",
    height: 34,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    userSelect: "none",
    transition: "transform 80ms var(--ease-snap)",
  });

  function handle(type: RouletteBetType, value: number | undefined, e: React.MouseEvent) {
    if (disabled) return;
    if (e.shiftKey || e.button === 2) {
      e.preventDefault();
      onRemove(type, value);
      return;
    }
    onPick(type, value);
  }
  function preview(type: RouletteBetType, value: number | undefined, label: string) {
    setHover({ label, payout: payoutFor(type) });
  }
  function clearPreview() { setHover(null); }

  return (
    <div onContextMenu={(e) => e.preventDefault()}>
      {/* Main felt: 0 + number grid + 2:1 columns */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "40px repeat(12, 1fr) 40px",
          gap: 2,
        }}
      >
        {/* Zero — spans all 3 rows */}
        <button
          type="button"
          onClick={(e) => handle("straight", 0, e)}
          onMouseEnter={() => preview("straight", 0, "# 0")}
          onMouseLeave={clearPreview}
          style={{
            ...cellStyle("#3d6b2e"),
            gridRow: "1 / span 3",
            height: 34 * 3 + 4,
            fontSize: 20,
            border: highlight === 0 ? "3px solid var(--gold-300)" : "2px solid var(--ink-900)",
          }}
        >
          0
          <ChipStack amount={findStake("straight", 0)} chip={chip} />
        </button>

        {/* Three rows of numbers */}
        {[0, 1, 2].map((row) => (
          <ColumnRowCells
            key={row}
            row={row}
            findStake={findStake}
            highlight={highlight}
            handle={handle}
            preview={preview}
            clearPreview={clearPreview}
            cellStyle={cellStyle}
            chip={chip}
            numberAt={numberAt}
          />
        ))}

        {/* 2 to 1 column buttons (right side) — top = column 3 (top row of numbers) */}
        {[3, 2, 1].map((col, i) => (
          <button
            key={col}
            type="button"
            onClick={(e) => handle("column", col, e)}
            onMouseEnter={() => preview("column", col, `Col ${col}`)}
            onMouseLeave={clearPreview}
            style={{
              ...cellStyle("#4a2818"),
              gridColumn: 14,
              gridRow: i + 1,
              fontSize: 10,
              letterSpacing: "var(--ls-loose)",
              textTransform: "uppercase",
            }}
          >
            2 to 1
            <ChipStack amount={findStake("column", col)} chip={chip} />
          </button>
        ))}
      </div>

      {/* Dozens row */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "40px repeat(3, 1fr) 40px",
          gap: 2,
          marginTop: 2,
        }}
      >
        <span />
        {[1, 2, 3].map((d) => (
          <button
            key={d}
            type="button"
            onClick={(e) => handle("dozen", d, e)}
            onMouseEnter={() => preview("dozen", d, ["1st 12", "2nd 12", "3rd 12"][d - 1])}
            onMouseLeave={clearPreview}
            style={{
              ...cellStyle("#4a2818"),
              fontSize: 11,
              letterSpacing: "var(--ls-loose)",
              textTransform: "uppercase",
            }}
          >
            {["1st 12", "2nd 12", "3rd 12"][d - 1]}
            <ChipStack amount={findStake("dozen", d)} chip={chip} />
          </button>
        ))}
        <span />
      </div>

      {/* Outside row */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "40px repeat(6, 1fr) 40px",
          gap: 2,
          marginTop: 2,
        }}
      >
        <span />
        {OUTSIDE_BETS.map((b) => (
          <button
            key={b.type}
            type="button"
            onClick={(e) => handle(b.type, undefined, e)}
            onMouseEnter={() => preview(b.type, undefined, b.label)}
            onMouseLeave={clearPreview}
            style={{
              ...cellStyle(b.bg),
              color: b.fg,
              fontSize: 11,
              letterSpacing: "var(--ls-loose)",
              textTransform: "uppercase",
            }}
          >
            {b.label}
            <ChipStack amount={findStake(b.type)} chip={chip} />
          </button>
        ))}
        <span />
      </div>
    </div>
  );
}

const OUTSIDE_BETS: { type: RouletteBetType; label: string; bg: string; fg: string }[] = [
  { type: "low",   label: "1–18",  bg: "#4a2818", fg: "#fef6e4" },
  { type: "even",  label: "Even",  bg: "#4a2818", fg: "#fef6e4" },
  { type: "red",   label: "Red",   bg: "#c93a2c", fg: "#fef6e4" },
  { type: "black", label: "Black", bg: "#1a0f08", fg: "#fef6e4" },
  { type: "odd",   label: "Odd",   bg: "#4a2818", fg: "#fef6e4" },
  { type: "high",  label: "19–36", bg: "#4a2818", fg: "#fef6e4" },
];

function ColumnRowCells({
  row,
  findStake,
  highlight,
  handle,
  preview,
  clearPreview,
  cellStyle,
  chip,
  numberAt,
}: {
  row: number;
  findStake: (type: RouletteBetType, value?: number) => number;
  highlight: number | null;
  handle: (type: RouletteBetType, value: number | undefined, e: React.MouseEvent) => void;
  preview: (type: RouletteBetType, value: number | undefined, label: string) => void;
  clearPreview: () => void;
  cellStyle: (bg: string) => React.CSSProperties;
  chip: number;
  numberAt: (row: number, col: number) => number;
}) {
  return (
    <>
      {Array.from({ length: 12 }).map((_, col) => {
        const n = numberAt(row, col);
        const c = colorOf(n);
        const isWinner = highlight === n;
        return (
          <button
            key={n}
            type="button"
            onClick={(e) => handle("straight", n, e)}
            onMouseEnter={() => preview("straight", n, `# ${n}`)}
            onMouseLeave={clearPreview}
            style={{
              ...cellStyle(c === "red" ? "#c93a2c" : "#1a0f08"),
              gridColumn: col + 2,
              gridRow: row + 1,
              border: isWinner ? "4px solid var(--gold-300)" : "2px solid var(--ink-900)",
              boxShadow: isWinner ? "var(--glow-gold)" : undefined,
            }}
          >
            {n}
            <ChipStack amount={findStake("straight", n)} chip={chip} />
          </button>
        );
      })}
    </>
  );
}

// ============================================================
// Chip components
// ============================================================

function ChipSwatch({
  amount,
  active,
  onClick,
}: {
  amount: number;
  active: boolean;
  onClick: () => void;
}) {
  const c = CHIP_COLORS[amount] ?? CHIP_COLORS[100];
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        position: "relative",
        width: 42,
        height: 42,
        borderRadius: 999,
        background: c.bg,
        color: c.fg,
        border: `3px solid ${c.ring}`,
        boxShadow: active
          ? `inset 0 0 0 2px var(--gold-300), 0 0 0 2px var(--gold-300), var(--glow-gold)`
          : "inset 0 -2px 0 rgba(0,0,0,0.25), inset 0 2px 0 rgba(255,255,255,0.25), 0 3px 0 rgba(0,0,0,0.4)",
        fontFamily: "var(--font-display)",
        fontSize: 11,
        fontWeight: "bold",
        cursor: "pointer",
        transform: active ? "translateY(-3px)" : "none",
        transition: "transform 100ms var(--ease-snap)",
      }}
    >
      {amount >= 1000 ? `${amount / 1000}K` : amount}
    </button>
  );
}

function ChipStack({ amount, chip }: { amount: number; chip: number }) {
  if (amount <= 0) return null;
  // Pick the chip that visually represents this stake — the next-lowest
  // chip denomination. Keeps the visual close to what the player chose.
  const chipDenom = pickStackDenom(amount, chip);
  const c = CHIP_COLORS[chipDenom] ?? CHIP_COLORS[100];
  // Number of visible discs in the stack (purely cosmetic).
  const stackSize = Math.min(4, Math.max(1, Math.round(Math.log10(Math.max(1, amount / 100)) + 1)));
  return (
    <span
      style={{
        position: "absolute",
        bottom: -4,
        right: -4,
        display: "flex",
        flexDirection: "column-reverse",
        alignItems: "center",
        pointerEvents: "none",
      }}
    >
      <span
        style={{
          minWidth: 22,
          padding: "0 3px",
          background: c.bg,
          color: c.fg,
          border: `2px solid ${c.ring}`,
          borderRadius: 999,
          fontFamily: "var(--font-display)",
          fontSize: 9,
          textShadow: "none",
          boxShadow: "inset 0 -2px 0 rgba(0,0,0,0.25), inset 0 2px 0 rgba(255,255,255,0.3)",
          textAlign: "center",
          lineHeight: 1.2,
        }}
      >
        {fmtChip(amount)}
      </span>
      {/* Visual disc stack peeking out behind the label */}
      {Array.from({ length: stackSize - 1 }).map((_, i) => (
        <span
          key={i}
          style={{
            width: 24,
            height: 4,
            marginBottom: -3,
            background: c.bg,
            border: `2px solid ${c.ring}`,
            borderRadius: 999,
            marginRight: i % 2 === 0 ? 4 : -4,
          }}
        />
      ))}
    </span>
  );
}

function pickStackDenom(amount: number, currentChip: number): number {
  // Use the largest chip value <= amount, falling back to current chip.
  const denoms = [...CHIP_VALUES].sort((a, b) => b - a);
  for (const d of denoms) if (d <= amount) return d;
  return currentChip;
}

function payoutFor(type: RouletteBetType): number {
  switch (type) {
    case "straight": return 36;
    case "dozen":
    case "column":   return 3;
    default:         return 2;
  }
}

function labelBet(b: { type: RouletteBetType; value?: number }) {
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
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
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
