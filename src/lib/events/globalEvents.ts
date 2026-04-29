// Global gamewide events — entirely stateless. Vercel's serverless
// runtime tears down module-level memory on every cold start, so
// any "is an event happening right now" answer derived from a `let`
// variable would reset to `null` on each new function instance and
// the event would feel like it never sticks. Instead we derive the
// schedule deterministically from the wall clock so every server
// invocation (and every concurrent request) computes the same
// answer.
//
// Schedule for "Lucky Hour":
//   Once per UTC day. The active hour is picked deterministically
//   by hashing the current YYYY-MM-DD into a number 0..23. While
//   the wall clock is inside that hour, the event is active. The
//   hour boundary IS the natural reset, so no cooldown bookkeeping
//   is needed and every player on every server agrees on what's
//   running right now.

export type GlobalEvent =
  | {
      kind: "lucky_hour";
      multiplier: number;
      /** Epoch ms when this event ends. */
      endsAt: number;
      title: string;
      blurb: string;
    };

const LUCKY_HOUR_MULTIPLIER = 1.25;

/** Deterministic 32-bit hash of a string. Used to seed the
 *  per-day hour pick so every server picks the same hour without
 *  shared state. */
function hash32(s: string): number {
  let h = 2166136261; // FNV-1a offset
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/** Pick the lucky hour for a given UTC date (0..23). The seed
 *  includes a salt to make the schedule less guessable than just
 *  `hour = day % 24`. */
function luckyHourForDate(d: Date): number {
  const yyyy = d.getUTCFullYear();
  const mm = String(d.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(d.getUTCDate()).padStart(2, "0");
  return hash32(`lucas-games-lucky-hour:${yyyy}-${mm}-${dd}`) % 24;
}

export function getActiveEvent(): GlobalEvent | null {
  const now = new Date();
  const luckyHour = luckyHourForDate(now);
  if (now.getUTCHours() !== luckyHour) return null;
  // Build the endsAt for the top of the next hour (UTC).
  const endsAt = new Date(Date.UTC(
    now.getUTCFullYear(),
    now.getUTCMonth(),
    now.getUTCDate(),
    luckyHour + 1, // top of the next hour
    0, 0, 0,
  )).getTime();
  return {
    kind: "lucky_hour",
    multiplier: LUCKY_HOUR_MULTIPLIER,
    endsAt,
    title: "Lucky Hour!",
    blurb: `All wins pay ${LUCKY_HOUR_MULTIPLIER}× until the top of the hour.`,
  };
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

/** Helper for upcoming-event UIs that want to tease the next
 *  scheduled lucky hour. Returns null when one is currently
 *  active. */
export function getNextScheduledEvent(): { startsAt: number; endsAt: number; title: string } | null {
  const now = new Date();
  const luckyHour = luckyHourForDate(now);
  const currentHour = now.getUTCHours();
  if (currentHour === luckyHour) return null;
  // If today's lucky hour is still ahead, surface today's. Otherwise
  // surface tomorrow's.
  if (currentHour < luckyHour) {
    const startsAt = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), luckyHour, 0)).getTime();
    return { startsAt, endsAt: startsAt + 60 * 60 * 1000, title: "Lucky Hour" };
  }
  const tomorrow = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1));
  const tomorrowHour = luckyHourForDate(tomorrow);
  const startsAt = new Date(Date.UTC(tomorrow.getUTCFullYear(), tomorrow.getUTCMonth(), tomorrow.getUTCDate(), tomorrowHour, 0)).getTime();
  return { startsAt, endsAt: startsAt + 60 * 60 * 1000, title: "Lucky Hour" };
}
