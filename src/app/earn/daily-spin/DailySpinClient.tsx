"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import type { SpinSlice } from "@/lib/games/dailySpin/engine";
import * as Sfx from "@/lib/sfx";

type Status = {
  ready: boolean;
  availableAt: string | null;
  slices: SpinSlice[];
};

type SpinResult = {
  sliceIndex: number;
  amount: number;
  label: string;
  availableAt: string;
  balance: number;
};

const TONE_COLOR: Record<SpinSlice["tone"], { bg: string; fg: string }> = {
  low:     { bg: "#a87545", fg: "#fef6e4" },
  mid:     { bg: "#6ba84f", fg: "#fef6e4" },
  high:    { bg: "#c93a2c", fg: "#fef6e4" },
  jackpot: { bg: "#f5c842", fg: "#1a0f08" },
};

const SPIN_MS = 5500;
const REVEAL_DELAY = 250; // wait after wheel stops before stamp + confetti

export function DailySpinClient() {
  const router = useRouter();
  const [status, setStatus] = useState<Status | null>(null);
  const [busy, setBusy] = useState(false);
  const [angle, setAngle] = useState(0);
  const [result, setResult] = useState<SpinResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [now, setNow] = useState(Date.now());
  const [stampKey, setStampKey] = useState(0);
  const [confettiKey, setConfettiKey] = useState(0);

  useEffect(() => {
    fetch("/api/earn/daily-spin").then((r) => r.json()).then(setStatus);
    const tick = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(tick);
  }, []);

  async function spin() {
    if (!status?.ready || busy) return;
    setBusy(true);
    setError(null);
    setResult(null);
    Sfx.play("roulette.ball");

    const res = await fetch("/api/earn/daily-spin", { method: "POST" });
    const data = await res.json();
    if (!res.ok) {
      setBusy(false);
      setError(data.error ?? "error");
      return;
    }

    // Wheel rotates clockwise; we want sliceIndex centered under the top
    // pointer. Add 6 full rotations and a small jitter so the stop never
    // looks dead-center on the slice.
    const slices = status.slices.length;
    const sliceAngle = 360 / slices;
    const target = -((data.sliceIndex * sliceAngle) + sliceAngle / 2);
    const jitter = (Math.random() - 0.5) * (sliceAngle * 0.55);
    const finalAngle = 360 * 6 + target + jitter;
    setAngle(finalAngle);

    setTimeout(() => {
      setResult(data);
      setStatus((s) => (s ? { ...s, ready: false, availableAt: data.availableAt } : s));
      setStampKey((k) => k + 1);
      setConfettiKey((k) => k + 1);
      setBusy(false);
      router.refresh();
      const tone = data.tone as string | undefined;
      if (tone === "jackpot") Sfx.play("win.big");
      else if (tone === "high") Sfx.play("win.levelup");
      else if (tone === "mid") Sfx.play("win.notify");
      else Sfx.play("coins.clink");
    }, SPIN_MS + REVEAL_DELAY);
  }

  if (!status) return <p className="text-mute">Loading wheel...</p>;

  const ready = status.ready;
  const cooldownLeftMs = status.availableAt ? Math.max(0, new Date(status.availableAt).getTime() - now) : 0;
  const hh = Math.floor(cooldownLeftMs / 3600000);
  const mm = Math.floor((cooldownLeftMs % 3600000) / 60000);
  const ss = Math.floor((cooldownLeftMs % 60000) / 1000);

  const wonSlice = result ? status.slices[result.sliceIndex] : null;

  return (
    <>
      <style>{SPIN_KEYFRAMES}</style>
      <div className="stack-lg" style={{ gap: "var(--sp-4)" }}>
        {/* === Wheel === */}
        <div
          className="panel"
          style={{
            padding: "var(--sp-5)",
            background: "radial-gradient(circle at 50% 40%, #4a2818, #1a0f08)",
            border: "4px solid var(--ink-900)",
            color: "var(--parchment-50)",
            position: "relative",
            overflow: "hidden",
          }}
        >
          {/* Marquee bulbs around the panel */}
          <Bulbs running={busy} />

          <div className="center" style={{ flexDirection: "column", gap: "var(--sp-4)", padding: "var(--sp-3) 0" }}>
            <Wheel slices={status.slices} angle={angle} spinning={busy} />
          </div>

          {/* Result stamp & confetti */}
          {result && wonSlice && !busy && (
            <ResultStamp
              key={stampKey}
              tone={wonSlice.tone}
              label={wonSlice.label}
              amount={result.amount}
            />
          )}
          {result && wonSlice && !busy && wonSlice.tone !== "low" && (
            <Confetti key={confettiKey} jackpot={wonSlice.tone === "jackpot"} />
          )}
        </div>

        {/* === Status + payouts === */}
        <div className="grid grid-2" style={{ gap: "var(--sp-4)" }}>
          <div className="panel" style={{ padding: "var(--sp-5)" }}>
            <div className="panel-title">{ready ? "Ready to Spin" : "On Cooldown"}</div>
            {ready ? (
              <div className="stack-lg">
                <p className="text-mute">Free Coins every day. Pull the lever.</p>
                <button
                  className={`btn btn-lg btn-block${busy ? "" : " action-ready"}`}
                  onClick={spin}
                  disabled={busy}
                  style={{
                    fontSize: "var(--fs-h2)",
                    background: busy ? undefined : "var(--gold-300)",
                  }}
                >
                  {busy ? "Spinning..." : "SPIN!"}
                </button>
                {error && <p style={{ color: "var(--crimson-500)" }}>{error}</p>}
              </div>
            ) : (
              <div className="stack-lg">
                <p className="text-mute">
                  Next spin in{" "}
                  <b style={{ fontFamily: "var(--font-display)", fontSize: "var(--fs-h3)", color: "var(--gold-500)" }}>
                    {String(hh).padStart(2, "0")}:{String(mm).padStart(2, "0")}:{String(ss).padStart(2, "0")}
                  </b>
                </p>
                <button className="btn btn-lg btn-block" disabled>Locked</button>
                {result && (
                  <p style={{ fontFamily: "var(--font-display)", fontSize: "var(--fs-h4)", color: "var(--gold-500)" }}>
                    Last spin: +{result.amount.toLocaleString()} ¢
                  </p>
                )}
              </div>
            )}
          </div>

          <div className="panel" style={{ padding: "var(--sp-5)" }}>
            <div className="panel-title">Payouts</div>
            <table style={{ width: "100%", fontFamily: "var(--font-display)", fontSize: 14 }}>
              <tbody>
                {status.slices
                  .slice()
                  .sort((a, b) => b.amount - a.amount)
                  .map((s) => {
                    const c = TONE_COLOR[s.tone];
                    return (
                      <tr key={s.amount} style={{ borderBottom: "2px dashed var(--saddle-300)" }}>
                        <td style={{ padding: "var(--sp-2) 0" }}>
                          <span
                            style={{
                              display: "inline-block",
                              width: 16,
                              height: 16,
                              background: c.bg,
                              border: "2px solid var(--ink-900)",
                              marginRight: 8,
                              verticalAlign: "middle",
                            }}
                          />
                          {s.label}{" "}
                          {s.tone === "jackpot" && (
                            <span
                              style={{
                                marginLeft: 6,
                                fontSize: 10,
                                background: "var(--gold-300)",
                                color: "var(--ink-900)",
                                padding: "1px 6px",
                                border: "2px solid var(--ink-900)",
                                letterSpacing: "var(--ls-loose)",
                              }}
                            >
                              JACKPOT
                            </span>
                          )}
                        </td>
                        <td style={{ padding: "var(--sp-2) 0", textAlign: "right" }} className="text-money">
                          {s.amount.toLocaleString()} ¢
                        </td>
                      </tr>
                    );
                  })}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </>
  );
}

