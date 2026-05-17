// Site-wide named-tier number formatting.
//
// JavaScript `number` keeps integer precision up to ~9 quadrillion
// (Number.MAX_SAFE_INTEGER), then starts drifting on every arith op.
// Beyond that, idle games stop showing the raw integer anyway — they
// pivot to a named-tier abbreviation ("1.2Qa", "5.6Vg") where only
// the first few significant digits matter and float drift is invisible
// to the player.
//
// One formatter for every wallet ¢ / bet / payout / counter display
// across the casino. Drop in anywhere `toLocaleString()` used to live.
// Under 10,000 it stays exact (comma-separated) so the early game
// reads like a counter; past that it switches to named tiers.

const TIER_SUFFIXES = [
  "",     // 1e0
  "K",    // 1e3   thousand
  "M",    // 1e6   million
  "B",    // 1e9   billion
  "T",    // 1e12  trillion
  "Qa",   // 1e15  quadrillion
  "Qi",   // 1e18  quintillion
  "Sx",   // 1e21  sextillion
  "Sp",   // 1e24  septillion
  "Oc",   // 1e27  octillion
  "No",   // 1e30  nonillion
  "Dc",   // 1e33  decillion
  "UDc",  // 1e36  undecillion
  "DDc",  // 1e39  duodecillion
  "TDc",  // 1e42  tredecillion
  "QaDc", // 1e45  quattuordecillion
  "QiDc", // 1e48  quindecillion
  "SxDc", // 1e51  sexdecillion
  "SpDc", // 1e54  septendecillion
  "OcDc", // 1e57  octodecillion
  "NoDc", // 1e60  novemdecillion
  "Vg",   // 1e63  vigintillion
] as const;

export type TierSuffix = typeof TIER_SUFFIXES[number];

/** Tier index for a numeric or BigInt amount. 0 = no suffix (under
 *  10K), 1 = K, 2 = M, 3 = B, 4 = T, 5 = Qa, ... Used by display
 *  components to color or animate around tier crossings (e.g.
 *  "balance climbed M → B"). */
export function tierIndex(n: number | bigint): number {
  if (typeof n === "bigint") {
    const v = n < BigInt(0) ? -n : n;
    if (v < BigInt(10_000)) return 0;
    const digits = v.toString().length;
    return Math.min(TIER_SUFFIXES.length - 1, Math.floor((digits - 1) / 3));
  }
  if (!Number.isFinite(n) || Math.abs(n) < 10_000) return 0;
  return Math.min(TIER_SUFFIXES.length - 1, Math.floor(Math.log10(Math.abs(n)) / 3));
}

/** Plain-letter tier suffix for an amount (e.g. "B", "Qa"), or
 *  empty string under 10K. */
export function tierSuffix(n: number | bigint): TierSuffix {
  return TIER_SUFFIXES[tierIndex(n)];
}

/** CSS color string for a tier suffix. Default tiers cycle through
 *  saloon-palette accents so each new milestone reads visibly
 *  different from the last. */
export function tierColor(suffix: TierSuffix): string {
  switch (suffix) {
    case "":     return "var(--ink-900)";
    case "K":    return "var(--saddle-400)";
    case "M":    return "var(--gold-500)";
    case "B":    return "var(--cactus-500)";
    case "T":    return "var(--sky-500)";
    case "Qa":   return "#a855f7";  // purple
    case "Qi":   return "#ec4899";  // magenta
    case "Sx":   return "#f97316";  // orange
    case "Sp":   return "#14b8a6";  // teal
    case "Oc":   return "#06b6d4";  // cyan
    case "No":   return "#8b5cf6";  // violet
    case "Dc":   return "#eab308";  // amber
    case "Vg":   return "#fb7185";  // rose (top of the named ladder)
    default:     return "var(--gold-300)";
  }
}

/** Split a formatted amount into its numeric leading portion and
 *  its alphabetic tier suffix. Useful when a component wants to
 *  style the suffix separately. */
export function splitFormatted(s: string): { lead: string; suffix: string } {
  const m = s.match(/^(-?[\d,.]+)([A-Za-z]*)$/);
  if (!m) return { lead: s, suffix: "" };
  return { lead: m[1], suffix: m[2] };
}

/** Tier-formatted number. Keeps comma-separated exact display for
 *  small values so the early game reads as a counter; above 10k it
 *  switches to abbreviated tier suffixes.
 *
 *  Accepts `number` or `bigint`. BigInt callers preserve full
 *  precision past JS `Number.MAX_SAFE_INTEGER` (~9 quadrillion);
 *  the formatter inspects the digit count directly rather than
 *  going through Math.log10 so 5-vigintillion-coin amounts read
 *  correctly even when they can't fit in a double.
 *
 *  Examples:
 *    formatAmount(847)              → "847"
 *    formatAmount(12_345)           → "12.3K"
 *    formatAmount(8_456_000)        → "8.46M"
 *    formatAmount(2_300_000_000)    → "2.30B"
 *    formatAmount(7.8e12)           → "7.80T"
 *    formatAmount(4.1e15)           → "4.10Qa"
 *    formatAmount(9.9e18)           → "9.90Qi"
 *    formatAmount(1500n ** 10n)     → "57.7Qi"
 */
