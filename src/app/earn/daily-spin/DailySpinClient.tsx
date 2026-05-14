"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type { SpinSlice } from "@/lib/games/dailySpin/engine";
import { formatAmount } from "@/lib/format";
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
const REVEAL_DELAY = 250; // wait after strip stops before stamp + confetti
const CARD_W = 110;       // each strip card width (px)
const STRIP_LENGTH = 41;  // total cards on the strip; winner sits at index 20

export function DailySpinClient() {
  const router = useRouter();
  const [status, setStatus] = useState<Status | null>(null);
  const [busy, setBusy] = useState(false);
  /** Strip offset in px (translateX) — animated from a small starting
   *  offset to a far-left target so the winner card lands centered
   *  under the marker line. Replaces the old `angle` rotation. */
  const [stripOffset, setStripOffset] = useState(0);
  const [result, setResult] = useState<SpinResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [now, setNow] = useState(Date.now());
  const [stampKey, setStampKey] = useState(0);
  const [confettiKey, setConfettiKey] = useState(0);
  /** Frozen filler-card list for the active spin animation. The
   *  winner card sits at index 20; the rest are random samples
   *  from `slices` weighted toward common (low/mid) tones so the
   *  reel reads visually busy without spoiling the result early. */
  const [stripCards, setStripCards] = useState<SpinSlice[] | null>(null);
  /** Width of the viewport (in px) so we can centre the winner
   *  regardless of screen size. Measured on mount + resize. */
  const stripViewportRef = useRef<HTMLDivElement | null>(null);
  const [viewportW, setViewportW] = useState(520);

  useEffect(() => {
    fetch("/api/earn/daily-spin").then((r) => r.json()).then(setStatus);
    const tick = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(tick);
  }, []);

  useEffect(() => {
    const update = () => {
      const w = stripViewportRef.current?.clientWidth ?? 520;
      setViewportW(w);
    };
    update();
    window.addEventListener("resize", update);
    return () => window.removeEventListener("resize", update);
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

    // Build the filler strip — winner pinned at index 20, the rest
    // sampled from the slice list with a bias toward low/mid tones
    // so the reveal lands as a visible payoff vs cosmetic filler.
    const winnerSlice = status.slices[data.sliceIndex];
    const filler: SpinSlice[] = [];
    const weighted: SpinSlice[] = [];
    for (const s of status.slices) {
      const w = s.tone === "low" ? 6 : s.tone === "mid" ? 3 : s.tone === "high" ? 1 : 1;
      for (let i = 0; i < w; i++) weighted.push(s);
    }
    for (let i = 0; i < STRIP_LENGTH; i++) {
      if (i === 20) filler.push(winnerSlice);
      else filler.push(weighted[Math.floor(Math.random() * weighted.length)]);
    }
    setStripCards(filler);

    // Snap to a small starting offset (so the strip fills the
    // viewport and the deceleration has somewhere to fly in from)
    // before kicking off the transition.
    const startOffset = -(2 * CARD_W);
    setStripOffset(startOffset);
    requestAnimationFrame(() => {
      // Land the winner (index 20) centered under the marker line.
      // Center coord = viewportW/2; card center = idx*CARD_W + CARD_W/2.
      // → offset = viewportCenter − (idx*CARD_W + CARD_W/2)
      const jitter = (Math.random() - 0.5) * (CARD_W * 0.55);
      const target = viewportW / 2 - (20 * CARD_W + CARD_W / 2) + jitter;
      setStripOffset(target);
    });

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
      else if (tone === "mid") Sfx.play("chips.stack");
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
            <Strip
              cards={stripCards ?? status.slices.slice(0, STRIP_LENGTH)}
              offset={stripOffset}
              spinning={busy}
              viewportRef={stripViewportRef}
            />
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
                    Last spin: +{formatAmount(result.amount)} ¢
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
                          {formatAmount(s.amount)} ¢
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
// Strip — case-opening style. Horizontal reel of cards scrolling
// past a centred marker. Decelerates over SPIN_MS to land the
// winner card centred under the gold pointer. Replaces the old
// circular SVG wheel — same data, more cinematic reveal.
// ============================================================
function Strip({
  cards,
  offset,
  spinning,
  viewportRef,
}: {
  cards: SpinSlice[];
  offset: number;
  spinning: boolean;
  viewportRef: React.RefObject<HTMLDivElement | null>;
}) {
  return (
    <div style={{ position: "relative", width: "100%", maxWidth: 720 }}>
      {/* Top pointer + bottom pointer pinching the centre marker so
          the eye locks onto the landing slot. */}
      <div
        aria-hidden
        style={{
          position: "absolute",
          left: "50%",
          top: -10,
          transform: "translateX(-50%)",
          width: 0,
          height: 0,
          borderLeft: "14px solid transparent",
          borderRight: "14px solid transparent",
          borderTop: "20px solid var(--gold-300)",
          filter: "drop-shadow(0 0 6px var(--gold-300))",
          zIndex: 10,
        }}
      />
      <div
        aria-hidden
        style={{
          position: "absolute",
          left: "50%",
          bottom: -10,
          transform: "translateX(-50%)",
          width: 0,
          height: 0,
          borderLeft: "14px solid transparent",
          borderRight: "14px solid transparent",
          borderBottom: "20px solid var(--gold-300)",
          filter: "drop-shadow(0 0 6px var(--gold-300))",
          zIndex: 10,
        }}
      />
      {/* Viewport — clips the strip + holds edge fade gradients */}
      <div
        ref={viewportRef}
        style={{
          position: "relative",
          width: "100%",
          height: 160,
          background:
            "radial-gradient(circle at 50% 50%, #4a2818 0%, #1a0f08 80%)",
          border: "4px solid var(--ink-900)",
          borderRadius: 8,
          overflow: "hidden",
          boxShadow: "inset 0 0 28px rgba(0,0,0,0.7), 0 0 32px rgba(245, 200, 66, 0.25)",
        }}
      >
        {/* The reel itself — translates left over SPIN_MS with a
            cubic-bezier deceleration. */}
        <div
          style={{
            display: "flex",
            gap: 0,
            position: "absolute",
            left: 0,
            top: 0,
            height: "100%",
            transform: `translateX(${offset}px)`,
            transition: spinning
              ? `transform ${SPIN_MS}ms cubic-bezier(0.18, 0.85, 0.18, 1)`
              : "transform 220ms ease-out",
          }}
        >
          {cards.map((s, i) => (
            <StripCard key={i} slice={s} />
          ))}
        </div>
        {/* Centre marker — vertical gold line where the winner lands */}
        <div
          aria-hidden
          style={{
            position: "absolute",
            left: "50%",
            top: 0,
            bottom: 0,
            width: 3,
            transform: "translateX(-50%)",
            background: "var(--gold-300)",
            boxShadow: "0 0 10px rgba(245, 200, 66, 0.95), 0 0 22px rgba(245, 200, 66, 0.55)",
            zIndex: 6,
          }}
        />
        {/* Edge fades — soft black gradients on left/right so cards
            "appear from" the darkness as they scroll into view. */}
        <div
          aria-hidden
          style={{
            position: "absolute",
            left: 0,
            top: 0,
            bottom: 0,
            width: 80,
            background: "linear-gradient(90deg, #1a0f08 0%, transparent 100%)",
            zIndex: 5,
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
            width: 80,
            background: "linear-gradient(270deg, #1a0f08 0%, transparent 100%)",
            zIndex: 5,
            pointerEvents: "none",
          }}
        />
      </div>
    </div>
  );
}

function StripCard({ slice }: { slice: SpinSlice }) {
  const c = TONE_COLOR[slice.tone];
  const isJackpot = slice.tone === "jackpot";
  const isHigh = slice.tone === "high";
  return (
    <div
      style={{
        flex: `0 0 ${CARD_W}px`,
        height: "100%",
        background: c.bg,
        color: c.fg,
        borderRight: "3px solid var(--ink-900)",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        gap: 6,
        position: "relative",
        boxShadow: isJackpot
          ? "inset 0 0 24px rgba(255, 200, 60, 0.55), inset 0 -4px 0 rgba(0,0,0,0.35)"
          : "inset 0 -4px 0 rgba(0,0,0,0.35), inset 0 4px 0 rgba(255,255,255,0.2)",
      }}
    >
      {(isJackpot || isHigh) && (
        <span
          aria-hidden
          style={{
            position: "absolute",
            inset: 0,
            background: isJackpot
              ? "radial-gradient(circle at 50% 50%, rgba(255, 232, 168, 0.45), transparent 70%)"
              : "radial-gradient(circle at 50% 50%, rgba(255, 255, 255, 0.18), transparent 70%)",
            pointerEvents: "none",
          }}
        />
      )}
      <span
        style={{
          fontFamily: "var(--font-display)",
          fontSize: isJackpot ? 22 : 18,
          letterSpacing: "0.04em",
          textShadow: "1px 1px 0 rgba(0,0,0,0.45)",
          position: "relative",
          zIndex: 1,
        }}
      >
        {slice.label}
      </span>
      {isJackpot && (
        <span
          style={{
            background: "var(--ink-900)",
            color: "var(--gold-300)",
            fontFamily: "var(--font-display)",
            fontSize: 9,
            letterSpacing: "var(--ls-loose)",
            padding: "1px 6px",
            border: "2px solid var(--gold-300)",
            position: "relative",
            zIndex: 1,
          }}
        >
          JACKPOT
        </span>
      )}
      <span
        style={{
          fontFamily: "var(--font-display)",
          fontSize: 11,
          color: c.fg,
          opacity: 0.85,
          position: "relative",
          zIndex: 1,
        }}
      >
        {formatAmount(slice.amount)} ¢
      </span>
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
        +{formatAmount(amount)} ¢ ({label})
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
