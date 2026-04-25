"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";

const COLS = 9;
const ROWS_VISIBLE = 11;
const TILE = 48;
const W = COLS * TILE;
const H = ROWS_VISIBLE * TILE;

type Phase = "idle" | "playing" | "dead" | "submitted";

type Lane = {
  y: number;          // world row index
  kind: "grass" | "road";
  speed?: number;     // tiles/sec
  cars?: number[];    // x positions in tile units
  carWidth?: number;  // in tiles
  reverse?: boolean;
};

function makeLane(y: number, prev?: Lane): Lane {
  // Start zone is grass; alternate after.
  if (y === 0 || y < 2) return { y, kind: "grass" };
  // 50/50 grass vs road, but never two roads of identical speed back to back.
  const isRoad = Math.random() < 0.7;
  if (!isRoad) return { y, kind: "grass" };
  const reverse = Math.random() < 0.5;
  const speed = 1.2 + Math.random() * 3.5; // 1.2..4.7 tiles/sec
  const carCount = 2 + Math.floor(Math.random() * 2);
  const carWidth = 1 + Math.floor(Math.random() * 2);
  const spacing = COLS / carCount;
  const cars = Array.from({ length: carCount }, (_, i) => i * spacing + Math.random() * 1.5);
  return { y, kind: "road", speed, cars, carWidth, reverse };
}

