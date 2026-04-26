"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { BetInput } from "@/components/BetInput";
import { PlayingCard } from "@/components/PlayingCard";
import { useLive } from "@/components/social/LiveProvider";
import type { Card, Rank, Suit } from "@/lib/games/cards";

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
  useEffect(() => {
    refreshState();
    const t = setInterval(refreshState, POLL_MS);
    const tick = setInterval(() => force((n) => n + 1), 250); // re-render countdowns
    return () => { clearInterval(t); clearInterval(tick); };
  }, []);

  async function placeBet() {
    setBusy(true); setError(null);
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
  // The actively-playing hand for the current user (after split, there may be multiple).
  const mySeat = mySeats.find((s) => s.status === "playing") ?? mySeats[0];
  const isMyTurn = round?.status === "player_turn" && round.currentUserId === me && mySeat?.status === "playing";
  const isBetting = round?.status === "betting";

  // Split-eligibility check (same value, fresh 2-card hand).
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

  return (
    <div className="grid grid-2" style={{ alignItems: "start" }}>
      <div className="panel" style={{ padding: "var(--sp-6)" }}>
        <div className="panel-title">
          {round ? `Round #${round.roundNo} · ${labelStatus(round.status)}` : "Loading..."}
          {(isBetting || round?.status === "player_turn") && secondsLeft > 0 && (
            <span style={{ marginLeft: 12, color: "var(--crimson-500)" }}>· {secondsLeft}s</span>
          )}
        </div>

        {/* Felt */}
        <div
          style={{
            background: "var(--cactus-700)",
            border: "4px solid var(--ink-900)",
            padding: "var(--sp-5)",
            minHeight: 360,
          }}
        >
          {/* Dealer */}
          <div style={{ marginBottom: "var(--sp-5)" }}>
            <div className="row" style={{ marginBottom: "var(--sp-2)" }}>
              <span className="badge badge-crimson">DEALER</span>
              {round?.dealerHand && round.dealerHand.length > 0 && (
                <span className="badge">
                  {round.dealerHidden && round.dealerHand.length >= 2 ? "?" : round.dealerTotal}
                </span>
              )}
            </div>
            <div className="row" style={{ gap: "var(--sp-2)" }}>
              {(round?.dealerHand ?? []).length === 0 ? (
                <>
                  <PlayingCard faceDown />
                  <PlayingCard faceDown />
                </>
              ) : (
                round!.dealerHand.map((c, i) => (
                  <PlayingCard
                    key={i}
                    rank={c.rank as Rank | "?"}
                    suit={c.suit as Suit | "?"}
                    faceDown={c.rank === ("?" as Rank | "?")}
                  />
                ))
              )}
            </div>
          </div>

          {/* Seats */}
          <div style={{ display: "grid", gap: "var(--sp-3)" }}>
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
                  <div className="row" style={{ gap: 4 }}>
                    {seat.hand.length === 0 ? <span className="text-mute">—</span> :
                      seat.hand.map((c, i) => (
                        <PlayingCard key={i} rank={c.rank as Rank} suit={c.suit as Suit} size="sm" />
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
        </div>

        {error && <p style={{ color: "var(--crimson-500)", marginTop: "var(--sp-3)" }}>{error}</p>}
      </div>

      <div className="panel" style={{ padding: "var(--sp-6)" }}>
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
            <div className="row" style={{ flexWrap: "wrap" }}>
              <button className="btn btn-block" onClick={() => action("hit")} disabled={busy}>Hit</button>
              <button className="btn btn-wood btn-block" onClick={() => action("stand")} disabled={busy}>Stand</button>
            </div>
            <div className="row" style={{ flexWrap: "wrap" }}>
              {canDouble && (
                <button className="btn btn-danger btn-block" onClick={() => action("double")} disabled={busy}>
                  Double (+{mySeat.bet.toLocaleString()} ¢)
                </button>
              )}
              {canSplit && (
                <button className="btn btn-success btn-block" onClick={() => action("split")} disabled={busy}>
                  Split (+{mySeat.bet.toLocaleString()} ¢)
                </button>
              )}
            </div>
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
            {mySeats.every((s) => s.status === "done") && (
              <p className="text-money" style={{ fontFamily: "var(--font-display)", fontSize: "var(--fs-h3)" }}>
                {(() => {
                  const totalPayout = mySeats.reduce((sum, s) => sum + s.payout, 0);
                  return totalPayout > 0 ? `+${totalPayout.toLocaleString()} ¢` : "Lost the bet";
                })()}
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
  );
}

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
    done: seat.payout > 0 ? `+${seat.payout.toLocaleString()}` : "LOST",
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