// ============================================================
// Wheel (SVG conic, hub, pointer)
// ============================================================
function Wheel({ slices, angle, spinning }: { slices: SpinSlice[]; angle: number; spinning: boolean }) {
  const r = 200;
  const cx = r;
  const cy = r;
  const sliceAngle = 360 / slices.length;

  const paths = useMemo(() => {
    return slices.map((s, i) => {
      const a0 = i * sliceAngle - 90; // top is -90deg in SVG
      const a1 = a0 + sliceAngle;
      const x0 = cx + r * Math.cos((a0 * Math.PI) / 180);
      const y0 = cy + r * Math.sin((a0 * Math.PI) / 180);
      const x1 = cx + r * Math.cos((a1 * Math.PI) / 180);
      const y1 = cy + r * Math.sin((a1 * Math.PI) / 180);
      return {
        slice: s,
        d: `M ${cx} ${cy} L ${x0} ${y0} A ${r} ${r} 0 0 1 ${x1} ${y1} Z`,
        midDeg: i * sliceAngle + sliceAngle / 2,
      };
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [slices.length]);

  return (
    <div style={{ position: "relative", width: 400, maxWidth: "94%" }}>
      {/* Pointer at top */}
      <div
        aria-hidden
        style={{
          position: "absolute",
          left: "50%",
          top: -22,
          transform: "translateX(-50%)",
          width: 0,
          height: 0,
          borderLeft: "22px solid transparent",
          borderRight: "22px solid transparent",
          borderTop: "32px solid var(--gold-300)",
          filter: "drop-shadow(0 0 6px var(--gold-300))",
          zIndex: 10,
        }}
      />
      {/* Outer rim */}
      <div
        style={{
          position: "relative",
          width: "100%",
          aspectRatio: "1 / 1",
          background:
            "radial-gradient(circle at 50% 30%, #ffe9a8, #c8941d 70%, #7a5510 100%)",
          borderRadius: 999,
          padding: 14,
          boxShadow: "0 0 0 6px var(--ink-900), 0 16px 0 rgba(0, 0, 0, 0.6), 0 0 32px rgba(245, 200, 66, 0.45)",
        }}
      >
        {/* Rotating wheel */}
        <div
          style={{
            position: "relative",
            width: "100%",
            height: "100%",
            transform: `rotate(${angle}deg)`,
            transition: spinning ? `transform ${SPIN_MS}ms cubic-bezier(0.18, 0.85, 0.18, 1)` : "none",
            borderRadius: 999,
            overflow: "hidden",
            border: "4px solid var(--ink-900)",
            boxShadow: "inset 0 0 24px rgba(0, 0, 0, 0.5)",
          }}
        >
          <svg viewBox={`0 0 ${r * 2} ${r * 2}`} style={{ width: "100%", height: "100%", display: "block" }}>
            {paths.map((p, i) => {
              const c = TONE_COLOR[p.slice.tone];
              return (
                <g key={i}>
                  <path d={p.d} fill={c.bg} stroke="#1a0f08" strokeWidth={3} />
                </g>
              );
            })}
            {/* Slice labels */}
            {paths.map((p, i) => {
              const c = TONE_COLOR[p.slice.tone];
              const labelR = r * 0.65;
              const a = (p.midDeg - 90) * (Math.PI / 180);
              const x = cx + labelR * Math.cos(a);
              const y = cy + labelR * Math.sin(a);
              return (
                <g key={`l-${i}`} transform={`rotate(${p.midDeg} ${x} ${y})`}>
                  <text
                    x={x}
                    y={y}
                    textAnchor="middle"
                    dominantBaseline="middle"
                    fontFamily="M6X11, monospace"
                    fontSize={28}
                    fill={c.fg}
                    stroke="#1a0f08"
                    strokeWidth={1}
                    paintOrder="stroke"
                  >
                    {p.slice.label}
                  </text>
                </g>
              );
            })}
          </svg>
        </div>
        {/* Center hub */}
        <div
          aria-hidden
          style={{
            position: "absolute",
            left: "50%",
            top: "50%",
            transform: "translate(-50%, -50%)",
            width: 80,
            height: 80,
            borderRadius: 999,
            background:
              "radial-gradient(circle at 35% 30%, #ffd84d, #c8941d 60%, #7a5510 100%)",
            border: "4px solid var(--ink-900)",
            boxShadow: "inset 0 -3px 0 rgba(0,0,0,0.4), inset 0 3px 0 rgba(255,255,255,0.4), 0 0 12px rgba(245, 200, 66, 0.6)",
            zIndex: 5,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontFamily: "var(--font-display)",
            color: "var(--ink-900)",
            fontSize: 18,
            textShadow: "1px 1px 0 var(--gold-100)",
          }}
        >
          $
        </div>
      </div>
    </div>
  );
}

// ============================================================
// Marquee bulbs around the panel — chase animation while spinning
// ============================================================
function Bulbs({ running }: { running: boolean }) {
  const N = 24;
  return (
    <div aria-hidden style={{ position: "absolute", inset: 0, pointerEvents: "none", zIndex: 1 }}>
      {Array.from({ length: N }).map((_, i) => {
        const t = i / N;
        // Distribute around the panel border (top, right, bottom, left)
        let left = 0, top = 0;
        if (t < 0.25) { left = t * 4 * 100; top = 0; }
        else if (t < 0.5) { left = 100; top = (t - 0.25) * 4 * 100; }
        else if (t < 0.75) { left = (1 - (t - 0.5) * 4) * 100; top = 100; }
        else { left = 0; top = (1 - (t - 0.75) * 4) * 100; }
        return (
          <span
            key={i}
            style={{
              position: "absolute",
              left: `${left}%`,
              top: `${top}%`,
              width: 12,
              height: 12,
              borderRadius: 999,
              background: i % 3 === 0 ? "#ff5544" : i % 3 === 1 ? "#ffd84d" : "#fef6e4",
              border: "2px solid var(--ink-900)",
              transform: "translate(-50%, -50%)",
              boxShadow: "0 0 6px currentColor",
              animation: running ? `ds-bulb 0.8s linear infinite` : undefined,
              animationDelay: `${(i / N) * -0.8}s`,
              opacity: running ? 1 : 0.45,
              transition: "opacity 250ms",
            }}
          />
        );
      })}
    </div>
  );
}

// ============================================================
// Result stamp (slams in after the wheel settles)
// ============================================================
function ResultStamp({
  tone,
  label,
  amount,
}: {
  tone: SpinSlice["tone"];
  label: string;
  amount: number;
}) {
  const big = tone === "high" || tone === "jackpot";
  const cfg = TONE_COLOR[tone];
  const heading = tone === "jackpot" ? "JACKPOT!" : tone === "high" ? "BIG WIN!" : "WINNER";
  return (
    <div
      style={{
        position: "absolute",
        top: "50%",
        left: "50%",
        transform: "translate(-50%, -50%) rotate(-12deg)",
        background: cfg.bg,
        color: cfg.fg,
        border: "5px solid var(--ink-900)",
        padding: "var(--sp-5) var(--sp-7)",
        fontFamily: "var(--font-display)",
        fontSize: tone === "jackpot" ? 64 : big ? 48 : 36,
        letterSpacing: "var(--ls-loose)",
        textTransform: "uppercase",
        boxShadow: tone === "jackpot"
          ? "var(--glow-gold), 12px 12px 0 var(--ink-900), 0 0 60px rgba(255, 216, 77, 0.7)"
          : big
          ? "var(--glow-gold), 8px 8px 0 var(--ink-900)"
          : "8px 8px 0 var(--ink-900)",
        textShadow: tone === "jackpot" ? "3px 3px 0 var(--gold-100)" : "3px 3px 0 var(--ink-900)",
        animation: tone === "jackpot"
          ? "ds-stamp-jp 0.8s var(--ease-snap) backwards, ds-bounce 1.2s ease-in-out 0.8s infinite alternate"
          : "ds-stamp 0.7s var(--ease-snap) backwards",
        zIndex: 10,
        pointerEvents: "none",
        textAlign: "center",
      }}
    >
      {heading}
      <div
        style={{
          fontSize: tone === "jackpot" ? 28 : 20,
          marginTop: 6,
          letterSpacing: "var(--ls-tight)",
        }}
      >
        +{amount.toLocaleString()} ¢ ({label})
      </div>
    </div>
  );
}

// ============================================================
// Confetti shower — bigger + jackpot variant
// ============================================================
function Confetti({ jackpot }: { jackpot: boolean }) {
  const count = jackpot ? 80 : 40;
  const pieces = Array.from({ length: count }, (_, i) => ({
    id: i,
    left: Math.random() * 100,
    delay: 0.2 + Math.random() * 0.7,
    duration: 1.6 + Math.random() * 1.4,
    rotate: Math.random() * 360,
    size: 12 + Math.random() * (jackpot ? 18 : 12),
    color:
      jackpot && i % 5 === 0
        ? "#ff5544"
        : i % 3 === 0
        ? "#f5c842"
        : i % 3 === 1
        ? "#ffd84d"
        : "#c8941d",
    shape: i % 4 === 0 ? "rect" : "circle",
  }));
  return (
    <div
      aria-hidden
      style={{
        position: "absolute",
        inset: 0,
        pointerEvents: "none",
        overflow: "hidden",
        zIndex: 9,
      }}
    >
      {jackpot && (
        // Bright radial flash on the table on jackpot land
        <div
          style={{
            position: "absolute",
            inset: 0,
            background: "radial-gradient(circle at 50% 50%, rgba(255, 232, 168, 0.55), transparent 60%)",
            animation: "ds-flash 0.7s ease-out backwards",
          }}
        />
      )}
      {pieces.map((p) => (
        <span
          key={p.id}
          style={{
            position: "absolute",
            left: `${p.left}%`,
            top: -20,
            width: p.size,
            height: p.size,
            background: p.color,
            border: "2px solid var(--ink-900)",
            borderRadius: p.shape === "circle" ? 999 : 0,
            animation: `ds-coin-fall ${p.duration}s linear ${p.delay}s 1 forwards`,
            transform: `rotate(${p.rotate}deg)`,
          }}
        />
      ))}
    </div>
  );
}

// ============================================================
// Keyframes
// ============================================================
const SPIN_KEYFRAMES = `
@keyframes ds-bulb {
  0%, 100% { transform: translate(-50%, -50%) scale(1); filter: brightness(0.5); }
  50%      { transform: translate(-50%, -50%) scale(1.4); filter: brightness(1.6); }
}
@keyframes ds-stamp {
  0%   { transform: translate(-50%, -50%) rotate(-30deg) scale(3); opacity: 0; }
  55%  { transform: translate(-50%, -50%) rotate(-8deg)  scale(0.88); opacity: 1; }
  80%  { transform: translate(-50%, -50%) rotate(-16deg) scale(1.1); }
  100% { transform: translate(-50%, -50%) rotate(-12deg) scale(1); opacity: 1; }
}
@keyframes ds-stamp-jp {
  0%   { transform: translate(-50%, -50%) rotate(-45deg) scale(4);   opacity: 0; }
  35%  { transform: translate(-50%, -50%) rotate(-15deg) scale(0.7); opacity: 1; }
  60%  { transform: translate(-50%, -50%) rotate(-8deg)  scale(1.25); }
  85%  { transform: translate(-50%, -50%) rotate(-14deg) scale(0.95); }
  100% { transform: translate(-50%, -50%) rotate(-12deg) scale(1);   opacity: 1; }
}
@keyframes ds-bounce {
  0%   { transform: translate(-50%, -50%) rotate(-12deg) scale(1); }
  100% { transform: translate(-50%, -50%) rotate(-9deg)  scale(1.06); }
}
@keyframes ds-coin-fall {
  0%   { transform: translateY(-20px) rotate(0deg); opacity: 1; }
  100% { transform: translateY(700px) rotate(720deg); opacity: 0; }
}
@keyframes ds-flash {
  0%   { opacity: 1; }
  100% { opacity: 0; }
}
`;
