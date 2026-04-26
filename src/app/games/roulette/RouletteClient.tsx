"use client";

import { useEffect, useRef, useState } from "react";
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

// European single-zero wheel order, clockwise from 0.
const WHEEL_ORDER = [
  0, 32, 15, 19, 4, 21, 2, 25, 17, 34, 6, 27, 13, 36, 11, 30, 8, 23, 10, 5,
  24, 16, 33, 1, 20, 14, 31, 9, 22, 18, 29, 7, 28, 12, 35, 3, 26,
];
const SLOT_COUNT = WHEEL_ORDER.length; // 37
const SLOT_DEG = 360 / SLOT_COUNT;

const HISTORY_LEN = 12;
const SPIN_MS = 3500;

const CHIP_COLORS: Record<number, { bg: string; ring: string; fg: string }> = {
  100:    { bg: "#fef6e4", ring: "#1a0f08", fg: "#1a0f08" },
  500:    { bg: "#5fa8d3", ring: "#143348", fg: "#fef6e4" },
  1_000:  { bg: "#6ba84f", ring: "#1f3818", fg: "#fef6e4" },
  5_000:  { bg: "#e05a3c", ring: "#4a1a1a", fg: "#fef6e4" },
  25_000: { bg: "#1a0f08", ring: "#3d2418", fg: "#f5c842" },
};

