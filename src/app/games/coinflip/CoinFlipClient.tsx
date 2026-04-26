"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { BetInput } from "@/components/BetInput";

type Side = "heads" | "tails";

type Result = {
  result: Side;
  win: boolean;
  payout: number;
  balance: number;
};

type HistoryEntry = { id: number; result: Side; win: boolean };

const MAX_HISTORY = 12;
const FLIP_MS = 2200;       // total spin time
const POST_REVEAL_MS = 250; // wait after spin to show stamp + confetti

export function CoinFlipClient() {
  const router = useRouter();
  const [bet, setBet] = useState(1_000);
  const [pick, setPick] = useState<Side>("heads");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<Result | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [balance, setBalance] = useState<number | null>(null);
  const [history, setHistory] = useState<HistoryEntry[]>([]);

  // Coin animation state
  const [rotation, setRotation] = useState(0);
  const [spinning, setSpinning] = useState(false);
  const [tossKey, setTossKey] = useState(0);     // re-fires the toss-arc keyframe
  const [stampKey, setStampKey] = useState(0);
  const [confettiKey, setConfettiKey] = useState(0);
  const [shakeKey, setShakeKey] = useState(0);
  const settledRef = useRef<Side>("heads");

  useEffect(() => {
    fetch("/api/auth/me")
      .then((r) => r.json())
      .then((d) => setBalance(d.balance ?? null));
  }, []);

  async function flip() {
    setError(null);
    setResult(null);
    setBusy(true);
    setSpinning(true);
    setTossKey((k) => k + 1);

    const res = await fetch("/api/games/coinflip/flip", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ bet, pick }),
    });
    const data = await res.json();
    if (!res.ok) {
      setBusy(false);
      setSpinning(false);
      setError(data.error ?? "error");
      return;
    }

    // Compute the final rotation so the coin lands on the result face
    // (heads = 0, tails = 180). Add 6 full rotations for visible spin.
    const targetMod = data.result === "heads" ? 0 : 180;
    const currentMod = ((rotation % 360) + 360) % 360;
    const delta = ((targetMod - currentMod) + 360) % 360;
    const newRot = rotation + 360 * 6 + delta;
    setRotation(newRot);
    settledRef.current = data.result;

    setTimeout(() => {
      setSpinning(false);
      setResult(data);
      setBalance(data.balance);
      setStampKey((k) => k + 1);
      if (data.win) setConfettiKey((k) => k + 1);
      else setShakeKey((k) => k + 1);
      setHistory((prev) => {
        const next: HistoryEntry = { id: Date.now(), result: data.result, win: data.win };
        return [next, ...prev].slice(0, MAX_HISTORY);
      });
      setBusy(false);
      router.refresh();
    }, FLIP_MS + POST_REVEAL_MS);
  }

  const canFlip = !busy && bet >= 100 && (balance == null || balance >= bet);
  const displayedSide = result?.result ?? settledRef.current;

  return (
    <>
      <style>{COIN_KEYFRAMES}</style>
      <div className="stack-lg" style={{ gap: "var(--sp-4)" }}>
        {/* === Felt centerpiece === */}
        <div
          className="panel"
          key={`felt-${shakeKey}`}
          style={{
            padding: "var(--sp-6)",
            background: "radial-gradient(circle at 50% 40%, #2d5b22, #1f3818)",
            color: "var(--parchment-50)",
            position: "relative",
            overflow: "hidden",
            minHeight: 360,
            animation: shakeKey > 0 ? "cf-shake 0.5s var(--ease-snap)" : undefined,
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            gap: "var(--sp-5)",
          }}
        >
          {/* Pick label up top */}
          <div
            style={{
              fontFamily: "var(--font-display)",
              fontSize: 14,
              letterSpacing: "var(--ls-loose)",
              textTransform: "uppercase",
              color: "var(--gold-300)",
              textShadow: "2px 2px 0 var(--ink-900)",
            }}
          >
            You Picked: <span style={{ fontSize: 20, color: "var(--parchment-50)" }}>{pick.toUpperCase()}</span>
          </div>

          <Coin3D
            rotationDeg={rotation}
            spinning={spinning}
            size={240}
            tossKey={tossKey}
            displayedSide={displayedSide}
          />

          {/* Drop shadow under the coin (scales smaller while coin is up in the air) */}
          <div
            aria-hidden
            style={{
              width: 200,
              height: 14,
              borderRadius: "50%",
              background: "rgba(0,0,0,0.55)",
              marginTop: -20,
              animation: spinning ? "cf-shadow 2.2s ease-in-out" : undefined,
            }}
          />

          {result && !spinning && (
            <ResultStamp
              key={stampKey}
              win={result.win}
              side={result.result}
              bet={bet}
              payout={result.payout}
            />
          )}
          {result && result.win && !spinning && <Confetti key={confettiKey} />}
        </div>

        {/* === Controls === */}
        <div className="grid grid-2" style={{ gap: "var(--sp-4)" }}>
          <div className="panel" style={{ padding: "var(--sp-5)" }}>
            <div className="panel-title">Place Your Bet</div>
            <div className="stack-lg">
              <div>
                <label className="label">Pick a side</label>
                <div className="row" style={{ gap: "var(--sp-3)" }}>
                  <SidePickerButton
                    side="heads"
                    active={pick === "heads"}
                    disabled={busy}
                    onClick={() => setPick("heads")}
                  />
                  <SidePickerButton
                    side="tails"
                    active={pick === "tails"}
                    disabled={busy}
                    onClick={() => setPick("tails")}
                  />
                </div>
              </div>

              <BetInput
                value={bet}
                onChange={setBet}
                max={Math.max(100, balance ?? 100)}
                disabled={busy}
              />

              <button
                className="btn btn-lg btn-block"
                onClick={flip}
                disabled={!canFlip}
                style={{
                  fontSize: "var(--fs-h2)",
                  background: canFlip ? "var(--gold-300)" : undefined,
                }}
              >
                {busy ? "Flipping..." : "Flip"}
              </button>
              {error && <p style={{ color: "var(--crimson-500)" }}>{errorLabel(error)}</p>}
            </div>
          </div>

          <div className="panel" style={{ padding: "var(--sp-5)" }}>
            <div className="panel-title">Recent Flips</div>
            {history.length === 0 ? (
              <p className="text-mute" style={{ fontSize: 13 }}>
                No flips yet. Pull the trigger.
              </p>
            ) : (
              <div className="row" style={{ gap: 6, flexWrap: "wrap" }}>
                {history.map((h) => (
                  <span
                    key={h.id}
                    title={`${h.result.toUpperCase()} · ${h.win ? "win" : "loss"}`}
                    style={{
                      display: "inline-flex",
                      alignItems: "center",
                      justifyContent: "center",
                      width: 36,
                      height: 36,
                      borderRadius: 999,
                      background: h.win
                        ? "linear-gradient(135deg, #6ba84f, #3d6b2e)"
                        : "linear-gradient(135deg, #c93a2c, #4a1a1a)",
                      color: "var(--parchment-50)",
                      border: "3px solid var(--ink-900)",
                      fontFamily: "var(--font-display)",
                      fontSize: 16,
                      boxShadow: "var(--bevel-light)",
                      textShadow: "1px 1px 0 var(--ink-900)",
                    }}
                  >
                    {h.result === "heads" ? "H" : "T"}
                  </span>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </>
  );
}

// ============================================================
// 3D coin component — two faces, rotateY-driven
// ============================================================
function Coin3D({
  rotationDeg,
  spinning,
  size,
  tossKey,
  displayedSide,
}: {
  rotationDeg: number;
  spinning: boolean;
  size: number;
  tossKey: number;
  displayedSide: Side;
}) {
  return (
    <div
      key={`toss-${tossKey}`}
      style={{
        width: size,
        height: size,
        animation: spinning ? "cf-toss 2.2s ease-in-out" : undefined,
        transformStyle: "preserve-3d",
        perspective: 1000,
        position: "relative",
      }}
    >
      <div
        style={{
          width: "100%",
          height: "100%",
          position: "relative",
          transformStyle: "preserve-3d",
          transition: spinning
            ? `transform ${FLIP_MS}ms cubic-bezier(0.18, 0.85, 0.18, 1)`
            : "transform 0.4s var(--ease-snap)",
          transform: `rotateY(${rotationDeg}deg)`,
        }}
      >
        <CoinFace side="heads" size={size} highlight={!spinning && displayedSide === "heads"} />
        <CoinFace side="tails" size={size} flipped highlight={!spinning && displayedSide === "tails"} />
      </div>
    </div>
  );
}

function CoinFace({
  side,
  size,
  flipped,
  highlight,
}: {
  side: Side;
  size: number;
  flipped?: boolean;
  highlight?: boolean;
}) {
  return (
    <div
      style={{
        position: "absolute",
        inset: 0,
        width: size,
        height: size,
        borderRadius: "50%",
        background:
          "radial-gradient(circle at 35% 30%, #ffe9a8, #f5c842 50%, #c8941d 80%, #7a5510 100%)",
        border: "8px solid #7a5510",
        boxShadow: highlight
          ? "0 0 0 4px var(--gold-300), 0 0 36px rgba(245, 200, 66, 0.85), inset 0 -8px 0 rgba(0,0,0,0.25)"
          : "inset 0 -8px 0 rgba(0,0,0,0.25), inset 0 8px 0 rgba(255,255,255,0.25), 0 8px 0 rgba(0,0,0,0.4)",
        transform: flipped ? "rotateY(180deg)" : "rotateY(0deg)",
        backfaceVisibility: "hidden",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        fontFamily: "var(--font-display)",
        color: "var(--ink-900)",
        textShadow: "3px 3px 0 var(--gold-100)",
        fontSize: size * 0.45,
      }}
    >
      <div style={{ position: "relative", textAlign: "center", lineHeight: 1 }}>
        {side === "heads" ? "H" : "T"}
        <div
          style={{
            fontSize: size * 0.07,
            letterSpacing: "var(--ls-loose)",
            color: "var(--saddle-500)",
            textShadow: "none",
            marginTop: 6,
            textTransform: "uppercase",
          }}
        >
          {side}
        </div>
      </div>
      {/* Edge ring tick marks */}
      <div
        aria-hidden
        style={{
          position: "absolute",
          inset: 4,
          borderRadius: "50%",
          border: "2px dashed rgba(122, 85, 16, 0.5)",
          pointerEvents: "none",
        }}
      />
    </div>
  );
}

function SidePickerButton({
  side,
  active,
  disabled,
  onClick,
}: {
  side: Side;
  active: boolean;
  disabled: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`btn btn-block ${active ? "" : "btn-ghost"}`}
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        gap: 10,
        background: active ? "var(--gold-300)" : undefined,
        color: active ? "var(--ink-900)" : undefined,
        boxShadow: active ? "var(--glow-gold)" : undefined,
      }}
    >
      <span
        style={{
          width: 28,
          height: 28,
          borderRadius: "50%",
          background:
            "radial-gradient(circle at 35% 30%, #ffe9a8, #f5c842 60%, #c8941d 100%)",
          border: "2px solid var(--ink-900)",
          display: "inline-flex",
          alignItems: "center",
          justifyContent: "center",
          fontFamily: "var(--font-display)",
          color: "var(--ink-900)",
          fontSize: 14,
          textShadow: "1px 1px 0 var(--gold-100)",
        }}
      >
        {side === "heads" ? "H" : "T"}
      </span>
      {side === "heads" ? "Heads" : "Tails"}
    </button>
  );
}

// ============================================================
// Result stamp + confetti
// ============================================================
function ResultStamp({
  win,
  side,
  bet,
  payout,
}: {
  win: boolean;
  side: Side;
  bet: number;
  payout: number;
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
        fontSize: win ? 52 : 40,
        letterSpacing: "var(--ls-loose)",
        textTransform: "uppercase",
        boxShadow: win ? "var(--glow-gold), 8px 8px 0 var(--ink-900)" : "8px 8px 0 var(--ink-900)",
        textShadow: "3px 3px 0 var(--ink-900)",
        animation: "cf-stamp 0.7s var(--ease-snap) backwards",
        zIndex: 10,
        pointerEvents: "none",
        textAlign: "center",
      }}
    >
      {side.toUpperCase()}
      <div style={{ fontSize: 18, marginTop: 4, letterSpacing: "var(--ls-tight)" }}>
        {win ? `+${(payout - bet).toLocaleString()} ¢` : `Lost ${bet.toLocaleString()} ¢`}
      </div>
    </div>
  );
}

