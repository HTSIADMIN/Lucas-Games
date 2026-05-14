// Cookie Clicker-style named-tier number formatting.
//
// JavaScript `number` keeps integer precision up to ~9 quadrillion
// (Number.MAX_SAFE_INTEGER), then starts drifting on every arith op.
// Beyond that, idle games stop showing the raw integer anyway — they
// pivot to a named-tier abbreviation ("1.2Qa", "5.6Vg") where only
// the first few significant digits matter and float drift is
// invisible to the player.
//
// This module is the sole formatter for Penny Pinchers PC / wallet ¢
// displays. Drop it in anywhere a `toLocaleString()` used to live.
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

/** Tier-formatted number. Keeps comma-separated exact display for
 *  small values so the early game reads as a counter; above 10k it
 *  switches to abbreviated tier suffixes.
 *
 *  Examples:
 *    formatPC(847)            → "847"
 *    formatPC(12_345)         → "12.3K"
 *    formatPC(8_456_000)      → "8.46M"
 *    formatPC(2_300_000_000)  → "2.30B"
 *    formatPC(7.8e12)         → "7.80T"
 *    formatPC(4.1e15)         → "4.10Qa"
 *    formatPC(9.9e18)         → "9.90Qi"
 *    formatPC(1.5e24)         → "1.50Sp"
 */
export function formatPC(n: number): string {
  if (!Number.isFinite(n)) return n > 0 ? "∞" : "-∞";
  if (n < 0) return "-" + formatPC(-n);
  // Floor for stability — the helper drip carries fractional cents
  // in memory, and the player only sees the whole-number portion.
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
export function formatRate(n: number): string {
  if (!Number.isFinite(n)) return "∞";
  if (n < 0) return "-" + formatRate(-n);
  if (n < 1) return n.toFixed(2);
  if (n < 10_000) {
    // Keep one decimal for sub-tier rates so the ticker visibly
    // moves between integer values.
    return n < 100 ? n.toFixed(1) : Math.floor(n).toLocaleString();
  }
  return formatPC(n);
}
