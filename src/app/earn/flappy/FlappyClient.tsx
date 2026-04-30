"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { WeeklyArcadeLeaderboard } from "@/components/WeeklyArcadeLeaderboard";

const W = 480;
const H = 540;
const BIRD_X = 110;
const BIRD_R = 14;
const GROUND_H = 44;
const FLAP_VY = -440;     // px/s

type Phase = "idle" | "countdown" | "playing" | "dead" | "submitted";
type ModeKey = "easy" | "normal" | "hard";

type ModeCfg = {
  key: ModeKey;
  label: string;
  tagline: string;
  multiplier: number;
  perPipe: number;
  maxPayout: number;
  // Physics — must match server cap implications.
  gravity: number;
  pipeSpeed: number;
  pipeIntervalS: number;
  gapH: number;
  // Theming
  accent: string;
};

const MODES: Record<ModeKey, ModeCfg> = {
  easy: {
    key: "easy",
    label: "Drifter",
    tagline: "Wide gaps, slow pipes",
    multiplier: 1.0,
    perPipe: 100,
    maxPayout: 10_000,
    gravity: 1300,
    pipeSpeed: 160,
    pipeIntervalS: 1.7,
    gapH: 170,
    accent: "var(--cactus-300)",
  },
  normal: {
    key: "normal",
    label: "Gunslinger",
    tagline: "Tighter gaps, brisk pace",
    multiplier: 3.0,
    perPipe: 300,
    maxPayout: 30_000,
    gravity: 1450,
    pipeSpeed: 210,
    pipeIntervalS: 1.4,
    gapH: 140,
    accent: "var(--gold-300)",
  },
  hard: {
    key: "hard",
    label: "Outlaw",
    tagline: "Knife-edge gaps, full gallop",
    multiplier: 7.0,
    perPipe: 700,
    maxPayout: 70_000,
    gravity: 1600,
    pipeSpeed: 270,
    pipeIntervalS: 1.15,
    gapH: 110,
    accent: "var(--crimson-300)",
  },
};

type Spark = { x: number; y: number; vx: number; vy: number; life: number; color: string };

