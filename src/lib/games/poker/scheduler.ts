// No-Limit Hold'em scheduler. Lazy progression — every API call advances state.
//   waiting → preflop → flop → turn → river → showdown → cooldown → next hand
// Polling-based; deck and other players' hole cards stay server-side via RLS.

import { randomUUID } from "node:crypto";
import { freshDeck, type Card } from "@/lib/games/cards";
import { credit, debit } from "@/lib/wallet";
import { compareScores, evaluate7, categoryLabel } from "./evaluator";
import { createClient as createSupabaseClient, SupabaseClient } from "@supabase/supabase-js";
import { insertGameSession } from "@/lib/db";

export const ACTION_WINDOW_MS = 15_000;
export const COOLDOWN_AFTER_HAND_MS = 6_000;
export const SHOWDOWN_REVEAL_MS = 5_000;
export const MIN_PLAYERS_TO_START = 2;

type PokerStatus = "waiting" | "preflop" | "flop" | "turn" | "river" | "showdown" | "cooldown";

type SeatRow = {
  table_id: string;
  seat_no: number;
  user_id: string | null;
  stack: number;
  sitting_out: boolean;
  hole_cards: Card[];
  committed_this_round: number;
  committed_total: number;
  is_all_in: boolean;
  folded: boolean;
  in_hand: boolean;
  last_action: string | null;
};

type StateRow = {
  table_id: string;
  status: PokerStatus;
  hand_no: number;
  deck: Card[];
  community: Card[];
  dealer_seat: number | null;
  current_seat: number | null;
  action_deadline_at: string | null;
  pot: number;
  current_bet: number;
  last_raise_amount: number;
  hand_started_at: string | null;
  hand_ended_at: string | null;
  showdown: ShowdownInfo | null;
};

type ShowdownInfo = {
  winners: { userId: string; seatNo: number; amount: number; categoryLabel: string; cards: Card[] }[];
  reveals: { seatNo: number; userId: string; cards: Card[]; categoryLabel: string }[];
  finalCommunity: Card[];
};

function supa(): SupabaseClient {
  return createSupabaseClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false, autoRefreshToken: false } },
  );
}

export const SALOON_TABLE_NAME = "The Saloon";

export async function getDefaultTableId(): Promise<string | null> {
  const { data } = await supa().from("poker_tables").select("id").eq("name", SALOON_TABLE_NAME).maybeSingle();
  return (data as { id: string } | null)?.id ?? null;
}

export async function getTable(tableId: string) {
  const { data } = await supa().from("poker_tables").select("*").eq("id", tableId).maybeSingle();
  return data as { id: string; name: string; small_blind: number; big_blind: number; max_seats: number } | null;
}

export async function getState(tableId: string): Promise<StateRow | null> {
  const { data } = await supa().from("poker_state").select("*").eq("table_id", tableId).maybeSingle();
  return data as StateRow | null;
}

async function ensureState(tableId: string): Promise<StateRow> {
  const cur = await getState(tableId);
  if (cur) return cur;
  const { data, error } = await supa()
    .from("poker_state")
    .insert({ table_id: tableId })
    .select("*")
    .single();
  if (error) throw new Error(`ensureState: ${error.message}`);
  return data as StateRow;
}

async function listSeats(tableId: string): Promise<SeatRow[]> {
  const { data } = await supa()
    .from("poker_seats")
    .select("*")
    .eq("table_id", tableId)
    .order("seat_no", { ascending: true });
  return (data ?? []) as SeatRow[];
}

async function updateSeat(tableId: string, seatNo: number, patch: Partial<SeatRow>) {
  const { error } = await supa()
    .from("poker_seats")
    .update(patch)
    .eq("table_id", tableId)
    .eq("seat_no", seatNo);
  if (error) throw new Error(`updateSeat: ${error.message}`);
}