export function formatAmount(n: number | bigint): string {
  // BigInt path — no Math.log10, no Number cast, full precision.
  if (typeof n === "bigint") {
    if (n < BigInt(0)) return "-" + formatAmount(-n);
    if (n < BigInt(10_000)) return n.toString();
    const digits = n.toString();
    // tierIndex = floor((digits - 1) / 3). 5-digit number = K (idx 1),
    // 7-digit = M (idx 2), etc.
    const tierIndex = Math.min(TIER_SUFFIXES.length - 1, Math.floor((digits.length - 1) / 3));
    const leadingCount = digits.length - tierIndex * 3;
    // Show ~3 significant digits — match the number-path output.
    const lead = digits.slice(0, leadingCount);
    const next = digits.slice(leadingCount, leadingCount + 3);
    const suffix = TIER_SUFFIXES[tierIndex];
    let formatted: string;
    if (leadingCount === 1) {
      formatted = `${lead}.${next.slice(0, 2).padEnd(2, "0")}`;
    } else if (leadingCount === 2) {
      formatted = `${lead}.${(next[0] ?? "0")}`;
    } else {
      formatted = lead;
    }
    return formatted + suffix;
  }
  if (!Number.isFinite(n)) return n > 0 ? "∞" : "-∞";
  if (n < 0) return "-" + formatAmount(-n);
  // Floor for stability — helper drips / partial-payouts carry
  // fractional values in memory, and the player only sees the
  // whole-number portion.
  const v = Math.floor(n);
  if (v < 10_000) return v.toLocaleString();
  const tierIndex = Math.min(
    TIER_SUFFIXES.length - 1,
    Math.floor(Math.log10(v) / 3),
  );
  const scaled = v / Math.pow(1000, tierIndex);
  const suffix = TIER_SUFFIXES[tierIndex];
  // Significant-digit window: keep ~3 digits visible regardless of
  // the leading-digit count. "9.99M" → "99.9M" → "999M" → "1.00B".
  let formatted: string;
  if (scaled < 10)       formatted = scaled.toFixed(2);
  else if (scaled < 100) formatted = scaled.toFixed(1);
  else                   formatted = Math.floor(scaled).toString();
  return formatted + suffix;
}

/** Variant for per-second rates — same tiering, but always keeps two
 *  significant decimals so a slow ramp (e.g. "0.50 PC/sec → 5.00 PC/sec")
 *  reads as a real change instead of jumping straight to integers. */
export function formatRate(n: number | bigint): string {
  if (typeof n === "bigint") return formatAmount(n);
  if (!Number.isFinite(n)) return "∞";
  if (n < 0) return "-" + formatRate(-n);
  if (n < 1) return n.toFixed(2);
  if (n < 10_000) {
    return n < 100 ? n.toFixed(1) : Math.floor(n).toLocaleString();
  }
  return formatAmount(n);
}

// ============================================================
// Long-name tier formatting + parsing for the BetInput
//
// `formatAmount` renders "1.00M" / "1.45B" — compact for chips and
// HUD readouts but reads as alphabet soup at a glance. The bet
// input shows the player's stake big and prominent; long-form
// names ("1 mil", "1.5 bil", "2.3 tril") read more naturally there.
//
// `parseBetAmount` accepts the long-form names AND the short ones
// AND raw integers, so a player can type "1m", "1 mil", "1000000",
// or "1,000,000" interchangeably. Returns null on garbage so the
// input can fall back to the existing value.
// ============================================================

/** Long-form tier names matching the TIER_SUFFIXES index. Short
 *  enough to fit the bet display, readable enough that a 10-year-old
 *  understands "5 bil" without parsing "5.00B". */
const LONG_TIER_NAMES = [
  "",       // 1e0
  "k",      // 1e3   thousand
  "mil",    // 1e6   million
  "bil",    // 1e9   billion
  "tril",   // 1e12  trillion
  "quad",   // 1e15  quadrillion
  "quint",  // 1e18  quintillion
  "sext",   // 1e21  sextillion
  "sept",   // 1e24  septillion
  "oct",    // 1e27  octillion
  "non",    // 1e30  nonillion
  "dec",    // 1e33  decillion
  "udec",   // 1e36  undecillion
  "ddec",   // 1e39  duodecillion
  "tdec",   // 1e42  tredecillion
  "qadec",  // 1e45  quattuordecillion
  "qidec",  // 1e48  quindecillion
  "sxdec",  // 1e51  sexdecillion
  "spdec",  // 1e54  septendecillion
  "ocdec",  // 1e57  octodecillion
  "nodec",  // 1e60  novemdecillion
  "vig",    // 1e63  vigintillion
] as const;

