// BigInt-precise arithmetic helpers for wallet-scale amounts.
//
// JS `number` loses integer precision past 2^53 (~9 quadrillion).
// Once a player's stack is past that, `payout = bet * multiplier`
// in plain JS drifts by 1–64 ¢ per multiplication, and many spins
// compound that drift. The wallet ledger column is Postgres
// `numeric` (migration 0041) so DB storage is fine, but the JS-side
// math on the way in needs help to stay exact.
//
// The pattern: keep bet/payout amounts as BigInt, multiply by a
// fixed-point-scaled integer version of the multiplier, then divide
// out the scale. 9 decimal places (1e9 scale) is far more precision
// than any game's payout table uses (slots payback is 2 places,
// crash multipliers ~3 places), so the rounded answer is identical
// to true math at any wallet scale.

const MUL_SCALE = 1_000_000_000;
const MUL_SCALE_BIG = BigInt(MUL_SCALE);

/** Multiply a BigInt amount by a JS number multiplier with 1e-9
 *  multiplier precision. Returns the floored product as a BigInt
 *  (cents are integer-valued — fractional results are dropped). */
export function mulBigByNumber(amount: bigint, multiplier: number): bigint {
  if (!Number.isFinite(multiplier) || multiplier <= 0) return BigInt(0);
  const scaled = BigInt(Math.round(multiplier * MUL_SCALE));
  return (amount * scaled) / MUL_SCALE_BIG;
}

/** Coerce a `number | bigint` amount to BigInt. JS doubles past
 *  Number.MAX_SAFE_INTEGER can only represent integers anyway (every
 *  other one, then every fourth, etc.), so `BigInt(Math.floor(x))`
 *  is exact for any integer-valued input — fractional drift inside
 *  the safe range is also floored away. */
export function toBig(amount: number | bigint): bigint {
  if (typeof amount === "bigint") return amount;
  if (!Number.isFinite(amount)) return BigInt(0);
  return BigInt(Math.floor(amount));
}

/** Coerce a BigInt back to JS `number` for an API response. Past
 *  Number.MAX_SAFE_INTEGER this rounds to the nearest representable
 *  double (drift of up to 64 ¢), but the named-tier formatter in
 *  the UI hides those digits anyway. Use sparingly — internal math
 *  should stay in BigInt. */
export function toNum(amount: bigint): number {
  return Number(amount);
}
