"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { BetInput } from "@/components/BetInput";
import { PlayingCard } from "@/components/PlayingCard";
import { useLive } from "@/components/social/LiveProvider";
import { useVisibleInterval } from "@/lib/hooks/useVisibleInterval";
import type { Card, Rank, Suit } from "@/lib/games/cards";
import * as Sfx from "@/lib/sfx";

type SeatView = {
  userId: string;
  bet: number;
  hand: Card[];
  handTotal: number;
  status: "waiting" | "playing" | "standing" | "busted" | "blackjack" | "done";
  doubled: boolean;
  payout: number;
};

type RoundView = {
  id: string;
  roundNo: number;
  status: "betting" | "dealing" | "player_turn" | "dealer_turn" | "settled";
  betCloseAt: string | null;
  actionDeadlineAt: string | null;
  currentUserId: string | null;
  dealerHand: Card[];
  dealerHidden: boolean;
  dealerTotal: number | null;
};

const POLL_MS = 1000;

export function BlackjackMpClient() {
  const router = useRouter();
  const { presence } = useLive();
  const [bet, setBet] = useState(1_000);
  const [round, setRound] = useState<RoundView | null>(null);
  const [seats, setSeats] = useState<SeatView[]>([]);
  const [serverOffsetMs, setServerOffsetMs] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [balance, setBalance] = useState<number | null>(null);
  const meRef = useRef<string | null>(null);
  const [_, force] = useState(0);

  // Animation cues — keyed re-mounts for the result stamp / confetti / shake.
  const [revealHole, setRevealHole] = useState(0);
  const [stampKey, setStampKey] = useState(0);
  const [confettiKey, setConfettiKey] = useState(0);
  const [shakeKey, setShakeKey] = useState(0);
  const prevRoundStatusRef = useRef<RoundView["status"] | null>(null);
  const prevSeatStatusRef = useRef<SeatView["status"] | null>(null);

  useEffect(() => {
    fetch("/api/auth/me").then((r) => r.json()).then((d) => {
      meRef.current = d.user?.id ?? null;
      setBalance(d.balance ?? null);
    });
  }, []);

  async function refreshState() {
    try {
      const res = await fetch("/api/games/blackjack-mp/state");
      if (!res.ok) return;
      const data = await res.json();
      setServerOffsetMs((data.serverNow ?? Date.now()) - Date.now());
      setRound(data.round ?? null);
      setSeats(data.seats ?? []);
    } catch { /* ignore */ }
  }
  useVisibleInterval(refreshState, POLL_MS);
  useEffect(() => {
    // Local 4Hz countdown rerender — pure CPU, no server cost; keep
    // running even when hidden so we don't reset countdowns on resume.
    const tick = setInterval(() => force((n) => n + 1), 250);
    return () => clearInterval(tick);
  }, []);

  // Detect round state transitions to fire animation cues.
  useEffect(() => {
    if (!round) {
      prevRoundStatusRef.current = null;
      return;
    }
    const prev = prevRoundStatusRef.current;
    const cur = round.status;
    // Hole-card flip — anytime dealer reveals (player_turn -> anything else).
    if (prev === "player_turn" && cur !== "player_turn") {
      setRevealHole((k) => k + 1);
      Sfx.play("card.place");
    }
    if (prev === "betting" && cur === "dealing") Sfx.play("card.shuffle");
    if (prev !== cur && cur === "dealing") Sfx.play("card.deal");
    prevRoundStatusRef.current = cur;
  }, [round]);

  // Detect MY seat settling for stamp + confetti + shake.
  useEffect(() => {
    const me = meRef.current;
    if (!me) return;
    const mine = seats.filter((s) => s.userId === me);
    if (mine.length === 0) {
      prevSeatStatusRef.current = null;
      return;
    }
    const allDone = mine.every((s) => s.status === "done");
    const prev = prevSeatStatusRef.current;
    if (allDone && prev !== "done") {
      setStampKey((k) => k + 1);
      const totalPayout = mine.reduce((sum, s) => sum + s.payout, 0);
      const totalStake = mine.reduce((sum, s) => sum + (s.doubled ? s.bet * 2 : s.bet), 0);
      const net = totalPayout - totalStake;
      const blackjacked = mine.some((s) => s.status === "blackjack");
      if (net > 0) {
        setConfettiKey((k) => k + 1);
        if (blackjacked) Sfx.play("win.levelup");
        else if (net >= totalStake * 2) Sfx.play("win.big");
        else Sfx.play("chips.stack");
      } else if (net < 0) {
        setShakeKey((k) => k + 1);
        Sfx.play("ui.notify");
      } else {
        Sfx.play("coins.handle"); // push
      }
    }
    prevSeatStatusRef.current = allDone ? "done" : (mine[0]?.status ?? null);
  }, [seats]);

  async function placeBet() {
    setBusy(true); setError(null);
    Sfx.play("chip.lay");
    const res = await fetch("/api/games/blackjack-mp/bet", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ bet }),
    });
    const data = await res.json();
    setBusy(false);
    if (!res.ok) { setError(labelFor(data.error ?? "error")); return; }
    setBalance(data.balance);
    refreshState();
    router.refresh();
  }

  async function action(act: "hit" | "stand" | "double" | "split") {
    setBusy(true); setError(null);
    // Action SFX up-front for instant feedback.
    if (act === "hit")         Sfx.play("card.slide");
    else if (act === "stand")  Sfx.play("ui.wood");
    else if (act === "double") Sfx.play("chip.lay");
    else if (act === "split")  Sfx.play("card.shove");
    const res = await fetch("/api/games/blackjack-mp/action", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ action: act }),
    });
    const data = await res.json();
    setBusy(false);
    if (!res.ok) { setError(labelFor(data.error ?? "error")); return; }
    if (data.balance != null) setBalance(data.balance);
    refreshState();
    router.refresh();
  }

  const me = meRef.current;
  const mySeats = seats.filter((s) => s.userId === me);
  const mySeat = mySeats.find((s) => s.status === "playing") ?? mySeats[0];
  const isMyTurn = round?.status === "player_turn" && round.currentUserId === me && mySeat?.status === "playing";
  const isBetting = round?.status === "betting";

  function rankValue(rank: string): number {
    if (rank === "A") return 11;
    if (rank === "J" || rank === "Q" || rank === "K") return 10;
    return Number(rank) || 0;
  }
  const canSplit = !!(
    mySeat &&
    mySeat.status === "playing" &&
    mySeat.hand.length === 2 &&
    rankValue(mySeat.hand[0].rank) === rankValue(mySeat.hand[1].rank) &&
    (balance == null || balance >= mySeat.bet)
  );
  const canDouble = !!(
    mySeat &&
    mySeat.status === "playing" &&
    mySeat.hand.length === 2 &&
    !mySeat.doubled &&
    (balance == null || balance >= mySeat.bet)
  );

  const secondsLeft = (() => {
    if (isBetting && round?.betCloseAt) {
      return Math.max(0, Math.ceil((new Date(round.betCloseAt).getTime() - Date.now() - serverOffsetMs) / 1000));
    }
    if (round?.status === "player_turn" && round.actionDeadlineAt) {
      return Math.max(0, Math.ceil((new Date(round.actionDeadlineAt).getTime() - Date.now() - serverOffsetMs) / 1000));
    }
    return 0;
  })();

  function tagFor(userId: string) { return presence.find((p) => p.userId === userId); }

  // Aggregate payout/net for the result stamp
  const allMineDone = mySeats.length > 0 && mySeats.every((s) => s.status === "done");
  const totalPayout = mySeats.reduce((sum, s) => sum + s.payout, 0);
  const totalStake = mySeats.reduce((sum, s) => sum + (s.doubled ? s.bet * 2 : s.bet), 0);
  const net = totalPayout - totalStake;
  const stampStatus: ResultKind = !allMineDone
    ? "pending"
    : net > 0
    ? (totalPayout >= totalStake * 2.4 ? "blackjack" : "win")
    : net === 0
    ? "push"
    : "loss";

  return (
    <>
      <style>{BJ_KEYFRAMES}</style>
      <div className="grid grid-2" style={{ alignItems: "start" }}>
        <div className="panel" style={{ padding: "var(--sp-5)", position: "relative", overflow: "hidden" }}>
          <div className="panel-title">
            {round ? `Round #${round.roundNo} · ${labelStatus(round.status)}` : "Loading..."}
            {(isBetting || round?.status === "player_turn") && secondsLeft > 0 && (
              <span style={{ marginLeft: 12, color: "var(--crimson-500)" }}>· {secondsLeft}s</span>
            )}
          </div>

          {/* Felt — wood-rimmed casino table. Gold pinstripe inside
              the rim, radial light hot spot center, repeating felt
              grain underneath, soft vignette in the corners. */}
          <div
            key={`felt-${shakeKey}`}
            style={{
              background: `
                radial-gradient(ellipse at 50% 30%, rgba(255, 232, 160, 0.18) 0%, transparent 55%),
                radial-gradient(circle at 50% 50%, #347029 0%, #224620 55%, #16320f 100%),
                repeating-linear-gradient(45deg, rgba(0,0,0,0.04) 0 2px, transparent 2px 6px),
                repeating-linear-gradient(-45deg, rgba(0,0,0,0.04) 0 2px, transparent 2px 6px)
              `,
              border: "8px solid #4a2818",
              outline: "2px solid var(--gold-300)",
              outlineOffset: "-12px",
              borderRadius: 10,
              padding: "var(--sp-5) var(--sp-4) var(--sp-4)",
              minHeight: 320,
              boxShadow: `
                inset 0 0 0 4px rgba(0,0,0,0.45),
                inset 0 0 90px rgba(0, 0, 0, 0.7),
                0 4px 0 rgba(0,0,0,0.4),
                0 12px 28px rgba(0,0,0,0.5)
              `,
              animation: shakeKey > 0 ? "bj-shake 0.5s var(--ease-snap)" : undefined,
              position: "relative",
              overflow: "hidden",
            }}
          >
            {/* Game label arc on the dealer side — "BLACKJACK PAYS 3:2" */}
            <div
              aria-hidden
              style={{
                position: "absolute",
                top: 12,
                left: "50%",
                transform: "translateX(-50%)",
                fontFamily: "var(--font-display)",
                fontSize: 11,
                letterSpacing: "0.3em",
                color: "rgba(255, 232, 168, 0.45)",
                textTransform: "uppercase",
                whiteSpace: "nowrap",
                pointerEvents: "none",
                textShadow: "0 1px 0 rgba(0,0,0,0.6)",
              }}
            >
              ★ Blackjack pays 3:2 ★ Insurance pays 2:1 ★ Dealer must hit soft 17 ★
            </div>
            {/* Dealer */}
            <div style={{ marginBottom: "var(--sp-5)" }}>
              <div className="row" style={{ marginBottom: "var(--sp-2)" }}>
                <span className="badge badge-crimson">DEALER</span>
                {round?.dealerHand && round.dealerHand.length > 0 && (
                  <TotalBadge value={
                    round.dealerHidden && round.dealerHand.length >= 2 ? null : round.dealerTotal
                  } />
                )}
              </div>
              <div className="row" style={{ gap: "var(--sp-2)" }}>
                {(round?.dealerHand ?? []).length === 0 ? (
                  <>
                    <PlayingCard faceDown size="lg" />
                    <PlayingCard faceDown size="lg" />
                  </>
                ) : (
                  round!.dealerHand.map((c, i) => (
                    <DealCard
                      key={`dealer-${i}-${(c.rank as string) === "?" ? "back" : c.rank + c.suit}`}
                      rank={c.rank as Rank | "?"}
                      suit={c.suit as Suit | "?"}
                      faceDown={(c.rank as string) === "?"}
                      index={i}
                      isDealerHole={i === 1}
                      revealKey={revealHole}
                      size="lg"
                    />
                  ))
                )}
              </div>
            </div>

            {/* Seats */}
            <div style={{ display: "grid", gap: "var(--sp-3)", position: "relative", zIndex: 1 }}>
              {seats.length === 0 && (
                <p className="text-mute" style={{ color: "var(--parchment-200)" }}>
                  Waiting for players to bet...
                </p>
              )}
              {seats.map((seat) => {
                const tag = tagFor(seat.userId);
                const isCurrent = round?.currentUserId === seat.userId;
                const isMineRow = seat.userId === me;
                return (
                  <div
                    key={seat.userId}
                    style={{
                      background: isMineRow ? "var(--gold-100)" : "var(--parchment-100)",
                      border: isCurrent ? "4px solid var(--gold-300)" : "3px solid var(--ink-900)",
                      padding: "var(--sp-3)",
                      display: "flex",
                      alignItems: "center",
                      gap: "var(--sp-3)",
                      boxShadow: isCurrent ? "var(--glow-gold)" : "var(--bevel-light)",
                      transition: "border-color 200ms, box-shadow 200ms",
                    }}
                  >
                    <div
                      className="avatar avatar-sm"
                      style={{ background: tag?.avatarColor ?? "var(--gold-300)", fontSize: 12, width: 28, height: 28, borderWidth: 2 }}
                    >
                      {tag?.initials ?? "??"}
                    </div>
                    <div style={{ minWidth: 100, fontFamily: "var(--font-display)" }}>
                      <div style={{ fontSize: 14 }}>{tag?.username ?? "Player"}{isMineRow && <span className="tag-new" style={{ marginLeft: 4 }}>YOU</span>}</div>
                      <div style={{ fontSize: 12, color: "var(--saddle-400)" }}>
                        Bet {seat.bet.toLocaleString()}{seat.doubled && " ×2"}
                      </div>
                    </div>
                    <div className="row" style={{ gap: 6 }}>
                      {seat.hand.length === 0 ? <span className="text-mute">—</span> :
                        seat.hand.map((c, i) => (
                          <DealCard
                            key={`seat-${seat.userId}-${i}-${c.rank}${c.suit}`}
                            rank={c.rank as Rank}
                            suit={c.suit as Suit}
                            faceDown={false}
                            index={i}
                            isDealerHole={false}
                            size="md"
                          />
                        ))
                      }
                    </div>
                    <div style={{ marginLeft: "auto", textAlign: "right", fontFamily: "var(--font-display)" }}>
                      <div style={{ fontSize: 18 }}>{seat.handTotal || ""}</div>
                      <div style={{ fontSize: 11, color: tone(seat.status) }}>{statusLabel(seat)}</div>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Result stamp + confetti, anchored to the felt */}
            {allMineDone && stampStatus !== "pending" && (
              <ResultStamp
                key={stampKey}
                kind={stampStatus}
                netLabel={
                  stampStatus === "win" || stampStatus === "blackjack"
                    ? `+${net.toLocaleString()} ¢`
                    : stampStatus === "push"
                    ? "Stake returned"
                    : `${net.toLocaleString()} ¢`
                }
              />
            )}
            {allMineDone && (stampStatus === "win" || stampStatus === "blackjack") && (
              <Confetti key={`confetti-${confettiKey}`} />
            )}
          </div>

          {error && <p style={{ color: "var(--crimson-500)", marginTop: "var(--sp-3)" }}>{error}</p>}
        </div>

        <div className="panel" style={{ padding: "var(--sp-5)" }}>
          <div className="panel-title">
            {isMyTurn ? "Your Move" : isBetting && !mySeat ? "Place Your Bet" : "This Round"}
          </div>

          {isMyTurn && mySeat ? (
            <div className="stack-lg">
              <p className="text-mute">
                Hand: <b>{mySeat.handTotal}</b> · Dealer shows <b>{round?.dealerTotal ?? "—"}</b>
                {mySeats.length > 1 && (
                  <span> · Hand {mySeats.findIndex((s) => s.status === "playing") + 1} of {mySeats.length}</span>
                )}
              </p>
              <div className="row" style={{ gap: "var(--sp-2)", flexWrap: "wrap" }}>
                <BjActionButton
                  kind="hit"
                  label="Hit"
                  icon="+"
                  onClick={() => action("hit")}
                  busy={busy}
                />
                <BjActionButton
                  kind="stand"
                  label="Stand"
                  icon="✋"
                  onClick={() => action("stand")}
                  busy={busy}
                />
              </div>
              {(canDouble || canSplit) && (
                <div className="row" style={{ gap: "var(--sp-2)", flexWrap: "wrap" }}>
                  {canDouble && (
                    <BjActionButton
                      kind="double"
                      label="Double"
                      icon="×2"
                      sub={`+${mySeat.bet.toLocaleString()} ¢`}
                      onClick={() => action("double")}
                      busy={busy}
                    />
                  )}
                  {canSplit && (
                    <BjActionButton
                      kind="split"
                      label="Split"
                      icon="⫼"
                      sub={`+${mySeat.bet.toLocaleString()} ¢`}
                      onClick={() => action("split")}
                      busy={busy}
                    />
                  )}
                </div>
              )}
            </div>
          ) : mySeats.length === 0 && isBetting ? (
            <div className="stack-lg">
              <BetInput value={bet} onChange={setBet} max={Math.max(100, balance ?? 100)} disabled={busy} />
              <button
                className="btn btn-lg btn-block"
                onClick={placeBet}
                disabled={busy || bet < 100 || (balance != null && balance < bet)}
              >
                {busy ? "..." : `Sit Down (${bet.toLocaleString()} ¢)`}
              </button>
              {/* Escape hatch — players who don't want to wait on the
                  shared 15s bet timer can pop over to the solo
                  blackjack room (instant pace, no shared dealer). */}
              <Link
                href="/games/blackjack"
                className="btn btn-ghost btn-sm btn-block"
                style={{ textDecoration: "none" }}
              >
                ↗ Play alone (solo table)
              </Link>
            </div>
          ) : mySeats.length > 0 ? (
            <div className="stack-lg">
              <p className="text-mute">
                {mySeats.length === 1 ? (
                  <>You bet <b>{mySeats[0].bet.toLocaleString()} ¢</b>{mySeats[0].doubled && " (doubled)"}</>
                ) : (
                  <>{mySeats.length} hands · total stake <b>{mySeats.reduce((sum, s) => sum + (s.doubled ? s.bet * 2 : s.bet), 0).toLocaleString()} ¢</b></>
                )}
              </p>
              <p style={{ color: tone(mySeat!.status) }}>{statusBlurb(mySeat!, round?.status)}</p>
              {allMineDone && (
                <p className="text-money" style={{ fontFamily: "var(--font-display)", fontSize: "var(--fs-h3)" }}>
                  {totalPayout <= 0
                    ? `Lost ${totalStake.toLocaleString()} ¢`
                    : net > 0
                    ? `+${net.toLocaleString()} ¢`
                    : net === 0
                    ? `Push · stake returned`
                    : `${net.toLocaleString()} ¢`}
                </p>
              )}
            </div>
          ) : (
            <div className="stack-lg">
              <p className="text-mute">
                {round?.status === "settled" ? "Round over. New round opens shortly." : "Watching this hand. Wait for the next betting window."}
              </p>
            </div>
          )}
        </div>
      </div>
    </>
  );
}

// ============================================================
// Big chunky action button — colour-coded per move so Hit/Stand/
// Double/Split each read at a glance instead of a row of look-alikes.
// ============================================================
type BjActionKind = "hit" | "stand" | "double" | "split";
const BJ_ACTION_THEME: Record<
  BjActionKind,
  { bg: string; bgEnd: string; fg: string; border: string; glow: string }
> = {
  hit:    { bg: "#3a8c2a", bgEnd: "#1f4f17", fg: "#fef6e4", border: "#0b1e08", glow: "rgba(110, 220, 100, 0.55)" },
  stand:  { bg: "#a85b1f", bgEnd: "#5a2e0c", fg: "#fef6e4", border: "#1a0f08", glow: "rgba(255, 168, 90, 0.5)" },
  double: { bg: "#e0a830", bgEnd: "#8a6210", fg: "#1a0f08", border: "#1a0f08", glow: "rgba(255, 220, 90, 0.7)" },
  split:  { bg: "#5a4cc0", bgEnd: "#2c2470", fg: "#fef6e4", border: "#1a0f08", glow: "rgba(160, 140, 255, 0.55)" },
};
function BjActionButton({
  kind,
  label,
  icon,
  sub,
  onClick,
  busy,
}: {
  kind: BjActionKind;
  label: string;
  icon: string;
  sub?: string;
  onClick: () => void;
  busy: boolean;
}) {
  const theme = BJ_ACTION_THEME[kind];
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={busy}
      className={`bj-action bj-action-${kind}`}
      style={{
        flex: 1,
        minWidth: 110,
        padding: "10px 14px 12px",
        background: `linear-gradient(180deg, ${theme.bg} 0%, ${theme.bgEnd} 100%)`,
        color: theme.fg,
        border: `3px solid ${theme.border}`,
        boxShadow: `inset 0 2px 0 rgba(255,255,255,0.25), inset 0 -3px 0 rgba(0,0,0,0.35), 0 4px 0 ${theme.border}, 0 0 14px ${theme.glow}`,
        fontFamily: "var(--font-display)",
        letterSpacing: "var(--ls-loose)",
        textTransform: "uppercase",
        cursor: busy ? "not-allowed" : "pointer",
        opacity: busy ? 0.55 : 1,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        gap: 2,
        transition: "transform 90ms ease, box-shadow 160ms ease, filter 160ms ease",
      }}
    >
      <span style={{ display: "inline-flex", gap: 6, alignItems: "baseline", fontSize: 18 }}>
        <span aria-hidden style={{ fontSize: 16 }}>{icon}</span>
        <span>{label}</span>
      </span>
      {sub && (
        <span style={{ fontSize: 10, opacity: 0.85, letterSpacing: "var(--ls-tight)", textTransform: "none" }}>
          {sub}
        </span>
      )}
    </button>
  );
}

// ============================================================
// Animated card with deal + hole-flip
// ============================================================
function DealCard({
  rank,
  suit,
  faceDown,
  index,
  isDealerHole,
  revealKey,
  size,
}: {
  rank: Rank | "?";
  suit: Suit | "?";
  faceDown: boolean;
  index: number;
  isDealerHole: boolean;
  revealKey?: number;
  size?: "sm" | "md" | "lg";
}) {
  const justRevealed = isDealerHole && !faceDown && (revealKey ?? 0) > 0;
  // Stagger only the first 2 cards in a hand. Hits (index 2+) appear quickly.
  const delay = justRevealed
    ? "0s"
    : index < 2
    ? `${0.18 + index * 0.32}s`
    : "0.05s";
  return (
    <span
      style={{
        display: "inline-block",
        transformOrigin: "center center",
        animation: justRevealed
          ? "bj-flip 0.85s cubic-bezier(0.2, 0.9, 0.3, 1) backwards"
          : "bj-deal 0.85s cubic-bezier(0.18, 0.85, 0.3, 1) backwards",
        animationDelay: delay,
      }}
    >
      <PlayingCard rank={rank} suit={suit} faceDown={faceDown} size={size} />
    </span>
  );
}

// ============================================================
// Total badge that pops on value change
// ============================================================
function TotalBadge({ value }: { value: number | null }) {
  const [pulse, setPulse] = useState(0);
  const prev = useRef<number | null>(null);
  useEffect(() => {
    if (value !== null && value !== prev.current) {
      setPulse((k) => k + 1);
    }
    prev.current = value;
  }, [value]);
  const display = value === null ? "?" : `${value}`;
  const bg =
    value === null ? "var(--saddle-500)" :
    value === 21 ? "var(--gold-300)" :
    value > 21 ? "var(--crimson-500)" :
    "var(--saddle-500)";
  const fg = value === 21 ? "var(--ink-900)" : "var(--parchment-50)";
  return (
    <span
      key={`pulse-${pulse}`}
      className="badge"
      style={{
        background: bg,
        color: fg,
        animation: pulse ? "bj-pulse 0.45s var(--ease-snap)" : undefined,
        boxShadow: value === 21 ? "var(--glow-gold)" : undefined,
      }}
    >
      {display}
    </span>
  );
}

// ============================================================
// Result stamp — slams into view after the round settles
// ============================================================
type ResultKind = "win" | "loss" | "push" | "blackjack" | "pending";
function ResultStamp({ kind, netLabel }: { kind: ResultKind; netLabel: string }) {
  if (kind === "pending") return null;
  const cfg = {
    win:       { bg: "var(--cactus-500)", fg: "var(--parchment-50)", label: "YOU WIN" },
    blackjack: { bg: "var(--gold-300)",   fg: "var(--ink-900)",      label: "BLACKJACK!" },
    push:      { bg: "var(--saddle-300)", fg: "var(--ink-900)",      label: "PUSH" },
    loss:      { bg: "var(--crimson-500)", fg: "var(--parchment-50)", label: "HOUSE WINS" },
  }[kind];
  const big = kind === "win" || kind === "blackjack";
  const isBlackjack = kind === "blackjack";
  return (
    <>
      {/* Starburst — radial gold rays behind a winning stamp so the
          blackjack moment of truth actually pops. */}
      {big && (
        <div
          aria-hidden
          style={{
            position: "absolute",
            top: "50%",
            left: "50%",
            width: 460,
            height: 460,
            transform: "translate(-50%, -50%)",
            background: isBlackjack
              ? "conic-gradient(from 0deg, rgba(255,232,160,0.85), rgba(255,200,60,0) 18%, rgba(255,232,160,0.85) 36%, rgba(255,200,60,0) 54%, rgba(255,232,160,0.85) 72%, rgba(255,200,60,0) 90%, rgba(255,232,160,0.85))"
              : "conic-gradient(from 0deg, rgba(180,255,150,0.7), rgba(80,200,80,0) 25%, rgba(180,255,150,0.7) 50%, rgba(80,200,80,0) 75%, rgba(180,255,150,0.7))",
            filter: "blur(6px)",
            animation: "bj-stamp-burst 1.6s ease-out 0.95s backwards",
            zIndex: 9,
            pointerEvents: "none",
          }}
        />
      )}
      <div
        style={{
          position: "absolute",
          top: "50%",
          left: "50%",
          transform: "translate(-50%, -50%) rotate(-12deg)",
          background: cfg.bg,
          color: cfg.fg,
          border: "6px solid var(--ink-900)",
          padding: "var(--sp-5) var(--sp-7)",
          fontFamily: "var(--font-display)",
          fontSize: big ? 56 : 40,
          letterSpacing: "var(--ls-loose)",
          textTransform: "uppercase",
          lineHeight: 1.05,
          boxShadow: big
            ? "var(--glow-gold), 10px 10px 0 var(--ink-900), 0 0 60px rgba(255,200,60,0.45)"
            : "10px 10px 0 var(--ink-900)",
          textShadow: isBlackjack ? "2px 2px 0 var(--gold-100), 0 0 16px rgba(255,200,60,0.6)" : "3px 3px 0 var(--ink-900)",
          animation: "bj-stamp 0.7s var(--ease-snap) backwards",
          animationDelay: "1s",
          zIndex: 10,
          pointerEvents: "none",
          textAlign: "center",
        }}
      >
        {cfg.label}
        <div style={{ fontSize: big ? 22 : 16, marginTop: 6, letterSpacing: "var(--ls-tight)" }}>
          {netLabel}
        </div>
      </div>
    </>
  );
}

// ============================================================
// Confetti burst — coins fall from the top after a win
// ============================================================
function Confetti() {
  // 60 mixed coin sprites + ribbon flecks falling from above the
  // felt. More density + mixed sizes reads as "loot" instead of
  // "a few pixels" once the result stamp lands.
  const pieces = Array.from({ length: 60 }, (_, i) => {
    const isRibbon = i % 5 === 0;
    return {
      id: i,
      left: Math.random() * 100,
      delay: 1.0 + Math.random() * 0.7,
      duration: 1.5 + Math.random() * 1.1,
      rotate: Math.random() * 360,
      size: isRibbon ? 6 + Math.random() * 6 : 12 + Math.random() * 14,
      isRibbon,
      color: isRibbon
        ? (i % 2 === 0 ? "#fef6e4" : "#a8d4ff")
        : (i % 3 === 0 ? "#f5c842" : i % 3 === 1 ? "#ffd84d" : "#c8941d"),
    };
  });
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
            width: p.isRibbon ? p.size : p.size,
            height: p.isRibbon ? p.size * 0.4 : p.size,
            background: p.color,
            border: p.isRibbon ? "1px solid rgba(0,0,0,0.4)" : "2px solid var(--ink-900)",
            borderRadius: p.isRibbon ? 2 : 999,
            boxShadow: p.isRibbon ? undefined : "inset 0 -3px 0 rgba(0,0,0,0.3), 0 0 6px rgba(255,200,60,0.4)",
            animation: `bj-coin-fall ${p.duration}s linear ${p.delay}s 1 forwards`,
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
const BJ_KEYFRAMES = `
@keyframes bj-deal {
  0% {
    transform: translate(320px, -360px) rotate(55deg) perspective(900px) rotateX(-65deg) scale(0.55);
    opacity: 0;
    filter: blur(3px);
  }
  20% { opacity: 1; filter: blur(0); }
  70% {
    transform: translate(-12px, 6px) rotate(-4deg) perspective(900px) rotateX(8deg) scale(1.08);
    box-shadow: 0 18px 24px rgba(0, 0, 0, 0.45);
  }
  88% {
    transform: translate(2px, -2px) rotate(2deg) perspective(900px) rotateX(-3deg) scale(0.97);
  }
  100% {
    transform: translate(0, 0) rotate(0) perspective(900px) rotateX(0) scale(1);
    opacity: 1;
  }
}
@keyframes bj-flip {
  0%   { transform: perspective(900px) rotateY(180deg) translateY(-32px) scale(1.06); }
  40%  { transform: perspective(900px) rotateY(95deg)  translateY(-16px) scale(1.10); }
  72%  { transform: perspective(900px) rotateY(15deg)  translateY(-2px)  scale(1.05); }
  100% { transform: perspective(900px) rotateY(0deg)   translateY(0)     scale(1); }
}
@keyframes bj-pulse {
  0%, 100% { transform: scale(1); }
  50% { transform: scale(1.22); }
}
@keyframes bj-shake {
  0%, 100% { transform: translateX(0); }
  18%, 62% { transform: translateX(-10px); }
  38%, 82% { transform: translateX(10px); }
}
@keyframes bj-stamp {
  0%   { transform: translate(-50%, -50%) rotate(-30deg) scale(3); opacity: 0; }
  55%  { transform: translate(-50%, -50%) rotate(-8deg)  scale(0.88); opacity: 1; }
  80%  { transform: translate(-50%, -50%) rotate(-16deg) scale(1.1); }
  100% { transform: translate(-50%, -50%) rotate(-12deg) scale(1); opacity: 1; }
}
@keyframes bj-coin-fall {
  0%   { transform: translateY(-20px) rotate(0deg); opacity: 1; }
  100% { transform: translateY(560px) rotate(720deg); opacity: 0; }
}
@keyframes bj-stamp-burst {
  0%   { transform: translate(-50%, -50%) scale(0.2); opacity: 0; }
  60%  { transform: translate(-50%, -50%) scale(1.4);  opacity: 0.85; }
  100% { transform: translate(-50%, -50%) scale(1.9);  opacity: 0; }
}
.bj-action:not(:disabled):hover,
.bj-action:not(:disabled):focus-visible {
  transform: translateY(-2px);
  filter: brightness(1.1) saturate(1.05);
  outline: none;
}
.bj-action:not(:disabled):active {
  transform: translateY(2px);
  filter: brightness(0.95);
}
`;

function labelStatus(s: RoundView["status"]) {
  return ({
    betting: "Betting open",
    dealing: "Dealing",
    player_turn: "Player turn",
    dealer_turn: "Dealer plays",
    settled: "Round over",
  } as const)[s];
}
function statusLabel(seat: SeatView) {
  return ({
    waiting: "WAITING",
    playing: "PLAYING",
    standing: "STAND",
    busted: "BUST",
    blackjack: "BLACKJACK!",
    done: seat.payout > 0
      ? `+${(seat.payout - (seat.doubled ? seat.bet * 2 : seat.bet)).toLocaleString()}`
      : "LOST",
  } as const)[seat.status];
}
function tone(status: SeatView["status"]) {
  if (status === "blackjack") return "var(--gold-500)";
  if (status === "busted") return "var(--crimson-500)";
  if (status === "standing") return "var(--cactus-500)";
  return "var(--saddle-400)";
}
function statusBlurb(seat: SeatView, roundStatus: RoundView["status"] | undefined) {
  if (seat.status === "waiting") return "Waiting for the deal...";
  if (seat.status === "blackjack") return "Blackjack! Waiting on dealer.";
  if (seat.status === "busted") return "Busted. Watching others play out.";
  if (seat.status === "standing") return "Standing. Waiting on the rest.";
  if (seat.status === "playing") return roundStatus === "player_turn" ? "Another player's turn..." : "Waiting on the deal.";
  if (seat.status === "done") return "Round complete.";
  return "";
}
function labelFor(code: string) {
  const m: Record<string, string> = {
    insufficient_funds: "Not enough Coins.",
    bet_too_low: "Bet must be at least 100.",
    no_round: "No active round.",
    betting_closed: "Betting closed.",
    already_seated: "You're already in this round.",
    not_player_turn: "Wait for your turn.",
    not_your_turn: "Not your turn.",
    no_active_seat: "No active hand.",
    cant_double: "Can only double on a 2-card hand.",
    cant_split: "Can only split a pair of equal-rank cards.",
    deck_empty: "Deck ran out — try again.",
  };
  return m[code] ?? "Something went wrong.";
}
