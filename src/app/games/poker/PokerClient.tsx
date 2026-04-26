"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { PlayingCard } from "@/components/PlayingCard";
import type { Card, Rank, Suit } from "@/lib/games/cards";

const POLL_MS = 1000;

type Seat = {
  seatNo: number;
  userId: string | null;
  username: string | null;
  avatarColor: string | null;
  initials: string | null;
  stack: number;
  folded: boolean;
  isAllIn: boolean;
  inHand: boolean;
  committedThisRound: number;
  committedTotal: number;
  lastAction: string | null;
  holeCards: Card[];
  holeCount: number;
};

type State = {
  serverNow: number;
  table: { id: string; name: string; smallBlind: number; bigBlind: number; maxSeats: number };
  status: "waiting" | "preflop" | "flop" | "turn" | "river" | "showdown" | "cooldown";
  handNo: number;
  community: Card[];
  dealerSeat: number | null;
  currentSeat: number | null;
  actionDeadlineAt: string | null;
  pot: number;
  currentBet: number;
  minRaise: number;
  showdown: {
    winners: { userId: string; seatNo: number; amount: number; categoryLabel: string; cards: Card[] }[];
    reveals: { seatNo: number; userId: string; cards: Card[]; categoryLabel: string }[];
    finalCommunity: Card[];
  } | null;
  seats: Seat[];
  balance: number;
};

const STATUS_LABEL: Record<State["status"], string> = {
  waiting: "Waiting for players",
  preflop: "Pre-flop",
  flop: "Flop",
  turn: "Turn",
  river: "River",
  showdown: "Showdown",
  cooldown: "Hand over",
};