async function updateState(tableId: string, patch: Partial<StateRow>) {
  const { error } = await supa()
    .from("poker_state")
    .update(patch)
    .eq("table_id", tableId);
  if (error) throw new Error(`updateState: ${error.message}`);
}

// -------------- helpers --------------
function nextOccupiedSeat(seats: SeatRow[], from: number, max: number): number | null {
  for (let i = 1; i <= max; i++) {
    const s = (from + i) % max;
    const seat = seats.find((x) => x.seat_no === s && x.user_id != null);
    if (seat) return s;
  }
  return null;
}

function nextActionableSeat(seats: SeatRow[], from: number, max: number): number | null {
  for (let i = 1; i <= max; i++) {
    const s = (from + i) % max;
    const seat = seats.find((x) => x.seat_no === s);
    if (seat?.in_hand && !seat.folded && !seat.is_all_in) return s;
  }
  return null;
}

// -------------- core advance --------------
export async function advance(tableId: string): Promise<void> {
  const table = await getTable(tableId);
  if (!table) return;
  const state = await ensureState(tableId);
  const seats = await listSeats(tableId);
  const now = Date.now();

  if (state.status === "waiting") {
    const seated = seats.filter((s) => s.user_id != null && s.stack >= table.big_blind && !s.sitting_out);
    if (seated.length < MIN_PLAYERS_TO_START) return;
    await startNewHand(tableId, table, state, seats);
    return;
  }

  if (state.status === "cooldown" && state.hand_ended_at) {
    if (now >= new Date(state.hand_ended_at).getTime() + COOLDOWN_AFTER_HAND_MS) {
      const seated = seats.filter((s) => s.user_id != null && s.stack >= table.big_blind && !s.sitting_out);
      if (seated.length >= MIN_PLAYERS_TO_START) {
        await startNewHand(tableId, table, state, seats);
      } else {
        await updateState(tableId, { status: "waiting" });
      }
    }
    return;
  }

  if (state.status === "showdown" && state.hand_ended_at) {
    if (now >= new Date(state.hand_ended_at).getTime() + SHOWDOWN_REVEAL_MS) {
      await updateState(tableId, { status: "cooldown" });
    }
    return;
  }

  // Active betting / community streets
  if (["preflop", "flop", "turn", "river"].includes(state.status)) {
    // If only one in-hand seat remains (rest folded) → award pot, end hand.
    const alive = seats.filter((s) => s.in_hand && !s.folded);
    if (alive.length === 1) {
      await endHandSinglePlayer(tableId, state, alive[0]);
      return;
    }

    // Action deadline expired → auto-fold current actor.
    if (state.action_deadline_at && now >= new Date(state.action_deadline_at).getTime() && state.current_seat != null) {
      const cur = seats.find((s) => s.seat_no === state.current_seat);
      if (cur) {
        await updateSeat(tableId, cur.seat_no, { folded: true, last_action: "fold" });
        // Re-fetch seats for correctness, then advance.
        const fresh = await listSeats(tableId);
        await afterAction(tableId, table, state, fresh);
        return;
      }
    }
  }
}

// All non-folded actionable seats either match current_bet or are all-in,
// AND every actionable seat has acted at least once since the last raise.
function bettingClosed(seats: SeatRow[], state: StateRow): boolean {
  const actors = seats.filter((s) => s.in_hand && !s.folded && !s.is_all_in);
  if (actors.length === 0) return true;
  for (const a of actors) {
    if (a.committed_this_round !== state.current_bet) return false;
    if (a.last_action == null || a.last_action === "" || a.last_action === "blind") return false;
  }
  return true;
}

