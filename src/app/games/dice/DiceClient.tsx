"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { BetInput } from "@/components/BetInput";
import { chanceOfWin, multiplierFor, type DiceDirection } from "@/lib/games/dice/engine";

type Result = {
  roll: number;
  win: boolean;
  multiplier: number;
  payout: number;
  balance: number;
};

const ROLL_MS = 1500;            // Length of the tumble animation
const NUMBER_TICK_MS = 55;       // Cycling-number tick rate

export function DiceClient() {
  const router = useRouter();
  const [bet, setBet] = useState(1_000);
  const [target, setTarget] = useState(50);
  const [direction, setDirection] = useState<DiceDirection>("under");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<Result | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [balance, setBalance] = useState<number | null>(null);

  // Animation state
  const [rolling, setRolling] = useState(false);
  const [displayed, setDisplayed] = useState<number>(1);
  const [stampKey, setStampKey] = useState(0);
  const [confettiKey, setConfettiKey] = useState(0);
  const [shakeKey, setShakeKey] = useState(0);
  const [markerKey, setMarkerKey] = useState(0);

  useEffect(() => {
    fetch("/api/auth/me").then((r) => r.json()).then((d) => setBalance(d.balance ?? null));
  }, []);

  // Cycling number ticker while rolling.
  useEffect(() => {
    if (!rolling) return;
    const t = setInterval(() => {
      setDisplayed(1 + Math.floor(Math.random() * 100));
    }, NUMBER_TICK_MS);
    return () => clearInterval(t);
  }, [rolling]);

  const chance = useMemo(() => Math.round(chanceOfWin(target, direction) * 10000) / 100, [target, direction]);
  const mult = useMemo(() => multiplierFor(target, direction), [target, direction]);
  const winAmount = Math.floor(bet * mult);

  async function go() {
    setBusy(true);
    setError(null);
    setResult(null);
    setRolling(true);
    setDisplayed(1 + Math.floor(Math.random() * 100));
    const startedAt = Date.now();

    const res = await fetch("/api/games/dice/roll", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ bet, target, direction }),
    });
    const data = await res.json();
    if (!res.ok) {
      setBusy(false);
      setRolling(false);
      setError(data.error ?? "error");
      return;
    }

    // Always show the full tumble animation, even on fast networks.
    const elapsed = Date.now() - startedAt;
    const wait = Math.max(0, ROLL_MS - elapsed);
    setTimeout(() => {
      setRolling(false);
      setDisplayed(data.roll);
      setResult(data);
      setBalance(data.balance);
      setMarkerKey((k) => k + 1);
      setStampKey((k) => k + 1);
      if (data.win) setConfettiKey((k) => k + 1);
      else setShakeKey((k) => k + 1);
      setBusy(false);
      router.refresh();
    }, wait);
  }

  const canRoll = !busy && !rolling && bet >= 100 && (balance == null || balance >= bet);

  return (
    <>
      <style>{DICE_KEYFRAMES}</style>
      <div className="stack-lg" style={{ gap: "var(--sp-4)" }}>
        {/* === Felt centerpiece === */}
        <div
          className="panel"
          key={`felt-${shakeKey}`}
          style={{
            padding: "var(--sp-5)",
            background: "radial-gradient(circle at 50% 40%, #2d5b22, #1f3818)",
            color: "var(--parchment-50)",
            position: "relative",
            overflow: "hidden",
            animation: shakeKey > 0 ? "dice-shake 0.5s var(--ease-snap)" : undefined,
          }}
        >
          <div
            className="row"
            style={{ justifyContent: "center", gap: "var(--sp-6)", flexWrap: "wrap" }}
          >
            <DiceCube rolling={rolling} />
            <div style={{ textAlign: "center", minWidth: 220 }}>
              <div
                style={{
                  fontFamily: "var(--font-display)",
                  fontSize: 12,
                  letterSpacing: "var(--ls-loose)",
                  textTransform: "uppercase",
                  color: "var(--gold-300)",
                  marginBottom: 4,
                }}
              >
                {direction === "under" ? `Roll under ${target}` : `Roll over ${target}`}
              </div>
              <div
                style={{
                  fontFamily: "var(--font-display)",
                  fontSize: 96,
                  lineHeight: 1,
                  color: result
                    ? result.win
                      ? "var(--cactus-100)"
                      : "var(--crimson-100)"
                    : "var(--gold-300)",
                  textShadow:
                    result && result.win
                      ? "4px 4px 0 var(--ink-900), 0 0 24px rgba(184, 217, 154, 0.6)"
                      : "4px 4px 0 var(--ink-900)",
                  transform: rolling ? "scale(0.95)" : "scale(1)",
                  transition: "transform 200ms",
                }}
              >
                {result || rolling ? displayed : "?"}
              </div>
            </div>
          </div>

          {/* Win zone gauge */}
          <div style={{ marginTop: "var(--sp-5)" }}>
            <WinZoneBar
              target={target}
              direction={direction}
              roll={result?.roll ?? null}
              markerKey={markerKey}
            />
          </div>

          {/* Result stamp */}
          {result && !rolling && (
            <ResultStamp key={stampKey} win={result.win} payout={result.payout} bet={bet} multiplier={result.multiplier} />
          )}
          {result && result.win && !rolling && <Confetti key={confettiKey} />}
        </div>

        {/* === Stats row === */}
        <div className="grid grid-3" style={{ gap: "var(--sp-3)" }}>
          <StatBox label="Chance" value={`${chance}%`} tone="parchment" />
          <StatBox label="Multiplier" value={`×${mult}`} tone="parchment" />
          <StatBox label="Pays" value={winAmount.toLocaleString()} tone="gold" />
        </div>

        {/* === Controls === */}
        <div className="panel" style={{ padding: "var(--sp-5)" }}>
          <div className="panel-title">Pick Your Odds</div>

          <div className="stack-lg">
            <div>
              <label className="label">Direction</label>
              <div className="row" style={{ gap: "var(--sp-3)" }}>
                <button
                  type="button"
                  className={`btn btn-block ${direction === "under" ? "" : "btn-ghost"}`}
                  onClick={() => setDirection("under")}
                  disabled={busy || rolling}
                >
                  Under
                </button>
                <button
                  type="button"
                  className={`btn btn-block ${direction === "over" ? "" : "btn-ghost"}`}
                  onClick={() => setDirection("over")}
                  disabled={busy || rolling}
                >
                  Over
                </button>
              </div>
            </div>

            <div>
              <label className="label">Target — {target}</label>
              <input
                type="range"
                min={2}
                max={99}
                value={target}
                onChange={(e) => setTarget(Number(e.target.value))}
                disabled={busy || rolling}
                style={{ width: "100%" }}
              />
            </div>

            <BetInput value={bet} onChange={setBet} max={Math.max(100, balance ?? 100)} disabled={busy || rolling} />

            <button
              className="btn btn-lg btn-block"
              onClick={go}
              disabled={!canRoll}
              style={{ fontSize: "var(--fs-h2)" }}
            >
              {rolling ? "Rolling..." : "Roll"}
            </button>

            {error && <p style={{ color: "var(--crimson-500)" }}>{labelFor(error)}</p>}
          </div>
        </div>
      </div>
    </>
  );
}