export function RouletteClient() {
  const router = useRouter();
  const wheelCanvasRef = useRef<HTMLCanvasElement>(null);
  const [chip, setChip] = useState(1_000);
  const [bets, setBets] = useState<RouletteBet[]>([]);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<Result | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [balance, setBalance] = useState<number | null>(null);
  const [history, setHistory] = useState<{ n: number; color: "red" | "black" | "green" }[]>([]);
  const [spinning, setSpinning] = useState(false);
  const [hoverPreview, setHoverPreview] = useState<{ label: string; payout: number } | null>(null);

  // Animation state lives on refs so the rAF loop doesn't re-create.
  const wheelRotRef = useRef(0);          // wheel rotation (radians)
  const ballRotRef = useRef(Math.PI);     // ball angular position (radians)
  const wheelTargetRef = useRef(0);
  const ballTargetRef = useRef(Math.PI);
  const animStartRef = useRef<number | null>(null);
  const idleSpinRef = useRef(0);

  useEffect(() => {
    fetch("/api/auth/me").then((r) => r.json()).then((d) => setBalance(d.balance ?? null));
  }, []);

  // Wheel render loop — mounts once.
  useEffect(() => {
    const canvasEl = wheelCanvasRef.current;
    if (!canvasEl) return;
    const ctxOrNull = canvasEl.getContext("2d");
    if (!ctxOrNull) return;
    const canvas: HTMLCanvasElement = canvasEl;
    const ctx: CanvasRenderingContext2D = ctxOrNull;

    let raf = 0;
    let last = performance.now();

    function frame(now: number) {
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;

      const animStart = animStartRef.current;
      if (animStart !== null) {
        const t = Math.min(1, (now - animStart) / SPIN_MS);
        const eased = easeOutCubic(t);
        wheelRotRef.current = wheelTargetRef.current * eased;
        // Ball spins opposite, at higher angular velocity, then settles.
        ballRotRef.current = ballTargetRef.current * eased + Math.PI * 6 * (1 - eased);
        if (t >= 1) {
          // Lock in
          wheelRotRef.current = wheelTargetRef.current;
          ballRotRef.current = ballTargetRef.current;
          animStartRef.current = null;
        }
      } else if (!spinningRef.current) {
        // Slow idle drift so the wheel doesn't look frozen.
        idleSpinRef.current += dt * 0.12;
        wheelRotRef.current = idleSpinRef.current;
      }

      drawWheel(ctx, canvas.width, canvas.height, wheelRotRef.current, ballRotRef.current);
      raf = requestAnimationFrame(frame);
    }
    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
  }, []);

  // Mirror `spinning` to a ref so the rAF loop sees the latest value.
  const spinningRef = useRef(false);
  useEffect(() => { spinningRef.current = spinning; }, [spinning]);

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

    // Position the winning slot at the top (12 o'clock pointer).
    const idx = WHEEL_ORDER.indexOf(data.winning);
    // Wheel rotates so target slot ends at angle = -π/2 (top).
    // Slot i sits at i * SLOT_DEG (deg) clockwise from 12 — the wheel canvas
    // draws slots starting from the top. We want totalRotRad such that
    // (idx * slotRad + totalRotRad) % 2π == 0 (slot 0 of wheel = top before
    // any rotation, but we want WINNING at top), i.e. totalRot = -idx * slotRad.
    const slotRad = (SLOT_DEG * Math.PI) / 180;
    const baseTarget = -idx * slotRad;
    // Add several full rotations for visual drama.
    const targetRot = baseTarget + Math.PI * 2 * 5 + (Math.random() - 0.5) * (slotRad * 0.4);

    // Ball lands at the same angular position as the winning slot but
    // counter-rotates with extra revolutions for the bouncy feel.
    const ballTarget = -baseTarget + Math.PI * 2 * 8;

    wheelRotRef.current = 0;
    ballRotRef.current = Math.PI;
    wheelTargetRef.current = targetRot;
    ballTargetRef.current = ballTarget;
    animStartRef.current = performance.now();
    setSpinning(true);

    // Resolve UI after the spin animation completes.
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
    <div className="grid grid-2" style={{ alignItems: "start", gap: "var(--sp-5)" }}>
      <div className="stack-lg">
        {/* Wheel */}
        <div className="panel" style={{ padding: "var(--sp-5)" }}>
          <div className="panel-title">The Wheel</div>

          <HistoryStrip
            history={history}
            currentResult={result ? { n: result.winning, color: result.color } : null}
          />

          <div
            className="center"
            style={{
              background: "radial-gradient(circle at 50% 40%, #4a2818, #1a0f08)",
              border: "4px solid var(--ink-900)",
              padding: "var(--sp-4)",
              position: "relative",
              flexDirection: "column",
              gap: "var(--sp-3)",
            }}
          >
            <canvas
              ref={wheelCanvasRef}
              width={320}
              height={320}
              style={{
                imageRendering: "auto",
                maxWidth: "100%",
                width: "100%",
                height: "auto",
                maxHeight: 360,
                display: "block",
              }}
            />
            {result && !spinning && (
              <div
                style={{
                  position: "absolute",
                  top: 12,
                  left: "50%",
                  transform: "translateX(-50%)",
                  fontFamily: "var(--font-display)",
                  fontSize: 36,
                  color:
                    result.color === "red" ? "var(--crimson-300)" :
                    result.color === "black" ? "var(--parchment-50)" :
                    "var(--cactus-300)",
                  textShadow: "3px 3px 0 var(--ink-900), 0 0 16px rgba(245, 200, 66, 0.5)",
                  background: "rgba(26, 15, 8, 0.8)",
                  padding: "4px 14px",
                  border: "3px solid var(--ink-900)",
                }}
              >
                {result.winning}
              </div>
            )}
            {result && !spinning && (
              <div
                className="sign"
                style={{
                  background: result.totalPayout > result.totalBet
                    ? "var(--cactus-500)"
                    : result.totalPayout > 0
                    ? "var(--saddle-300)"
                    : "var(--crimson-500)",
                  marginTop: "var(--sp-2)",
                }}
              >
                {result.totalPayout > 0
                  ? `+${(result.totalPayout - result.totalBet).toLocaleString()} ¢`
                  : "House wins"}
              </div>
            )}
          </div>
        </div>

        {/* Felt betting table */}
        <div className="panel" style={{ padding: "var(--sp-4)", background: "#1f3818", borderColor: "var(--ink-900)" }}>
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
// Wheel canvas renderer
// ============================================================

function drawWheel(ctx: CanvasRenderingContext2D, W: number, H: number, wheelRot: number, ballRot: number) {
  ctx.clearRect(0, 0, W, H);
  const cx = W / 2;
  const cy = H / 2;
  const outerR = Math.min(W, H) / 2 - 6;
  const slotInnerR = outerR * 0.62;
  const hubR = outerR * 0.32;
  const ballR = outerR * 0.69;

  // Outer brass rim
  const rimGrad = ctx.createRadialGradient(cx, cy - outerR / 2, outerR * 0.2, cx, cy, outerR);
  rimGrad.addColorStop(0, "#ffd84d");
  rimGrad.addColorStop(0.6, "#c8941d");
  rimGrad.addColorStop(1, "#7a5510");
  ctx.fillStyle = rimGrad;
  ctx.beginPath();
  ctx.arc(cx, cy, outerR, 0, Math.PI * 2);
  ctx.fill();

  // Inner felt ring
  ctx.fillStyle = "#1f3818";
  ctx.beginPath();
  ctx.arc(cx, cy, outerR * 0.92, 0, Math.PI * 2);
  ctx.fill();

  // Slots
  const slotRad = (SLOT_DEG * Math.PI) / 180;
  for (let i = 0; i < SLOT_COUNT; i++) {
    const n = WHEEL_ORDER[i];
    const c = colorOf(n);
    const a0 = wheelRot + i * slotRad - Math.PI / 2 - slotRad / 2;
    const a1 = a0 + slotRad;
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.arc(cx, cy, outerR * 0.92, a0, a1);
    ctx.closePath();
    ctx.fillStyle = c === "red" ? "#c93a2c" : c === "black" ? "#1a0f08" : "#3d6b2e";
    ctx.fill();
    ctx.strokeStyle = "#2a1810";
    ctx.lineWidth = 1.2;
    ctx.stroke();
  }

  // Slot numbers
  ctx.fillStyle = "#fef6e4";
  ctx.font = "bold 12px 'M6X11', monospace";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  const labelR = outerR * 0.78;
  for (let i = 0; i < SLOT_COUNT; i++) {
    const n = WHEEL_ORDER[i];
    const a = wheelRot + i * slotRad - Math.PI / 2;
    const tx = cx + Math.cos(a) * labelR;
    const ty = cy + Math.sin(a) * labelR;
    ctx.save();
    ctx.translate(tx, ty);
    ctx.rotate(a + Math.PI / 2);
    ctx.fillText(String(n), 0, 0);
    ctx.restore();
  }

  // Inner ring (separates slots from hub)
  ctx.strokeStyle = "#7a5510";
  ctx.lineWidth = 4;
  ctx.beginPath();
  ctx.arc(cx, cy, slotInnerR, 0, Math.PI * 2);
  ctx.stroke();

  // Hub (wood)
  const hubGrad = ctx.createRadialGradient(cx, cy - hubR / 2, hubR * 0.2, cx, cy, hubR);
  hubGrad.addColorStop(0, "#a87545");
  hubGrad.addColorStop(1, "#4a2818");
  ctx.fillStyle = hubGrad;
  ctx.beginPath();
  ctx.arc(cx, cy, hubR, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = "#1a0f08";
  ctx.lineWidth = 3;
  ctx.stroke();

  // Hub spokes (rotate with the wheel)
  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate(wheelRot);
  ctx.strokeStyle = "rgba(26, 15, 8, 0.5)";
  ctx.lineWidth = 3;
  for (let i = 0; i < 4; i++) {
    const a = (Math.PI / 2) * i;
    ctx.beginPath();
    ctx.moveTo(Math.cos(a) * 6, Math.sin(a) * 6);
    ctx.lineTo(Math.cos(a) * hubR, Math.sin(a) * hubR);
    ctx.stroke();
  }
  // Center pin
  ctx.fillStyle = "#f5c842";
  ctx.beginPath();
  ctx.arc(0, 0, 6, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();

  // Ball (orbits at fixed radius — track itself doesn't rotate)
  const ballAngle = ballRot - Math.PI / 2;
  const bx = cx + Math.cos(ballAngle) * ballR;
  const by = cy + Math.sin(ballAngle) * ballR;
  ctx.shadowColor = "rgba(0, 0, 0, 0.6)";
  ctx.shadowBlur = 6;
  ctx.fillStyle = "#fef6e4";
  ctx.beginPath();
  ctx.arc(bx, by, 6, 0, Math.PI * 2);
  ctx.fill();
  ctx.shadowBlur = 0;
  ctx.fillStyle = "#fff";
  ctx.beginPath();
  ctx.arc(bx - 1.5, by - 1.5, 2, 0, Math.PI * 2);
  ctx.fill();

  // Top pointer
  ctx.fillStyle = "#f5c842";
  ctx.beginPath();
  ctx.moveTo(cx, cy - outerR + 2);
  ctx.lineTo(cx - 8, cy - outerR - 14);
  ctx.lineTo(cx + 8, cy - outerR - 14);
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = "#1a0f08";
  ctx.lineWidth = 2;
  ctx.stroke();
}

function easeOutCubic(t: number): number {
  return 1 - Math.pow(1 - t, 3);
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
            fontSize: 13,
            width: 28,
            height: 28,
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
    fontSize: 16,
    border: "2px solid var(--ink-900)",
    cursor: disabled ? "not-allowed" : "pointer",
    height: 48,
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
          gridTemplateColumns: "56px repeat(12, 1fr) 56px",
          gap: 3,
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
            height: 48 * 3 + 6,
            fontSize: 28,
            border: highlight === 0 ? "4px solid var(--gold-300)" : "3px solid var(--ink-900)",
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
              fontSize: 12,
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
          gridTemplateColumns: "56px repeat(3, 1fr) 56px",
          gap: 3,
          marginTop: 3,
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
              fontSize: 14,
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
          gridTemplateColumns: "56px repeat(6, 1fr) 56px",
          gap: 3,
          marginTop: 3,
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
              fontSize: 14,
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
        width: 56,
        height: 56,
        borderRadius: 999,
        background: c.bg,
        color: c.fg,
        border: `4px solid ${c.ring}`,
        boxShadow: active
          ? `inset 0 0 0 2px var(--gold-300), 0 0 0 3px var(--gold-300), var(--glow-gold)`
          : "inset 0 -3px 0 rgba(0,0,0,0.25), inset 0 3px 0 rgba(255,255,255,0.25), 0 4px 0 rgba(0,0,0,0.4)",
        fontFamily: "var(--font-display)",
        fontSize: 13,
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
          minWidth: 28,
          padding: "1px 4px",
          background: c.bg,
          color: c.fg,
          border: `2px solid ${c.ring}`,
          borderRadius: 999,
          fontFamily: "var(--font-display)",
          fontSize: 11,
          textShadow: "none",
          boxShadow: "inset 0 -2px 0 rgba(0,0,0,0.25), inset 0 2px 0 rgba(255,255,255,0.3)",
          textAlign: "center",
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