async function startNewHand(tableId: string, table: { small_blind: number; big_blind: number; max_seats: number }, prev: StateRow, seats: SeatRow[]) {
  const seated = seats.filter((s) => s.user_id != null && s.stack >= table.big_blind && !s.sitting_out);
  if (seated.length < MIN_PLAYERS_TO_START) return;

  const max = table.max_seats;
  // Move dealer button forward.
  let dealer = prev.dealer_seat ?? -1;
  const lookFrom = dealer < 0 ? -1 : dealer;
  const newDealer = nextOccupiedSeat(seats, lookFrom, max);
  if (newDealer == null) return;

  // Reset all seats.
  for (const s of seats) {
    const playing = s.user_id != null && s.stack >= table.big_blind && !s.sitting_out;
    await updateSeat(tableId, s.seat_no, {
      hole_cards: [],
      committed_this_round: 0,
      committed_total: 0,
      is_all_in: false,
      folded: false,
      in_hand: playing,
      last_action: "",
    });
  }
  const fresh = await listSeats(tableId);

  // Find blinds (the next two occupied seats clockwise from dealer that are in_hand).
  const sb = nextActionableSeat(fresh, newDealer, max);
  if (sb == null) return;
  const bb = nextActionableSeat(fresh, sb, max);
  if (bb == null) return;

  // Post blinds (cap at stack, possibly all-in).
  const sbSeat = fresh.find((x) => x.seat_no === sb)!;
  const bbSeat = fresh.find((x) => x.seat_no === bb)!;
  const sbAmt = Math.min(table.small_blind, sbSeat.stack);
  const bbAmt = Math.min(table.big_blind, bbSeat.stack);
  await updateSeat(tableId, sb, {
    stack: sbSeat.stack - sbAmt,
    committed_this_round: sbAmt,
    committed_total: sbAmt,
    is_all_in: sbSeat.stack - sbAmt === 0,
    last_action: "blind",
  });
  await updateSeat(tableId, bb, {
    stack: bbSeat.stack - bbAmt,
    committed_this_round: bbAmt,
    committed_total: bbAmt,
    is_all_in: bbSeat.stack - bbAmt === 0,
    last_action: "blind",
  });

  // Deal hole cards.
  const deck = freshDeck(1);
  for (const s of fresh) {
    if (!s.in_hand) continue;
    const c1 = deck.pop()!;
    const c2 = deck.pop()!;
    await updateSeat(tableId, s.seat_no, { hole_cards: [c1, c2] });
  }

  // First to act preflop = next actionable after BB.
  const firstActor = nextActionableSeat(await listSeats(tableId), bb, max);

  await updateState(tableId, {
    status: "preflop",
    hand_no: prev.hand_no + 1,
    deck: deck as unknown as Card[],
    community: [],
    dealer_seat: newDealer,
    current_seat: firstActor,
    action_deadline_at: new Date(Date.now() + ACTION_WINDOW_MS).toISOString(),
    pot: sbAmt + bbAmt,
    current_bet: bbAmt,
    last_raise_amount: table.big_blind,
    hand_started_at: new Date().toISOString(),
    hand_ended_at: null,
    showdown: null,
  });
}

async function clearInHandFlags(tableId: string) {
  // After a hand ends, reset the per-hand `in_hand` flag for every seat so
  // players can cash out / leave between hands.
  const seats = await listSeats(tableId);
  for (const s of seats) {
    if (s.in_hand) {
      await updateSeat(tableId, s.seat_no, { in_hand: false });
    }
  }
}

async function endHandSinglePlayer(tableId: string, state: StateRow, winnerSeat: SeatRow) {
  // Pay the entire pot to the last remaining player.
  const totalPot = state.pot;
  await updateSeat(tableId, winnerSeat.seat_no, { stack: winnerSeat.stack + totalPot });
  if (winnerSeat.user_id) {
    await credit({
      userId: winnerSeat.user_id,
      amount: 0, // chips live on the table, no wallet credit until cash-out
      reason: "poker_pot",
      refKind: "poker_pot",
      refId: `${tableId}:${state.hand_no}:fold-win`,
    }).catch(() => { /* ignore — credit is informational here */ });
  }
  await recordHandSession(tableId, state, [winnerSeat], totalPot);
  await clearInHandFlags(tableId);
  await updateState(tableId, {
    status: "showdown",
    pot: 0,
    current_bet: 0,
    last_raise_amount: 0,
    current_seat: null,
    action_deadline_at: null,
    hand_ended_at: new Date().toISOString(),
    showdown: {
      winners: [{
        userId: winnerSeat.user_id ?? "?",
        seatNo: winnerSeat.seat_no,
        amount: totalPot,
        categoryLabel: "(others folded)",
        cards: [],
      }],
      reveals: [],
      finalCommunity: state.community,
    },
  });
}