// ============================================================
// 3D tumbling dice cube
// ============================================================
function DiceCube({ rolling }: { rolling: boolean }) {
  return (
    <div
      style={{
        width: 140,
        height: 140,
        perspective: 720,
        perspectiveOrigin: "50% 50%",
        flexShrink: 0,
      }}
    >
      <div
        style={{
          position: "relative",
          width: "100%",
          height: "100%",
          transformStyle: "preserve-3d",
          animation: rolling ? "dice-tumble 1.5s cubic-bezier(0.4, 0.0, 0.3, 1)" : undefined,
          transform: rolling ? undefined : "rotateX(-22deg) rotateY(38deg)",
          transition: rolling ? undefined : "transform 0.5s var(--ease-snap)",
        }}
      >
        {[1, 2, 3, 4, 5, 6].map((n) => (
          <DiceFace key={n} n={n} />
        ))}
      </div>
    </div>
  );
}

function DiceFace({ n }: { n: number }) {
  const transforms: Record<number, string> = {
    1: "rotateY(0deg)   translateZ(70px)",
    2: "rotateY(180deg) translateZ(70px)",
    3: "rotateY(90deg)  translateZ(70px)",
    4: "rotateY(-90deg) translateZ(70px)",
    5: "rotateX(90deg)  translateZ(70px)",
    6: "rotateX(-90deg) translateZ(70px)",
  };
  return (
    <div
      style={{
        position: "absolute",
        inset: 0,
        width: 140,
        height: 140,
        background: "linear-gradient(135deg, var(--parchment-50), var(--parchment-200))",
        border: "5px solid var(--ink-900)",
        transform: transforms[n],
        backfaceVisibility: "hidden",
        boxShadow: "inset 0 -8px 0 rgba(26, 15, 8, 0.18), inset 0 8px 0 rgba(255, 255, 255, 0.2)",
      }}
    >
      <DicePips n={n} />
    </div>
  );
}

