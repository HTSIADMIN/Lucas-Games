"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { WeeklyArcadeLeaderboard } from "@/components/WeeklyArcadeLeaderboard";
import * as Sfx from "@/lib/sfx";

// Classic snake. 20×20 grid, wrap-free walls, dies on self-bite or
// wall-hit. Each fruit = +1 score and the snake grows by one cell.
// Speed creeps up every few fruits so the run stays tense.

type Phase = "idle" | "playing" | "dead" | "submitted";
type Cell = { x: number; y: number };
type Dir = "up" | "down" | "left" | "right";

const COLS = 20;
const ROWS = 20;
const CELL = 20; // px
const BOARD_W = COLS * CELL;
const BOARD_H = ROWS * CELL;

const BASE_TICK_MS = 140;          // starting move interval
const MIN_TICK_MS = 60;            // floor — fastest the snake ever moves
const SPEED_RAMP_PER_FRUIT = 4;    // ms shaved off the tick per fruit eaten

const DIR_VEC: Record<Dir, { dx: number; dy: number }> = {
  up:    { dx:  0, dy: -1 },
  down:  { dx:  0, dy:  1 },
  left:  { dx: -1, dy:  0 },
  right: { dx:  1, dy:  0 },
};

const OPPOSITE: Record<Dir, Dir> = {
  up: "down", down: "up", left: "right", right: "left",
};

function randomEmptyCell(snake: Cell[]): Cell {
  // Pick a random cell not currently occupied by the snake. With a
  // 400-cell board and snake almost never longer than 50, the
  // probability of repeated rejection is trivial.
  const occupied = new Set(snake.map((c) => `${c.x},${c.y}`));
  while (true) {
    const x = Math.floor(Math.random() * COLS);
    const y = Math.floor(Math.random() * ROWS);
    if (!occupied.has(`${x},${y}`)) return { x, y };
  }
}

