"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { BetInput } from "@/components/BetInput";
import { useCoinFace } from "@/components/CoinFaceProvider";
import * as Sfx from "@/lib/sfx";

type Side = "heads" | "tails";

type DuelView = {
  id: string;
  challenger_id: string;
  challenger_side: Side;
  wager: number;
  acceptor_id: string | null;
  result: Side | null;
  winner_id: string | null;
  status: "open" | "resolved" | "cancelled";
  created_at: string;
  resolved_at: string | null;
  challenger: { username: string; avatar_color: string; initials: string } | null;
  acceptor: { username: string; avatar_color: string; initials: string } | null;
};

const POLL_MS = 3000;
const FLIP_MS = 2400;     // duel coin spin time
const REVEAL_HOLD_MS = 3500; // how long the result overlay stays before auto-dismiss

type FlipOverlayState = {
  challengerName: string;
  challengerColor: string;
  challengerInitials: string;
  challengerSide: Side;
  acceptorName: string;
  acceptorColor: string;
  acceptorInitials: string;
  acceptorSide: Side;
  result: Side;
  winnerIsChallenger: boolean;
  payout: number;
  iWon: boolean | null; // null if I'm watching
};

export function CoinflipDuelClient() {
  const router = useRouter();
  const meRef = useRef<string | null>(null);
  const [balance, setBalance] = useState<number | null>(null);
  const [open, setOpen] = useState<DuelView[]>([]);
  const [recent, setRecent] = useState<DuelView[]>([]);
  const [wager, setWager] = useState(1_000);
  const [side, setSide] = useState<Side>("heads");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [overlay, setOverlay] = useState<FlipOverlayState | null>(null);
  const [overlayPhase, setOverlayPhase] = useState<"flipping" | "revealed">("flipping");
  const [overlayKey, setOverlayKey] = useState(0);
  // Track resolved duel ids we've already animated locally so we don't
  // re-animate when polling brings the same row back.
  const animatedResolvedRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    fetch("/api/auth/me").then((r) => r.json()).then((d) => {
      meRef.current = d.user?.id ?? null;
      setBalance(d.balance ?? null);
    });
  }, []);

  async function refresh() {
    try {
      const r = await fetch("/api/games/coinflip-duel/list");
      if (!r.ok) return;
      const d = await r.json();
      setOpen(d.open ?? []);
      const newRecent: DuelView[] = d.recent ?? [];
      // If a duel I'm part of just resolved and we haven't animated it yet,
      // pop the overlay (e.g. someone accepted my open duel while I waited).
      const me = meRef.current;
      for (const duel of newRecent) {
        if (duel.status !== "resolved") continue;
        if (animatedResolvedRef.current.has(duel.id)) continue;
        if (duel.challenger_id !== me && duel.acceptor_id !== me) continue;
        // Only animate if the resolved time is recent (last 30s).
        const resolvedAt = duel.resolved_at ? new Date(duel.resolved_at).getTime() : 0;
        if (Date.now() - resolvedAt > 30_000) {
          animatedResolvedRef.current.add(duel.id);
          continue;
        }
        animatedResolvedRef.current.add(duel.id);
        showFlipOverlay(duel, /* iWonLocal */ duel.winner_id === me);
        break;
      }
      setRecent(newRecent);
    } catch { /* ignore */ }
  }
  useEffect(() => {
    refresh();
    const t = setInterval(refresh, POLL_MS);
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function showFlipOverlay(duel: DuelView, iWonLocal: boolean | null) {
    if (!duel.challenger || !duel.acceptor || !duel.result) return;
    const winnerIsChallenger = duel.winner_id === duel.challenger_id;
    setOverlay({
      challengerName: duel.challenger.username,
      challengerColor: duel.challenger.avatar_color,
      challengerInitials: duel.challenger.initials,
      challengerSide: duel.challenger_side,
      acceptorName: duel.acceptor.username,
      acceptorColor: duel.acceptor.avatar_color,
      acceptorInitials: duel.acceptor.initials,
      acceptorSide: duel.challenger_side === "heads" ? "tails" : "heads",
      result: duel.result,
      winnerIsChallenger,
      payout: duel.wager * 2,
      iWon: iWonLocal,
    });
    setOverlayPhase("flipping");
    setOverlayKey((k) => k + 1);
    // Wood-click toss start — matches the slots reel-stop sound.
    Sfx.play("ui.wood");
    setTimeout(() => {
      setOverlayPhase("revealed");
      if (iWonLocal === true) Sfx.play("coins.shower");
      else if (iWonLocal === false) Sfx.play("ui.notify");
      else Sfx.play("coins.clink");
    }, FLIP_MS);
    setTimeout(() => setOverlay(null), FLIP_MS + REVEAL_HOLD_MS);
  }

  async function create() {
    setBusy(true); setError(null);
    Sfx.play("chip.lay");
    const r = await fetch("/api/games/coinflip-duel/create", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ wager, side }),
    });
    const d = await r.json();
    setBusy(false);
    if (!r.ok) { setError(labelFor(d.error ?? "error")); return; }
    setBalance(d.balance);
    refresh();
    router.refresh();
  }

  async function accept(id: string) {
    setBusy(true); setError(null);
    Sfx.play("chip.lay");
    const r = await fetch(`/api/games/coinflip-duel/${id}/accept`, { method: "POST" });
    const d = await r.json();
    setBusy(false);
    if (!r.ok) { setError(labelFor(d.error ?? "error")); return; }
    setBalance(d.balance);

    // Server returns: { youWon, payout, result, duel } — animate the flip
    // using the server-provided duel record.
    if (d.duel) {
      animatedResolvedRef.current.add(d.duel.id);
      showFlipOverlay(d.duel, d.youWon);
    }
    refresh();
    router.refresh();
  }

  async function cancel(id: string) {
    setBusy(true); setError(null);
    const r = await fetch(`/api/games/coinflip-duel/${id}/cancel`, { method: "POST" });
    const d = await r.json();
    setBusy(false);
    if (!r.ok) { setError(labelFor(d.error ?? "error")); return; }
    setBalance(d.balance);
    refresh();
    router.refresh();
  }

  const me = meRef.current;

  return (
    <>
      <style>{COIN_KEYFRAMES}</style>
      <div className="grid grid-2" style={{ alignItems: "start", gap: "var(--sp-4)" }}>
        {/* Create + open lobby */}
        <div className="stack-lg">
          <div className="panel" style={{ padding: "var(--sp-5)" }}>
            <div className="panel-title">Challenge a Friend</div>
            <div className="stack-lg">
              <div>
                <label className="label">Your Side</label>
                <div className="row" style={{ gap: "var(--sp-3)" }}>
                  <SidePickerButton side="heads" active={side === "heads"} disabled={busy} onClick={() => setSide("heads")} />
                  <SidePickerButton side="tails" active={side === "tails"} disabled={busy} onClick={() => setSide("tails")} />
                </div>
              </div>
              <BetInput value={wager} onChange={setWager} max={Math.max(100, balance ?? 100)} disabled={busy} />
              <button
                className="btn btn-lg btn-block"
                onClick={create}
                disabled={busy || wager < 100 || (balance != null && balance < wager)}
                style={{
                  fontSize: "var(--fs-h3)",
                  background: !busy && wager >= 100 ? "var(--gold-300)" : undefined,
                }}
              >
                {busy ? "..." : `Post Challenge (${wager.toLocaleString()} ¢)`}
              </button>
              {error && <p style={{ color: "var(--crimson-500)" }}>{error}</p>}
            </div>
          </div>

          <div className="panel" style={{ padding: "var(--sp-5)" }}>
            <div className="panel-title">Open Duels ({open.length})</div>
            {open.length === 0 ? (
              <p className="text-mute">No open challenges. Be the first.</p>
            ) : (
              <div className="stack" style={{ gap: 8 }}>
                {open.map((d) => {
                  const isMine = d.challenger_id === me;
                  const otherSide = d.challenger_side === "heads" ? "tails" : "heads";
                  return (
                    <div
                      key={d.id}
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: 10,
                        padding: "var(--sp-3)",
                        background: isMine ? "var(--gold-100)" : "var(--parchment-200)",
                        border: "3px solid var(--ink-900)",
                        boxShadow: "var(--bevel-light)",
                      }}
                    >
                      <MiniCoin side={d.challenger_side} size={36} />
                      <div
                        className="avatar avatar-sm"
                        style={{
                          background: d.challenger?.avatar_color ?? "var(--gold-300)",
                          fontSize: 13,
                          width: 32,
                          height: 32,
                          borderWidth: 2,
                        }}
                      >
                        {d.challenger?.initials ?? "??"}
                      </div>
                      <div style={{ flex: 1, minWidth: 0, fontFamily: "var(--font-display)", fontSize: 14 }}>
                        <div>
                          {d.challenger?.username ?? "?"} picks <b>{d.challenger_side.toUpperCase()}</b>
                        </div>
                        <div style={{ color: "var(--saddle-400)", fontSize: 12 }}>
                          Wager {d.wager.toLocaleString()} ¢ · pot {(d.wager * 2).toLocaleString()} ¢
                        </div>
                      </div>
                      {isMine ? (
                        <button
                          type="button"
                          className="btn btn-ghost btn-sm"
                          onClick={() => cancel(d.id)}
                          disabled={busy}
                        >
                          Cancel
                        </button>
                      ) : (
                        <button
                          type="button"
                          className="btn btn-sm"
                          onClick={() => accept(d.id)}
                          disabled={busy || (balance != null && balance < d.wager)}
                          style={{
                            background: "var(--gold-300)",
                            color: "var(--ink-900)",
                          }}
                        >
                          Take {otherSide.toUpperCase()}
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        {/* History */}
        <div className="panel" style={{ padding: "var(--sp-5)" }}>
          <div className="panel-title">Recent Duels</div>
          {recent.length === 0 ? (
            <p className="text-mute">No duels yet. Set the first wager.</p>
          ) : (
            <div className="stack" style={{ gap: 8 }}>
              {recent.map((d) => {
                const youWere =
                  d.challenger_id === me ? "challenger" :
                  d.acceptor_id === me ? "acceptor" : null;
                const isResolved = d.status === "resolved";
                const youWon = isResolved && d.winner_id === me;
                return (
                  <div
                    key={d.id}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 10,
                      padding: "var(--sp-3)",
                      background:
                        d.status === "cancelled"
                          ? "var(--parchment-200)"
                          : youWon
                          ? "var(--cactus-100)"
                          : youWere
                          ? "var(--crimson-100)"
                          : "var(--parchment-100)",
                      border: "2px solid var(--ink-900)",
                    }}
                  >
                    {d.result && <MiniCoin side={d.result} size={32} />}
                    <div
                      className="avatar avatar-sm"
                      style={{
                        background: d.challenger?.avatar_color ?? "var(--gold-300)",
                        fontSize: 13,
                        width: 28,
                        height: 28,
                        borderWidth: 2,
                      }}
                    >
                      {d.challenger?.initials ?? "??"}
                    </div>
                    <div style={{ flex: 1, minWidth: 0, fontFamily: "var(--font-display)", fontSize: 13 }}>
                      {d.status === "cancelled" ? (
                        <span>{d.challenger?.username ?? "?"} cancelled · {d.wager.toLocaleString()} ¢</span>
                      ) : (
                        <>
                          <div>
                            {d.challenger?.username} ({d.challenger_side.toUpperCase()}) vs{" "}
                            {d.acceptor?.username ?? "?"}
                          </div>
                          <div style={{ color: "var(--saddle-400)", fontSize: 12 }}>
                            Result: <b>{d.result?.toUpperCase()}</b> · pot {(d.wager * 2).toLocaleString()} ¢
                          </div>
                        </>
                      )}
                    </div>
                    {youWere && isResolved && (
                      <span
                        style={{
                          fontFamily: "var(--font-display)",
                          fontSize: 13,
                          color: youWon ? "var(--cactus-500)" : "var(--crimson-500)",
                        }}
                      >
                        {youWon ? `+${(d.wager * 2).toLocaleString()}` : `-${d.wager.toLocaleString()}`}
                      </span>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* Flip overlay */}
      {overlay && (
        <DuelFlipOverlay key={overlayKey} state={overlay} phase={overlayPhase} />
      )}
    </>
  );
}

// ============================================================
// Duel flip overlay — VS layout with the coin tumbling between
// ============================================================
function DuelFlipOverlay({
  state,
  phase,
}: {
  state: FlipOverlayState;
  phase: "flipping" | "revealed";
}) {
  // Compute coin rotation: lands on heads (0) or tails (180) after 6 spins.
  const targetMod = state.result === "heads" ? 0 : 180;
  const finalRot = 360 * 6 + targetMod;
  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(26, 15, 8, 0.86)",
        zIndex: 200,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: "var(--sp-4)",
        backdropFilter: "blur(3px)",
      }}
    >
      <div
        className="panel-wood"
        style={{
          padding: "var(--sp-6)",
          maxWidth: 800,
          width: "100%",
          border: "5px solid var(--ink-900)",
          boxShadow: "var(--glow-gold)",
          textAlign: "center",
          position: "relative",
          overflow: "hidden",
        }}
      >
        <div
          style={{
            fontFamily: "var(--font-display)",
            fontSize: "var(--fs-h2)",
            color: "var(--gold-300)",
            textShadow: "3px 3px 0 var(--ink-900)",
            marginBottom: "var(--sp-5)",
            letterSpacing: "var(--ls-loose)",
          }}
        >
          {phase === "flipping" ? "FLIPPING..." : state.result.toUpperCase()}
        </div>

        <div
          style={{
            display: "grid",
            gridTemplateColumns: "1fr auto 1fr",
            gap: "var(--sp-5)",
            alignItems: "center",
          }}
        >
          <DuelistSlot
            name={state.challengerName}
            color={state.challengerColor}
            initials={state.challengerInitials}
            side={state.challengerSide}
            winner={phase === "revealed" && state.winnerIsChallenger}
            loser={phase === "revealed" && !state.winnerIsChallenger}
          />
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 8 }}>
            <div
              style={{
                fontFamily: "var(--font-display)",
                fontSize: 32,
                color: "var(--crimson-300)",
                textShadow: "3px 3px 0 var(--ink-900)",
                letterSpacing: "var(--ls-loose)",
              }}
            >
              VS
            </div>
            <div style={{ position: "relative" }}>
              <DuelCoin rotationDeg={finalRot} flipping={phase === "flipping"} side={state.result} />
            </div>
            <div
              aria-hidden
              style={{
                width: 120,
                height: 8,
                borderRadius: "50%",
                background: "rgba(0,0,0,0.55)",
                marginTop: -8,
                animation: phase === "flipping" ? `cf-shadow ${FLIP_MS}ms ease-in-out` : undefined,
              }}
            />
          </div>
          <DuelistSlot
            name={state.acceptorName}
            color={state.acceptorColor}
            initials={state.acceptorInitials}
            side={state.acceptorSide}
            winner={phase === "revealed" && !state.winnerIsChallenger}
            loser={phase === "revealed" && state.winnerIsChallenger}
          />
        </div>

        {phase === "revealed" && state.iWon !== null && (
          <div
            style={{
              marginTop: "var(--sp-5)",
              fontFamily: "var(--font-display)",
              fontSize: "var(--fs-h2)",
              padding: "var(--sp-3)",
              background: state.iWon ? "var(--cactus-500)" : "var(--crimson-500)",
              color: "var(--parchment-50)",
              border: "4px solid var(--ink-900)",
              letterSpacing: "var(--ls-loose)",
              textTransform: "uppercase",
              animation: "cf-stamp 0.7s var(--ease-snap) backwards",
              textShadow: "2px 2px 0 var(--ink-900)",
            }}
          >
            {state.iWon ? `YOU WIN +${state.payout.toLocaleString()} ¢` : "House Wins"}
          </div>
        )}
        {phase === "revealed" && state.iWon === null && (
          <div
            style={{
              marginTop: "var(--sp-5)",
              fontFamily: "var(--font-display)",
              fontSize: "var(--fs-h3)",
              color: "var(--gold-300)",
              animation: "cf-stamp 0.7s var(--ease-snap) backwards",
            }}
          >
            {state.winnerIsChallenger ? state.challengerName : state.acceptorName} took{" "}
            {state.payout.toLocaleString()} ¢
          </div>
        )}

        {phase === "revealed" && state.iWon === true && <Confetti />}
      </div>
    </div>
  );
}

function DuelistSlot({
  name,
  color,
  initials,
  side,
  winner,
  loser,
}: {
  name: string;
  color: string;
  initials: string;
  side: Side;
  winner: boolean;
  loser: boolean;
}) {
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        gap: 10,
        transition: "all 400ms",
        opacity: loser ? 0.45 : 1,
        transform: winner ? "scale(1.08)" : loser ? "scale(0.92)" : "scale(1)",
      }}
    >
      <div
        className="avatar avatar-lg"
        style={{
          background: color,
          fontSize: 28,
          width: 84,
          height: 84,
          borderWidth: 4,
          boxShadow: winner ? "var(--glow-gold), 0 0 32px rgba(245, 200, 66, 0.8)" : "var(--bevel-light)",
          animation: winner ? "cf-winner-pulse 1.4s ease-in-out infinite alternate" : undefined,
        }}
      >
        {initials}
      </div>
      <div style={{ fontFamily: "var(--font-display)", fontSize: 16, color: "var(--parchment-50)" }}>
        {name}
      </div>
      <span
        style={{
          background: "var(--ink-900)",
          color: "var(--gold-300)",
          border: "2px solid var(--ink-900)",
          padding: "2px 10px",
          fontFamily: "var(--font-display)",
          fontSize: 12,
          letterSpacing: "var(--ls-loose)",
        }}
      >
        {side.toUpperCase()}
      </span>
    </div>
  );
}

// ============================================================
// Reusable coin components
// ============================================================
function DuelCoin({
  rotationDeg,
  flipping,
  side,
}: {
  rotationDeg: number;
  flipping: boolean;
  side: Side;
}) {
  const size = 140;
  return (
    <div
      style={{
        width: size,
        height: size,
        animation: flipping ? `cf-toss ${FLIP_MS}ms ease-in-out` : undefined,
        transformStyle: "preserve-3d",
        perspective: 1000,
      }}
    >
      <div
        style={{
          width: "100%",
          height: "100%",
          position: "relative",
          transformStyle: "preserve-3d",
          transition: flipping
            ? `transform ${FLIP_MS}ms cubic-bezier(0.18, 0.85, 0.18, 1)`
            : "transform 0.4s var(--ease-snap)",
          transform: `rotateY(${flipping ? rotationDeg : (side === "heads" ? 0 : 180)}deg)`,
        }}
      >
        <CoinFace side="heads" size={size} />
        <CoinFace side="tails" size={size} flipped />
      </div>
    </div>
  );
}

function MiniCoin({ side, size = 32 }: { side: Side; size?: number }) {
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        width: size,
        height: size,
        borderRadius: "50%",
        background:
          "radial-gradient(circle at 35% 30%, #ffe9a8, #f5c842 60%, #c8941d 100%)",
        border: "3px solid var(--ink-900)",
        fontFamily: "var(--font-display)",
        color: "var(--ink-900)",
        fontSize: size * 0.45,
        textShadow: "1px 1px 0 var(--gold-100)",
        boxShadow: "var(--bevel-light)",
        flexShrink: 0,
      }}
    >
      {side === "heads" ? "H" : "T"}
    </span>
  );
}