export function CrossyRoadClient() {
  const router = useRouter();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const phaseRef = useRef<Phase>("idle");
  const [phase, setPhase] = useState<Phase>("idle");
  const [score, setScore] = useState(0);
  const [highScore, setHighScore] = useState(0);
  const [submission, setSubmission] = useState<{ score: number; payout: number } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const runTokenRef = useRef<string | null>(null);
  const startedAtRef = useRef<number>(0);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d")!;
    ctx.imageSmoothingEnabled = false;

    let raf = 0;
    let lastT = performance.now();

    // World state
    const lanes = new Map<number, Lane>();
    let playerX = Math.floor(COLS / 2);
    let playerY = 0;          // world row (== rows crossed)
    let cameraY = 0;          // top-of-view world row

    function ensureLane(y: number) {
      if (!lanes.has(y) && y >= 0) {
        lanes.set(y, makeLane(y, lanes.get(y - 1)));
      }
    }

    function reset() {
      lanes.clear();
      playerX = Math.floor(COLS / 2);
      playerY = 0;
      cameraY = 0;
      for (let y = 0; y < ROWS_VISIBLE + 4; y++) ensureLane(y);
    }

    reset();

    function tryMove(dx: number, dy: number) {
      if (phaseRef.current !== "playing") return;
      const nx = Math.max(0, Math.min(COLS - 1, playerX + dx));
      const ny = Math.max(0, playerY + dy);
      playerX = nx;
      playerY = ny;
      // Camera follows player up
      if (playerY - cameraY > ROWS_VISIBLE - 5) cameraY = playerY - (ROWS_VISIBLE - 5);
      // Spawn new lanes ahead
      for (let y = cameraY; y < cameraY + ROWS_VISIBLE + 4; y++) ensureLane(y);
      // Score = highest row reached
      setScore((s) => Math.max(s, playerY));
    }

    function onKey(e: KeyboardEvent) {
      if (phaseRef.current !== "playing") return;
      switch (e.key) {
        case "ArrowUp":
        case "w":
        case "W":
          e.preventDefault();
          tryMove(0, 1);
          break;
        case "ArrowDown":
        case "s":
        case "S":
          e.preventDefault();
          tryMove(0, -1);
          break;
        case "ArrowLeft":
        case "a":
        case "A":
          e.preventDefault();
          tryMove(-1, 0);
          break;
        case "ArrowRight":
        case "d":
        case "D":
          e.preventDefault();
          tryMove(1, 0);
          break;
      }
    }
    window.addEventListener("keydown", onKey);

    function frame(t: number) {
      const dt = Math.min(0.05, (t - lastT) / 1000);
      lastT = t;

      // Advance cars
      if (phaseRef.current === "playing") {
        lanes.forEach((lane) => {
          if (lane.kind === "road" && lane.cars && lane.speed) {
            const dir = lane.reverse ? -1 : 1;
            lane.cars = lane.cars.map((cx) => {
              let nx = cx + dir * lane.speed! * dt;
              if (nx > COLS + 1) nx -= COLS + 2;
              if (nx < -2) nx += COLS + 2;
              return nx;
            });
          }
        });

        // Collision check
        const lane = lanes.get(playerY);
        if (lane && lane.kind === "road" && lane.cars) {
          const cw = lane.carWidth ?? 1;
          for (const cx of lane.cars) {
            if (playerX >= cx - cw + 0.05 && playerX <= cx + cw - 0.05) {
              phaseRef.current = "dead";
              setPhase("dead");
              setHighScore((h) => Math.max(h, playerY));
              break;
            }
          }
        }
      }

      // Render
      ctx.clearRect(0, 0, W, H);
      // Lanes
      for (let row = 0; row < ROWS_VISIBLE; row++) {
        const worldY = cameraY + row;
        ensureLane(worldY);
        const lane = lanes.get(worldY)!;
        const screenY = H - (row + 1) * TILE;
        if (lane.kind === "grass") {
          ctx.fillStyle = (worldY % 2 === 0) ? "#6ba84f" : "#5a9243";
          ctx.fillRect(0, screenY, W, TILE);
        } else {
          ctx.fillStyle = "#3a2418";
          ctx.fillRect(0, screenY, W, TILE);
          // Lane stripes
          ctx.fillStyle = "#e8c468";
          for (let x = 0; x < COLS; x++) {
            ctx.fillRect(x * TILE + TILE / 2 - 4, screenY + TILE / 2 - 2, 8, 4);
          }
          // Cars
          if (lane.cars) {
            const cw = lane.carWidth ?? 1;
            ctx.fillStyle = lane.reverse ? "#e05a3c" : "#5fa8d3";
            ctx.strokeStyle = "#1a0f08";
            ctx.lineWidth = 3;
            for (const cx of lane.cars) {
              const x = cx * TILE;
              ctx.fillRect(x, screenY + 4, cw * TILE, TILE - 8);
              ctx.strokeRect(x, screenY + 4, cw * TILE, TILE - 8);
            }
          }
        }
      }
      // Player
      const playerScreenRow = playerY - cameraY;
      const px = playerX * TILE;
      const py = H - (playerScreenRow + 1) * TILE;
      ctx.fillStyle = "#f5c842";
      ctx.strokeStyle = "#1a0f08";
      ctx.lineWidth = 4;
      ctx.fillRect(px + 6, py + 6, TILE - 12, TILE - 12);
      ctx.strokeRect(px + 6, py + 6, TILE - 12, TILE - 12);

      raf = requestAnimationFrame(frame);
    }
    raf = requestAnimationFrame(frame);

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("keydown", onKey);
    };
  }, []);

  async function start() {
    setError(null);
    setSubmission(null);
    setScore(0);
    const res = await fetch("/api/earn/crossy-road/start", { method: "POST" });
    const data = await res.json();
    if (!res.ok) {
      setError(data.error ?? "error");
      return;
    }
    runTokenRef.current = data.runToken;
    startedAtRef.current = Date.now();
    phaseRef.current = "playing";
    setPhase("playing");
  }

  async function submit() {
    if (!runTokenRef.current) return;
    const durationMs = Date.now() - startedAtRef.current;
    const res = await fetch("/api/earn/crossy-road/submit", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ runToken: runTokenRef.current, score, durationMs }),
    });
    const data = await res.json();
    if (!res.ok) {
      setError(data.error ?? "error");
      return;
    }
    setSubmission({ score: data.score, payout: data.payout });
    setPhase("submitted");
    runTokenRef.current = null;
    router.refresh();
  }

  return (
    <div className="grid grid-2" style={{ alignItems: "start" }}>
      <div className="panel" style={{ padding: "var(--sp-6)" }}>
        <div className="panel-title">Cross The Road</div>
        <div
          className="center"
          style={{
            background: "var(--saddle-500)",
            border: "4px solid var(--ink-900)",
            padding: "var(--sp-4)",
          }}
        >
          <canvas
            ref={canvasRef}
            width={W}
            height={H}
            style={{
              imageRendering: "pixelated",
              border: "3px solid var(--ink-900)",
              maxWidth: "100%",
              height: "auto",
              background: "#6ba84f",
            }}
          />
        </div>
        <p className="text-mute" style={{ marginTop: "var(--sp-3)", textAlign: "center" }}>
          Arrow keys / WASD. Up = forward.
        </p>
      </div>

      <div className="panel" style={{ padding: "var(--sp-6)" }}>
        <div className="panel-title">{phase === "playing" ? "Don't get hit" : "Run"}</div>

        <div className="grid grid-2">
          <div className="panel" style={{ background: "var(--parchment-200)", padding: "var(--sp-3)" }}>
            <div className="label">Score</div>
            <div className="text-money" style={{ fontSize: "var(--fs-h2)", fontFamily: "var(--font-display)" }}>
              {score}
            </div>
          </div>
          <div className="panel" style={{ background: "var(--gold-100)", padding: "var(--sp-3)" }}>
            <div className="label">Best</div>
            <div className="text-money" style={{ fontSize: "var(--fs-h2)", fontFamily: "var(--font-display)" }}>
              {highScore}
            </div>
          </div>
        </div>

        <div className="stack-lg" style={{ marginTop: "var(--sp-5)" }}>
          {phase === "idle" && (
            <button className="btn btn-lg btn-block" onClick={start}>Start</button>
          )}
          {phase === "playing" && (
            <p className="text-mute">Crossing rows. Don't stop.</p>
          )}
          {phase === "dead" && (
            <>
              <p style={{ color: "var(--crimson-500)" }}>Splat. {score} rows crossed.</p>
              <button className="btn btn-block" onClick={submit}>Claim Coins</button>
              <button className="btn btn-ghost btn-block" onClick={start}>Try Again</button>
            </>
          )}
          {phase === "submitted" && submission && (
            <>
              <div
                className="sign"
                style={{
                  display: "block",
                  textAlign: "center",
                  background: submission.payout > 0 ? "var(--cactus-500)" : "var(--saddle-300)",
                }}
              >
                {submission.payout > 0
                  ? `+${submission.payout.toLocaleString()} ¢`
                  : "Need at least 10 rows for a payout."}
              </div>
              <button className="btn btn-block" onClick={start}>Run Again</button>
            </>
          )}
          {error && <p style={{ color: "var(--crimson-500)" }}>{error}</p>}
        </div>

        <div style={{ marginTop: "var(--sp-5)" }}>
          <div className="label">Payouts</div>
          <p className="text-mute" style={{ fontSize: "var(--fs-small)" }}>
            100 Coins per row. Minimum 1,000 (10 rows). Cap 10,000 per run.
          </p>
        </div>
      </div>
    </div>
  );
}
