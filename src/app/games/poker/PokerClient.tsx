"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { PlayingCard } from "@/components/PlayingCard";
import type { Card, Rank, Suit } from "@/lib/games/cards";
import * as Sfx from "@/lib/sfx";

const POLL_MS = 1000;
const LOG_MAX = 10;

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

  // Per-seat last-action tracker for the action log feed.
  const lastActRef = useRef<Map<number, string | null>>(new Map());
  const lastHandRef = useRef<number>(-1);
  const logSeqRef = useRef<number>(0);
  const [actionLog, setActionLog] = useState<{ id: number; text: string; tone: string }[]>([]);

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
      const d: State = await r.json();
      // Detect stage transitions to layer in table sounds.
      const prevStatus = state?.status;
      if (prevStatus !== d.status) {
        if (d.status === "preflop")       Sfx.play("card.shuffle");
        else if (d.status === "flop")     Sfx.play("card.slide");
        else if (d.status === "turn")     Sfx.play("card.slide");
        else if (d.status === "river")    Sfx.play("card.slide");
        else if (d.status === "showdown") Sfx.play("card.fan");
      }
      setState(d);
      setServerOffset((d.serverNow ?? Date.now()) - Date.now());

      // Diff per-seat last_action since last render to build the action log.
      // Reset tracker on new hand so blinds don't pollute.
      if (d.handNo !== lastHandRef.current) {
        lastActRef.current.clear();
        lastHandRef.current = d.handNo;
      }
      const additions: { id: number; text: string; tone: string }[] = [];
      for (const s of d.seats) {
        const prev = lastActRef.current.get(s.seatNo);
        const cur = s.lastAction;
        if (cur !== prev) {
          if (cur && cur !== "" && cur !== "blind") {
            additions.push({
              id: ++logSeqRef.current,
              text: actionLogText(s, cur),
              tone: actionTone(cur),
            });
          }
          lastActRef.current.set(s.seatNo, cur);
        }
      }
      // Showdown winners log
      if (d.status === "showdown" && d.showdown) {
        for (const w of d.showdown.winners) {
          const lookupSeat = d.seats.find((s) => s.seatNo === w.seatNo);
          const name = lookupSeat?.username ?? `Seat ${w.seatNo + 1}`;
          const key = `win:${d.handNo}:${w.seatNo}`;
          // De-dupe via tracker
          if (!lastActRef.current.has(-1 - w.seatNo) || lastActRef.current.get(-1 - w.seatNo) !== key) {
            additions.push({
              id: ++logSeqRef.current,
              text: `${name} won ${w.amount.toLocaleString()} ¢ · ${w.categoryLabel}`,
              tone: "win",
            });
            lastActRef.current.set(-1 - w.seatNo, key);
            // If me, fire the chip-stack pot-collect cue.
            if (w.userId && w.userId === meRef.current) {
              if (w.amount >= 50_000) Sfx.play("win.big");
              else                    Sfx.play("chips.handle");
            }
          }
        }
      }
      if (additions.length > 0) {
        setActionLog((prev) => [...additions.reverse(), ...prev].slice(0, LOG_MAX));
      }
    } catch { /* ignore */ }
  }

  useEffect(() => {
    refresh();
    const t = setInterval(refresh, POLL_MS);
    const tick = setInterval(() => force((n) => n + 1), 250);
    return () => { clearInterval(t); clearInterval(tick); };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Sync raise input to min raise when state advances.
  useEffect(() => {
    if (!state) return;
    if (raiseTo === 0 || raiseTo < state.minRaise) setRaiseTo(state.minRaise);
  }, [state?.minRaise]); // eslint-disable-line react-hooks/exhaustive-deps

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
    // Play the action SFX immediately so the tap feels responsive.
    if (action === "fold")        Sfx.play("card.shove");
    else if (action === "check")  Sfx.play("ui.wood");
    else if (action === "call" || action === "raise" || action === "all_in") Sfx.play("chip.lay");
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

  let actionSecs = 0;
  if (state.actionDeadlineAt) {
    const ms = new Date(state.actionDeadlineAt).getTime() - Date.now() - serverOffset;
    actionSecs = Math.max(0, Math.ceil(ms / 1000));
  }
  const timerText = `${actionSecs} ${actionSecs === 1 ? "second" : "seconds"}`;

  // Compute the current actor's name (for the "Waiting on X" header).
  const currentActor = state.currentSeat != null
    ? state.seats.find((s) => s.seatNo === state.currentSeat)
    : null;

  // Layout: 6 seats arranged top, sides, bottom. Mine always shown bottom-center if I'm seated.
  const seatsByPosition = layoutSeats(state.seats, mySeat?.seatNo ?? null, state.table.maxSeats);

  return (
    <>
    <style>{POKER_KEYFRAMES}</style>
    <div
      className="poker-grid"
      style={{
        display: "grid",
        gridTemplateColumns: "minmax(0, 1fr) 320px",
        gap: "var(--sp-5)",
        alignItems: "start",
      }}
    >
      {/* === FELT === */}
      <div className="panel" style={{ padding: "var(--sp-4)", position: "relative", overflow: "hidden" }}>
        <div
          className="between"
          style={{ marginBottom: "var(--sp-3)", flexWrap: "wrap", gap: "var(--sp-3)" }}
        >
          <div style={{ fontFamily: "var(--font-display)", fontSize: "var(--fs-h4)" }}>
            {STATUS_LABEL[state.status]}
            {state.handNo > 0 && <span className="text-mute" style={{ fontSize: 12, marginLeft: 8 }}>· Hand #{state.handNo}</span>}
          </div>
          <div className="row" style={{ gap: "var(--sp-3)" }}>
            <span className="badge">{state.table.smallBlind}/{state.table.bigBlind}</span>
            {currentActor && (
              <span
                className="badge"
                style={{
                  background: "var(--gold-300)",
                  color: "var(--ink-900)",
                  borderColor: "var(--ink-900)",
                }}
              >
                {isMyTurn ? `YOUR TURN · ${timerText}` : `Waiting on ${currentActor.username ?? `Seat ${currentActor.seatNo + 1}`} · ${timerText}`}
              </span>
            )}
          </div>
        </div>

        {/* The felt itself */}
        <div
          style={{
            background: "var(--cactus-700)",
            border: "4px solid var(--ink-900)",
            padding: "var(--sp-3)",
            borderRadius: 0,
            position: "relative",
            display: "grid",
            gridTemplateColumns: "1fr 1fr 1fr",
            gridTemplateRows: "auto auto auto",
            gap: "var(--sp-3)",
            minHeight: 360,
          }}
        >
          {/* Top row */}
          <SeatBox seat={seatsByPosition.topLeft}      state={state} me={me} cell={{ row: 1, col: 1 }} />
          <SeatBox seat={seatsByPosition.topMid}       state={state} me={me} cell={{ row: 1, col: 2 }} />
          <SeatBox seat={seatsByPosition.topRight}     state={state} me={me} cell={{ row: 1, col: 3 }} />

          {/* Center: pot + community */}
          <div
            style={{
              gridRow: 2,
              gridColumn: "1 / span 3",
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              gap: "var(--sp-3)",
              padding: "var(--sp-4) 0",
              background: "rgba(26,15,8,0.15)",
              border: "3px solid var(--cactus-500)",
            }}
          >
            <div className="row" style={{ gap: 6 }}>
              {Array.from({ length: 5 }).map((_, i) => {
                const c = state.community[i];
                if (c) {
                  return (
                    <DealCard
                      key={`comm-${i}-${c.rank}${c.suit}`}
                      rank={c.rank as Rank}
                      suit={c.suit as Suit}
                      faceDown={false}
                      index={i}
                      size="md"
                    />
                  );
                }
                return (
                  <div
                    key={`empty-${i}`}
                    style={{
                      width: 84, height: 120,
                      border: "3px dashed var(--saddle-300)",
                      opacity: 0.4,
                    }}
                  />
                );
              })}
            </div>
            <div
              className="balance"
              style={{ fontSize: 22, padding: "4px 14px" }}
            >
              POT {state.pot.toLocaleString()} ¢
            </div>
          </div>

          {/* Bottom row */}
          <SeatBox seat={seatsByPosition.bottomLeft}   state={state} me={me} cell={{ row: 3, col: 1 }} />
          <SeatBox seat={seatsByPosition.bottomMid}    state={state} me={me} cell={{ row: 3, col: 2 }} mine={!!mySeat && seatsByPosition.bottomMid?.seatNo === mySeat.seatNo} />
          <SeatBox seat={seatsByPosition.bottomRight}  state={state} me={me} cell={{ row: 3, col: 3 }} />
        </div>

        {/* Showdown winner stamp + confetti */}
        {state.status === "showdown" && state.showdown && state.showdown.winners.length > 0 && (
          <ShowdownStamp
            key={`stamp-${state.handNo}`}
            winners={state.showdown.winners}
            seats={state.seats}
            iWon={state.showdown.winners.some((w) => w.userId === me)}
          />
        )}
      </div>

      {/* === STICKY SIDE PANEL === */}
      <div
        style={{
          position: "sticky",
          top: 16,
          display: "flex",
          flexDirection: "column",
          gap: "var(--sp-4)",
        }}
      >
        {/* Action card */}
        <div className="panel" style={{ padding: "var(--sp-4)" }}>
          <div className="panel-title" style={{ fontSize: "var(--fs-h4)" }}>
            {!isSeated ? "Buy In" : isMyTurn ? `Your Action · ${timerText}` : "At The Table"}
          </div>

          {!isSeated ? (
            <div className="stack-lg">
              <p className="text-mute" style={{ fontSize: 12 }}>
                Buy in {(state.table.bigBlind * 20).toLocaleString()}–{(state.table.bigBlind * 250).toLocaleString()} ¢.
              </p>
              <input
                type="number"
                value={buyIn}
                min={state.table.bigBlind * 20}
                max={state.table.bigBlind * 250}
                step={1000}
                onChange={(e) => setBuyIn(Math.floor(Number(e.target.value) || 0))}
              />
              <button
                className="btn btn-lg btn-block"
                onClick={sit}
                disabled={busy || (state.balance != null && state.balance < buyIn)}
              >
                {busy ? "..." : `Sit Down (${buyIn.toLocaleString()} ¢)`}
              </button>
            </div>
          ) : isMyTurn ? (
            <div className="stack" style={{ gap: 8 }}>
              <div className="text-mute" style={{ fontSize: 12 }}>
                Stack <b>{mySeat!.stack.toLocaleString()}</b>
                {toCall > 0 && <> · To call <b>{toCall.toLocaleString()}</b></>}
              </div>
              <div className="row" style={{ gap: 6 }}>
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
                <>
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
                      style={{ width: 90 }}
                    />
                  </div>
                  <div className="row" style={{ gap: 6 }}>
                    <button
                      type="button"
                      className="btn btn-ghost btn-sm"
                      onClick={() => setRaiseTo(Math.min(maxRaise, state.pot))}
                    >POT</button>
                    <button
                      type="button"
                      className="btn btn-ghost btn-sm"
                      onClick={() => setRaiseTo(Math.min(maxRaise, Math.floor(state.pot / 2)))}
                    >½ POT</button>
                    <button
                      type="button"
                      className="btn btn-ghost btn-sm"
                      onClick={() => setRaiseTo(Math.min(maxRaise, minRaise * 2))}
                    >2× MIN</button>
                  </div>
                  <div className="row" style={{ gap: 6 }}>
                    <button
                      className="btn btn-danger btn-block"
                      onClick={() => act("raise", Math.max(minRaise, Math.min(maxRaise, raiseTo)))}
                      disabled={busy || raiseTo < minRaise || raiseTo > maxRaise}
                    >
                      Raise {Math.max(minRaise, Math.min(maxRaise, raiseTo)).toLocaleString()}
                    </button>
                    <button
                      className="btn btn-wood btn-block"
                      onClick={() => act("all_in")}
                      disabled={busy}
                    >
                      All-in {maxRaise.toLocaleString()}
                    </button>
                  </div>
                </>
              )}
              {error && <p style={{ color: "var(--crimson-500)", fontSize: 12 }}>{error}</p>}
            </div>
          ) : (
            <div className="stack" style={{ gap: 8 }}>
              <div className="text-mute" style={{ fontSize: 12 }}>
                Stack <b>{mySeat!.stack.toLocaleString()} ¢</b>
                {mySeat!.inHand && !mySeat!.folded && " · in hand"}
                {mySeat!.folded && " · folded"}
              </div>
              <p className="text-mute" style={{ fontSize: 12 }}>
                {state.status === "waiting"
                  ? "Waiting for players to sit."
                  : currentActor
                  ? `Waiting on ${currentActor.username ?? `Seat ${currentActor.seatNo + 1}`}.`
                  : state.status === "showdown" ? "Showdown — see results." : "Hand resolving..."}
              </p>
              <button
                className="btn btn-ghost btn-block btn-sm"
                onClick={leave}
                disabled={
                  busy ||
                  // Only disable if there's a live betting round and you're still in it.
                  (["preflop", "flop", "turn", "river"].includes(state.status) &&
                    mySeat!.inHand &&
                    !mySeat!.folded)
                }
              >
                Cash Out · {mySeat!.stack.toLocaleString()} ¢
              </button>
              {error && <p style={{ color: "var(--crimson-500)", fontSize: 12 }}>{error}</p>}
            </div>
          )}
        </div>

        {/* Action log */}
        <div className="panel" style={{ padding: "var(--sp-4)" }}>
          <div className="panel-title" style={{ fontSize: "var(--fs-h4)" }}>Action</div>
          {actionLog.length === 0 ? (
            <p className="text-mute" style={{ fontSize: 12 }}>No actions yet.</p>
          ) : (
            <div className="stack" style={{ gap: 4 }}>
              {actionLog.map((l) => (
                <div
                  key={l.id}
                  style={{
                    fontFamily: "var(--font-display)",
                    fontSize: 12,
                    padding: "4px 8px",
                    background: tonyBg(l.tone),
                    color: tonyFg(l.tone),
                    border: "2px solid var(--ink-900)",
                  }}
                >
                  {l.text}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
    </>
  );
}

function layoutSeats(seats: Seat[], mySeatNo: number | null, max: number) {
  // We always render 6 visible cells (top: 3, bottom: 3). If I'm seated, my seat goes bottom-center.
  // Other seats cycle clockwise from there. If I'm not seated, seat 0 goes top-left in numeric order.
  const order: number[] = [];
  if (mySeatNo != null) {
    order.push(mySeatNo); // bottom-mid
    for (let i = 1; i < max; i++) order.push((mySeatNo + i) % max);
  } else {
    for (let i = 0; i < max; i++) order.push(i);
  }
  // Display order maps to: bottom-mid, bottom-right, top-right, top-mid, top-left, bottom-left
  const slotOrder = ["bottomMid", "bottomRight", "topRight", "topMid", "topLeft", "bottomLeft"] as const;
  const result: Record<typeof slotOrder[number], Seat | undefined> = {
    bottomMid: undefined, bottomRight: undefined, topRight: undefined,
    topMid: undefined, topLeft: undefined, bottomLeft: undefined,
  };
  for (let i = 0; i < Math.min(slotOrder.length, order.length); i++) {
    const seatNo = order[i];
    result[slotOrder[i]] = seats.find((s) => s.seatNo === seatNo);
  }
  return result;
}

function SeatBox({
  seat,
  state,
  me,
  cell,
  mine,
}: {
  seat: Seat | undefined;
  state: State;
  me: string | null;
  cell: { row: number; col: number };
  mine?: boolean;
}) {
  const containerStyle: React.CSSProperties = {
    gridRow: cell.row,
    gridColumn: cell.col,
    minHeight: 96,
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
          fontSize: 12,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          opacity: 0.5,
        }}
      >
        empty
      </div>
    );
  }
  const isMe = seat.userId === me || mine;
  const isCurrent = state.currentSeat === seat.seatNo && (state.status === "preflop" || state.status === "flop" || state.status === "turn" || state.status === "river");
  const isDealer = state.dealerSeat === seat.seatNo;
  const isFolded = seat.folded;
  return (
    <div
      style={{
        ...containerStyle,
        background: isMe ? "var(--gold-100)" : "var(--parchment-100)",
        border: isCurrent ? "4px solid var(--gold-300)" : "3px solid var(--ink-900)",
        boxShadow: isCurrent ? "var(--glow-gold)" : "var(--bevel-light)",
        padding: 8,
        opacity: isFolded ? 0.45 : 1,
        position: "relative",
        animation: isCurrent ? "seatPulse 1.4s ease-in-out infinite" : undefined,
      }}
    >
      <style>{`@keyframes seatPulse {
        0%, 100% { box-shadow: var(--glow-gold); }
        50%      { box-shadow: 0 0 0 3px var(--gold-300), 0 0 24px rgba(255,216,77,0.85); }
      }`}</style>

      {isDealer && (
        <span
          style={{
            position: "absolute",
            top: -8,
            right: -8,
            background: "var(--ink-900)",
            color: "var(--gold-300)",
            border: "2px solid var(--ink-900)",
            width: 24,
            height: 24,
            borderRadius: 999,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontFamily: "var(--font-display)",
            fontSize: 12,
            zIndex: 2,
          }}
        >
          D
        </span>
      )}
      {isCurrent && (
        <span
          style={{
            position: "absolute",
            top: -10,
            left: 6,
            background: "var(--gold-300)",
            color: "var(--ink-900)",
            border: "2px solid var(--ink-900)",
            padding: "1px 6px",
            fontFamily: "var(--font-display)",
            fontSize: 10,
            letterSpacing: "var(--ls-loose)",
          }}
        >
          TO ACT
        </span>
      )}

      <div className="row" style={{ gap: 6 }}>
        <div
          className="avatar avatar-sm"
          style={{ background: seat.avatarColor ?? "var(--gold-300)", fontSize: 10, width: 26, height: 26, borderWidth: 2 }}
        >
          {seat.initials ?? "??"}
        </div>
        <div style={{ flex: 1, minWidth: 0, fontFamily: "var(--font-display)", lineHeight: 1.1 }}>
          <div style={{ fontSize: 12 }}>
            {seat.username ?? "Player"}
            {isMe && <span className="tag-new" style={{ marginLeft: 4 }}>YOU</span>}
          </div>
          <div style={{ fontSize: 11, color: "var(--saddle-400)" }}>{seat.stack.toLocaleString()} ¢</div>
        </div>
      </div>

      <div className="row" style={{ gap: 3, marginTop: 6 }}>
        {seat.holeCards.length > 0 ? (
          seat.holeCards.map((c, i) => (
            <DealCard
              key={`hole-${seat.seatNo}-${i}-${c.rank}${c.suit}`}
              rank={c.rank as Rank}
              suit={c.suit as Suit}
              faceDown={false}
              index={i}
              size="sm"
              flipFromBack
            />
          ))
        ) : seat.holeCount > 0 && !isFolded ? (
          <>
            <DealCard
              key={`hole-${seat.seatNo}-back-0`}
              rank={"?"}
              suit={"?"}
              faceDown={true}
              index={0}
              size="sm"
            />
            <DealCard
              key={`hole-${seat.seatNo}-back-1`}
              rank={"?"}
              suit={"?"}
              faceDown={true}
              index={1}
              size="sm"
            />
          </>
        ) : null}

        {seat.committedThisRound > 0 && (
          <div
            style={{
              marginLeft: "auto",
              background: "var(--saddle-600)",
              color: "var(--gold-300)",
              border: "2px solid var(--ink-900)",
              padding: "2px 6px",
              fontFamily: "var(--font-display)",
              fontSize: 12,
              alignSelf: "flex-end",
            }}
          >
            {seat.committedThisRound.toLocaleString()}
          </div>
        )}
      </div>

      {(seat.lastAction && seat.lastAction !== "" && seat.lastAction !== "blind") || isFolded || seat.isAllIn ? (
        <div
          style={{
            marginTop: 6,
            display: "inline-block",
            background: actionTagBg(isFolded ? "fold" : seat.isAllIn ? "all_in" : seat.lastAction!),
            color: actionTagFg(isFolded ? "fold" : seat.isAllIn ? "all_in" : seat.lastAction!),
            border: "2px solid var(--ink-900)",
            padding: "2px 6px",
            fontFamily: "var(--font-display)",
            fontSize: 11,
            letterSpacing: "var(--ls-loose)",
            textTransform: "uppercase",
          }}
        >
          {isFolded ? "FOLD" : seat.isAllIn ? "ALL-IN" : actionLabel(seat.lastAction!)}
        </div>
      ) : null}
    </div>
  );
}

function actionLogText(seat: Seat, action: string): string {
  const name = seat.username ?? `Seat ${seat.seatNo + 1}`;
  switch (action) {
    case "fold":   return `${name} folded`;
    case "check":  return `${name} checked`;
    case "call":   return `${name} called ${seat.committedThisRound.toLocaleString()}`;
    case "raise":  return `${name} raised to ${seat.committedThisRound.toLocaleString()}`;
    case "all_in": return `${name} went all-in (${seat.committedTotal.toLocaleString()})`;
    default:       return `${name} ${action}`;
  }
}
function actionTone(action: string): string {
  switch (action) {
    case "fold":   return "fold";
    case "raise":  return "raise";
    case "all_in": return "all_in";
    case "call":   return "call";
    case "check":  return "check";
    default:       return "neutral";
  }
}
function tonyBg(tone: string): string {
  switch (tone) {
    case "fold":   return "var(--crimson-300)";
    case "raise":  return "var(--crimson-500)";
    case "all_in": return "var(--gold-500)";
    case "call":   return "var(--cactus-300)";
    case "check":  return "var(--saddle-200)";
    case "win":    return "var(--gold-300)";
    default:       return "var(--parchment-200)";
  }
}
function tonyFg(tone: string): string {
  switch (tone) {
    case "raise":  return "var(--parchment-50)";
    case "all_in": return "var(--ink-900)";
    case "win":    return "var(--ink-900)";
    case "fold":   return "var(--parchment-50)";
    case "call":   return "var(--parchment-50)";
    case "check":  return "var(--ink-900)";
    default:       return "var(--ink-900)";
  }
}
function actionLabel(a: string) {
  return ({
    fold: "Fold", check: "Check", call: "Call", raise: "Raise", all_in: "All-in", blind: "Blind",
  } as Record<string, string>)[a] ?? a;
}
function actionTagBg(a: string) {
  return tonyBg(actionTone(a));
}
function actionTagFg(a: string) {
  return tonyFg(actionTone(a));
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

// ============================================================
// Animation: card-by-card deal + showdown stamp + confetti
// ============================================================

function DealCard({
  rank,
  suit,
  faceDown,
  index,
  size,
  flipFromBack,
}: {
  rank: Rank | "?";
  suit: Suit | "?";
  faceDown: boolean;
  index: number;
  size?: "sm" | "md" | "lg";
  flipFromBack?: boolean;
}) {
  // Stagger the first 3 cards in any cluster (flop / hole). Later cards
  // (turn = index 3, river = index 4) animate quickly.
  const delay = flipFromBack
    ? "0s"
    : index < 3
    ? `${0.15 + index * 0.32}s`
    : "0.1s";
  return (
    <span
      style={{
        display: "inline-block",
        transformOrigin: "center center",
        animation: flipFromBack
          ? "pk-flip 0.85s cubic-bezier(0.2, 0.9, 0.3, 1) backwards"
          : "pk-deal 0.85s cubic-bezier(0.18, 0.85, 0.3, 1) backwards",
        animationDelay: delay,
      }}
    >
      <PlayingCard rank={rank} suit={suit} faceDown={faceDown} size={size} />
    </span>
  );
}

function ShowdownStamp({
  winners,
  seats,
  iWon,
}: {
  winners: { userId: string; seatNo: number; amount: number; categoryLabel: string }[];
  seats: Seat[];
  iWon: boolean;
}) {
  const top = winners[0];
  const seat = seats.find((s) => s.seatNo === top.seatNo);
  const name = seat?.username ?? `Seat ${top.seatNo + 1}`;
  return (
    <>
      <div
        style={{
          position: "absolute",
          top: "50%",
          left: "50%",
          transform: "translate(-50%, -50%) rotate(-12deg)",
          background: iWon ? "var(--gold-300)" : "var(--cactus-500)",
          color: iWon ? "var(--ink-900)" : "var(--parchment-50)",
          border: "5px solid var(--ink-900)",
          padding: "var(--sp-4) var(--sp-6)",
          fontFamily: "var(--font-display)",
          fontSize: 32,
          letterSpacing: "var(--ls-loose)",
          textTransform: "uppercase",
          boxShadow: iWon
            ? "var(--glow-gold), 8px 8px 0 var(--ink-900)"
            : "8px 8px 0 var(--ink-900)",
          textShadow: iWon ? "2px 2px 0 var(--gold-100)" : "3px 3px 0 var(--ink-900)",
          animation: "pk-stamp 0.7s var(--ease-snap) backwards",
          animationDelay: "1s",
          zIndex: 10,
          pointerEvents: "none",
          textAlign: "center",
        }}
      >
        {iWon ? "YOU WIN" : `${name} wins`}
        <div style={{ fontSize: 16, marginTop: 4, letterSpacing: "var(--ls-tight)" }}>
          {top.categoryLabel} · +{top.amount.toLocaleString()} ¢
        </div>
      </div>
      {iWon && <PokerConfetti />}
    </>
  );
}

function PokerConfetti() {
  const pieces = Array.from({ length: 32 }, (_, i) => ({
    id: i,
    left: Math.random() * 100,
    delay: 1.2 + Math.random() * 0.5,
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
            animation: `pk-coin-fall ${p.duration}s linear ${p.delay}s 1 forwards`,
            transform: `rotate(${p.rotate}deg)`,
          }}
        />
      ))}
    </div>
  );
}

const POKER_KEYFRAMES = `
@keyframes pk-deal {
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
@keyframes pk-flip {
  0%   { transform: perspective(900px) rotateY(180deg) translateY(-32px) scale(1.06); }
  40%  { transform: perspective(900px) rotateY(95deg)  translateY(-16px) scale(1.10); }
  72%  { transform: perspective(900px) rotateY(15deg)  translateY(-2px)  scale(1.05); }
  100% { transform: perspective(900px) rotateY(0deg)   translateY(0)     scale(1); }
}
@keyframes pk-stamp {
  0%   { transform: translate(-50%, -50%) rotate(-30deg) scale(3); opacity: 0; }
  55%  { transform: translate(-50%, -50%) rotate(-8deg)  scale(0.88); opacity: 1; }
  80%  { transform: translate(-50%, -50%) rotate(-16deg) scale(1.1); }
  100% { transform: translate(-50%, -50%) rotate(-12deg) scale(1); opacity: 1; }
}
@keyframes pk-coin-fall {
  0%   { transform: translateY(-20px) rotate(0deg); opacity: 1; }
  100% { transform: translateY(560px) rotate(720deg); opacity: 0; }
}
`;