export function SnakeClient() {
  const router = useRouter();
  const canvasRef = useRef<HTMLCanvasElement>(null);

  const [phase, setPhase] = useState<Phase>("idle");
  const phaseRef = useRef<Phase>("idle");
  useEffect(() => { phaseRef.current = phase; }, [phase]);

  const [score, setScore] = useState(0);
  const scoreRef = useRef(0);
  const [highScore, setHighScore] = useState(0);
  const [submission, setSubmission] = useState<{ score: number; payout: number } | null>(null);
  const [error, setError] = useState<string | null>(null);

  const runTokenRef = useRef<string | null>(null);
  const startedAtRef = useRef<number>(0);

  // Snake body — head is the LAST element. Direction queue smooths
  // out rapid taps so two presses inside a single tick still both
  // register on consecutive ticks.
  const snakeRef = useRef<Cell[]>([]);
  const dirRef = useRef<Dir>("right");
  const queuedDirRef = useRef<Dir | null>(null);
  const fruitRef = useRef<Cell>({ x: 0, y: 0 });

  // Tick scheduling — manual setTimeout chain rather than rAF so
  // the game feels grid-stepped (no half-cell visuals).
  const tickTimerRef = useRef<number | null>(null);

  // Force redraw when score/state changes during play.
  const [, setRedraw] = useState(0);

  function resetGameState() {
    const startX = Math.floor(COLS / 2);
    const startY = Math.floor(ROWS / 2);
    snakeRef.current = [
      { x: startX - 2, y: startY },
      { x: startX - 1, y: startY },
      { x: startX,     y: startY },
    ];
    dirRef.current = "right";
    queuedDirRef.current = null;
    fruitRef.current = randomEmptyCell(snakeRef.current);
    scoreRef.current = 0;
    setScore(0);
    setSubmission(null);
    setError(null);
  }

  function tick() {
    if (phaseRef.current !== "playing") return;
    // Apply queued direction iff it isn't a 180° flip.
    if (queuedDirRef.current && OPPOSITE[queuedDirRef.current] !== dirRef.current) {
      dirRef.current = queuedDirRef.current;
    }
    queuedDirRef.current = null;

    const head = snakeRef.current[snakeRef.current.length - 1];
    const v = DIR_VEC[dirRef.current];
    const nx = head.x + v.dx;
    const ny = head.y + v.dy;

    // Wall collision
    if (nx < 0 || nx >= COLS || ny < 0 || ny >= ROWS) return die();

    // Self collision (skip the tail cell since it'll move out of
    // the way this same tick — unless we're about to grow).
    const willEat = nx === fruitRef.current.x && ny === fruitRef.current.y;
    const collisionStart = willEat ? 0 : 1; // include tail if eating
    for (let i = collisionStart; i < snakeRef.current.length; i++) {
      const c = snakeRef.current[i];
      if (c.x === nx && c.y === ny) return die();
    }

    const newSnake = snakeRef.current.slice();
    newSnake.push({ x: nx, y: ny });
    if (willEat) {
      scoreRef.current += 1;
      setScore(scoreRef.current);
      Sfx.play("coins.clink");
      fruitRef.current = randomEmptyCell(newSnake);
    } else {
      newSnake.shift();
    }
    snakeRef.current = newSnake;

    setRedraw((n) => (n + 1) & 0xffff);
    scheduleNextTick();
  }

  function scheduleNextTick() {
    const interval = Math.max(MIN_TICK_MS, BASE_TICK_MS - scoreRef.current * SPEED_RAMP_PER_FRUIT);
    if (tickTimerRef.current) window.clearTimeout(tickTimerRef.current);
    tickTimerRef.current = window.setTimeout(tick, interval);
  }

  function die() {
    if (tickTimerRef.current) window.clearTimeout(tickTimerRef.current);
    tickTimerRef.current = null;
    Sfx.play("ui.bomb");
    setHighScore((h) => Math.max(h, scoreRef.current));
    setPhase("dead");
  }

  // Render the board to canvas. Re-runs whenever phase / redraw
  // tick / score changes. Cheap — a 400-cell grid.
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.imageSmoothingEnabled = false;

    // Felt
    ctx.fillStyle = "#1f3818";
    ctx.fillRect(0, 0, BOARD_W, BOARD_H);

    // Grid stripes — alternate slightly lighter rows for a chequered look
    for (let y = 0; y < ROWS; y++) {
      for (let x = 0; x < COLS; x++) {
        if ((x + y) % 2 === 0) {
          ctx.fillStyle = "rgba(95, 158, 79, 0.10)";
          ctx.fillRect(x * CELL, y * CELL, CELL, CELL);
        }
      }
    }

    // Border
    ctx.strokeStyle = "#0a1808";
    ctx.lineWidth = 2;
    ctx.strokeRect(1, 1, BOARD_W - 2, BOARD_H - 2);

    // Fruit — pixel-art apple
    const f = fruitRef.current;
    if (phase !== "idle") {
      const fx = f.x * CELL;
      const fy = f.y * CELL;
      ctx.fillStyle = "#c93a2c";
      ctx.fillRect(fx + 3, fy + 4, CELL - 6, CELL - 7);
      ctx.fillStyle = "#ff5544";
      ctx.fillRect(fx + 5, fy + 6, 4, 4);
      ctx.fillStyle = "#3d6b2e";
      ctx.fillRect(fx + CELL / 2 - 1, fy + 1, 2, 4);
      ctx.fillStyle = "#1a0f08";
      ctx.fillRect(fx + 3, fy + 4, CELL - 6, 1);
      ctx.fillRect(fx + 3, fy + CELL - 4, CELL - 6, 1);
    }

    // Snake
    const snake = snakeRef.current;
    for (let i = 0; i < snake.length; i++) {
      const c = snake[i];
      const isHead = i === snake.length - 1;
      const x = c.x * CELL;
      const y = c.y * CELL;
      ctx.fillStyle = isHead ? "#ffd84d" : i % 2 === 0 ? "#6ba84f" : "#5a8a3e";
      ctx.fillRect(x + 1, y + 1, CELL - 2, CELL - 2);
      ctx.fillStyle = "#1a0f08";
      ctx.fillRect(x + 1, y + 1, CELL - 2, 1);
      ctx.fillRect(x + 1, y + CELL - 2, CELL - 2, 1);
      if (isHead) {
        // eye dots
        const dir = dirRef.current;
        const eyeColor = "#1a0f08";
        ctx.fillStyle = eyeColor;
        if (dir === "right") {
          ctx.fillRect(x + CELL - 7, y + 5, 2, 2);
          ctx.fillRect(x + CELL - 7, y + CELL - 7, 2, 2);
        } else if (dir === "left") {
          ctx.fillRect(x + 5, y + 5, 2, 2);
          ctx.fillRect(x + 5, y + CELL - 7, 2, 2);
        } else if (dir === "up") {
          ctx.fillRect(x + 5, y + 5, 2, 2);
          ctx.fillRect(x + CELL - 7, y + 5, 2, 2);
        } else {
          ctx.fillRect(x + 5, y + CELL - 7, 2, 2);
          ctx.fillRect(x + CELL - 7, y + CELL - 7, 2, 2);
        }
      }
    }
  });

  // Keyboard input
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (phaseRef.current !== "playing") return;
      const k = e.key.toLowerCase();
      let dir: Dir | null = null;
      if (k === "arrowup" || k === "w")    dir = "up";
      if (k === "arrowdown" || k === "s")  dir = "down";
      if (k === "arrowleft" || k === "a")  dir = "left";
      if (k === "arrowright" || k === "d") dir = "right";
      if (!dir) return;
      e.preventDefault();
      queuedDirRef.current = dir;
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  function dpadPress(dir: Dir) {
    if (phaseRef.current !== "playing") return;
    queuedDirRef.current = dir;
  }

  async function start() {
    setError(null);
    setSubmission(null);
    const res = await fetch("/api/earn/snake/start", { method: "POST" });
    const data = await res.json();
    if (!res.ok) {
      setError(data.error ?? "error");
      return;
    }
    runTokenRef.current = data.runToken;
    if (typeof data.bestScore === "number") {
      setHighScore((h) => Math.max(h, data.bestScore));
    }
    resetGameState();
    startedAtRef.current = Date.now();
    setPhase("playing");
    scheduleNextTick();
  }

  async function submit() {
    if (!runTokenRef.current) return;
    const durationMs = Date.now() - startedAtRef.current;
    const res = await fetch("/api/earn/snake/submit", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ runToken: runTokenRef.current, score: scoreRef.current, durationMs }),
    });
    const data = await res.json();
    if (!res.ok) {
      setError(data.error ?? "error");
      return;
    }
    setSubmission({ score: data.score, payout: data.payout });
    if (typeof data.bestScore === "number") setHighScore(data.bestScore);
    setPhase("submitted");
    runTokenRef.current = null;
    router.refresh();
  }

  // Auto-claim on death after a short read-the-result beat.
  useEffect(() => {
    if (phase !== "dead") return;
    if (!runTokenRef.current) return;
    const t = window.setTimeout(() => submit(), 600);
    return () => window.clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase]);

  // Cleanup any pending tick on unmount.
  useEffect(() => () => {
    if (tickTimerRef.current) window.clearTimeout(tickTimerRef.current);
  }, []);

  return (
    <div className="grid grid-2" style={{ alignItems: "start" }}>
      <div className="panel" style={{ padding: "var(--sp-5)" }}>
        <div className="panel-title">The Garden</div>
        <div
          style={{
            display: "flex",
            justifyContent: "center",
            position: "relative",
            background: "var(--saddle-500)",
            border: "4px solid var(--ink-900)",
            padding: "var(--sp-3)",
          }}
        >
          <canvas
            ref={canvasRef}
            width={BOARD_W}
            height={BOARD_H}
            style={{
              imageRendering: "pixelated",
              width: "100%",
              maxWidth: BOARD_W,
              height: "auto",
              aspectRatio: `${BOARD_W} / ${BOARD_H}`,
              touchAction: "none",
              background: "#0a1808",
              border: "3px solid var(--ink-900)",
            }}
          />

          {phase === "idle" && (
            <Overlay tone="neutral">
              <h3 style={{ fontFamily: "var(--font-display)", fontSize: 32, marginBottom: 4 }}>
                Snake
              </h3>
              <p style={{ marginBottom: 16, opacity: 0.85, textAlign: "center" }}>
                Eat the fruit. Don&apos;t bite yourself.
                <br />
                Each fruit = +200 ¢ (cap 50k / run).
              </p>
              <button className="btn btn-lg" onClick={start}>Start</button>
            </Overlay>
          )}

          {phase === "dead" && (
            <Overlay tone="danger">
              <h3 style={{ fontFamily: "var(--font-display)", fontSize: 32, marginBottom: 4 }}>
                Bit yourself
              </h3>
              <p style={{ marginBottom: 14, opacity: 0.85 }}>
                {score} fruit eaten — banked!
              </p>
              <button className="btn btn-ghost btn-block" onClick={start}>Try Again</button>
            </Overlay>
          )}
          {phase === "submitted" && submission && (
            <Overlay tone={submission.payout > 0 ? "neutral" : "danger"}>
              <h3 style={{ fontFamily: "var(--font-display)", fontSize: 28, marginBottom: 8 }}>
                {submission.payout > 0 ? `+${submission.payout.toLocaleString()} ¢` : "Need more fruit"}
              </h3>
              <p style={{ marginBottom: 14, opacity: 0.85 }}>
                Final score: {submission.score} fruit
              </p>
              <button className="btn btn-block" onClick={start}>New Run</button>
            </Overlay>
          )}
        </div>

        {/* Touch d-pad */}
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(3, 56px)",
            gridTemplateRows: "repeat(3, 56px)",
            gap: 4,
            marginTop: "var(--sp-4)",
            justifyContent: "center",
          }}
        >
          <span />
          <DPadBtn label="↑" onPress={() => dpadPress("up")} />
          <span />
          <DPadBtn label="←" onPress={() => dpadPress("left")} />
          <span />
          <DPadBtn label="→" onPress={() => dpadPress("right")} />
          <span />
          <DPadBtn label="↓" onPress={() => dpadPress("down")} />
          <span />
        </div>

        <p className="text-mute" style={{ marginTop: "var(--sp-3)", textAlign: "center", fontSize: 12 }}>
          Arrow keys / WASD on desktop. Snake speeds up the longer it gets.
        </p>
      </div>

      <div className="panel" style={{ padding: "var(--sp-5)" }}>
        <div className="panel-title">Run Stats</div>
        <div className="grid grid-3">
          <Stat label="Fruit" value={score} tone="money" />
          <Stat label="Reward" value={Math.min(50_000, score * 200)} tone="gold" prefix="¢" />
          <Stat label="Best" value={highScore} tone="parchment" />
        </div>
        {error && <p style={{ color: "var(--crimson-500)", marginTop: "var(--sp-3)" }}>{error}</p>}
      </div>

      <div className="panel" style={{ padding: "var(--sp-5)" }}>
        <div className="label">How it pays</div>
        <ul className="text-mute" style={{ fontSize: "var(--fs-small)", paddingLeft: 18, margin: 0 }}>
          <li>+200 ¢ per fruit</li>
          <li>Minimum 1,000 ¢ to claim</li>
          <li>Cap 50,000 ¢ per run</li>
        </ul>
      </div>

      <WeeklyArcadeLeaderboard game="snake" />
    </div>
  );
}