function DicePips({ n }: { n: number }) {
  // Pip positions on a 3×3 grid (true = pip).
  const grids: Record<number, boolean[]> = {
    1: [false, false, false, false, true, false, false, false, false],
    2: [true, false, false, false, false, false, false, false, true],
    3: [true, false, false, false, true, false, false, false, true],
    4: [true, false, true, false, false, false, true, false, true],
    5: [true, false, true, false, true, false, true, false, true],
    6: [true, false, true, true, false, true, true, false, true],
  };
  const cells = grids[n];
  return (
    <div
      style={{
        position: "absolute",
        inset: 18,
        display: "grid",
        gridTemplateColumns: "1fr 1fr 1fr",
        gridTemplateRows: "1fr 1fr 1fr",
        gap: 6,
      }}
    >
      {cells.map((on, i) => (
        <span
          key={i}
          style={{
            background: on ? "var(--ink-900)" : "transparent",
            borderRadius: 999,
            boxShadow: on ? "inset 1px 2px 0 rgba(255,255,255,0.25), inset -1px -2px 0 rgba(0,0,0,0.6)" : undefined,
          }}
        />
      ))}
    </div>
  );
}

// ============================================================
// Win-zone gauge
// ============================================================
function WinZoneBar({
  target,
  direction,
  roll,
  markerKey,
}: {
  target: number;
  direction: DiceDirection;
  roll: number | null;
  markerKey: number;
}) {
  const winLeft = direction === "under" ? 0 : target;
  const winWidth = direction === "under" ? target : 100 - target;
  return (
    <div style={{ position: "relative", padding: "10px 0 24px" }}>
      <div
        style={{
          position: "relative",
          height: 18,
          background: "var(--crimson-500)",
          border: "3px solid var(--ink-900)",
          boxShadow: "inset 0 -3px 0 rgba(0,0,0,0.3), inset 0 3px 0 rgba(255,255,255,0.15)",
        }}
      >
        <div
          style={{
            position: "absolute",
            top: 0,
            bottom: 0,
            left: `${winLeft}%`,
            width: `${winWidth}%`,
            background: "var(--cactus-500)",
            transition: "left 200ms, width 200ms",
            boxShadow: "inset 0 -3px 0 rgba(0,0,0,0.3), inset 0 3px 0 rgba(255,255,255,0.2)",
          }}
        />
        {/* Target tick */}
        <div
          style={{
            position: "absolute",
            top: -6,
            bottom: -6,
            left: `${target}%`,
            width: 4,
            transform: "translateX(-50%)",
            background: "var(--gold-300)",
            border: "1px solid var(--ink-900)",
            transition: "left 200ms",
            zIndex: 2,
          }}
        />
        {/* Result marker */}
        {roll != null && (
          <div
            key={`marker-${markerKey}`}
            style={{
              position: "absolute",
              top: -10,
              left: `${roll}%`,
              transform: "translateX(-50%)",
              width: 0,
              height: 0,
              borderLeft: "10px solid transparent",
              borderRight: "10px solid transparent",
              borderTop: "12px solid var(--parchment-50)",
              filter: "drop-shadow(0 0 4px var(--gold-300))",
              animation: "dice-marker-pop 0.5s var(--ease-snap)",
              zIndex: 3,
            }}
          />
        )}
      </div>
      {/* Range labels */}
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          marginTop: 4,
          fontFamily: "var(--font-display)",
          fontSize: 11,
          color: "var(--parchment-200)",
          letterSpacing: "var(--ls-loose)",
        }}
      >
        <span>1</span>
        <span>25</span>
        <span>50</span>
        <span>75</span>
        <span>100</span>
      </div>
    </div>
  );
}

// ============================================================
// Result stamp (slams in after settle)
// ============================================================
function ResultStamp({
  win,
  payout,
  bet,
  multiplier,
}: {
  win: boolean;
  payout: number;
  bet: number;
  multiplier: number;
}) {
  return (
    <div
      style={{
        position: "absolute",
        top: "50%",
        left: "50%",
        transform: "translate(-50%, -50%) rotate(-12deg)",
        background: win ? "var(--cactus-500)" : "var(--crimson-500)",
        color: "var(--parchment-50)",
        border: "5px solid var(--ink-900)",
        padding: "var(--sp-4) var(--sp-6)",
        fontFamily: "var(--font-display)",
        fontSize: win ? 44 : 36,
        letterSpacing: "var(--ls-loose)",
        textTransform: "uppercase",
        boxShadow: win ? "var(--glow-gold), 8px 8px 0 var(--ink-900)" : "8px 8px 0 var(--ink-900)",
        textShadow: "3px 3px 0 var(--ink-900)",
        animation: "dice-stamp 0.7s var(--ease-snap) backwards",
        animationDelay: "0.05s",
        zIndex: 10,
        pointerEvents: "none",
        textAlign: "center",
      }}
    >
      {win ? "WINNER" : "BUST"}
      <div style={{ fontSize: 16, marginTop: 4, letterSpacing: "var(--ls-tight)" }}>
        {win
          ? `×${multiplier} · +${(payout - bet).toLocaleString()} ¢`
          : `Lost ${bet.toLocaleString()} ¢`}
      </div>
    </div>
  );
}