export function PokerClient() {
  const router = useRouter();
  const [state, setState] = useState<State | null>(null);
  const [serverOffset, setServerOffset] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [buyIn, setBuyIn] = useState(5_000);
  const [raiseTo, setRaiseTo] = useState(0);
  const meRef = useRef<string | null>(null);
  const [, force] = useState(0);

  useEffect(() => {
    fetch("/api/auth/me").then((r) => r.json()).then((d) => {
      meRef.current = d.user?.id ?? null;
    });
  }, []);

  async function refresh() {
    try {
      const r = await fetch("/api/games/poker/state");
      if (!r.ok) return;
      const d = await r.json();
      setState(d);
      setServerOffset((d.serverNow ?? Date.now()) - Date.now());
      // Default raise input to min raise the first time we see it.
      if (d.minRaise && raiseTo === 0) setRaiseTo(d.minRaise);
    } catch { /* ignore */ }
  }
  useEffect(() => {
    refresh();
    const t = setInterval(refresh, POLL_MS);
    const tick = setInterval(() => force((n) => n + 1), 250);
    return () => { clearInterval(t); clearInterval(tick); };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  async function sit() {
    setBusy(true); setError(null);
    const r = await fetch("/api/games/poker/sit", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ buyIn }),
    });
    const d = await r.json();
    setBusy(false);
    if (!r.ok) { setError(labelFor(d.error ?? "error")); return; }
    refresh();
    router.refresh();
  }

  async function leave() {
    setBusy(true); setError(null);
    const r = await fetch("/api/games/poker/leave", { method: "POST" });
    const d = await r.json();
    setBusy(false);
    if (!r.ok) { setError(labelFor(d.error ?? "error")); return; }
    refresh();
    router.refresh();
  }

  async function act(action: "fold" | "check" | "call" | "raise" | "all_in", amount?: number) {
    setBusy(true); setError(null);
    const r = await fetch("/api/games/poker/action", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ action, raiseTo: amount }),
    });
    const d = await r.json();
    setBusy(false);
    if (!r.ok) { setError(labelFor(d.error ?? "error")); return; }
    refresh();
    router.refresh();
  }

  if (!state) return <p className="text-mute">Loading the table...</p>;

  const me = meRef.current;
  const mySeat = state.seats.find((s) => s.userId === me);
  const isSeated = !!mySeat;
  const isMyTurn = isSeated && state.currentSeat === mySeat!.seatNo;
  const toCall = isSeated ? state.currentBet - mySeat!.committedThisRound : 0;
  const canCheck = toCall === 0;
  const canCall = toCall > 0 && (mySeat?.stack ?? 0) > 0;
  const canRaise = !!mySeat && mySeat.stack > toCall;
  const minRaise = state.minRaise;
  const maxRaise = mySeat ? mySeat.committedThisRound + mySeat.stack : 0;

  // Action timer countdown
  let actionSecs = 0;
  if (state.actionDeadlineAt) {
    const ms = new Date(state.actionDeadlineAt).getTime() - Date.now() - serverOffset;
    actionSecs = Math.max(0, Math.ceil(ms / 1000));
  }

  return (
    <div className="grid grid-2" style={{ alignItems: "start" }}>
      {/* === FELT === */}
      <div className="panel" style={{ padding: "var(--sp-5)", gridColumn: "1 / span 2" }}>
        <div className="panel-title">
          {STATUS_LABEL[state.status]}
          {state.handNo > 0 && <> · Hand #{state.handNo}</>}
          {(state.status === "preflop" || state.status === "flop" || state.status === "turn" || state.status === "river") && state.currentSeat != null && (
            <span style={{ marginLeft: 12, color: "var(--crimson-500)" }}>· {actionSecs}s</span>
          )}
        </div>

        {/* Felt area with all 6 seats around the perimeter and community center */}
        <div
          style={{
            background: "var(--cactus-700)",
            border: "4px solid var(--ink-900)",
            padding: "var(--sp-5)",
            position: "relative",
            minHeight: 420,
          }}
        >
          {/* Pot + community in center */}
          <div
            style={{
              position: "absolute",
              top: "50%",
              left: "50%",
              transform: "translate(-50%, -50%)",
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              gap: 12,
              minWidth: 320,
              textAlign: "center",
            }}
          >
            <div className="balance" style={{ fontSize: 22 }}>
              POT {state.pot.toLocaleString()} ¢
            </div>
            <div className="row" style={{ gap: 6, justifyContent: "center" }}>
              {Array.from({ length: 5 }).map((_, i) => {
                const c = state.community[i];
                if (c) return <PlayingCard key={i} rank={c.rank as Rank} suit={c.suit as Suit} size="md" />;
                return (
                  <div
                    key={i}
                    style={{
                      width: 84, height: 120,
                      border: "3px dashed var(--saddle-300)",
                      opacity: 0.4,
                    }}
                  />
                );
              })}
            </div>
            {state.showdown && state.showdown.winners.length > 0 && (
              <div
                className="sign"
                style={{ background: "var(--gold-300)", color: "var(--ink-900)", fontSize: 16 }}
              >
                {state.showdown.winners.map((w) => `${seatLabel(state.seats, w.seatNo)} +${w.amount.toLocaleString()} (${w.categoryLabel})`).join(" · ")}
              </div>
            )}
          </div>

          {/* Seat slots — laid out 2 top, 2 sides, 2 bottom */}
          <div
            style={{
              position: "relative",
              minHeight: 420,
              display: "grid",
              gridTemplateColumns: "1fr 1fr 1fr",
              gridTemplateRows: "auto auto auto",
              gap: "var(--sp-5)",
              alignItems: "stretch",
            }}
          >
            {/* Top row: seat 0, seat 1 */}
            <SeatBox seat={state.seats.find((s) => s.seatNo === 0)} state={state} me={me} pos={{ gridColumn: 1, gridRow: 1 }} />
            <div style={{ gridColumn: 2, gridRow: 1 }} />
            <SeatBox seat={state.seats.find((s) => s.seatNo === 1)} state={state} me={me} pos={{ gridColumn: 3, gridRow: 1 }} />

            {/* Middle row reserved for community (rendered absolute above) */}
            <SeatBox seat={state.seats.find((s) => s.seatNo === 5)} state={state} me={me} pos={{ gridColumn: 1, gridRow: 2 }} />
            <div style={{ gridColumn: 2, gridRow: 2 }} />
            <SeatBox seat={state.seats.find((s) => s.seatNo === 2)} state={state} me={me} pos={{ gridColumn: 3, gridRow: 2 }} />

            {/* Bottom row: seat 4, seat 3 */}
            <SeatBox seat={state.seats.find((s) => s.seatNo === 4)} state={state} me={me} pos={{ gridColumn: 1, gridRow: 3 }} />
            <div style={{ gridColumn: 2, gridRow: 3 }} />
            <SeatBox seat={state.seats.find((s) => s.seatNo === 3)} state={state} me={me} pos={{ gridColumn: 3, gridRow: 3 }} />
          </div>
        </div>
      </div>

      {/* === ACTION PANEL === */}
      <div className="panel" style={{ padding: "var(--sp-5)" }}>
        <div className="panel-title">{isMyTurn ? "Your Action" : isSeated ? "At The Table" : "Buy In"}</div>

        {!isSeated ? (
          <div className="stack-lg">
            <p className="text-mute">
              Buy in for between {(state.table.bigBlind * 20).toLocaleString()} and{" "}
              {(state.table.bigBlind * 250).toLocaleString()} ¢.
            </p>
            <div>
              <label className="label">Buy In</label>
              <input
                type="number"
                value={buyIn}
                min={state.table.bigBlind * 20}
                max={state.table.bigBlind * 250}
                step={1000}
                onChange={(e) => setBuyIn(Math.floor(Number(e.target.value) || 0))}
              />
            </div>
            <button
              className="btn btn-lg btn-block"
              onClick={sit}
              disabled={busy || (state.balance != null && state.balance < buyIn)}
            >
              {busy ? "..." : `Sit Down (${buyIn.toLocaleString()} ¢)`}
            </button>
          </div>
        ) : isMyTurn ? (
          <div className="stack-lg">
            <p className="text-mute">
              Stack <b>{mySeat!.stack.toLocaleString()}</b> · Pot <b>{state.pot.toLocaleString()}</b>
              {toCall > 0 && <> · To call <b>{toCall.toLocaleString()}</b></>}
            </p>
            <div className="row" style={{ flexWrap: "wrap", gap: 8 }}>
              <button className="btn btn-ghost btn-block" onClick={() => act("fold")} disabled={busy}>Fold</button>
              {canCheck ? (
                <button className="btn btn-block" onClick={() => act("check")} disabled={busy}>Check</button>
              ) : (
                <button
                  className="btn btn-block"
                  onClick={() => act("call")}
                  disabled={busy || !canCall}
                >
                  Call {Math.min(toCall, mySeat!.stack).toLocaleString()}
                </button>
              )}
            </div>
            {canRaise && (
              <div>
                <div className="row" style={{ justifyContent: "space-between" }}>
                  <span className="label">Raise to</span>
                  <span className="text-mute" style={{ fontSize: 12 }}>min {minRaise.toLocaleString()} · max {maxRaise.toLocaleString()}</span>
                </div>
                <div className="row" style={{ gap: 6 }}>
                  <input
                    type="range"
                    min={minRaise}
                    max={maxRaise}
                    step={state.table.bigBlind}
                    value={Math.max(minRaise, Math.min(maxRaise, raiseTo))}
                    onChange={(e) => setRaiseTo(Number(e.target.value))}
                    style={{ flex: 1 }}
                  />
                  <input
                    type="number"
                    min={minRaise}
                    max={maxRaise}
                    value={Math.max(minRaise, Math.min(maxRaise, raiseTo))}
                    onChange={(e) => setRaiseTo(Number(e.target.value) || minRaise)}
                    style={{ width: 110 }}
                  />
                </div>
                <div className="row" style={{ marginTop: 6 }}>
                  <button
                    className="btn btn-danger btn-block"
                    onClick={() => act("raise", Math.max(minRaise, Math.min(maxRaise, raiseTo)))}
                    disabled={busy || raiseTo < minRaise || raiseTo > maxRaise}
                  >
                    Raise to {Math.max(minRaise, Math.min(maxRaise, raiseTo)).toLocaleString()}
                  </button>
                  <button
                    className="btn btn-wood btn-block"
                    onClick={() => act("all_in")}
                    disabled={busy}
                  >
                    All-in {maxRaise.toLocaleString()}
                  </button>
                </div>
              </div>
            )}
            {error && <p style={{ color: "var(--crimson-500)" }}>{error}</p>}
          </div>
        ) : (
          <div className="stack-lg">
            <p className="text-mute">
              Stack <b>{mySeat!.stack.toLocaleString()} ¢</b>
              {mySeat!.inHand && !mySeat!.folded && " · in hand"}
              {mySeat!.folded && " · folded"}
            </p>
            <p className="text-mute">
              {state.status === "waiting"
                ? "Waiting for the next hand."
                : state.currentSeat != null
                ? `Waiting on seat ${state.currentSeat + 1}.`
                : "Hand resolving..."}
            </p>
            <button className="btn btn-ghost btn-block" onClick={leave} disabled={busy || mySeat!.inHand}>
              Cash Out & Leave ({mySeat!.stack.toLocaleString()} ¢)
            </button>
            {error && <p style={{ color: "var(--crimson-500)" }}>{error}</p>}
          </div>
        )}
      </div>
    </div>
  );
}

