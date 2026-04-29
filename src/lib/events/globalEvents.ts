// Global gamewide events — module-level state that any route or
// client can read. The first event in the V2 set is "Lucky Hour":
// once a day at a randomized hour, all coin-flavored credits
// (game wins) get a 1.25× multiplier. Visible via the
// /api/events route + a global <EventTicker> in the header.

import { randomInt } from "node:crypto";

export type GlobalEvent =
  | {
      kind: "lucky_hour";
      /** Multiplier applied to wins. */
      multiplier: number;
      /** Epoch ms when this event ends. */
      endsAt: number;
      title: string;
      blurb: string;
    };

const LUCKY_HOUR_DURATION_MS = 60 * 60 * 1000;
/** Cooldown between lucky hours — once it ends we wait this long
 *  before the next one can start. ~6h average gap so it feels
 *  surprising but not relentless. */
const COOLDOWN_MS = 5 * 60 * 60 * 1000;
/** Probability per "rotateIfStale" call (every state read) that a
 *  new lucky hour kicks off, after the cooldown has elapsed. ~3%
 *  per minute of poll = expected ~30min to fire. */
const KICKOFF_CHANCE_PER_TICK = 0.05;

let _current: GlobalEvent | null = null;
/** Next-eligible-start epoch ms; rolling forward after each event. */
let _nextEligibleAt: number = Date.now();

function rotateIfStale(): void {
  const now = Date.now();
  if (_current && now >= _current.endsAt) {
    _current = null;
    _nextEligibleAt = now + COOLDOWN_MS;
  }
  if (!_current && now >= _nextEligibleAt) {
    if (Math.random() < KICKOFF_CHANCE_PER_TICK) {
      _current = {
        kind: "lucky_hour",
        multiplier: 1.25,
        endsAt: now + LUCKY_HOUR_DURATION_MS,
        title: "Lucky Hour!",
        blurb: "All wins pay 1.25× for the next hour.",
      };
    }
  }
  void randomInt; // crypto reserved for future event variants
}

export function getActiveEvent(): GlobalEvent | null {
  rotateIfStale();
  return _current;
}

/** Apply the active event's multiplier to a win amount. Used by
 *  the wallet credit() path so all server-side payouts share the
 *  same boost. Returns the same amount when no event is active. */
export function maybeBoostWin(amount: number): { amount: number; bonus: number } {
  const e = getActiveEvent();
  if (!e || e.kind !== "lucky_hour") return { amount, bonus: 0 };
  const boosted = Math.floor(amount * e.multiplier);
  return { amount: boosted, bonus: boosted - amount };
}
