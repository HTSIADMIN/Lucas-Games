// Helpers for the daily/weekly winnings ticker. The SQL function
// `user_winnings_window(p_user_id, p_since)` does the heavy lifting;
// this module wraps the call + handles the timezone-aware "since"
// computation (start-of-local-day, Monday-00:00-local).

export type WinningsWindow = {
  bet: number;
  won: number;
  net: number;
};

/** Compute today's start in the given IANA timezone, expressed as
 *  an ISO UTC timestamp. Falls back to UTC midnight when the
 *  timezone is invalid or missing. */
export function startOfLocalToday(timeZone: string | null | undefined): Date {
  if (!timeZone) return startOfUtcToday();
  try {
    // Use Intl to get the local-time parts now, then construct a UTC
    // Date that represents the local-midnight moment.
    const fmt = new Intl.DateTimeFormat("en-US", {
      timeZone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    });
    const parts = fmt.formatToParts(new Date());
    const y = Number(parts.find((p) => p.type === "year")?.value);
    const m = Number(parts.find((p) => p.type === "month")?.value);
    const d = Number(parts.find((p) => p.type === "day")?.value);
    if (!Number.isFinite(y) || !Number.isFinite(m) || !Number.isFinite(d)) {
      return startOfUtcToday();
    }
    // Express local midnight as an instant. We approximate by taking
    // the UTC midnight of the same calendar date, then shifting by
    // the timezone's current offset.
    const guess = new Date(Date.UTC(y, m - 1, d, 0, 0, 0, 0));
    // Determine the offset between UTC and the requested zone for
    // that exact instant — pretty stable for non-DST-transition
    // moments; the worst case is ~1h, far less than the ticker's
    // intended granularity.
    const offsetMs = utcOffsetForZone(guess, timeZone);
    return new Date(guess.getTime() - offsetMs);
  } catch {
    return startOfUtcToday();
  }
}

/** Start of the current local week (Monday 00:00) in the given zone. */
export function startOfLocalWeek(timeZone: string | null | undefined): Date {
  const today = startOfLocalToday(timeZone);
  // 0 = Sun, 1 = Mon, ..., 6 = Sat. We want Monday as week start.
  const dow = today.getUTCDay(); // safe — getUTCDay reflects the UTC repr
  // The Date we built represents local-midnight as a UTC instant,
  // so its UTC day-of-week matches the local calendar day-of-week
  // for the same date. Walk back to Monday.
  const daysToMonday = (dow + 6) % 7; // 0=Mon, 1=Tue, ..., 6=Sun
  const monday = new Date(today.getTime() - daysToMonday * 24 * 60 * 60 * 1000);
  return monday;
}

function startOfUtcToday(): Date {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
}

/** Returns the (instant - localTimeAtInstant) offset in ms — i.e. how
 *  far UTC is BEHIND the requested zone at the given instant. */
function utcOffsetForZone(at: Date, timeZone: string): number {
  // Intl.DateTimeFormat with `timeZoneName: "shortOffset"` is the
  // most portable way to extract the offset, but it's a string
  // ("GMT-7", "GMT+5:30") so we parse it.
  const fmt = new Intl.DateTimeFormat("en-US", {
    timeZone,
    timeZoneName: "shortOffset",
  });
  const tzNamePart = fmt.formatToParts(at).find((p) => p.type === "timeZoneName")?.value;
  if (!tzNamePart) return 0;
  // Forms: "GMT", "GMT-7", "GMT+5:30"
  const m = tzNamePart.match(/GMT(?:([+-])(\d{1,2})(?::(\d{2}))?)?/);
  if (!m) return 0;
  if (!m[1]) return 0;
  const sign = m[1] === "-" ? -1 : 1;
  const h = Number(m[2]);
  const mi = Number(m[3] ?? "0");
  return sign * (h * 60 + mi) * 60 * 1000;
}

/** Resolve a likely IANA timezone string from a request header. */
export function timezoneFromRequest(req: Request): string | null {
  // Headers are case-insensitive in the Fetch API.
  const tz = req.headers.get("time-zone") ?? req.headers.get("x-time-zone");
  if (tz && tz.length < 60) return tz;
  return null;
}