async function afterAction(tableId: string, table: { small_blind: number; big_blind: number; max_seats: number }, state: StateRow, seats: SeatRow[]) {
  // After someone acts, check if betting round closed; if so advance street.
  const fresh = await getState(tableId);
  if (!fresh) return;
  const alive = seats.filter((s) => s.in_hand && !s.folded);
  if (alive.length <= 1) {
    if (alive.length === 1) await endHandSinglePlayer(tableId, fresh, alive[0]);
    return;
  }

  if (bettingClosed(seats, fresh)) {
    await advanceStreet(tableId, table, fresh, seats);
  } else {
    // Move to next actor.
    const next = nextActionableSeat(seats, fresh.current_seat ?? -1, table.max_seats);
    if (next == null) {
      await advanceStreet(tableId, table, fresh, seats);
    } else {
      await updateState(tableId, {
        current_seat: next,
        action_deadline_at: new Date(Date.now() + ACTION_WINDOW_MS).toISOString(),
      });
    }
  }
}

async function advanceStreet(tableId: string, table: { small_blind: number; big_blind: number; max_seats: number }, state: StateRow, seats: SeatRow[]) {
  // Reset round-specific seat fields.
  for (const s of seats) {
    if (s.in_hand) await updateSeat(tableId, s.seat_no, { committed_this_round: 0, last_action: s.is_all_in || s.folded ? s.last_action : "" });
  }

  const deck = state.deck as Card[];
  const community = (state.community as Card[]).slice();

  let newStatus: PokerStatus = state.status;
  if (state.status === "preflop") {
    // Burn one then deal flop.
    deck.pop();
    community.push(deck.pop()!, deck.pop()!, deck.pop()!);
    newStatus = "flop";
  } else if (state.status === "flop") {
    deck.pop();
    community.push(deck.pop()!);
    newStatus = "turn";
  } else if (state.status === "turn") {
    deck.pop();
    community.push(deck.pop()!);
    newStatus = "river";
  } else if (state.status === "river") {
    return await runShowdown(tableId, table, state, seats);
  }

  // First to act post-flop = first actionable after dealer.
  const fresh = await listSeats(tableId);
  const first = nextActionableSeat(fresh, state.dealer_seat ?? -1, table.max_seats);

  // If everyone left is all-in, just deal remaining streets and showdown.
  const actors = fresh.filter((s) => s.in_hand && !s.folded && !s.is_all_in);
  if (actors.length === 0) {
    // Run remaining cards then showdown.
    while (community.length < 5) {
      deck.pop();
      community.push(deck.pop()!);
    }
    await updateState(tableId, {
      status: "river",
      deck: deck as unknown as Card[],
      community: community as unknown as Card[],
      current_seat: null,
      action_deadline_at: null,
      current_bet: 0,
      last_raise_amount: 0,
    });
    const refreshedState = await getState(tableId);
    if (refreshedState) await runShowdown(tableId, table, refreshedState, fresh);
    return;
  }

  await updateState(tableId, {
    status: newStatus,
    deck: deck as unknown as Card[],
    community: community as unknown as Card[],
    current_seat: first,
    action_deadline_at: first != null ? new Date(Date.now() + ACTION_WINDOW_MS).toISOString() : null,
    current_bet: 0,
    last_raise_amount: 0,
  });
}

