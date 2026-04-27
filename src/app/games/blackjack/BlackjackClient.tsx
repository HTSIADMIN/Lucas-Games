"use client";

import { useEffect, useRef, useState } from "react";
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

type DealerCell = Card | { rank: "?"; suit: "?" };

type Hand = {
  sessionId: string;
  player: Card[];
  dealer: DealerCell[];
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
  player_blackjack: "Blackjack!",
  push: "Push",
  win: "You win",
  loss: "House wins",
};

const STATUS_BG: Record<Status, string> = {
  player_turn: "var(--saddle-500)",
  dealer_turn: "var(--saddle-500)",
  player_bust: "var(--crimson-500)",
  dealer_bust: "var(--cactus-500)",
  player_blackjack: "var(--gold-300)",
  push: "var(--saddle-300)",
  win: "var(--cactus-500)",
  loss: "var(--crimson-500)",
};

// Status helpers
function isWin(s: Status) { return s === "win" || s === "dealer_bust" || s === "player_blackjack"; }
function isLoss(s: Status) { return s === "loss" || s === "player_bust"; }
function isSettled(s: Status) { return s !== "player_turn" && s !== "dealer_turn"; }

export function BlackjackClient() {
  const router = useRouter();
  const [bet, setBet] = useState(1_000);
  const [hand, setHand] = useState<Hand | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [balance, setBalance] = useState<number | null>(null);
  // Detected animation cues
  const [revealHole, setRevealHole] = useState(0);    // bumps when dealer hole flips
  const [shake, setShake] = useState(0);              // bumps on bust
  const [confettiKey, setConfettiKey] = useState(0);  // re-key confetti for win
  const [stampKey, setStampKey] = useState(0);        // re-key result stamp animation
  const prevStatusRef = useRef<Status | null>(null);
  const prevPlayerTotal = useRef<number>(0);
  const prevDealerTotal = useRef<number>(0);
  const [pulsePlayer, setPulsePlayer] = useState(0);
  const [pulseDealer, setPulseDealer] = useState(0);

  useEffect(() => {
    fetch("/api/auth/me").then((r) => r.json()).then((d) => setBalance(d.balance ?? null));
  }, []);

  // React to hand state transitions to trigger animation cues.
  useEffect(() => {
    if (!hand) {
      prevStatusRef.current = null;
      prevPlayerTotal.current = 0;
      prevDealerTotal.current = 0;
      return;
    }
    const prev = prevStatusRef.current;
    const cur = hand.status;
    // Hole-card reveal: any time the second dealer card's rank is no longer "?"
    if (prev === "player_turn" && cur !== "player_turn") {
      setRevealHole((k) => k + 1);
    }
    // Settle cues
    if (prev !== cur && isSettled(cur) && (prev === null || !isSettled(prev))) {
      setStampKey((k) => k + 1);
      if (isWin(cur)) setConfettiKey((k) => k + 1);
      if (isLoss(cur)) setShake((k) => k + 1);
    }
    // Total pulse on change
    if (hand.playerTotal !== prevPlayerTotal.current && hand.playerTotal > 0) {
      setPulsePlayer((k) => k + 1);
    }
    if (hand.dealerTotal !== prevDealerTotal.current && hand.dealerTotal > 0) {
      setPulseDealer((k) => k + 1);
    }
    prevStatusRef.current = cur;
    prevPlayerTotal.current = hand.playerTotal;
    prevDealerTotal.current = hand.dealerTotal;
  }, [hand]);

  async function deal() {
    setBusy(true);
    setError(null);
    setHand(null);
    setShake(0);
    setStampKey(0);
    setConfettiKey(0);
    setRevealHole(0);
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
  const settled = hand && isSettled(hand.status);

  return (
    <>
      <style>{BLACKJACK_KEYFRAMES}</style>
      <div className="stack-lg" style={{ gap: "var(--sp-4)" }}>
        {/* === Felt === */}
        <div className="panel" style={{ padding: 0, overflow: "hidden", position: "relative" }}>
          <Felt
            hand={hand}
            shake={shake}
            revealHole={revealHole}
            pulsePlayer={pulsePlayer}
            pulseDealer={pulseDealer}
          />
          {hand && settled && (
            <ResultStamp key={stampKey} status={hand.status} payout={hand.payout} bet={hand.bet} doubled={hand.doubled} />
          )}
          {hand && isWin(hand.status) && <Confetti key={confettiKey} />}
        </div>

        {/* === Action bar === */}
        <div className="panel" style={{ padding: "var(--sp-5)" }}>
          <div className="panel-title">{inHand ? "Your Move" : "Place Your Bet"}</div>
          {inHand && hand ? (
            <div className="stack-lg">
              <div className="row" style={{ gap: "var(--sp-2)", flexWrap: "wrap" }}>
                <ActionButton kind="hit" onClick={() => action("hit")} busy={busy} />
                <ActionButton kind="stand" onClick={() => action("stand")} busy={busy} />
                {hand.canDouble && (balance == null || balance >= hand.bet) && (
                  <ActionButton kind="double" amount={hand.bet} onClick={() => action("double")} busy={busy} />
                )}
              </div>
              <p className="text-mute" style={{ fontSize: 13 }}>
                You sit on <b>{hand.playerTotal}</b>. Dealer shows <b>{hand.dealerTotal}</b>.
              </p>
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
          {error && <p style={{ color: "var(--crimson-500)", marginTop: "var(--sp-3)" }}>{labelFor(error)}</p>}
        </div>
      </div>
    </>
  );
}

// ============================================================
// Felt — the table itself, dealer up top, player at bottom.
// ============================================================
function Felt({
  hand,
  shake,
  revealHole,
  pulsePlayer,
  pulseDealer,
}: {
  hand: Hand | null;
  shake: number;
  revealHole: number;
  pulsePlayer: number;
  pulseDealer: number;
}) {
  return (
    <div
      style={{
        position: "relative",
        background:
          "radial-gradient(circle at 50% 50%, #2d5b22, #1f3818)",
        padding: "var(--sp-4) var(--sp-4)",
        minHeight: 320,
        display: "flex",
        flexDirection: "column",
        justifyContent: "space-between",
        gap: "var(--sp-5)",
        boxShadow: "inset 0 0 60px rgba(0, 0, 0, 0.7)",
        animation: shake > 0 ? `bj-shake 0.5s var(--ease-snap)` : undefined,
      }}
      key={`felt-${shake}`}
    >
      {/* Felt arc detail (semicircle by the dealer) */}
      <div
        aria-hidden
        style={{
          position: "absolute",
          top: 64,
          left: "50%",
          transform: "translateX(-50%)",
          width: 540,
          maxWidth: "92%",
          height: 220,
          border: "3px dashed rgba(255, 232, 168, 0.18)",
          borderTop: 0,
          borderLeft: 0,
          borderRight: 0,
          borderRadius: "0 0 50% 50% / 0 0 100% 100%",
          pointerEvents: "none",
        }}
      />

      {/* Dealer row */}
      <HandRow
        title="DEALER"
        titleBg="var(--crimson-500)"
        cards={hand?.dealer ?? null}
        total={hand && hand.status !== "player_turn" ? hand.dealerTotal : null}
        pulseKey={pulseDealer}
        revealKey={revealHole}
        align="top"
      />

      {/* Center: deck + bet chip */}
      {hand && (
        <div
          style={{
            position: "absolute",
            left: "50%",
            top: "50%",
            transform: "translate(-50%, -50%)",
            display: "flex",
            alignItems: "center",
            gap: "var(--sp-3)",
            opacity: 0.9,
            pointerEvents: "none",
          }}
        >
          <Deck />
          {hand && (
            <div
              style={{
                background: "var(--gold-300)",
                color: "var(--ink-900)",
                border: "3px solid var(--ink-900)",
                padding: "4px 10px",
                fontFamily: "var(--font-display)",
                fontSize: 14,
                letterSpacing: "var(--ls-loose)",
                boxShadow: "var(--bevel-light), 0 4px 0 var(--gold-700)",
                animation: hand.doubled ? "bj-pulse 0.6s var(--ease-snap) infinite alternate" : undefined,
              }}
            >
              BET {hand.bet.toLocaleString()}{hand.doubled ? " ×2" : ""}
            </div>
          )}
        </div>
      )}

      {/* Player row */}
      <HandRow
        title="YOU"
        titleBg="var(--gold-300)"
        titleFg="var(--ink-900)"
        cards={hand?.player ?? null}
        total={hand?.playerTotal ?? null}
        pulseKey={pulsePlayer}
        align="bottom"
        doubled={hand?.doubled}
      />
    </div>
  );
}

function HandRow({
  title,
  titleBg,
  titleFg = "var(--parchment-50)",
  cards,
  total,
  pulseKey,
  revealKey,
  align,
  doubled,
}: {
  title: string;
  titleBg: string;
  titleFg?: string;
  cards: (Card | DealerCell)[] | null;
  total: number | null;
  pulseKey: number;
  revealKey?: number;
  align: "top" | "bottom";
  doubled?: boolean;
}) {
  const totalColor =
    total === null ? "var(--saddle-500)" :
    total === 21 ? "var(--gold-300)" :
    total > 21 ? "var(--crimson-500)" :
    "var(--saddle-500)";
  const totalFg = total === 21 ? "var(--ink-900)" : "var(--parchment-50)";
  return (
    <div style={{ position: "relative", zIndex: 1 }}>
      <div
        className="row"
        style={{
          gap: "var(--sp-2)",
          marginBottom: align === "top" ? "var(--sp-2)" : 0,
          marginTop: align === "bottom" ? "var(--sp-2)" : 0,
          flexDirection: align === "bottom" ? "row-reverse" : "row",
        }}
      >
        <span
          style={{
            background: titleBg,
            color: titleFg,
            border: "3px solid var(--ink-900)",
            padding: "3px 10px",
            fontFamily: "var(--font-display)",
            fontSize: 14,
            letterSpacing: "var(--ls-loose)",
            boxShadow: "var(--bevel-light)",
          }}
        >
          {title}
        </span>
        {total !== null && (
          <span
            key={`pulse-${pulseKey}`}
            style={{
              background: totalColor,
              color: totalFg,
              border: "3px solid var(--ink-900)",
              padding: "3px 12px",
              fontFamily: "var(--font-display)",
              fontSize: 18,
              letterSpacing: "var(--ls-tight)",
              minWidth: 44,
              textAlign: "center",
              animation: pulseKey ? "bj-pulse 0.45s var(--ease-snap)" : undefined,
              boxShadow: total === 21 ? "var(--glow-gold)" : undefined,
            }}
          >
            {total}
          </span>
        )}
        {doubled && (
          <span
            style={{
              background: "var(--crimson-500)",
              color: "var(--parchment-50)",
              border: "3px solid var(--ink-900)",
              padding: "3px 8px",
              fontFamily: "var(--font-display)",
              fontSize: 12,
            }}
          >
            ×2
          </span>
        )}
      </div>
      <div
        className="row"
        style={{
          gap: "var(--sp-2)",
          justifyContent: "center",
          flexWrap: "wrap",
          minHeight: 110,
        }}
      >
        {cards
          ? cards.map((c, i) => (
              <DealCard
                key={`${title}-${i}-${c.rank === "?" ? "back" : c.rank + c.suit}`}
                rank={c.rank as Card["rank"] | "?"}
                suit={c.suit as Card["suit"] | "?"}
                faceDown={c.rank === "?"}
                index={i}
                isDealerHole={title === "DEALER" && i === 1}
                revealKey={revealKey}
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
  );
}

// Card with deal-from-deck slide animation. The dealer's hole card also
// flips in place when its data flips from "?" to a real rank/suit.
function DealCard({
  rank,
  suit,
  faceDown,
  index,
  isDealerHole,
  revealKey,
}: {
  rank: Card["rank"] | "?";
  suit: Card["suit"] | "?";
  faceDown: boolean;
  index: number;
  isDealerHole: boolean;
  revealKey?: number;
}) {
  const justRevealed = isDealerHole && !faceDown && (revealKey ?? 0) > 0;
  return (
    <span
      style={{
        display: "inline-block",
        transformOrigin: "center center",
        animation: justRevealed
          ? "bj-flip 0.85s cubic-bezier(0.2, 0.9, 0.3, 1) backwards"
          : `bj-deal 0.85s cubic-bezier(0.18, 0.85, 0.3, 1) backwards`,
        animationDelay: justRevealed ? "0s" : `${0.18 + index * 0.32}s`,
      }}
    >
      <PlayingCard rank={rank} suit={suit} faceDown={faceDown} />
    </span>
  );
}

// ============================================================
// Deck illustration (small, decorative)
// ============================================================
function Deck() {
  return (
    <div
      style={{
        position: "relative",
        width: 60,
        height: 84,
      }}
    >
      {[0, 1, 2].map((i) => (
        <span
          key={i}
          style={{
            position: "absolute",
            left: i * 2,
            top: i * 2,
            width: 56,
            height: 80,
            background: "var(--saddle-500)",
            border: "3px solid var(--ink-900)",
            backgroundImage:
              "repeating-linear-gradient(45deg, var(--saddle-400) 0 6px, var(--saddle-600) 6px 12px)",
            boxShadow: "var(--bevel-light)",
          }}
        />
      ))}
    </div>
  );
}

// ============================================================
// Result stamp — slams into view when the hand settles.
// ============================================================
function ResultStamp({
  status,
  payout,
  bet,
  doubled,
}: {
  status: Status;
  payout: number | null;
  bet: number;
  doubled: boolean;
}) {
  const cost = doubled ? bet * 2 : bet;
  const net = payout != null ? payout - cost : 0;
  const big = isWin(status);
  return (
    <div
      style={{
        position: "absolute",
        top: "50%",
        left: "50%",
        transform: "translate(-50%, -50%) rotate(-12deg)",
        background: STATUS_BG[status],
        color: status === "player_blackjack" ? "var(--ink-900)" : "var(--parchment-50)",
        border: "5px solid var(--ink-900)",
        padding: "var(--sp-4) var(--sp-6)",
        fontFamily: "var(--font-display)",
        fontSize: big ? 48 : 36,
        letterSpacing: "var(--ls-loose)",
        textTransform: "uppercase",
        boxShadow: big ? "var(--glow-gold), 8px 8px 0 var(--ink-900)" : "8px 8px 0 var(--ink-900)",
        textShadow: status === "player_blackjack" ? "2px 2px 0 var(--gold-100)" : "3px 3px 0 var(--ink-900)",
        animation: "bj-stamp 0.7s var(--ease-snap) backwards",
        animationDelay: "1.2s",
        zIndex: 10,
        pointerEvents: "none",
        textAlign: "center",
      }}
    >
      {STATUS_LABEL[status]}
      {payout !== null && payout > 0 && (
        <div
          style={{
            fontSize: 18,
            marginTop: 4,
            letterSpacing: "var(--ls-tight)",
          }}
        >
          +{net.toLocaleString()} ¢
        </div>
      )}
    </div>
  );
}

// ============================================================
// Confetti — gold coins falling from the top after a win.
// ============================================================
function Confetti() {
  // Delay the burst until just after the result stamp has slammed in.
  const pieces = Array.from({ length: 32 }, (_, i) => ({
    id: i,
    left: Math.random() * 100,
    delay: 1.4 + Math.random() * 0.5,
    duration: 1.6 + Math.random() * 0.9,
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
            animation: `bj-coin-fall ${p.duration}s linear ${p.delay}s 1 forwards`,
            transform: `rotate(${p.rotate}deg)`,
          }}
        />
      ))}
    </div>
  );
}

// ============================================================
// Action button with kind-specific styling.
// ============================================================
function ActionButton({
  kind,
  amount,
  onClick,
  busy,
}: {
  kind: "hit" | "stand" | "double";
  amount?: number;
  onClick: () => void;
  busy: boolean;
}) {
  const labels = {
    hit:    "Hit",
    stand:  "Stand",
    double: amount ? `Double (+${amount.toLocaleString()})` : "Double",
  };
  const cls = kind === "stand" ? "btn btn-wood" : kind === "double" ? "btn btn-danger" : "btn";
  return (
    <button
      className={`${cls}`}
      onClick={onClick}
      disabled={busy}
      style={{
        flex: 1,
        minWidth: 100,
      }}
    >
      {labels[kind]}
    </button>
  );
}

// ============================================================
// Keyframes (scoped via a <style> tag inside the component tree).
// ============================================================
const BLACKJACK_KEYFRAMES = `
/* Card flies in from the deck position (top-right of the felt), tumbles
   through a tilt, and slams flat onto the table with a small overshoot
   bounce. perspective + rotateX gives the "card landing flat" feel. */
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
/* Hole-card flip — Y-axis rotation with a slight upward lift so the card
   visibly leaves the felt for the flip and resettles. */
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
  100% { transform: translateY(520px) rotate(720deg); opacity: 0; }
}
`;

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
