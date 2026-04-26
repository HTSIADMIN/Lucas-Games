"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { BetInput } from "@/components/BetInput";
import { PlayingCard } from "@/components/PlayingCard";
import type { Card } from "@/lib/games/cards";

type Status =
  | "player_turn"
  | "dealer_turn"
  | "player_bust"
  | "dealer_bust"
  | "player_blackjack"
  | "push"
  | "win"
  | "loss";

type Hand = {
  sessionId: string;
  player: Card[];
  dealer: (Card | { rank: "?"; suit: "?" })[];
  playerTotal: number;
  dealerTotal: number;
  status: Status;
  bet: number;
  doubled: boolean;
  canDouble: boolean;
  payout: number | null;
  balance: number;
};

const STATUS_LABEL: Record<Status, string> = {
  player_turn: "Your move",
  dealer_turn: "Dealer plays...",
  player_bust: "Bust!",
  dealer_bust: "Dealer busts — you win!",
  player_blackjack: "Blackjack! 3:2",
  push: "Push",
  win: "You win",
  loss: "You lose",
};

const STATUS_COLOR: Record<Status, string> = {
  player_turn: "var(--saddle-500)",
  dealer_turn: "var(--saddle-500)",
  player_bust: "var(--crimson-500)",
  dealer_bust: "var(--cactus-500)",
  player_blackjack: "var(--gold-500)",
  push: "var(--saddle-300)",
  win: "var(--cactus-500)",
  loss: "var(--crimson-500)",
};

export function BlackjackClient() {
  const router = useRouter();
  const [bet, setBet] = useState(1_000);
  const [hand, setHand] = useState<Hand | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [balance, setBalance] = useState<number | null>(null);

  useEffect(() => {
    fetch("/api/auth/me").then((r) => r.json()).then((d) => setBalance(d.balance ?? null));
  }, []);

  async function deal() {
    setBusy(true);
    setError(null);
    setHand(null);
    const res = await fetch("/api/games/blackjack/deal", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ bet }),
    });
    const data = await res.json();
    setBusy(false);
    if (!res.ok) {
      setError(data.error ?? "error");
      return;
    }
    setHand(data);
    setBalance(data.balance);
    router.refresh();
  }

  async function action(act: "hit" | "stand" | "double") {
    if (!hand) return;
    setBusy(true);
    setError(null);
    const res = await fetch(`/api/games/blackjack/${hand.sessionId}/action`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ action: act }),
    });
    const data = await res.json();
    setBusy(false);
    if (!res.ok) {
      setError(data.error ?? "error");
      return;
    }
    setHand(data);
    setBalance(data.balance);
    router.refresh();
  }

  const inHand = hand && hand.status === "player_turn";
  const settled = hand && hand.status !== "player_turn" && hand.status !== "dealer_turn";

  return (
    <div className="grid grid-2" style={{ alignItems: "start" }}>
      <div className="panel" style={{ padding: "var(--sp-6)" }}>
        <div className="panel-title">The Felt</div>

        <div
          style={{
            background: "var(--cactus-700)",
            border: "4px solid var(--ink-900)",
            padding: "var(--sp-6)",
            minHeight: 400,
            display: "flex",
            flexDirection: "column",
            justifyContent: "space-between",
            gap: "var(--sp-5)",
          }}
        >
          <div>
            <div className="row" style={{ marginBottom: "var(--sp-3)" }}>
              <span className="badge badge-crimson">DEALER</span>
              {hand && (
                <span className="badge">
                  {STATUS_LABEL[hand.status] === "Your move" ? "?" : hand.dealerTotal}
                </span>
              )}
            </div>
            <div className="row" style={{ gap: "var(--sp-2)" }}>
              {hand
                ? hand.dealer.map((c, i) => (
                    <PlayingCard
                      key={i}
                      rank={c.rank as Card["rank"] | "?"}
                      suit={c.suit as Card["suit"] | "?"}
                      faceDown={c.rank === "?"}
                    />
                  ))
                : (
                  <>
                    <PlayingCard faceDown />
                    <PlayingCard faceDown />
                  </>
                )}
            </div>
          </div>

          <div>
            <div className="row" style={{ marginBottom: "var(--sp-3)" }}>
              <span className="badge badge-gold">YOU</span>
              {hand && <span className="badge">{hand.playerTotal}</span>}
              {hand?.doubled && <span className="badge badge-crimson">DOUBLED</span>}
            </div>
            <div className="row" style={{ gap: "var(--sp-2)" }}>
              {hand
                ? hand.player.map((c, i) => (
                    <PlayingCard key={i} rank={c.rank as Card["rank"]} suit={c.suit as Card["suit"]} />
                  ))
                : (
                  <>
                    <PlayingCard faceDown />
                    <PlayingCard faceDown />
                  </>
                )}
            </div>
          </div>
        </div>

        {settled && hand && (
          <div
            className="sign"
            style={{
              marginTop: "var(--sp-5)",
              display: "block",
              textAlign: "center",
              background: STATUS_COLOR[hand.status],
              color: hand.status === "player_blackjack" ? "var(--ink-900)" : "var(--parchment-50)",
            }}
          >
            {STATUS_LABEL[hand.status]}
            {hand.payout !== null && hand.payout > 0 && ` · Bet ${hand.bet.toLocaleString()} → +${(hand.payout - (hand.doubled ? hand.bet * 2 : hand.bet)).toLocaleString()} ¢`}
          </div>
        )}

        {error && <p style={{ color: "var(--crimson-500)", marginTop: "var(--sp-3)" }}>{labelFor(error)}</p>}
      </div>

      <div className="panel" style={{ padding: "var(--sp-6)" }}>
        <div className="panel-title">{inHand ? "Your Move" : "Place Your Bet"}</div>

        {inHand && hand ? (
          <div className="stack-lg">
            <p className="text-mute">
              You have <b>{hand.playerTotal}</b>. Dealer shows <b>{hand.dealerTotal}</b>.
            </p>
            <div className="row" style={{ flexWrap: "wrap" }}>
              <button className="btn btn-block" onClick={() => action("hit")} disabled={busy}>
                Hit
              </button>
              <button className="btn btn-wood btn-block" onClick={() => action("stand")} disabled={busy}>
                Stand
              </button>
            </div>
            {hand.canDouble && (balance == null || balance >= hand.bet) && (
              <button
                className="btn btn-danger btn-block"
                onClick={() => action("double")}
                disabled={busy}
              >
                Double Down (+{hand.bet.toLocaleString()} ¢)
              </button>
            )}
          </div>
        ) : (
          <div className="stack-lg">
            <BetInput value={bet} onChange={setBet} max={Math.max(100, balance ?? 100)} disabled={busy} />
            <button
              className="btn btn-lg btn-block"
              onClick={deal}
              disabled={busy || bet < 100 || (balance != null && balance < bet)}
            >
              {busy ? "Dealing..." : settled ? "Deal Again" : "Deal"}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

function labelFor(code: string) {
  const labels: Record<string, string> = {
    insufficient_funds: "Not enough Coins.",
    bet_too_low: "Bet must be at least 100.",
    session_not_found: "Hand expired. Deal again.",
    not_player_turn: "Not your turn.",
    already_settled: "Hand already done.",
  };
  return labels[code] ?? "Something went wrong.";
}
