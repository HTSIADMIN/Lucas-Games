"use client";

import { useRef } from "react";

const DEFAULT_BET = 100;
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
}: {
  value: number;
  onChange: (v: number) => void;
  max: number;
  disabled?: boolean;
}) {
  // Track whether the player has interacted yet. The first preset press
  // replaces the default 100 stake instead of stacking on top of it, so
  // tapping +1k from a fresh control yields 1,000 (not 1,100).
  const touchedRef = useRef(false);

  function setSafe(n: number) {
    if (!Number.isFinite(n)) n = 0;
    onChange(Math.max(0, Math.min(max, Math.floor(n))));
  }
  function addPreset(delta: number) {
    if (!touchedRef.current && value === DEFAULT_BET) {
      touchedRef.current = true;
      setSafe(delta);
      return;
    }
    touchedRef.current = true;
    setSafe(value + delta);
  }
  function clear() {
    touchedRef.current = false;
    setSafe(DEFAULT_BET);
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

      {/* Amount display */}
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          background: "var(--parchment-50)",
          border: "3px solid var(--ink-900)",
          padding: "var(--sp-2) var(--sp-3)",
          width: "100%",
        }}
      >
        <span className="currency" style={{ fontFamily: "var(--font-display)", fontSize: "var(--fs-tiny)", letterSpacing: "var(--ls-loose)", color: "var(--saddle-400)" }}>
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
            fontSize: "var(--fs-h2)",
            color: "var(--gold-500)",
            textShadow: "2px 2px 0 var(--gold-100)",
            textAlign: "center",
            width: "100%",
            outline: "none",
          }}
        />
      </div>

      {/* Quick-add presets — first press replaces the default 100 stake;
          after that they stack (tap +1k three times = +3,000). */}
      <div className="row" style={{ flexWrap: "wrap" }}>
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