async function runShowdown(tableId: string, _table: unknown, state: StateRow, seats: SeatRow[]) {
  const community = state.community as Card[];
  const contenders = seats.filter((s) => s.in_hand && !s.folded);

  // Side-pot computation by ascending committed_total levels.
  const levels = [...new Set(seats.filter((s) => s.committed_total > 0).map((s) => s.committed_total))].sort((a, b) => a - b);
  const pots: { amount: number; eligibleSeats: number[] }[] = [];
  let prev = 0;
  for (const lvl of levels) {
    const slice = lvl - prev;
    const contributors = seats.filter((s) => s.committed_total >= lvl);
    const eligible = contenders.filter((s) => s.committed_total >= lvl).map((s) => s.seat_no);
    const amount = slice * contributors.length;
    if (amount > 0 && eligible.length > 0) pots.push({ amount, eligibleSeats: eligible });
    else if (amount > 0) {
      // No contender eligible for this slice (everyone folded above this level) — give to last pot if any
      if (pots.length > 0) pots[pots.length - 1].amount += amount;
    }
    prev = lvl;
  }

  const showdown: ShowdownInfo = { winners: [], reveals: [], finalCommunity: community };

  // Score each contender.
  const scored = contenders.map((s) => ({
    seat: s,
    score: evaluate7([...(s.hole_cards as Card[]), ...community]),
  }));

  for (const sc of scored) {
    showdown.reveals.push({
      seatNo: sc.seat.seat_no,
      userId: sc.seat.user_id ?? "?",
      cards: sc.seat.hole_cards as Card[],
      categoryLabel: categoryLabel(sc.score.category),
    });
  }

  for (const pot of pots) {
    const eligibleScored = scored.filter((sc) => pot.eligibleSeats.includes(sc.seat.seat_no));
    if (eligibleScored.length === 0) continue;
    const bestKey = eligibleScored.reduce((best, x) => (compareScores(x.score.scoreKey, best) > 0 ? x.score.scoreKey : best), eligibleScored[0].score.scoreKey);
    const winners = eligibleScored.filter((x) => compareScores(x.score.scoreKey, bestKey) === 0);
    const share = Math.floor(pot.amount / winners.length);
    const remainder = pot.amount - share * winners.length;
    let bonus = remainder;
    for (const w of winners) {
      const give = share + (bonus > 0 ? 1 : 0);
      if (bonus > 0) bonus--;
      const fresh = await supa().from("poker_seats").select("stack").eq("table_id", tableId).eq("seat_no", w.seat.seat_no).maybeSingle();
      const stackNow = (fresh.data as { stack: number } | null)?.stack ?? w.seat.stack;
      await updateSeat(tableId, w.seat.seat_no, { stack: stackNow + give });
      showdown.winners.push({
        userId: w.seat.user_id ?? "?",
        seatNo: w.seat.seat_no,
        amount: give,
        categoryLabel: categoryLabel(w.score.category),
        cards: w.score.best5,
      });
    }
  }

  // Log a settled game_session per contender (for the bets feed + xp).
  const totalCommittedBySeat = new Map<number, number>();
  for (const s of seats) totalCommittedBySeat.set(s.seat_no, s.committed_total);
  const winningsBySeat = new Map<number, number>();
  for (const w of showdown.winners) {
    winningsBySeat.set(w.seatNo, (winningsBySeat.get(w.seatNo) ?? 0) + w.amount);
  }
  for (const s of contenders) {
    if (!s.user_id) continue;
    await insertGameSession({
      id: randomUUID(),
      user_id: s.user_id,
      game: "poker",
      bet: totalCommittedBySeat.get(s.seat_no) ?? 0,
      payout: winningsBySeat.get(s.seat_no) ?? 0,
      state: { handNo: state.hand_no, hole: s.hole_cards, community },
      status: "settled",
    });
  }

  await clearInHandFlags(tableId);
  await updateState(tableId, {
    status: "showdown",
    pot: 0,
    current_bet: 0,
    last_raise_amount: 0,
    current_seat: null,
    action_deadline_at: null,
    hand_ended_at: new Date().toISOString(),
    showdown,
  });
}

