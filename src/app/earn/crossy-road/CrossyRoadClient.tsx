"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";

const COLS = 9;
const ROWS_VISIBLE = 11;
const TILE = 48;
const W = COLS * TILE;
const H = ROWS_VISIBLE * TILE;

// Animation timings (seconds)
const HOP_DURATION = 0.12;
const CAMERA_LERP = 8;       // higher = snappier follow

type Phase = "idle" | "playing" | "dead" | "submitted";

type Lane = {
  y: number;
  kind: "grass" | "road";
  speed?: number;
  cars?: number[];
  carWidth?: number;
  reverse?: boolean;
  carColor?: string;
  // Decorations on grass tiles (column index → kind). Coins are collectable;
  // trees are visual-only.
  decorations?: Map<number, "tree" | "coin">;
};

type Particle = {
  x: number;       // tile coords
  y: number;       // world row coords
  vy: number;      // upward velocity (tiles/sec)
  life: number;    // seconds remaining
  text: string;
  color: string;
};

const CAR_COLORS = ["#5fa8d3", "#e05a3c", "#f5c842", "#6ba84f", "#c93a2c", "#5a3a78"];

function pick<T>(arr: readonly T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

// Difficulty curve. y is the highest row the player has reached.
function difficultyAt(y: number) {
  // First 5 rows always grass. Then road probability ramps from 0.30 → ~0.85.
  const roadProb = y < 5 ? 0 : Math.min(0.85, 0.30 + (y - 5) * 0.012);
  // Car speed bounds (tiles/sec) widen with depth.
  const speedMin = 0.8 + Math.min(1.6, y * 0.018);
  const speedMax = 2.0 + Math.min(4.0, y * 0.05);
  // More cars per lane as you go deeper.
  const carBonus = Math.min(2, Math.floor(y / 25));
  return { roadProb, speedMin, speedMax, carBonus };
}

function makeLane(y: number, prevWasRoad: boolean): Lane {
  // First strip is the safe spawn zone.
  if (y === 0 || y < 3) {
    return { y, kind: "grass", decorations: makeGrassDecorations(y, true) };
  }
  const d = difficultyAt(y);
  // Never two roads of identical direction back to back at low difficulty
  // (more forgiving for new players).
  const isRoad = !prevWasRoad && Math.random() < d.roadProb;
  if (!isRoad) {
    return { y, kind: "grass", decorations: makeGrassDecorations(y, false) };
  }
  const reverse = Math.random() < 0.5;
  const speed = d.speedMin + Math.random() * (d.speedMax - d.speedMin);
  const carCount = 1 + Math.floor(Math.random() * (2 + d.carBonus));
  const carWidth = 1 + Math.floor(Math.random() * 2);
  const spacing = COLS / Math.max(1, carCount);
  const cars = Array.from({ length: carCount }, (_, i) => i * spacing + Math.random() * 1.2);
  return {
    y,
    kind: "road",
    speed,
    cars,
    carWidth,
    reverse,
    carColor: pick(CAR_COLORS),
  };
}

function makeGrassDecorations(y: number, safeZone: boolean): Map<number, "tree" | "coin"> {
  const out = new Map<number, "tree" | "coin">();
  if (safeZone) return out;
  // Coins are rare — only ~6% of grass rows spawn one, and at most a single
  // coin per row.
  if (Math.random() < 0.06) {
    const cx = 1 + Math.floor(Math.random() * (COLS - 2));
    out.set(cx, "coin");
  }
  // Trees only on the edges, so the player isn't boxed in.
  for (let x = 0; x < COLS; x++) {
    if ((x <= 1 || x >= COLS - 2) && Math.random() < 0.20) out.set(x, "tree");
  }
  return out;
}

export function CrossyRoadClient() {
  const router = useRouter();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const phaseRef = useRef<Phase>("idle");
  const [phase, setPhase] = useState<Phase>("idle");
  const [score, setScore] = useState(0);
  const [coins, setCoins] = useState(0);
  const [highScore, setHighScore] = useState(0);
  const [submission, setSubmission] = useState<{ score: number; payout: number } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const runTokenRef = useRef<string | null>(null);
  const startedAtRef = useRef<number>(0);
  const resetFnRef = useRef<() => void>(() => {});
  const coinsRef = useRef(0);
  const scoreRef = useRef(0);

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
    let playerY = 0;
    // Smooth-animated player position (visual only)
    let visualX = playerX;
    let visualY = playerY;
    let hopT = 0;            // 0..1 progress of the current hop
    let hopFromX = playerX;
    let hopFromY = playerY;
    // Camera (interpolated)
    let cameraY = 0;
    // Death / shake
    let deathFlash = 0;
    let deathBy: { dx: number; dy: number } | null = null;
    // Particles (coin pickups, etc.)
    const particles: Particle[] = [];
    // Per-frame time for animated sprites
    let timeMs = 0;

    function ensureLane(y: number) {
      if (!lanes.has(y) && y >= 0) {
        const prev = lanes.get(y - 1);
        const prevWasRoad = !!prev && prev.kind === "road";
        lanes.set(y, makeLane(y, prevWasRoad));
      }
    }

    function reset() {
      lanes.clear();
      playerX = Math.floor(COLS / 2);
      playerY = 0;
      visualX = playerX;
      visualY = playerY;
      hopT = 1;
      hopFromX = playerX;
      hopFromY = playerY;
      cameraY = 0;
      deathFlash = 0;
      deathBy = null;
      particles.length = 0;
      coinsRef.current = 0;
      scoreRef.current = 0;
      for (let y = 0; y < ROWS_VISIBLE + 4; y++) ensureLane(y);
      setScore(0);
      setCoins(0);
    }

    reset();
    resetFnRef.current = reset;

    function tryMove(dx: number, dy: number) {
      if (phaseRef.current !== "playing") return;
      if (hopT < 0.6) return; // throttle: wait until current hop is mostly complete
      const targetX = Math.max(0, Math.min(COLS - 1, playerX + dx));
      const targetY = Math.max(0, playerY + dy);
      // Block walking into trees.
      const targetLane = lanes.get(targetY);
      if (targetLane?.kind === "grass" && targetLane.decorations?.get(targetX) === "tree") {
        return;
      }
      hopFromX = playerX;
      hopFromY = playerY;
      playerX = targetX;
      playerY = targetY;
      hopT = 0;
      // Spawn new lanes ahead
      for (let y = playerY; y < playerY + ROWS_VISIBLE + 4; y++) ensureLane(y);
      // Pick up coin if standing on one.
      const lane = lanes.get(playerY);
      if (lane?.kind === "grass" && lane.decorations?.get(playerX) === "coin") {
        lane.decorations.delete(playerX);
        coinsRef.current += 1;
        setCoins(coinsRef.current);
        particles.push({
          x: playerX + 0.5,
          y: playerY + 0.5,
          vy: 1.5,
          life: 0.9,
          text: "+500¢",
          color: "#f5c842",
        });
      }
      // Score = highest row reached
      if (playerY > scoreRef.current) {
        scoreRef.current = playerY;
        setScore(scoreRef.current);
      }
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
      timeMs += dt * 1000;

      // Advance cars only while alive
      if (phaseRef.current === "playing") {
        lanes.forEach((lane) => {
          if (lane.kind === "road" && lane.cars && lane.speed) {
            const dir = lane.reverse ? -1 : 1;
            const cw = lane.carWidth ?? 1;
            lane.cars = lane.cars.map((cx) => {
              let nx = cx + dir * lane.speed! * dt;
              if (nx > COLS) nx = -cw;
              if (nx + cw < 0) nx = COLS;
              return nx;
            });
          }
        });

        // Collision (only when player is settled on the tile, i.e. mostly done hopping).
        const lane = lanes.get(playerY);
        if (lane && lane.kind === "road" && lane.cars && hopT > 0.5) {
          const cw = lane.carWidth ?? 1;
          const playerStart = playerX + 0.25;
          const playerEnd = playerX + 0.75;
          for (const cx of lane.cars) {
            if (cx + cw <= 0 || cx >= COLS) continue;
            if (cx + cw > playerStart && cx < playerEnd) {
              phaseRef.current = "dead";
              setPhase("dead");
              setHighScore((h) => Math.max(h, scoreRef.current));
              deathFlash = 1;
              const dir = lane.reverse ? -1 : 1;
              deathBy = { dx: dir, dy: 0 };
              break;
            }
          }
        }
      }

      // Animate hop
      if (hopT < 1) {
        hopT = Math.min(1, hopT + dt / HOP_DURATION);
        const eased = 1 - (1 - hopT) * (1 - hopT); // ease-out
        visualX = hopFromX + (playerX - hopFromX) * eased;
        visualY = hopFromY + (playerY - hopFromY) * eased;
      } else {
        visualX = playerX;
        visualY = playerY;
      }

      // Camera lerp — keep player around 4 rows from the top of the view.
      const targetCamera = Math.max(0, visualY - (ROWS_VISIBLE - 5));
      cameraY += (targetCamera - cameraY) * Math.min(1, dt * CAMERA_LERP);

      // Particles
      for (const p of particles) {
        p.life -= dt;
        p.y += p.vy * dt;
      }
      for (let i = particles.length - 1; i >= 0; i--) {
        if (particles[i].life <= 0) particles.splice(i, 1);
      }

      // Death anim
      if (phaseRef.current === "dead") {
        deathFlash = Math.max(0, deathFlash - dt * 2);
        if (deathBy) {
          // Squash visual toward direction of impact
          visualX += deathBy.dx * dt * 0.6;
        }
      }

      render();
      raf = requestAnimationFrame(frame);
    }

    function render() {
      ctx.clearRect(0, 0, W, H);

      // Sky/grass backdrop
      ctx.fillStyle = "#6ba84f";
      ctx.fillRect(0, 0, W, H);

      // Compute which world rows are visible
      const startWorldY = Math.floor(cameraY) - 1;
      const endWorldY = startWorldY + ROWS_VISIBLE + 2;
      for (let worldY = startWorldY; worldY <= endWorldY; worldY++) {
        if (worldY < 0) continue;
        ensureLane(worldY);
        const lane = lanes.get(worldY)!;
        const screenY = H - (worldY - cameraY + 1) * TILE;
        drawLane(lane, screenY);
      }

      // Particles (drawn above lanes, below player)
      for (const p of particles) {
        const sx = p.x * TILE;
        const sy = H - (p.y - cameraY + 0.5) * TILE;
        const alpha = Math.max(0, Math.min(1, p.life * 1.2));
        ctx.globalAlpha = alpha;
        ctx.fillStyle = "#1a0f08";
        ctx.font = "bold 16px 'M6X11', monospace";
        ctx.textAlign = "center";
        ctx.fillText(p.text, sx + 1, sy + 1);
        ctx.fillStyle = p.color;
        ctx.fillText(p.text, sx, sy);
        ctx.globalAlpha = 1;
      }

      // Player
      drawChicken(visualX, visualY);

      // Death flash overlay
      if (deathFlash > 0) {
        ctx.fillStyle = `rgba(224, 90, 60, ${deathFlash * 0.55})`;
        ctx.fillRect(0, 0, W, H);
      }

      // HUD overlay (top-left)
      drawHud();
    }

    function drawLane(lane: Lane, screenY: number) {
      if (lane.kind === "grass") {
        ctx.fillStyle = (lane.y % 2 === 0) ? "#6ba84f" : "#5a9243";
        ctx.fillRect(0, screenY, W, TILE);
        // Grass tufts
        ctx.fillStyle = "#3d6b2e";
        for (let i = 0; i < 6; i++) {
          const gx = ((lane.y * 71 + i * 113) % (W - 6));
          ctx.fillRect(gx, screenY + (i * 7) % (TILE - 4), 2, 2);
        }
        // Decorations
        if (lane.decorations) {
          lane.decorations.forEach((kind, x) => {
            const dx = x * TILE;
            if (kind === "coin") drawCoin(dx, screenY);
            else if (kind === "tree") drawTree(dx, screenY);
          });
        }
      } else {
        // Road base
        ctx.fillStyle = "#3a2418";
        ctx.fillRect(0, screenY, W, TILE);
        ctx.fillStyle = "#2a1810";
        ctx.fillRect(0, screenY + TILE - 3, W, 3);
        ctx.fillRect(0, screenY, W, 3);
        // Lane stripes
        ctx.fillStyle = "#e8c468";
        for (let x = 0; x < COLS; x++) {
          ctx.fillRect(x * TILE + TILE / 2 - 5, screenY + TILE / 2 - 2, 10, 4);
        }
        // Cars
        if (lane.cars) {
          const cw = lane.carWidth ?? 1;
          for (const cx of lane.cars) {
            drawCar(cx * TILE, screenY, cw * TILE, lane.carColor ?? "#5fa8d3", lane.reverse ?? false);
          }
        }
      }
    }

    function drawChicken(vx: number, vy: number) {
      const px = vx * TILE;
      const py = H - (vy - cameraY + 1) * TILE;
      // Hop arc — visualY-only when actually hopping
      const arc = hopT < 1 ? Math.sin(hopT * Math.PI) * 8 : 0;
      const cx = px + TILE / 2;
      const cy = py + TILE / 2 - arc;

      // Drop shadow
      ctx.fillStyle = "rgba(26, 15, 8, 0.35)";
      ctx.beginPath();
      ctx.ellipse(cx, py + TILE - 6, TILE * 0.32, 4, 0, 0, Math.PI * 2);
      ctx.fill();

      // Pixel chicken (16-grid baked into a 36px sprite area)
      const s = TILE * 0.62;
      const left = cx - s / 2;
      const top = cy - s / 2;
      const u = s / 16;
      const px16 = (gx: number, gy: number, w: number, h: number, color: string) => {
        ctx.fillStyle = color;
        ctx.fillRect(Math.round(left + gx * u), Math.round(top + gy * u), Math.ceil(w * u), Math.ceil(h * u));
      };
      // body white
      px16(4, 6, 8, 7, "#fef6e4");
      px16(3, 7, 1, 5, "#fef6e4");
      px16(12, 7, 1, 5, "#fef6e4");
      // belly shadow
      px16(5, 11, 6, 2, "#e8c468");
      // beak
      px16(11, 8, 2, 2, "#e05a3c");
      // eye
      px16(9, 7, 1, 1, "#1a0f08");
      // comb (red)
      px16(7, 4, 1, 1, "#c93a2c");
      px16(8, 4, 1, 1, "#c93a2c");
      px16(7, 5, 2, 1, "#e05a3c");
      // feet
      px16(6, 13, 1, 2, "#c8941d");
      px16(9, 13, 1, 2, "#c8941d");
    }

    function drawCar(x: number, y: number, w: number, color: string, reverse: boolean) {
      // Drop shadow
      ctx.fillStyle = "rgba(0,0,0,0.35)";
      ctx.fillRect(x + 2, y + TILE - 8, w - 4, 6);
      // Body
      ctx.fillStyle = color;
      ctx.fillRect(x + 2, y + 8, w - 4, TILE - 16);
      // Top stripe (slight darker)
      ctx.fillStyle = shade(color, -0.25);
      ctx.fillRect(x + 2, y + TILE - 14, w - 4, 4);
      // Outline
      ctx.strokeStyle = "#1a0f08";
      ctx.lineWidth = 3;
      ctx.strokeRect(x + 2, y + 8, w - 4, TILE - 16);
      // Windshield (positioned by direction)
      ctx.fillStyle = "#c9e4f2";
      const wsW = Math.min(w - 12, TILE - 16);
      const wsX = reverse ? x + 6 : x + w - 6 - wsW;
      ctx.fillRect(wsX, y + 12, wsW, 8);
      // Wheels
      ctx.fillStyle = "#1a0f08";
      ctx.fillRect(x + 4, y + TILE - 12, 8, 4);
      ctx.fillRect(x + w - 12, y + TILE - 12, 8, 4);
      // Headlight
      ctx.fillStyle = "#ffd84d";
      const hlX = reverse ? x + 2 : x + w - 4;
      ctx.fillRect(hlX, y + 14, 2, 4);
    }

    function drawCoin(x: number, y: number) {
      // Spin animation: scale x with sine
      const t = (timeMs / 1000) * 4 + (x * 0.13);
      const sx = Math.abs(Math.cos(t));
      const cx = x + TILE / 2;
      const cy = y + TILE / 2;
      const rW = (TILE * 0.32) * sx;
      const rH = TILE * 0.34;
      // Shadow
      ctx.fillStyle = "rgba(26, 15, 8, 0.25)";
      ctx.beginPath();
      ctx.ellipse(cx, y + TILE - 6, TILE * 0.22, 3, 0, 0, Math.PI * 2);
      ctx.fill();
      // Coin
      ctx.fillStyle = "#c8941d";
      ctx.fillRect(cx - rW, cy - rH / 2, rW * 2, rH);
      ctx.fillStyle = "#f5c842";
      ctx.fillRect(cx - rW + 2, cy - rH / 2 + 2, rW * 2 - 4, rH - 4);
      // Inner $ when sx is wide enough to read
      if (sx > 0.55) {
        ctx.fillStyle = "#7a5510";
        ctx.fillRect(cx - 1, cy - 5, 2, 10);
        ctx.fillRect(cx - 4, cy - 3, 8, 2);
        ctx.fillRect(cx - 4, cy + 1, 8, 2);
      }
      ctx.strokeStyle = "#1a0f08";
      ctx.lineWidth = 2;
      ctx.strokeRect(cx - rW, cy - rH / 2, rW * 2, rH);
    }

    function drawTree(x: number, y: number) {
      // Trunk
      ctx.fillStyle = "#6b3f24";
      ctx.fillRect(x + TILE / 2 - 4, y + TILE - 18, 8, 14);
      ctx.fillStyle = "#4a2818";
      ctx.fillRect(x + TILE / 2 - 4, y + TILE - 6, 8, 2);
      // Foliage
      ctx.fillStyle = "#3d6b2e";
      ctx.fillRect(x + 8, y + 6, TILE - 16, 22);
      ctx.fillStyle = "#6ba84f";
      ctx.fillRect(x + 10, y + 8, 6, 6);
      ctx.fillRect(x + 22, y + 12, 6, 6);
      ctx.strokeStyle = "#1a0f08";
      ctx.lineWidth = 2;
      ctx.strokeRect(x + 8, y + 6, TILE - 16, 22);
    }

    function drawHud() {
      // Subtle gradient strip behind HUD
      ctx.fillStyle = "rgba(26, 15, 8, 0.55)";
      ctx.fillRect(0, 0, W, 30);
      ctx.font = "bold 16px 'M6X11', monospace";
      ctx.textAlign = "left";
      ctx.fillStyle = "#fef6e4";
      ctx.fillText(`ROW ${scoreRef.current}`, 10, 21);
      ctx.fillStyle = "#f5c842";
      ctx.fillText(`◉ ${coinsRef.current}`, 110, 21);
      // Difficulty pip
      const d = difficultyAt(scoreRef.current);
      const pct = Math.round((d.roadProb / 0.85) * 100);
      ctx.textAlign = "right";
      ctx.fillStyle = pct < 40 ? "#b8d99a" : pct < 70 ? "#ffe9a8" : "#ff5544";
      ctx.fillText(`HEAT ${pct}%`, W - 10, 21);
    }

    function shade(hex: string, amt: number): string {
      // Mix toward black (amt<0) or white (amt>0). Cheap and good enough.
      const m = /^#([0-9a-f]{6})$/i.exec(hex);
      if (!m) return hex;
      const num = parseInt(m[1], 16);
      let r = (num >> 16) & 0xff, g = (num >> 8) & 0xff, b = num & 0xff;
      const t = amt < 0 ? 0 : 255;
      const k = Math.abs(amt);
      r = Math.round(r + (t - r) * k);
      g = Math.round(g + (t - g) * k);
      b = Math.round(b + (t - b) * k);
      return `#${((r << 16) | (g << 8) | b).toString(16).padStart(6, "0")}`;
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
    resetFnRef.current();
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
    // Server pays 50¢ per row + 500¢ per ground-coin, each capped to a
    // per-second ceiling.
    const res = await fetch("/api/earn/crossy-road/submit", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ runToken: runTokenRef.current, score, coins, durationMs }),
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
            position: "relative",
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
              display: "block",
            }}
          />
          {phase === "idle" && (
            <Overlay>
              <h3 style={{ fontFamily: "var(--font-display)", fontSize: 32, marginBottom: 8 }}>
                Crossy Road
              </h3>
              <p style={{ marginBottom: 16, opacity: 0.85 }}>
                Hop the chicken across. Grab coins. Avoid wagons.
              </p>
              <button className="btn btn-lg" onClick={start}>Start</button>
            </Overlay>
          )}
          {phase === "dead" && (
            <Overlay tone="danger">
              <h3 style={{ fontFamily: "var(--font-display)", fontSize: 32, marginBottom: 4 }}>
                Splat
              </h3>
              <p style={{ marginBottom: 14, opacity: 0.85 }}>
                {score} rows · {coins} coin{coins === 1 ? "" : "s"}
              </p>
              <div className="row" style={{ gap: 8 }}>
                <button className="btn" onClick={submit}>Claim</button>
                <button className="btn btn-ghost" onClick={start}>Try Again</button>
              </div>
            </Overlay>
          )}
        </div>
        <p className="text-mute" style={{ marginTop: "var(--sp-3)", textAlign: "center" }}>
          Arrow keys / WASD. Up = forward. Edge trees block movement.
        </p>
      </div>

      <div className="panel" style={{ padding: "var(--sp-6)" }}>
        <div className="panel-title">Run Stats</div>

        <div className="grid grid-3">
          <StatBox label="Rows" value={score} tone="money" />
          <StatBox label="Coins" value={coins} tone="gold" />
          <StatBox label="Best" value={highScore} tone="parchment" />
        </div>

        <div className="stack-lg" style={{ marginTop: "var(--sp-5)" }}>
          {phase === "playing" && (
            <div className="text-mute">
              Each row is +50¢. Ground coins are rare and +500¢ each.
              Difficulty climbs the further you go.
            </div>
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
                  : "Need at least 1,000¢ worth (20 rows or 2 coins) for a payout."}
              </div>
              <button className="btn btn-block" onClick={start}>Run Again</button>
            </>
          )}
          {error && <p style={{ color: "var(--crimson-500)" }}>{error}</p>}
        </div>

        <div style={{ marginTop: "var(--sp-5)" }}>
          <div className="label">How it pays</div>
          <ul className="text-mute" style={{ fontSize: "var(--fs-small)", paddingLeft: 18 }}>
            <li>+50¢ per row crossed</li>
            <li>+500¢ per ground coin grabbed</li>
            <li>Minimum 1,000¢ to claim</li>
            <li>Cap 50,000¢ per run</li>
          </ul>
        </div>
      </div>
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
        inset: "var(--sp-4)",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        textAlign: "center",
        padding: "var(--sp-5)",
        background: tone === "danger" ? "rgba(74, 26, 26, 0.86)" : "rgba(26, 15, 8, 0.78)",
        color: "var(--parchment-50)",
        border: "3px solid var(--ink-900)",
        boxShadow: "var(--bevel-light)",
        backdropFilter: "blur(2px)",
      }}
    >
      {children}
    </div>
  );
}

function StatBox({ label, value, tone }: { label: string; value: number; tone: "money" | "gold" | "parchment" }) {
  const bg =
    tone === "money" ? "var(--parchment-200)" :
    tone === "gold" ? "var(--gold-100)" :
    "var(--parchment-50)";
  const fg =
    tone === "money" ? "var(--gold-500)" :
    tone === "gold" ? "var(--gold-700)" :
    "var(--saddle-500)";
  return (
    <div className="panel" style={{ background: bg, padding: "var(--sp-3)" }}>
      <div className="label">{label}</div>
      <div
        style={{
          fontSize: "var(--fs-h2)",
          fontFamily: "var(--font-display)",
          color: fg,
          textShadow: tone !== "parchment" ? "2px 2px 0 var(--gold-100)" : undefined,
          lineHeight: 1,
        }}
      >
        {value}
      </div>
    </div>
  );
}