/** Format an amount with long-form tier names. Mirrors `formatAmount`
 *  but uses "1 mil" / "1.5 bil" / "2.3 tril" instead of "1.00M" etc.
 *  Under 10,000 stays comma-formatted (exact). 10K - 1M shows "k"
 *  with a leading-digit count to fit ~3 significant digits. */
export function formatBetAmount(n: number | bigint): string {
  if (typeof n === "bigint") {
    if (n < BigInt(0)) return "-" + formatBetAmount(-n);
    if (n < BigInt(10_000)) return n.toString();
    const digits = n.toString();
    const tier = Math.min(LONG_TIER_NAMES.length - 1, Math.floor((digits.length - 1) / 3));
    const leadingCount = digits.length - tier * 3;
    const lead = digits.slice(0, leadingCount);
    const next = digits.slice(leadingCount, leadingCount + 3);
    let formatted: string;
    if (leadingCount === 1) formatted = `${lead}.${next.slice(0, 2).padEnd(2, "0")}`;
    else if (leadingCount === 2) formatted = `${lead}.${next[0] ?? "0"}`;
    else formatted = lead;
    return `${formatted} ${LONG_TIER_NAMES[tier]}`.trimEnd();
  }
  if (!Number.isFinite(n)) return n > 0 ? "∞" : "-∞";
  if (n < 0) return "-" + formatBetAmount(-n);
  const v = Math.floor(n);
  if (v < 10_000) return v.toLocaleString();
  const tier = Math.min(LONG_TIER_NAMES.length - 1, Math.floor(Math.log10(v) / 3));
  const scaled = v / Math.pow(1000, tier);
  let lead: string;
  if (scaled < 10) lead = scaled.toFixed(2);
  else if (scaled < 100) lead = scaled.toFixed(1);
  else lead = Math.floor(scaled).toString();
  const name = LONG_TIER_NAMES[tier];
  return name ? `${lead} ${name}` : lead;
}

// Build a lookup from any-shorthand → tier index. Accepts both the
// long names ("mil", "bil") and the short letter form ("M", "B"),
// case-insensitive. "k" maps to thousand for both forms.
const SUFFIX_TO_TIER: Record<string, number> = (() => {
  const map: Record<string, number> = {};
  LONG_TIER_NAMES.forEach((name, i) => {
    if (name) map[name.toLowerCase()] = i;
  });
  TIER_SUFFIXES.forEach((suffix, i) => {
    if (suffix) map[suffix.toLowerCase()] = i;
  });
  // A few common single-letter aliases that don't appear in the
  // short list (TIER_SUFFIXES[1] is "K" already, but covering "k"
  // explicitly for the bigger ones too in case a player types "1q"
  // for a quadrillion — match the short form's first letter).
  map["q"] = 5; // quad — disambiguates against Qi (quint) by length
  return map;
})();

/** Parse a player-entered bet string into a coin integer. Accepts:
 *    "1000000"          → 1_000_000
 *    "1,000,000"        → 1_000_000
 *    "1m" / "1 m"       → 1_000_000
 *    "1mil" / "1.5 mil" → 1_000_000 / 1_500_000
 *    "1.5b" / "1.5 bil" → 1_500_000_000
 *    "2.3t" / "2.3 tril"→ 2_300_000_000_000
 *
 *  Returns null on garbage so the caller can leave the existing
 *  value alone instead of clobbering it with NaN. Floors fractional
 *  results — coins are integer-only. */
export function parseBetAmount(input: string): number | null {
  if (typeof input !== "string") return null;
  const s = input.trim().toLowerCase().replace(/,/g, "").replace(/\s+/g, "");
  if (s === "") return null;
  // Pull off a numeric prefix and a suffix (letters). The suffix
  // can be empty, in which case the prefix is the answer.
  const m = s.match(/^([0-9]*\.?[0-9]+)([a-z]*)$/);
  if (!m) return null;
  const numPart = Number(m[1]);
  if (!Number.isFinite(numPart) || numPart < 0) return null;
  const suffix = m[2];
  if (!suffix) return Math.floor(numPart);
  const tier = SUFFIX_TO_TIER[suffix];
  if (tier == null) return null;
  // Use Math.pow(1000, tier) for the multiplier. Past Number.MAX_SAFE_INTEGER
  // this loses precision, but bet inputs are always within the player's
  // wallet — and even the top player's stack is under ~1e22 (sextillion).
  // 1e22 is well within JS double range so the multiplier is exact.
  return Math.floor(numPart * Math.pow(1000, tier));
}