function CoinFace({
  side,
  size,
  flipped,
}: {
  side: Side;
  size: number;
  flipped?: boolean;
}) {
  const art = useCoinFace();
  const customSrc = side === "heads" ? art.heads : art.tails;
  const baseStyle: React.CSSProperties = {
    position: "absolute",
    inset: 0,
    width: size,
    height: size,
    borderRadius: "50%",
    transform: flipped ? "rotateY(180deg)" : "rotateY(0deg)",
    backfaceVisibility: "hidden",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
  };
  if (customSrc) {
    return (
      <div style={{ ...baseStyle, background: "transparent", overflow: "hidden" }}>
        <img
          src={customSrc}
          alt={side}
          width={size}
          height={size}
          draggable={false}
          style={{ display: "block", imageRendering: "pixelated" }}
        />
      </div>
    );
  }
  return (
    <div
      style={{
        ...baseStyle,
        background:
          "radial-gradient(circle at 35% 30%, #ffe9a8, #f5c842 50%, #c8941d 80%, #7a5510 100%)",
        border: "6px solid #7a5510",
        boxShadow:
          "inset 0 -6px 0 rgba(0,0,0,0.25), inset 0 6px 0 rgba(255,255,255,0.25)",
        fontFamily: "var(--font-display)",
        color: "var(--ink-900)",
        textShadow: "2px 2px 0 var(--gold-100)",
        fontSize: size * 0.5,
      }}
    >
      {side === "heads" ? "H" : "T"}
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
      <MiniCoin side={side} size={26} />
      {side === "heads" ? "Heads" : "Tails"}
    </button>
  );
}

