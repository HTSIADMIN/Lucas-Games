"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";

const W = 480;
const H = 540;
const BIRD_X = 96;
const BIRD_R = 14;
const GRAVITY = 1400;     // px/s^2
const FLAP_VY = -440;     // px/s
const PIPE_W = 64;
const GAP_H = 150;
const PIPE_SPEED = 180;   // px/s
const PIPE_INTERVAL_S = 1.6;
const GROUND_H = 40;

type Phase = "idle" | "playing" | "dead" | "submitted";

export function FlappyClient() {
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
    const ctx2d = canvas.getContext("2d");
    if (!ctx2d) return;
    const ctx: CanvasRenderingContext2D = ctx2d;
    ctx.imageSmoothingEnabled = false;

    let raf = 0;
    let lastT = performance.now();

    let birdY = H / 2;
    let birdVy = 0;
    let pipes: { x: number; gapY: number; passed: boolean }[] = [];
    let timeSincePipe = 0;
    let frameTilt = 0;

    function reset() {
      birdY = H / 2;
      birdVy = 0;
      pipes = [];
      timeSincePipe = 0;
      frameTilt = 0;
      setScore(0);
    }
    resetFnRef.current = reset;

    function flap() {
      if (phaseRef.current === "playing") birdVy = FLAP_VY;
    }
    flapFnRef.current = flap;

    function onKey(e: KeyboardEvent) {
      if (e.code === "Space" || e.code === "ArrowUp" || e.code === "KeyW") {
        e.preventDefault();
        flap();
      }
    }
    function onClick() { flap(); }
    function onTouch(e: TouchEvent) { e.preventDefault(); flap(); }

    window.addEventListener("keydown", onKey);
    canvas.addEventListener("mousedown", onClick);
    canvas.addEventListener("touchstart", onTouch, { passive: false });

    function spawnPipe() {
      const margin = 60;
      const gapY = margin + Math.random() * (H - GROUND_H - GAP_H - margin * 2);
      pipes.push({ x: W + 20, gapY, passed: false });
    }

    function frame(t: number) {
      const dt = Math.min(0.04, (t - lastT) / 1000);
      lastT = t;

      if (phaseRef.current === "playing") {
        // Physics
        birdVy += GRAVITY * dt;
        birdY += birdVy * dt;
        frameTilt = Math.max(-0.5, Math.min(1.0, birdVy / 500));

        // Pipes
        timeSincePipe += dt;
        if (timeSincePipe > PIPE_INTERVAL_S) {
          spawnPipe();
          timeSincePipe = 0;
        }
        for (const p of pipes) p.x -= PIPE_SPEED * dt;
        pipes = pipes.filter((p) => p.x + PIPE_W > -10);

        // Score: pipe fully passed
        for (const p of pipes) {
          if (!p.passed && p.x + PIPE_W < BIRD_X - BIRD_R) {
            p.passed = true;
            setScore((s) => s + 1);
          }
        }

        // Collisions
        let dead = false;
        if (birdY - BIRD_R < 0 || birdY + BIRD_R > H - GROUND_H) dead = true;
        for (const p of pipes) {
          const inX = BIRD_X + BIRD_R > p.x && BIRD_X - BIRD_R < p.x + PIPE_W;
          if (inX) {
            const inGap = birdY - BIRD_R > p.gapY && birdY + BIRD_R < p.gapY + GAP_H;
            if (!inGap) { dead = true; break; }
          }
        }
        if (dead) {
          phaseRef.current = "dead";
          setPhase("dead");
          setHighScore((h) => {
            // Score state may not be flushed yet — use the `pipes passed` count.
            const passed = pipes.filter((p) => p.passed).length;
            return Math.max(h, passed);
          });
        }
      }

      // === RENDER ===
      // Sky
      ctx.fillStyle = "#fef6e4";
      ctx.fillRect(0, 0, W, H);
      // Distant cliffs (parallax-y)
      ctx.fillStyle = "#e8c089";
      for (let i = 0; i < 5; i++) {
        const x = (i * 140 - (Date.now() / 30) % 140);
        ctx.fillRect(x, H - GROUND_H - 60, 100, 60);
      }
      // Pipes
      for (const p of pipes) {
        // Top
        ctx.fillStyle = "#3d6b2e";
        ctx.fillRect(p.x, 0, PIPE_W, p.gapY);
        ctx.strokeStyle = "#1a0f08";
        ctx.lineWidth = 4;
        ctx.strokeRect(p.x, 0, PIPE_W, p.gapY);
        // Top cap
        ctx.fillStyle = "#6ba84f";
        ctx.fillRect(p.x - 4, p.gapY - 16, PIPE_W + 8, 16);
        ctx.strokeRect(p.x - 4, p.gapY - 16, PIPE_W + 8, 16);
        // Bottom
        ctx.fillStyle = "#3d6b2e";
        ctx.fillRect(p.x, p.gapY + GAP_H, PIPE_W, H - GROUND_H - p.gapY - GAP_H);
        ctx.strokeRect(p.x, p.gapY + GAP_H, PIPE_W, H - GROUND_H - p.gapY - GAP_H);
        // Bottom cap
        ctx.fillStyle = "#6ba84f";
        ctx.fillRect(p.x - 4, p.gapY + GAP_H, PIPE_W + 8, 16);
        ctx.strokeRect(p.x - 4, p.gapY + GAP_H, PIPE_W + 8, 16);
      }
      // Ground
      ctx.fillStyle = "#a87545";
      ctx.fillRect(0, H - GROUND_H, W, GROUND_H);
      ctx.strokeStyle = "#1a0f08";
      ctx.lineWidth = 4;
      ctx.strokeRect(0, H - GROUND_H, W, GROUND_H);
      // Ground stripes
      ctx.fillStyle = "#6b3f24";
      for (let i = 0; i < 12; i++) {
        const x = ((i * 48) - (Date.now() / 5) % 48);
        ctx.fillRect(x, H - GROUND_H + 8, 24, 6);
      }

      // Bird
      ctx.save();
      ctx.translate(BIRD_X, birdY);
      ctx.rotate(frameTilt * 0.6);
      ctx.fillStyle = "#f5c842";
      ctx.strokeStyle = "#1a0f08";
      ctx.lineWidth = 4;
      // Body
      ctx.fillRect(-BIRD_R, -BIRD_R, BIRD_R * 2, BIRD_R * 2);
      ctx.strokeRect(-BIRD_R, -BIRD_R, BIRD_R * 2, BIRD_R * 2);
      // Wing
      ctx.fillStyle = "#c8941d";
      ctx.fillRect(-BIRD_R + 2, -2, BIRD_R, 8);
      // Eye
      ctx.fillStyle = "#fff";
      ctx.fillRect(BIRD_R - 8, -BIRD_R + 4, 6, 6);
      ctx.fillStyle = "#1a0f08";
      ctx.fillRect(BIRD_R - 6, -BIRD_R + 6, 3, 3);
      // Beak
      ctx.fillStyle = "#e05a3c";
      ctx.fillRect(BIRD_R, -2, 6, 6);
      ctx.strokeRect(BIRD_R, -2, 6, 6);
      ctx.restore();

      raf = requestAnimationFrame(frame);
    }
    raf = requestAnimationFrame(frame);

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("keydown", onKey);
      canvas.removeEventListener("mousedown", onClick);
      canvas.removeEventListener("touchstart", onTouch);
    };
  }, []);

  const resetFnRef = useRef<() => void>(() => {});
  const flapFnRef = useRef<() => void>(() => {});

  async function start() {
    setError(null);
    setSubmission(null);
    resetFnRef.current();
    const res = await fetch("/api/earn/flappy/start", { method: "POST" });
    const data = await res.json();
    if (!res.ok) { setError(data.error ?? "error"); return; }
    runTokenRef.current = data.runToken;
    startedAtRef.current = Date.now();
    phaseRef.current = "playing";
    setPhase("playing");
  }

  async function submit() {
    if (!runTokenRef.current) return;
    const durationMs = Date.now() - startedAtRef.current;
    const res = await fetch("/api/earn/flappy/submit", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ runToken: runTokenRef.current, score, durationMs }),
    });
    const data = await res.json();
    if (!res.ok) { setError(data.error ?? "error"); return; }
    setSubmission({ score: data.score, payout: data.payout });
    setPhase("submitted");
    runTokenRef.current = null;
    router.refresh();
  }

  return (
    <div className="grid grid-2" style={{ alignItems: "start" }}>
      <div className="panel" style={{ padding: "var(--sp-6)" }}>
        <div className="panel-title">Tap to Fly</div>
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
              cursor: "pointer",
            }}
          />
        </div>
        <p className="text-mute" style={{ marginTop: "var(--sp-3)", textAlign: "center" }}>
          Space / click / tap to flap.
        </p>

        {/* On-screen flap button — visible on mobile, useful on desktop too. */}
        <button
          type="button"
          aria-label="Flap"
          onPointerDown={(e) => { e.preventDefault(); flapFnRef.current(); }}
          onClick={(e) => { e.preventDefault(); }}
          disabled={phase !== "playing"}
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            gap: 8,
            width: "100%",
            marginTop: "var(--sp-3)",
            padding: "var(--sp-4)",
            fontFamily: "var(--font-display)",
            fontSize: "var(--fs-h3)",
            letterSpacing: "var(--ls-loose)",
            textTransform: "uppercase",
            background: phase === "playing" ? "var(--gold-300)" : "var(--saddle-300)",
            color: "var(--ink-900)",
            border: "3px solid var(--ink-900)",
            cursor: phase === "playing" ? "pointer" : "not-allowed",
            boxShadow: "var(--bevel-light), var(--bevel-dark)",
            touchAction: "manipulation",
            userSelect: "none",
          }}
        >
          ↑ Flap
        </button>
      </div>

      <div className="panel" style={{ padding: "var(--sp-6)" }}>
        <div className="panel-title">{phase === "playing" ? "Stay Aloft" : "Take Flight"}</div>

        <div className="grid grid-2">
          <div className="panel" style={{ background: "var(--parchment-200)", padding: "var(--sp-3)" }}>
            <div className="label">Pipes</div>
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
          {phase === "playing" && <p className="text-mute">Don't crash.</p>}
          {phase === "dead" && (
            <>
              <p style={{ color: "var(--crimson-500)" }}>Crashed. {score} pipes cleared.</p>
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
                  : "Need at least 5 pipes for a payout."}
              </div>
              <button className="btn btn-block" onClick={start}>Fly Again</button>
            </>
          )}
          {error && <p style={{ color: "var(--crimson-500)" }}>{error}</p>}
        </div>

        <div style={{ marginTop: "var(--sp-5)" }}>
          <div className="label">Payouts</div>
          <p className="text-mute" style={{ fontSize: "var(--fs-small)" }}>
            200 Coins per pipe. Minimum 1,000 (5 pipes). Cap 10,000 per run.
          </p>
        </div>
      </div>
    </div>
  );
}