async function recordHandSession(tableId: string, state: StateRow, contenders: SeatRow[], _pot: number) {
  void tableId;
  const totalBySeat = new Map<number, number>();
  for (const s of contenders) totalBySeat.set(s.seat_no, s.committed_total);
  // Single-winner case (others folded). Just log this player as winner of what they
  // committed + what folders contributed.
  const allSeats = await listSeats((await getState(state.table_id))!.table_id);
  for (const s of allSeats) {
    if (!s.user_id) continue;
    const committed = s.committed_total;
    if (committed === 0) continue;
    const isWinner = contenders.some((c) => c.seat_no === s.seat_no);
    const payout = isWinner
      ? allSeats.reduce((sum, x) => sum + x.committed_total, 0)
      : 0;
    await insertGameSession({
      id: randomUUID(),
      user_id: s.user_id,
      game: "poker",
      bet: committed,
      payout,
      state: { handNo: state.hand_no, foldedTo: true },
      status: "settled",
    });
  }
}

// Public action handlers ---------------------------------------------

export async function applyAction(
  tableId: string,
  userId: string,
  action: "fold" | "check" | "call" | "raise" | "all_in",
  raiseTo?: number,
): Promise<{ ok: true } | { ok: false; error: string }> {
  await advance(tableId);
  const table = await getTable(tableId);
  if (!table) return { ok: false, error: "no_table" };
  const state = await getState(tableId);
  if (!state) return { ok: false, error: "no_state" };
  if (!["preflop", "flop", "turn", "river"].includes(state.status)) return { ok: false, error: "not_in_hand" };

  const seats = await listSeats(tableId);
  const seat = seats.find((s) => s.user_id === userId);
  if (!seat) return { ok: false, error: "not_seated" };
  if (seat.seat_no !== state.current_seat) return { ok: false, error: "not_your_turn" };
  if (seat.folded || !seat.in_hand || seat.is_all_in) return { ok: false, error: "cant_act" };

  const toCall = state.current_bet - seat.committed_this_round;

  if (action === "fold") {
    await updateSeat(tableId, seat.seat_no, { folded: true, last_action: "fold" });
  } else if (action === "check") {
    if (toCall > 0) return { ok: false, error: "must_call" };
    await updateSeat(tableId, seat.seat_no, { last_action: "check" });
  } else if (action === "call") {
    const pay = Math.min(toCall, seat.stack);
    const allIn = pay >= seat.stack;
    await updateSeat(tableId, seat.seat_no, {
      stack: seat.stack - pay,
      committed_this_round: seat.committed_this_round + pay,
      committed_total: seat.committed_total + pay,
      is_all_in: allIn,
      last_action: allIn ? "all_in" : "call",
    });
    await updateState(tableId, { pot: state.pot + pay });
  } else if (action === "raise") {
    if (raiseTo == null || !Number.isFinite(raiseTo)) return { ok: false, error: "raise_amount_required" };
    const minRaise = state.current_bet + Math.max(state.last_raise_amount, table.big_blind);
    if (raiseTo < minRaise) return { ok: false, error: "raise_too_small" };
    const cost = raiseTo - seat.committed_this_round;
    if (cost > seat.stack) return { ok: false, error: "insufficient_stack" };
    const allIn = cost >= seat.stack;
    await updateSeat(tableId, seat.seat_no, {
      stack: seat.stack - cost,
      committed_this_round: raiseTo,
      committed_total: seat.committed_total + cost,
      is_all_in: allIn,
      last_action: allIn ? "all_in" : "raise",
    });
    await updateState(tableId, {
      pot: state.pot + cost,
      current_bet: raiseTo,
      last_raise_amount: raiseTo - state.current_bet,
    });
    // Reset last_action for everyone else still actionable so they get to respond.
    for (const o of seats) {
      if (o.seat_no === seat.seat_no) continue;
      if (o.in_hand && !o.folded && !o.is_all_in) {
        await updateSeat(tableId, o.seat_no, { last_action: "" });
      }
    }
  } else if (action === "all_in") {
    const cost = seat.stack;
    if (cost <= 0) return { ok: false, error: "no_chips" };
    const newCommit = seat.committed_this_round + cost;
    const newCurrentBet = Math.max(state.current_bet, newCommit);
    const wasRaise = newCommit > state.current_bet;
    await updateSeat(tableId, seat.seat_no, {
      stack: 0,
      committed_this_round: newCommit,
      committed_total: seat.committed_total + cost,
      is_all_in: true,
      last_action: "all_in",
    });
    await updateState(tableId, {
      pot: state.pot + cost,
      current_bet: newCurrentBet,
      last_raise_amount: wasRaise ? newCommit - state.current_bet : state.last_raise_amount,
    });
    if (wasRaise) {
      for (const o of seats) {
        if (o.seat_no === seat.seat_no) continue;
        if (o.in_hand && !o.folded && !o.is_all_in) {
          await updateSeat(tableId, o.seat_no, { last_action: "" });
        }
      }
    }
  } else {
    return { ok: false, error: "bad_action" };
  }

  const fresh = await listSeats(tableId);
  const freshState = (await getState(tableId))!;
  await afterAction(tableId, table, freshState, fresh);
  return { ok: true };
}