function seatLabel(seats: Seat[], no: number) {
  const s = seats.find((x) => x.seatNo === no);
  return s?.username ?? `Seat ${no + 1}`;
}

function SeatBox({
  seat,
  state,
  me,
  pos,
}: {
  seat: Seat | undefined;
  state: State;
  me: string | null;
  pos: { gridColumn: number; gridRow: number };
}) {
  const containerStyle: React.CSSProperties = {
    gridColumn: pos.gridColumn,
    gridRow: pos.gridRow,
    minHeight: 110,
  };

  if (!seat || !seat.userId) {
    return (
      <div
        style={{
          ...containerStyle,
          background: "var(--saddle-600)",
          border: "3px dashed var(--saddle-300)",
          padding: "var(--sp-3)",
          color: "var(--saddle-300)",
          fontFamily: "var(--font-display)",
          fontSize: 13,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          opacity: 0.6,
        }}
      >
        Empty Seat
      </div>
    );
  }
  const isMe = seat.userId === me;
  const isCurrent = state.currentSeat === seat.seatNo;
  const isDealer = state.dealerSeat === seat.seatNo;
  const isFolded = seat.folded;
  const isAllIn = seat.isAllIn;
  return (
    <div
      style={{
        ...containerStyle,
        background: isMe ? "var(--gold-100)" : "var(--parchment-100)",
        border: isCurrent ? "4px solid var(--gold-300)" : "3px solid var(--ink-900)",
        boxShadow: isCurrent ? "var(--glow-gold)" : "var(--bevel-light)",
        padding: "var(--sp-3)",
        opacity: isFolded ? 0.55 : 1,
        position: "relative",
      }}
    >
      <div className="between">
        <div className="row" style={{ gap: 6 }}>
          <div
            className="avatar avatar-sm"
            style={{ background: seat.avatarColor ?? "var(--gold-300)", fontSize: 11, width: 28, height: 28, borderWidth: 2 }}
          >
            {seat.initials ?? "??"}
          </div>
          <div style={{ fontFamily: "var(--font-display)", fontSize: 13, lineHeight: 1.1 }}>
            <div>{seat.username ?? "Player"}{isMe && <span className="tag-new" style={{ marginLeft: 4 }}>YOU</span>}</div>
            <div style={{ color: "var(--saddle-400)", fontSize: 11 }}>{seat.stack.toLocaleString()} ¢</div>
          </div>
        </div>
        {isDealer && (
          <span
            style={{
              fontFamily: "var(--font-display)",
              fontSize: 11,
              background: "var(--ink-900)",
              color: "var(--gold-300)",
              padding: "2px 6px",
              border: "2px solid var(--ink-900)",
            }}
          >
            D
          </span>
        )}
      </div>
      <div className="row" style={{ gap: 4, marginTop: 6 }}>
        {seat.holeCards.length > 0 ? (
          seat.holeCards.map((c, i) => (
            <PlayingCard key={i} rank={c.rank as Rank} suit={c.suit as Suit} size="sm" />
          ))
        ) : seat.holeCount > 0 ? (
          <>
            <PlayingCard faceDown size="sm" />
            <PlayingCard faceDown size="sm" />
          </>
        ) : null}
      </div>
      {seat.committedThisRound > 0 && (
        <div
          style={{
            position: "absolute",
            top: 4,
            right: 4,
            background: "var(--gold-300)",
            color: "var(--ink-900)",
            border: "2px solid var(--ink-900)",
            padding: "2px 6px",
            fontFamily: "var(--font-display)",
            fontSize: 11,
          }}
        >
          {seat.committedThisRound.toLocaleString()}
        </div>
      )}
      {seat.lastAction && seat.lastAction !== "" && (
        <div style={{ marginTop: 4, fontFamily: "var(--font-display)", fontSize: 11, color: actionColor(seat.lastAction) }}>
          {actionLabel(seat.lastAction)}
        </div>
      )}
      {isAllIn && (
        <div className="badge badge-crimson" style={{ marginTop: 4 }}>ALL-IN</div>
      )}
    </div>
  );
}