function Overlay({
  children,
  tone = "neutral",
}: {
  children: React.ReactNode;
  tone?: "neutral" | "danger";
}) {
  return (
    <div
      style={{
        position: "absolute",
        inset: 0,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        background:
          tone === "danger"
            ? "rgba(74, 16, 16, 0.78)"
            : "rgba(31, 56, 24, 0.82)",
        color: "var(--parchment-50)",
        padding: "var(--sp-5)",
        textAlign: "center",
      }}
    >
      {children}
    </div>
  );
}

function DPadBtn({ label, onPress }: { label: string; onPress: () => void }) {
  return (
    <button
      type="button"
      onPointerDown={(e) => { e.preventDefault(); onPress(); }}
      onClick={(e) => e.preventDefault()}
      style={{
        width: 56,
        height: 56,
        background: "var(--saddle-500)",
        border: "3px solid var(--ink-900)",
        color: "var(--gold-300)",
        fontFamily: "var(--font-display)",
        fontSize: 24,
        cursor: "pointer",
        boxShadow: "var(--bevel-light), var(--bevel-dark)",
      }}
    >
      {label}
    </button>
  );
}

function Stat({ label, value, tone, prefix }: {
  label: string;
  value: number;
  tone: "money" | "gold" | "parchment";
  prefix?: string;
}) {
  const bg =
    tone === "money" ? "var(--cactus-500)" :
    tone === "gold" ? "var(--gold-300)" :
    "var(--parchment-200)";
  const fg = tone === "money" ? "var(--parchment-50)" : "var(--ink-900)";
  return (
    <div
      style={{
        background: bg,
        color: fg,
        padding: "var(--sp-3)",
        border: "3px solid var(--ink-900)",
        textAlign: "center",
      }}
    >
      <div className="label" style={{ color: fg, opacity: 0.7 }}>{label}</div>
      <div style={{ fontFamily: "var(--font-display)", fontSize: 22, lineHeight: 1, marginTop: 2 }}>
        {value.toLocaleString()}{prefix ? ` ${prefix}` : ""}
      </div>
    </div>
  );
}