// Public state view (sanitized for client) ---------------------------

export type PokerStateView = {
  serverNow: number;
  table: { id: string; name: string; smallBlind: number; bigBlind: number; maxSeats: number };
  status: PokerStatus;
  handNo: number;
  community: Card[];
  dealerSeat: number | null;
  currentSeat: number | null;
  actionDeadlineAt: string | null;
  pot: number;
  currentBet: number;
  minRaise: number;
  showdown: ShowdownInfo | null;
  seats: Array<{
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
    holeCards: Card[];     // populated only for `me`; others get []
    holeCount: number;     // 0 or 2 for in-hand
  }>;
};

export async function getStateView(tableId: string, currentUserId: string): Promise<PokerStateView | null> {
  await advance(tableId);
  const table = await getTable(tableId);
  if (!table) return null;
  const state = (await getState(tableId))!;
  const seats = await listSeats(tableId);

  // Hydrate usernames from users_public.
  const userIds = seats.map((s) => s.user_id).filter((x): x is string => !!x);
  const userInfo: Record<string, { username: string; avatar_color: string; initials: string }> = {};
  if (userIds.length > 0) {
    const { data } = await supa()
      .from("users_public")
      .select("id, username, avatar_color, initials")
      .in("id", userIds);
    if (data) {
      for (const u of data as Array<{ id: string; username: string; avatar_color: string; initials: string }>) {
        userInfo[u.id] = { username: u.username, avatar_color: u.avatar_color, initials: u.initials };
      }
    }
  }

  return {
    serverNow: Date.now(),
    table: {
      id: table.id, name: table.name,
      smallBlind: table.small_blind, bigBlind: table.big_blind,
      maxSeats: table.max_seats,
    },
    status: state.status,
    handNo: state.hand_no,
    community: state.community,
    dealerSeat: state.dealer_seat,
    currentSeat: state.current_seat,
    actionDeadlineAt: state.action_deadline_at,
    pot: state.pot,
    currentBet: state.current_bet,
    minRaise: state.current_bet + Math.max(state.last_raise_amount, table.big_blind),
    showdown: state.status === "showdown" ? state.showdown : null,
    seats: seats.map((s) => {
      const u = s.user_id ? userInfo[s.user_id] : undefined;
      const showHole = s.user_id === currentUserId || (state.status === "showdown" && s.in_hand && !s.folded);
      return {
        seatNo: s.seat_no,
        userId: s.user_id,
        username: u?.username ?? null,
        avatarColor: u?.avatar_color ?? null,
        initials: u?.initials ?? null,
        stack: s.stack,
        folded: s.folded,
        isAllIn: s.is_all_in,
        inHand: s.in_hand,
        committedThisRound: s.committed_this_round,
        committedTotal: s.committed_total,
        lastAction: s.last_action,
        holeCards: showHole ? s.hole_cards : [],
        holeCount: s.in_hand && !s.folded ? 2 : 0,
      };
    }),
  };
}