function actionColor(a: string) {
  if (a === "fold") return "var(--crimson-500)";
  if (a === "all_in") return "var(--gold-500)";
  if (a === "raise") return "var(--crimson-500)";
  return "var(--saddle-500)";
}
function actionLabel(a: string) {
  return ({
    fold: "Folded", check: "Checked", call: "Called", raise: "Raised", all_in: "All-in", blind: "Posted blind",
  } as Record<string, string>)[a] ?? a;
}

function labelFor(code: string) {
  const m: Record<string, string> = {
    insufficient_funds: "Not enough Coins.",
    buyin_too_small: "Buy in is too small.",
    buyin_too_large: "Buy in exceeds the cap.",
    buyin_invalid: "Invalid buy in.",
    already_seated: "You're already at the table.",
    table_full: "Table is full.",
    no_table: "No table.",
    no_state: "No active state.",
    not_seated: "You're not at the table.",
    in_hand: "Wait until your hand finishes.",
    not_in_hand: "Not in a betting round.",
    not_your_turn: "Not your turn.",
    cant_act: "You can't act right now.",
    must_call: "You must call or raise.",
    raise_amount_required: "Specify a raise amount.",
    raise_too_small: "Raise must be at least the minimum.",
    insufficient_stack: "Not enough chips for that raise.",
    no_chips: "No chips to bet.",
    bad_action: "Unknown action.",
  };
  return m[code] ?? "Something went wrong.";
}