function Confetti() {
  const pieces = Array.from({ length: 40 }, (_, i) => ({
    id: i,
    left: Math.random() * 100,
    delay: Math.random() * 0.3,
    duration: 1.5 + Math.random() * 1.0,
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
            animation: `cf-fall ${p.duration}s linear ${p.delay}s 1 forwards`,
            transform: `rotate(${p.rotate}deg)`,
          }}
        />
      ))}
    </div>
  );
}

const COIN_KEYFRAMES = `
@keyframes cf-toss {
  0%   { transform: translateY(0); }
  20%  { transform: translateY(-110px); }
  60%  { transform: translateY(-150px); }
  85%  { transform: translateY(-30px); }
  100% { transform: translateY(0); }
}
@keyframes cf-shadow {
  0%   { transform: scale(1, 1); opacity: 0.55; }
  20%  { transform: scale(0.7, 0.6); opacity: 0.3; }
  60%  { transform: scale(0.55, 0.5); opacity: 0.2; }
  85%  { transform: scale(0.85, 0.8); opacity: 0.4; }
  100% { transform: scale(1, 1); opacity: 0.55; }
}
@keyframes cf-shake {
  0%, 100% { transform: translateX(0); }
  18%, 62% { transform: translateX(-10px); }
  38%, 82% { transform: translateX(10px); }
}
@keyframes cf-stamp {
  0%   { transform: translate(-50%, -50%) rotate(-30deg) scale(3);   opacity: 0; }
  55%  { transform: translate(-50%, -50%) rotate(-8deg)  scale(0.88); opacity: 1; }
  80%  { transform: translate(-50%, -50%) rotate(-16deg) scale(1.1); }
  100% { transform: translate(-50%, -50%) rotate(-12deg) scale(1); opacity: 1; }
}
@keyframes cf-fall {
  0%   { transform: translateY(-20px) rotate(0deg); opacity: 1; }
  100% { transform: translateY(560px) rotate(720deg); opacity: 0; }
}
`;

function errorLabel(code: string) {
  const labels: Record<string, string> = {
    insufficient_funds: "Not enough Coins.",
    bet_too_low: "Bet must be at least 100.",
    bet_invalid: "Invalid bet.",
    pick_invalid: "Pick heads or tails.",
  };
  return labels[code] ?? "Something went wrong.";
}