// Sit / leave helpers ------------------------------------------------

export async function sitDown(tableId: string, userId: string, buyIn: number): Promise<{ ok: true; seatNo: number } | { ok: false; error: string }> {
  const table = await getTable(tableId);
  if (!table) return { ok: false, error: "no_table" };
  if (buyIn < table.big_blind * 20) return { ok: false, error: "buyin_too_small" };
  if (buyIn > table.big_blind * 250) return { ok: false, error: "buyin_too_large" };

  const seats = await listSeats(tableId);
  if (seats.some((s) => s.user_id === userId)) return { ok: false, error: "already_seated" };
  const open = (() => {
    const taken = new Set(seats.filter((s) => s.user_id != null).map((s) => s.seat_no));
    for (let i = 0; i < table.max_seats; i++) {
      if (!taken.has(i)) return i;
    }
    return -1;
  })();
  if (open < 0) return { ok: false, error: "table_full" };

  // Debit wallet for buy-in.
  try {
    await debit({
      userId,
      amount: buyIn,
      reason: "poker_buyin",
      refKind: "poker_buyin",
      refId: `${tableId}:${userId}:${Date.now()}`,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "error";
    return { ok: false, error: msg };
  }

  const existing = seats.find((s) => s.seat_no === open);
  if (existing) {
    await updateSeat(tableId, open, {
      user_id: userId,
      stack: buyIn,
      sitting_out: false,
      hole_cards: [],
      committed_this_round: 0,
      committed_total: 0,
      is_all_in: false,
      folded: false,
      in_hand: false,
      last_action: "",
    });
  } else {
    const { error } = await supa().from("poker_seats").insert({
      table_id: tableId,
      seat_no: open,
      user_id: userId,
      stack: buyIn,
      sitting_out: false,
    });
    if (error) return { ok: false, error: error.message };
  }
  return { ok: true, seatNo: open };
}

export async function leaveTable(tableId: string, userId: string): Promise<{ ok: true; cashedOut: number } | { ok: false; error: string }> {
  const seats = await listSeats(tableId);
  const seat = seats.find((s) => s.user_id === userId);
  if (!seat) return { ok: false, error: "not_seated" };
  // Only block leaving during an active betting round AND when the player
  // hasn't folded. After hand end (showdown/cooldown/waiting) cash-out is OK.
  const state = await getState(tableId);
  const inActiveBetting =
    state && ["preflop", "flop", "turn", "river"].includes(state.status);
  if (inActiveBetting && seat.in_hand && !seat.folded) {
    return { ok: false, error: "in_hand" };
  }
  const cashedOut = seat.stack;
  if (cashedOut > 0) {
    await credit({
      userId,
      amount: cashedOut,
      reason: "poker_cashout",
      refKind: "poker_cashout",
      refId: `${tableId}:${userId}:${Date.now()}`,
    });
  }
  await updateSeat(tableId, seat.seat_no, {
    user_id: null,
    stack: 0,
    sitting_out: false,
    hole_cards: [],
    committed_this_round: 0,
    committed_total: 0,
    is_all_in: false,
    folded: false,
    in_hand: false,
    last_action: "",
  });
  return { ok: true, cashedOut };
}
