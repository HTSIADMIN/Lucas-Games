"use client";

import { useEffect, useRef, useState } from "react";

// Full-screen takeover for large + jackpot wins.
//
// Sequence (per spec):
//   1. Backdrop slams + brief screen shake.
//   2. WANTED poster drops in from the top.
//   3. WINNER stamp slams diagonally with red ink splat.
//   4. Coin shower from the top — physics (gravity + ground bounce).
//   5. Hold 2.5s, then fade. The parent decides what comes next.

type Coin = { x: number; y: number; vx: number; vy: number; r: number; spin: number; vSpin: number };

export function BigWinOverlay({
  open,
  payout,
  jackpot,
  onClose,
}: {
  open: boolean;
  payout: number;
  jackpot: boolean;
  onClose: () => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rafRef = useRef<number | null>(null);
  const coinsRef = useRef<Coin[]>([]);
  const [, force] = useState(0);

  useEffect(() => {
    if (!open) return;
    const c = canvasRef.current;
    if (!c) return;
    const ctx = c.getContext("2d");
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    const W = window.innerWidth;
    const H = window.innerHeight;
    c.width = W * dpr; c.height = H * dpr;
    c.style.width = `${W}px`; c.style.height = `${H}px`;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    // Spawn the coin shower.
    const N = jackpot ? 60 : 30;
    const coins: Coin[] = [];
    for (let i = 0; i < N; i++) {
      coins.push({
        x: Math.random() * W,
        y: -40 - Math.random() * H * 0.5,
        vx: (Math.random() - 0.5) * 60,
        vy: 80 + Math.random() * 120,
        r: 14 + Math.random() * 8,
        spin: Math.random() * Math.PI * 2,
        vSpin: (Math.random() - 0.5) * 8,
      });
    }
    coinsRef.current = coins;

    const GROUND = H - 30;
    let last = performance.now();

    function frame(now: number) {
      const dt = Math.min(0.06, (now - last) / 1000);
      last = now;
      ctx!.clearRect(0, 0, W, H);

      for (const co of coinsRef.current) {
        co.vy += 540 * dt;            // gravity
        co.x += co.vx * dt;
        co.y += co.vy * dt;
        co.spin += co.vSpin * dt;
        // Ground bounce with damping
        if (co.y > GROUND) {
          co.y = GROUND;
          co.vy *= -0.55;
          co.vx *= 0.75;
          co.vSpin *= 0.6;
        }

        ctx!.save();
        ctx!.translate(co.x, co.y);
        // Squish the disc by abs(cos(spin)) so it reads as spinning.
        const sx = Math.abs(Math.cos(co.spin));
        ctx!.scale(Math.max(0.18, sx), 1);
        // Coin face — radial gradient gold
        const grad = ctx!.createRadialGradient(-co.r * 0.3, -co.r * 0.3, 0, 0, 0, co.r);
        grad.addColorStop(0, "#ffe9a8");
        grad.addColorStop(0.65, "#f5c842");
        grad.addColorStop(1, "#7a5510");
        ctx!.fillStyle = grad;
        ctx!.beginPath();
        ctx!.arc(0, 0, co.r, 0, Math.PI * 2);
        ctx!.fill();
        ctx!.lineWidth = 3;
        ctx!.strokeStyle = "#1a0f08";
        ctx!.stroke();
        ctx!.restore();
      }
      rafRef.current = requestAnimationFrame(frame);
    }
    rafRef.current = requestAnimationFrame(frame);

    // Auto-close after 2.5s.
    const closeT = window.setTimeout(() => onClose(), 2500);
    // Force a render so the DOM bits (stamp + payout text) animate.
    force((n) => n + 1);

    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      window.clearTimeout(closeT);
    };
  }, [open, jackpot, onClose]);

  if (!open) return null;

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 250,
        pointerEvents: "auto",
        background: "rgba(26,15,8,0.78)",
        backdropFilter: "blur(2px)",
        animation: "scratch-bigwin-shake 0.5s ease",
        overflow: "hidden",
      }}
      onClick={onClose}
    >
      {/* WANTED poster slam-in */}
      <div
        style={{
          position: "absolute",
          left: "50%",
          top: "12%",
          transform: "translate(-50%, -50%)",
          fontFamily: "var(--font-display)",
          fontSize: 64,
          letterSpacing: "0.08em",
          color: "#f5c842",
          textShadow: "4px 4px 0 #1a0f08",
          background: "#9b2c2c",
          padding: "var(--sp-3) var(--sp-7)",
          border: "5px solid #1a0f08",
          boxShadow: "0 8px 0 0 #1a0f08",
          animation: "scratch-poster-slam 0.6s cubic-bezier(.4,1.8,.4,1) both",
        }}
      >
        WANTED
      </div>

      {/* WINNER stamp — diagonal ink splat */}
      <div
        style={{
          position: "absolute",
          left: "50%",
          top: "50%",
          transform: "translate(-50%, -50%) rotate(-18deg)",
          animation: "scratch-stamp-slam 0.55s cubic-bezier(.4,1.8,.4,1) 0.4s both",
          padding: "var(--sp-5) var(--sp-9)",
          fontFamily: "var(--font-display)",
          fontSize: jackpot ? 120 : 88,
          color: "#fef6e4",
          textShadow: "5px 5px 0 #1a0f08, 0 0 32px rgba(255,85,68,0.7)",
          background: "transparent",
          letterSpacing: "0.06em",
          opacity: 0,
        }}
      >
        WINNER!
      </div>

      {/* Inkstain blots flanking the stamp */}
      <Inkstain x="45%" y="42%" delayMs={420} />
      <Inkstain x="55%" y="58%" delayMs={520} />

      {/* Payout readout below the stamp */}
      <div
        style={{
          position: "absolute",
          left: 0,
          right: 0,
          bottom: "16%",
          textAlign: "center",
          fontFamily: "var(--font-display)",
          fontSize: 36,
          color: "#f5c842",
          textShadow: "3px 3px 0 #1a0f08",
          letterSpacing: "0.06em",
          animation: "scratch-payout-rise 0.45s ease 0.7s both",
          opacity: 0,
        }}
      >
        +{payout.toLocaleString()} ¢
      </div>

      <canvas ref={canvasRef} style={{ position: "absolute", inset: 0, pointerEvents: "none" }} />
    </div>
  );
}

function Inkstain({ x, y, delayMs }: { x: string; y: string; delayMs: number }) {
  return (
    <div
      aria-hidden
      style={{
        position: "absolute",
        left: x, top: y,
        width: 140, height: 140,
        transform: "translate(-50%, -50%)",
        background: "radial-gradient(circle, rgba(155,44,44,0.85) 0%, rgba(155,44,44,0) 70%)",
        animation: `scratch-inkblot 0.6s ease ${delayMs}ms both`,
        opacity: 0,
        pointerEvents: "none",
      }}
    />
  );
}