function Confetti() {
  const pieces = Array.from({ length: 50 }, (_, i) => ({
    id: i,
    left: Math.random() * 100,
    delay: Math.random() * 0.4,
    duration: 1.6 + Math.random() * 1.0,
    rotate: Math.random() * 360,
    size: 12 + Math.random() * 14,
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
  20%  { transform: translateY(-90px); }
  60%  { transform: translateY(-130px); }
  85%  { transform: translateY(-25px); }
  100% { transform: translateY(0); }
}
@keyframes cf-shadow {
  0%   { transform: scale(1, 1); opacity: 0.55; }
  20%  { transform: scale(0.7, 0.6); opacity: 0.3; }
  60%  { transform: scale(0.55, 0.5); opacity: 0.2; }
  85%  { transform: scale(0.85, 0.8); opacity: 0.4; }
  100% { transform: scale(1, 1); opacity: 0.55; }
}
@keyframes cf-stamp {
  0%   { transform: rotate(-30deg) scale(2.5); opacity: 0; }
  55%  { transform: rotate(-8deg) scale(0.92); opacity: 1; }
  80%  { transform: rotate(-4deg) scale(1.06); }
  100% { transform: rotate(0deg) scale(1); opacity: 1; }
}
@keyframes cf-winner-pulse {
  0%, 100% { transform: scale(1); }
  100% { transform: scale(1.06); }
}
@keyframes cf-fall {
  0%   { transform: translateY(-20px) rotate(0deg); opacity: 1; }
  100% { transform: translateY(620px) rotate(720deg); opacity: 0; }
}
`;

function labelFor(code: string) {
  const m: Record<string, string> = {
    insufficient_funds: "Not enough Coins.",
    bet_too_low: "Wager must be at least 100.",
    side_invalid: "Pick heads or tails.",
    not_found: "Duel not found.",
    not_open: "Duel already closed.",
    cant_accept_own: "Can't accept your own challenge.",
    not_yours: "You can only cancel your own challenges.",
  };
  return m[code] ?? "Something went wrong.";
}
