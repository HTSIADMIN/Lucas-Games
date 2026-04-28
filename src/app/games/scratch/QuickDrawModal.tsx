"use client";

import { useEffect, useRef, useState } from "react";
import { ModalShell } from "@/components/ModalShell";
import * as Sfx from "@/lib/sfx";

// Sheriff's Bonus quick-draw round.
//
// Flow:
//   ready  → tap to begin
//   armed  → "wait for the buzzer" — random 1.2–3.0s delay; if the
//            player taps during this, it's a foul (false start).
//   draw   → "DRAW!" — player taps as fast as possible; reaction
//            time gets posted to /api/games/scratch/quickdraw and the
//            server returns the multiplier + payout.
//   done   → show payout + Close.

type Phase = "ready" | "armed" | "draw" | "settling" | "done" | "fault";

export function QuickDrawModal({
  open,
  onClose,
  onOpened,
  onCreditedPayout,
}: {
  open: boolean;
  onClose: () => void;
  /** Fired exactly once per opening — the parent uses this to
      consume the 5-star threshold so the bonus is one-shot
      regardless of whether the player false-starts or misses. */
  onOpened?: () => void;
  onCreditedPayout: (delta: number, balance: number) => void;
}) {
  const [phase, setPhase] = useState<Phase>("ready");
  const [error, setError] = useState<string | null>(null);
  const [reaction, setReaction] = useState<number | null>(null);
  const [payout, setPayout] = useState<number | null>(null);
  const [multiplier, setMultiplier] = useState<number | null>(null);
  const armTimerRef = useRef<number | null>(null);
  const drawAtRef = useRef<number | null>(null);

  // Reset state when re-opened. Stars consume on entry so the bonus
  // is genuinely one-shot.
  useEffect(() => {
    if (!open) return;
    setPhase("ready");
    setError(null);
    setReaction(null);
    setPayout(null);
    setMultiplier(null);
    onOpened?.();
    return () => {
      if (armTimerRef.current) window.clearTimeout(armTimerRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  function arm() {
    setPhase("armed");
    Sfx.play("card.place");
    const delay = 1200 + Math.random() * 1800;
    armTimerRef.current = window.setTimeout(() => {
      drawAtRef.current = performance.now();
      setPhase("draw");
      Sfx.play("ui.notify"); // buzzer
    }, delay);
  }

  async function fire() {
    if (phase === "ready") return arm();
    if (phase === "armed") {
      // False start — abort the timer.
      if (armTimerRef.current) window.clearTimeout(armTimerRef.current);
      setPhase("fault");
      Sfx.play("ui.notify");
      return;
    }
    if (phase !== "draw") return;
    Sfx.play("coin.drop");
    const t = performance.now() - (drawAtRef.current ?? performance.now());
    setReaction(t);
    setPhase("settling");
    try {
      const r = await fetch("/api/games/scratch/quickdraw", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ reactionMs: Math.round(t) }),
      });
      const d = await r.json();
      if (!r.ok || !d.ok) {
        setError(d.error ?? "couldnt_post");
        setPhase("done");
        return;
      }
      setPayout(d.payout);
      setMultiplier(d.multiplier);
      setPhase("done");
      onCreditedPayout(d.payout, d.balance);
      // Tier-scaled stinger by reaction speed.
      if (d.payout >= 50_000) Sfx.play("win.big");
      else if (d.payout >= 20_000) Sfx.play("win.levelup");
      else if (d.payout > 0) Sfx.play("win.notify");
      else Sfx.play("ui.notify");
    } catch {
      setError("network");
      setPhase("done");
    }
  }

  return (
    <ModalShell open={open} onClose={onClose} width={460}>
      <div style={{ textAlign: "center", padding: "var(--sp-3) 0" }}>
        <div
          style={{
            fontFamily: "var(--font-display)",
            fontSize: "var(--fs-h3)",
            color: "var(--gold-700)",
            letterSpacing: "0.06em",
            textTransform: "uppercase",
            marginBottom: "var(--sp-2)",
          }}
        >
          Sheriff's Bonus
        </div>
        <p className="text-mute" style={{ marginBottom: "var(--sp-4)" }}>
          5 stars collected. Wait for the buzzer, then tap fast as you can.
        </p>

        <div
          onClick={fire}
          role="button"
          tabIndex={0}
          onKeyDown={(e) => { if (e.key === " " || e.key === "Enter") fire(); }}
          style={{
            margin: "0 auto",
            width: "100%",
            height: 220,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            border: "5px solid var(--ink-900)",
            cursor: phase === "settling" ? "default" : "pointer",
            userSelect: "none",
            background:
              phase === "draw"  ? "var(--crimson-300)"
              : phase === "armed" ? "var(--saddle-500)"
              : phase === "fault" ? "var(--saddle-300)"
              : phase === "done" && payout && payout > 0 ? "var(--cactus-300)"
              : phase === "done" ? "var(--saddle-200)"
              : "var(--gold-300)",
            color: phase === "armed" || phase === "draw" ? "var(--parchment-50)" : "var(--ink-900)",
            fontFamily: "var(--font-display)",
            fontSize: 52,
            letterSpacing: "0.08em",
            textShadow: "3px 3px 0 var(--ink-900)",
            transition: "background 120ms",
          }}
        >
          {phase === "ready"    && "TAP TO ARM"}
          {phase === "armed"    && "WAIT..."}
          {phase === "draw"     && "DRAW!"}
          {phase === "settling" && "..."}
          {phase === "fault"    && "TOO SOON"}
          {phase === "done" && payout != null && (payout > 0
            ? `+${payout.toLocaleString()} ¢`
            : "TOO SLOW"
          )}
        </div>

        <div style={{ marginTop: "var(--sp-3)", fontFamily: "var(--font-display)", fontSize: 14 }}>
          {phase === "done" && reaction != null && (
            <div className="text-mute">
              Reaction: {Math.round(reaction)}ms · Multiplier ×{multiplier ?? 0}
            </div>
          )}
          {phase === "fault" && (
            <div className="text-mute">
              False start — try again.
            </div>
          )}
          {error && <div style={{ color: "var(--crimson-500)" }}>{error}</div>}
        </div>

        <div className="row" style={{ justifyContent: "center", gap: "var(--sp-2)", marginTop: "var(--sp-4)" }}>
          <button className="btn btn-sm" onClick={onClose}>Close</button>
        </div>
      </div>
    </ModalShell>
  );
}
