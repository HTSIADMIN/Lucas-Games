"use client";

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
  function setSafe(n: number) {
    if (!Number.isFinite(n)) n = 0;
    onChange(Math.max(0, Math.min(max, Math.floor(n))));
  }
  function add(delta: number) { setSafe(value + delta); }
  function clear() { setSafe(100); }

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

      {/* Custom amount input + ÷2 / ×2 */}
      <div className="stepper" style={{ width: "100%" }}>
        <button
          type="button"
          className="stepper-btn"
          onClick={() => setSafe(Math.max(100, Math.floor(value / 2)))}
          disabled={disabled}
          aria-label="halve"
        >
          ÷2
        </button>
        <div className="stepper-amount" style={{ flex: 1 }}>
          <span className="currency">COINS</span>
          <input
            type="number"
            value={value}
            min={0}
            max={max}
            onChange={(e) => setSafe(Number(e.target.value))}
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
        <button
          type="button"
          className="stepper-btn"
          onClick={() => setSafe(value * 2)}
          disabled={disabled}
          aria-label="double"
        >
          ×2
        </button>
      </div>

      {/* Quick-add presets — pressing a preset adds it to the current bet,
          so tapping +1k three times = +3,000. */}
      <div className="row" style={{ flexWrap: "wrap" }}>
        {PRESETS.map((p) => (
          <button
            key={p}
            type="button"
            className="btn btn-ghost btn-sm"
            onClick={() => add(p)}
            disabled={disabled}
          >
            {formatPreset(p)}
          </button>
        ))}
        <button
          type="button"
          className="btn btn-wood btn-sm"
          onClick={() => setSafe(max)}
          disabled={disabled}
        >
          MAX
        </button>
      </div>
    </div>
  );
}