export function FlappyClient() {
  const router = useRouter();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const phaseRef = useRef<Phase>("idle");
  const [phase, setPhase] = useState<Phase>("idle");
  const [score, setScore] = useState(0);
  const [highScore, setHighScore] = useState(0);
  const [submission, setSubmission] = useState<{ score: number; payout: number; multiplier: number } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [mode, setMode] = useState<ModeKey>("normal");
  const [countdown, setCountdown] = useState<number | null>(null);
  const runTokenRef = useRef<string | null>(null);
  const startedAtRef = useRef<number>(0);

  // Refs the render loop reads (so we can mount it once).
  const modeRef = useRef<ModeCfg>(MODES.normal);
  const scoreRef = useRef(0);
  useEffect(() => { modeRef.current = MODES[mode]; }, [mode]);
  useEffect(() => { phaseRef.current = phase; }, [phase]);

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
    let wingPhase = 0;
    const sparks: Spark[] = [];
    const trail: { x: number; y: number; life: number }[] = [];
    let deathFlash = 0;
    let cameraShake = 0;
    // Parallax offsets
    let cloudOffset = 0;
    let mountainOffset = 0;
    let groundOffset = 0;

    function reset() {
      birdY = H / 2;
      birdVy = 0;
      pipes = [];
      timeSincePipe = 0;
      frameTilt = 0;
      wingPhase = 0;
      sparks.length = 0;
      trail.length = 0;
      deathFlash = 0;
      cameraShake = 0;
      scoreRef.current = 0;
      setScore(0);
    }
    resetFnRef.current = reset;

    function flap() {
      if (phaseRef.current === "playing") {
        birdVy = FLAP_VY;
        // Burst of small feathers/dust on flap
        for (let i = 0; i < 4; i++) {
          sparks.push({
            x: BIRD_X - 6,
            y: birdY + 4,
            vx: -40 - Math.random() * 60,
            vy: -10 + Math.random() * 40,
            life: 0.35 + Math.random() * 0.2,
            color: "#fef6e4",
          });
        }
      }
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
      const m = modeRef.current;
      const margin = 60;
      const gapY = margin + Math.random() * (H - GROUND_H - m.gapH - margin * 2);
      pipes.push({ x: W + 20, gapY, passed: false });
    }

    function frame(t: number) {
      const dt = Math.min(0.04, (t - lastT) / 1000);
      lastT = t;
      const m = modeRef.current;

      // Parallax always scrolls (even when idle, gives the world life)
      const scrollSpeed = phaseRef.current === "playing" ? m.pipeSpeed : 60;
      cloudOffset = (cloudOffset + scrollSpeed * 0.15 * dt) % 240;
      mountainOffset = (mountainOffset + scrollSpeed * 0.35 * dt) % 200;
      groundOffset = (groundOffset + scrollSpeed * dt) % 32;

      // Wing animation
      wingPhase = (wingPhase + dt * (phaseRef.current === "playing" ? 12 : 6)) % (Math.PI * 2);

      if (phaseRef.current === "playing") {
        // Physics
        birdVy += m.gravity * dt;
        birdY += birdVy * dt;
        frameTilt = Math.max(-0.5, Math.min(1.0, birdVy / 500));

        // Trail behind bird
        trail.push({ x: BIRD_X - 4, y: birdY, life: 0.4 });

        // Pipes
        timeSincePipe += dt;
        if (timeSincePipe > m.pipeIntervalS) {
          spawnPipe();
          timeSincePipe = 0;
        }
        for (const p of pipes) p.x -= m.pipeSpeed * dt;
        pipes = pipes.filter((p) => p.x + 64 > -10);

        // Score: pipe fully passed
        for (const p of pipes) {
          if (!p.passed && p.x + 64 < BIRD_X - BIRD_R) {
            p.passed = true;
            scoreRef.current += 1;
            setScore(scoreRef.current);
            // Coin pickup spark cluster at the gap center
            for (let i = 0; i < 10; i++) {
              const a = Math.random() * Math.PI * 2;
              const sp = 80 + Math.random() * 80;
              sparks.push({
                x: BIRD_X + 24,
                y: birdY,
                vx: Math.cos(a) * sp,
                vy: Math.sin(a) * sp - 20,
                life: 0.5 + Math.random() * 0.3,
                color: "#f5c842",
              });
            }
          }
        }

        // Collisions
        let dead = false;
        if (birdY - BIRD_R < 0 || birdY + BIRD_R > H - GROUND_H) dead = true;
        for (const p of pipes) {
          const inX = BIRD_X + BIRD_R > p.x && BIRD_X - BIRD_R < p.x + 64;
          if (inX) {
            const inGap = birdY - BIRD_R > p.gapY && birdY + BIRD_R < p.gapY + m.gapH;
            if (!inGap) { dead = true; break; }
          }
        }
        if (dead) {
          phaseRef.current = "dead";
          setPhase("dead");
          deathFlash = 1;
          cameraShake = 1;
          // Crash explosion
          for (let i = 0; i < 22; i++) {
            const a = Math.random() * Math.PI * 2;
            const sp = 120 + Math.random() * 220;
            sparks.push({
              x: BIRD_X,
              y: birdY,
              vx: Math.cos(a) * sp,
              vy: Math.sin(a) * sp,
              life: 0.7 + Math.random() * 0.4,
              color: Math.random() < 0.5 ? "#e05a3c" : "#f5c842",
            });
          }
          setHighScore((h) => Math.max(h, scoreRef.current));
        }
      } else if (phaseRef.current === "dead") {
        // Bird tumbles to the ground
        birdVy += m.gravity * 1.4 * dt;
        birdY = Math.min(H - GROUND_H - BIRD_R, birdY + birdVy * dt);
        frameTilt += dt * 6;
      }

      // Decay sparks/trail/effects always
      for (const s of sparks) {
        s.x += s.vx * dt;
        s.y += s.vy * dt;
        s.vy += 380 * dt;
        s.life -= dt;
      }
      for (let i = sparks.length - 1; i >= 0; i--) if (sparks[i].life <= 0) sparks.splice(i, 1);
      for (const tr of trail) tr.life -= dt;
      for (let i = trail.length - 1; i >= 0; i--) if (trail[i].life <= 0) trail.splice(i, 1);
      deathFlash = Math.max(0, deathFlash - dt * 1.6);
      cameraShake = Math.max(0, cameraShake - dt * 1.4);

      render();
      raf = requestAnimationFrame(frame);
    }

    function render() {
      const m = modeRef.current;

      ctx.save();
      if (cameraShake > 0.01) {
        const a = cameraShake * 7;
        ctx.translate((Math.random() - 0.5) * a, (Math.random() - 0.5) * a);
      }

      // Sky — vertical gradient with mode tinting
      const sky = ctx.createLinearGradient(0, 0, 0, H);
      if (m.key === "hard") {
        sky.addColorStop(0, "#ffb8a8");
        sky.addColorStop(0.7, "#f5c842");
        sky.addColorStop(1, "#e05a3c");
      } else if (m.key === "normal") {
        sky.addColorStop(0, "#fef6e4");
        sky.addColorStop(0.6, "#fbe9c4");
        sky.addColorStop(1, "#f4dba0");
      } else {
        sky.addColorStop(0, "#c9e4f2");
        sky.addColorStop(0.6, "#fef6e4");
        sky.addColorStop(1, "#fbe9c4");
      }
      ctx.fillStyle = sky;
      ctx.fillRect(0, 0, W, H);

      // Sun
      ctx.fillStyle = "rgba(255, 232, 168, 0.85)";
      ctx.beginPath();
      ctx.arc(W - 80, 80, 36, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "rgba(255, 246, 228, 0.5)";
      ctx.beginPath();
      ctx.arc(W - 80, 80, 50, 0, Math.PI * 2);
      ctx.fill();

      // Clouds (parallax slow)
      ctx.fillStyle = "rgba(254, 246, 228, 0.9)";
      for (let i = 0; i < 4; i++) {
        const cx = ((i * 200 - cloudOffset + 600) % (W + 240)) - 120;
        const cy = 50 + (i * 17) % 40;
        cloud(cx, cy);
      }

      // Mountains (parallax mid)
      ctx.fillStyle = m.key === "hard" ? "#5a3a78" : m.key === "normal" ? "#a87545" : "#8a8077";
      for (let i = 0; i < 4; i++) {
        const mx = ((i * 200 - mountainOffset + 800) % (W + 240)) - 120;
        mountain(mx, H - GROUND_H);
      }

      // Pipes (themed wood posts)
      for (const p of pipes) {
        drawPipe(p.x, 0, p.gapY, true);
        drawPipe(p.x, p.gapY + m.gapH, H - GROUND_H - p.gapY - m.gapH, false);
      }

      // Trail (gold streaks)
      for (const tr of trail) {
        const a = Math.max(0, tr.life / 0.4);
        ctx.fillStyle = `rgba(245, 200, 66, ${a * 0.55})`;
        ctx.fillRect(tr.x, tr.y - 3, 6, 6);
      }

      // Bird
      drawBird(BIRD_X, birdY, frameTilt, wingPhase);

      // Sparks
      for (const s of sparks) {
        const a = Math.max(0, s.life);
        ctx.fillStyle = s.color;
        ctx.globalAlpha = Math.min(1, a * 1.8);
        ctx.fillRect(s.x - 1.5, s.y - 1.5, 3, 3);
        ctx.globalAlpha = 1;
      }

      // Ground (foreground parallax)
      ctx.fillStyle = "#a87545";
      ctx.fillRect(0, H - GROUND_H, W, GROUND_H);
      ctx.fillStyle = "#6b3f24";
      for (let i = -1; i < 17; i++) {
        const x = i * 32 - groundOffset;
        ctx.fillRect(x, H - GROUND_H + 8, 16, 6);
        ctx.fillRect(x + 8, H - GROUND_H + 22, 12, 4);
      }
      ctx.strokeStyle = "#1a0f08";
      ctx.lineWidth = 4;
      ctx.strokeRect(0, H - GROUND_H, W, GROUND_H);

      // Top HUD overlay — score badge + multiplier badge
      drawHud();

      // Death flash
      if (deathFlash > 0) {
        ctx.fillStyle = `rgba(224, 90, 60, ${deathFlash * 0.6})`;
        ctx.fillRect(0, 0, W, H);
      }

      ctx.restore();
    }

    function drawHud() {
      const m = modeRef.current;
      // Score pill (top-center)
      const sc = `${scoreRef.current}`;
      ctx.font = "bold 32px 'M6X11', monospace";
      const padX = 14, padY = 6;
      const tw = ctx.measureText(sc).width;
      const w = tw + padX * 2;
      const cx = W / 2 - w / 2;
      const cy = 14;
      ctx.fillStyle = "rgba(26, 15, 8, 0.78)";
      ctx.fillRect(cx, cy, w, 36);
      ctx.strokeStyle = "#1a0f08";
      ctx.lineWidth = 2;
      ctx.strokeRect(cx, cy, w, 36);
      ctx.fillStyle = "#f5c842";
      ctx.textBaseline = "middle";
      ctx.textAlign = "center";
      ctx.fillText(sc, W / 2, cy + 18);

      // Mode badge (top-left)
      const ml = m.label.toUpperCase();
      ctx.font = "bold 14px 'M6X11', monospace";
      ctx.textAlign = "left";
      ctx.textBaseline = "middle";
      const mtw = ctx.measureText(ml).width;
      const mw = mtw + 24;
      ctx.fillStyle = "rgba(26, 15, 8, 0.78)";
      ctx.fillRect(8, 14, mw, 26);
      ctx.strokeRect(8, 14, mw, 26);
      ctx.fillStyle = "#fef6e4";
      ctx.fillText(ml, 14, 27);

      // Multiplier badge (top-right)
      const mult = `${m.multiplier}×`;
      ctx.font = "bold 18px 'M6X11', monospace";
      const mwt = ctx.measureText(mult).width + 16;
      ctx.fillStyle = "rgba(26, 15, 8, 0.78)";
      ctx.fillRect(W - mwt - 8, 14, mwt, 26);
      ctx.strokeRect(W - mwt - 8, 14, mwt, 26);
      ctx.fillStyle = m.key === "hard" ? "#ff5544" : m.key === "normal" ? "#f5c842" : "#6ba84f";
      ctx.textAlign = "center";
      ctx.fillText(mult, W - 8 - mwt / 2, 27);
    }

    function cloud(x: number, y: number) {
      ctx.beginPath();
      ctx.arc(x, y, 16, 0, Math.PI * 2);
      ctx.arc(x + 18, y - 4, 14, 0, Math.PI * 2);
      ctx.arc(x + 32, y, 18, 0, Math.PI * 2);
      ctx.arc(x + 12, y + 6, 14, 0, Math.PI * 2);
      ctx.fill();
    }

    function mountain(x: number, baseY: number) {
      ctx.beginPath();
      ctx.moveTo(x, baseY);
      ctx.lineTo(x + 80, baseY - 90);
      ctx.lineTo(x + 130, baseY - 50);
      ctx.lineTo(x + 200, baseY - 120);
      ctx.lineTo(x + 280, baseY);
      ctx.closePath();
      ctx.fill();
      // Snow caps
      ctx.fillStyle = "rgba(254, 246, 228, 0.85)";
      ctx.beginPath();
      ctx.moveTo(x + 70, baseY - 80);
      ctx.lineTo(x + 80, baseY - 90);
      ctx.lineTo(x + 90, baseY - 80);
      ctx.closePath();
      ctx.fill();
      ctx.beginPath();
      ctx.moveTo(x + 188, baseY - 110);
      ctx.lineTo(x + 200, baseY - 120);
      ctx.lineTo(x + 212, baseY - 110);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = modeRef.current.key === "hard" ? "#5a3a78" : modeRef.current.key === "normal" ? "#a87545" : "#8a8077";
    }

    function drawPipe(x: number, y: number, h: number, isTop: boolean) {
      if (h <= 0) return;
      // Body
      const bodyGrad = ctx.createLinearGradient(x, 0, x + 64, 0);
      bodyGrad.addColorStop(0, "#6b3f24");
      bodyGrad.addColorStop(0.5, "#a87545");
      bodyGrad.addColorStop(1, "#6b3f24");
      ctx.fillStyle = bodyGrad;
      ctx.fillRect(x, y, 64, h);
      // Wood grain
      ctx.strokeStyle = "rgba(26, 15, 8, 0.25)";
      ctx.lineWidth = 1;
      for (let g = 0; g < 5; g++) {
        const gx = x + 8 + g * 12;
        ctx.beginPath();
        ctx.moveTo(gx, y);
        ctx.lineTo(gx, y + h);
        ctx.stroke();
      }
      // Outline
      ctx.strokeStyle = "#1a0f08";
      ctx.lineWidth = 4;
      ctx.strokeRect(x, y, 64, h);
      // Cap (the chunky end facing the player)
      const capH = 18;
      const capY = isTop ? y + h - capH : y;
      ctx.fillStyle = "#d4a574";
      ctx.fillRect(x - 6, capY, 76, capH);
      ctx.strokeRect(x - 6, capY, 76, capH);
      ctx.fillStyle = "#a87545";
      ctx.fillRect(x - 6, capY + (isTop ? capH - 4 : 0), 76, 4);
    }

    function drawBird(x: number, y: number, tilt: number, wing: number) {
      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(tilt * 0.6);
      // Body (yellow with shadow)
      ctx.fillStyle = "#f5c842";
      ctx.fillRect(-BIRD_R, -BIRD_R, BIRD_R * 2, BIRD_R * 2);
      ctx.fillStyle = "#e8c468";
      ctx.fillRect(-BIRD_R, BIRD_R - 6, BIRD_R * 2, 6);
      // Belly white
      ctx.fillStyle = "#fef6e4";
      ctx.fillRect(-BIRD_R + 4, BIRD_R - 8, BIRD_R, 5);
      ctx.strokeStyle = "#1a0f08";
      ctx.lineWidth = 4;
      ctx.strokeRect(-BIRD_R, -BIRD_R, BIRD_R * 2, BIRD_R * 2);
      // Wing — animated up/down
      const wOff = Math.sin(wing) * 4;
      ctx.fillStyle = "#c8941d";
      ctx.fillRect(-BIRD_R + 2, -2 + wOff, BIRD_R, 8);
      ctx.strokeRect(-BIRD_R + 2, -2 + wOff, BIRD_R, 8);
      // Eye white
      ctx.fillStyle = "#fff";
      ctx.fillRect(BIRD_R - 9, -BIRD_R + 4, 7, 7);
      ctx.fillStyle = "#1a0f08";
      ctx.fillRect(BIRD_R - 6, -BIRD_R + 6, 3, 3);
      // Beak
      ctx.fillStyle = "#e05a3c";
      ctx.fillRect(BIRD_R, -2, 7, 7);
      ctx.strokeRect(BIRD_R, -2, 7, 7);
      ctx.fillStyle = "#c93a2c";
      ctx.fillRect(BIRD_R, 2, 7, 3);
      ctx.restore();
    }

    raf = requestAnimationFrame(frame);

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("keydown", onKey);
      canvas.removeEventListener("mousedown", onClick);
      canvas.removeEventListener("touchstart", onTouch);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const resetFnRef = useRef<() => void>(() => {});
  const flapFnRef = useRef<() => void>(() => {});

  async function start() {
    setError(null);
    setSubmission(null);
    resetFnRef.current();
    const res = await fetch("/api/earn/flappy/start", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ mode }),
    });
    const data = await res.json();
    if (!res.ok) { setError(data.error ?? "error"); return; }
    runTokenRef.current = data.runToken;
    if (typeof data.bestScore === "number") {
      setHighScore((h) => Math.max(h, data.bestScore));
    }
    // 3-2-1-GO countdown before play actually starts.
    setPhase("countdown");
    let n = 3;
    setCountdown(n);
    const tick = () => {
      n -= 1;
      if (n > 0) {
        setCountdown(n);
        setTimeout(tick, 700);
      } else {
        setCountdown(null);
        startedAtRef.current = Date.now();
        phaseRef.current = "playing";
        setPhase("playing");
      }
    };
    setTimeout(tick, 700);
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
    setSubmission({ score: data.score, payout: data.payout, multiplier: data.multiplier ?? 1 });
    if (typeof data.bestScore === "number") setHighScore(data.bestScore);
    setPhase("submitted");
    runTokenRef.current = null;
    router.refresh();
  }

  // Auto-claim on death — the player shouldn't have to tap a button
  // to bank the run. We give the splat overlay a beat to read first
  // (~600ms) so the death feedback isn't replaced instantly.
  useEffect(() => {
    if (phase !== "dead") return;
    if (!runTokenRef.current) return;
    const t = window.setTimeout(() => {
      submit();
    }, 600);
    return () => window.clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase]);

  const m = MODES[mode];
  const projectedPayout = Math.min(m.maxPayout, score * m.perPipe);

  return (
    <div className="grid grid-2" style={{ alignItems: "start" }}>
      <div className="panel" style={{ padding: "var(--sp-6)" }}>
        <div className="panel-title">Tap to Fly</div>

        <div
          style={{
            position: "relative",
            background: "var(--saddle-500)",
            border: "4px solid var(--ink-900)",
            padding: "var(--sp-3)",
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
              width: "100%",
              height: "auto",
              cursor: "pointer",
              display: "block",
            }}
          />

          {/* In-canvas overlays */}
          {phase === "idle" && (
            <Overlay>
              <div style={{ fontFamily: "var(--font-display)", fontSize: 36, marginBottom: 6 }}>
                Take Flight
              </div>
              <div style={{ marginBottom: 14, opacity: 0.85 }}>
                Pick a difficulty. Tap, click, or press <b>Space</b> to flap.
              </div>
              <button className="btn btn-lg" onClick={start}>Start as {m.label}</button>
            </Overlay>
          )}
          {phase === "countdown" && countdown !== null && (
            <Overlay tone="neutral">
              <div
                key={countdown}
                style={{
                  fontFamily: "var(--font-display)",
                  fontSize: 96,
                  color: "var(--gold-300)",
                  textShadow: "4px 4px 0 var(--ink-900)",
                  animation: "popIn 0.6s var(--ease-snap)",
                }}
              >
                {countdown}
              </div>
              <style>{`
                @keyframes popIn {
                  0% { transform: scale(0.4); opacity: 0; }
                  60% { transform: scale(1.15); opacity: 1; }
                  100% { transform: scale(1); }
                }
              `}</style>
            </Overlay>
          )}
          {phase === "dead" && (
            <Overlay tone="danger">
              <div style={{ fontFamily: "var(--font-display)", fontSize: 36 }}>Splat!</div>
              <div style={{ marginBottom: 12, opacity: 0.85 }}>
                {score} pipe{score === 1 ? "" : "s"} · {m.label} · {m.multiplier}× mode
              </div>
              <div style={{ marginBottom: 14, fontFamily: "var(--font-display)", fontSize: 22, color: "var(--gold-300)" }}>
                {projectedPayout >= 1000 ? `+${projectedPayout.toLocaleString()} ¢ banked!` : "Need more pipes for a payout"}
              </div>
              <button className="btn btn-ghost btn-block" onClick={start}>Try Again</button>
            </Overlay>
          )}
        </div>

        {/* On-screen flap button */}
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

      <div className="stack-lg">
        {/* Mode picker */}
        <div className="panel" style={{ padding: "var(--sp-5)" }}>
          <div className="panel-title">Difficulty</div>
          <div className="stack" style={{ gap: 8 }}>
            {(Object.values(MODES)).map((cfg) => {
              const selected = cfg.key === mode;
              const locked = phase === "playing" || phase === "countdown";
              return (
                <button
                  key={cfg.key}
                  type="button"
                  onClick={() => !locked && setMode(cfg.key)}
                  disabled={locked}
                  style={{
                    display: "grid",
                    gridTemplateColumns: "auto 1fr auto",
                    alignItems: "center",
                    gap: 12,
                    padding: "var(--sp-3) var(--sp-4)",
                    background: selected ? cfg.accent : "var(--parchment-100)",
                    color: "var(--ink-900)",
                    border: `3px solid ${selected ? "var(--ink-900)" : "var(--saddle-300)"}`,
                    cursor: locked ? "not-allowed" : "pointer",
                    boxShadow: selected ? "var(--bevel-light), var(--bevel-dark), var(--glow-gold)" : "var(--bevel-light)",
                    fontFamily: "inherit",
                    textAlign: "left",
                    width: "100%",
                    opacity: locked && !selected ? 0.5 : 1,
                  }}
                >
                  <span
                    style={{
                      width: 14, height: 14,
                      background: selected ? "var(--ink-900)" : "transparent",
                      border: "3px solid var(--ink-900)",
                      borderRadius: 999,
                    }}
                  />
                  <span>
                    <div style={{ fontFamily: "var(--font-display)", fontSize: 18, letterSpacing: "var(--ls-loose)", textTransform: "uppercase" }}>
                      {cfg.label}
                    </div>
                    <div style={{ fontSize: 13, color: "var(--saddle-400)" }}>{cfg.tagline}</div>
                  </span>
                  <span
                    style={{
                      fontFamily: "var(--font-display)",
                      fontSize: 22,
                      padding: "2px 10px",
                      background: "var(--ink-900)",
                      color: cfg.accent,
                      border: "2px solid var(--ink-900)",
                      letterSpacing: "var(--ls-loose)",
                    }}
                  >
                    {cfg.multiplier}×
                  </span>
                </button>
              );
            })}
          </div>
          <p className="text-mute" style={{ fontSize: "var(--fs-small)", marginTop: "var(--sp-3)" }}>
            Each pipe pays <b>{m.perPipe.toLocaleString()}¢</b> · cap <b>{m.maxPayout.toLocaleString()}¢</b>
          </p>
        </div>

        {/* Stats */}
        <div className="panel" style={{ padding: "var(--sp-5)" }}>
          <div className="panel-title">{phase === "playing" ? "Stay Aloft" : "Run Stats"}</div>
          <div className="grid grid-3">
            <Stat label="Pipes" value={score} tone="money" />
            <Stat label="Reward" value={projectedPayout} tone="gold" prefix="¢" />
            <Stat label="Best" value={highScore} tone="parchment" />
          </div>

          <div className="stack-lg" style={{ marginTop: "var(--sp-4)" }}>
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
                    ? `+${submission.payout.toLocaleString()} ¢ · ${submission.multiplier}× ${m.label}`
                    : "Need at least 1,000¢ for a payout."}
                </div>
                <button className="btn btn-block" onClick={start}>Fly Again</button>
              </>
            )}
            {error && <p style={{ color: "var(--crimson-500)" }}>{error}</p>}
            {phase === "idle" && (
              <p className="text-mute" style={{ fontSize: "var(--fs-small)" }}>
                Higher difficulty = bigger reward per pipe. Pick your bounty.
              </p>
            )}
          </div>
        </div>

        {/* Weekly leaderboard — top score this week wins 10M ¢. */}
        <div style={{ gridColumn: "1 / -1" }}>
          <WeeklyArcadeLeaderboard game="flappy" />
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
        inset: "var(--sp-3)",
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

function Stat({
  label,
  value,
  tone,
  prefix,
}: {
  label: string;
  value: number;
  tone: "money" | "gold" | "parchment";
  prefix?: string;
}) {
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
          fontSize: "var(--fs-h3)",
          fontFamily: "var(--font-display)",
          color: fg,
          textShadow: tone !== "parchment" ? "2px 2px 0 var(--gold-100)" : undefined,
          lineHeight: 1,
          whiteSpace: "nowrap",
          overflow: "hidden",
          textOverflow: "ellipsis",
        }}
      >
        {prefix ? `${value.toLocaleString()}${prefix}` : value.toLocaleString()}
      </div>
    </div>
  );
}