// ============================================================
// Confetti shower (reuses the blackjack/poker pattern)
// ============================================================
function Confetti() {
  const pieces = Array.from({ length: 30 }, (_, i) => ({
    id: i,
    left: Math.random() * 100,
    delay: 0.3 + Math.random() * 0.5,
    duration: 1.4 + Math.random() * 0.9,
    rotate: Math.random() * 360,
    size: 12 + Math.random() * 12,
    color: i % 3 === 0 ? "#f5c842" : i % 3 === 1 ? "#ffd84d" : "#c8941d",
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
            borderRadius: 999,
            animation: `dice-coin-fall ${p.duration}s linear ${p.delay}s 1 forwards`,
            transform: `rotate(${p.rotate}deg)`,
          }}
        />
      ))}
    </div>
  );
}

// ============================================================
// Stat box
// ============================================================
function StatBox({ label, value, tone }: { label: string; value: string; tone: "parchment" | "gold" }) {
  const bg = tone === "gold" ? "var(--gold-100)" : "var(--parchment-200)";
  const fg = tone === "gold" ? "var(--gold-700)" : "var(--ink-900)";
  return (
    <div className="panel" style={{ background: bg, padding: "var(--sp-3)" }}>
      <div className="label">{label}</div>
      <div
        style={{
          fontFamily: "var(--font-display)",
          fontSize: "var(--fs-h3)",
          color: fg,
          textShadow: tone === "gold" ? "2px 2px 0 var(--gold-100)" : undefined,
          lineHeight: 1,
        }}
      >
        {value}
      </div>
    </div>
  );
}

// ============================================================
// Keyframes
// ============================================================
const DICE_KEYFRAMES = `
@keyframes dice-tumble {
  0%   { transform: rotateX(0)       rotateY(0)       rotateZ(0)       scale(1); }
  18%  { transform: rotateX(360deg)  rotateY(220deg)  rotateZ(45deg)   scale(1.08); }
  40%  { transform: rotateX(720deg)  rotateY(540deg)  rotateZ(180deg)  scale(1.12); }
  62%  { transform: rotateX(1080deg) rotateY(900deg)  rotateZ(135deg)  scale(1.08); }
  82%  { transform: rotateX(1320deg) rotateY(1080deg) rotateZ(45deg)   scale(1.02); }
  100% { transform: rotateX(-22deg)  rotateY(38deg)   rotateZ(0)       scale(1); }
}
@keyframes dice-shake {
  0%, 100% { transform: translateX(0); }
  18%, 62% { transform: translateX(-10px); }
  38%, 82% { transform: translateX(10px); }
}
@keyframes dice-stamp {
  0%   { transform: translate(-50%, -50%) rotate(-30deg) scale(3); opacity: 0; }
  55%  { transform: translate(-50%, -50%) rotate(-8deg)  scale(0.88); opacity: 1; }
  80%  { transform: translate(-50%, -50%) rotate(-16deg) scale(1.1); }
  100% { transform: translate(-50%, -50%) rotate(-12deg) scale(1); opacity: 1; }
}
@keyframes dice-coin-fall {
  0%   { transform: translateY(-20px) rotate(0deg); opacity: 1; }
  100% { transform: translateY(420px) rotate(720deg); opacity: 0; }
}
@keyframes dice-marker-pop {
  0%   { transform: translateX(-50%) translateY(-30px) scale(0.4); opacity: 0; }
  60%  { transform: translateX(-50%) translateY(0)     scale(1.3); opacity: 1; }
  100% { transform: translateX(-50%) translateY(0)     scale(1); opacity: 1; }
}
`;

function labelFor(code: string) {
  const labels: Record<string, string> = {
    insufficient_funds: "Not enough Coins.",
    bet_too_low: "Bet must be at least 100.",
    target_invalid: "Pick a target between 2 and 99.",
    direction_invalid: "Pick over or under.",
  };
  return labels[code] ?? "Something went wrong.";
}
