"use client";

import { useRef } from "react";

const PRESETS = [100, 1_000, 10_000, 100_000];

function formatPreset(n: number): string {
  if (n >= 1_000_000) return `+${n / 1_000_000}M`;
  if (n >= 1_000) return `+${n / 1_000}k`;
  return `+${n}`;
}

export function BetInput({
  value,
  onChange,
  max,
  disabled,
  defaultBet = 100,
}: {
  value: number;
  onChange: (v: number) => void;
  max: number;
  disabled?: boolean;
  /** Parent's resting/default stake. Drives the Clear button target
   *  AND the first-press replace logic — tapping +1k from a fresh
   *  control whose default is 1,000 stays at 1,000, not 2,000. */
  defaultBet?: number;
}) {
  // Track whether the player has interacted yet. The very first
  // preset press from an untouched control always REPLACES the
  // resting stake (no matter what that resting value is) instead of
  // stacking. Means a fresh 1,000-default control + tap +100k lands
  // on 100,000, not 101,000 — matches every game in the casino
  // regardless of whether it boots at $100 or $1,000. After any
  // interaction (manual edit, Clear, halve/double, prior preset) the
  // touchedRef flips and presets stack normally.
  const touchedRef = useRef(false);

  function setSafe(n: number) {
    if (!Number.isFinite(n)) n = 0;
    onChange(Math.max(0, Math.min(max, Math.floor(n))));
  }
  function addPreset(delta: number) {
    if (!touchedRef.current) {
      touchedRef.current = true;
      setSafe(delta);
      return;
    }
    setSafe(value + delta);
  }
  function clear() {
    touchedRef.current = false;
    setSafe(defaultBet);
  }
  function halve() {
    touchedRef.current = true;
    setSafe(Math.max(100, Math.floor(value / 2)));
  }
  function double() {
    touchedRef.current = true;
    setSafe(value * 2);
  }

  return (
    <div className="stack" style={{ gap: "var(--sp-3)" }}>
      <div className="between" style={{ alignItems: "baseline" }}>
        <label className="label">Bet (Coins)</label>
        <button
          type="button"
          className="btn btn-ghost btn-sm"
          onClick={clear}
          disabled={disabled}
          style={{ padding: "2px 8px", fontSize: "var(--fs-tiny)" }}
        >
          Clear
        </button>
      </div>

      {/* Amount display — theme-aware so dark themes invert: deepest
          panel tone for bg, lightest fg colour for the value text,
          fg-muted for the 'COINS' label and the value's drop shadow.
          Light themes get the same triple, just flipped (cream bg,
          ink value, mid-brown shadow). */}
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          background: "var(--bg-deep)",
          border: "3px solid var(--fg)",
          padding: "var(--sp-2) var(--sp-3)",
          width: "100%",
        }}
      >
        <span className="currency" style={{ fontFamily: "var(--font-display)", fontSize: "var(--fs-tiny)", letterSpacing: "var(--ls-loose)", color: "var(--fg-muted)" }}>
          COINS
        </span>
        <input
          type="number"
          value={value}
          min={0}
          max={max}
          onChange={(e) => {
            touchedRef.current = true;
            setSafe(Number(e.target.value));
          }}
          onFocus={(e) => e.currentTarget.select()}
          disabled={disabled}
          style={{
            border: 0,
            padding: 0,
            background: "transparent",
            boxShadow: "none",
            fontFamily: "var(--font-display)",
            fontSize: "var(--fs-h3)",
            color: "var(--fg)",
            textShadow: "2px 2px 0 var(--fg-muted)",
            textAlign: "center",
            width: "100%",
            outline: "none",
          }}
        />
      </div>

      {/* Quick-add presets — first press from the resting default
          replaces it; after that they stack (tap +1k three times
          from default = default + 2k after the replace). */}
      <div className="row" style={{ flexWrap: "wrap", justifyContent: "center" }}>
        {PRESETS.map((p) => (
          <button
            key={p}
            type="button"
            className="btn btn-ghost btn-sm"
            onClick={() => addPreset(p)}
            disabled={disabled}
          >
            {formatPreset(p)}
          </button>
        ))}
        <button
          type="button"
          className="btn btn-wood btn-sm"
          onClick={() => { touchedRef.current = true; setSafe(max); }}
          disabled={disabled}
        >
          MAX
        </button>
      </div>

      {/* ÷2 / ×2 — own row below the presets */}
      <div className="row" style={{ gap: "var(--sp-2)" }}>
        <button
          type="button"
          className="btn btn-ghost btn-sm"
          onClick={halve}
          disabled={disabled}
          aria-label="halve"
          style={{ flex: 1 }}
        >
          ÷2
        </button>
        <button
          type="button"
          className="btn btn-ghost btn-sm"
          onClick={double}
          disabled={disabled}
          aria-label="double"
          style={{ flex: 1 }}
        >
          ×2
        </button>
      </div>
    </div>
  );
}
