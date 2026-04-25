"use client";

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
  const presets = [100, 1_000, 10_000, 100_000];

  function setSafe(n: number) {
    if (!Number.isFinite(n)) n = 0;
    onChange(Math.max(0, Math.min(max, Math.floor(n))));
  }

  return (
    <div className="stack" style={{ gap: "var(--sp-3)" }}>
      <label className="label">Bet (Coins)</label>
      <div className="stepper" style={{ width: "100%" }}>
        <button
          type="button"
          className="stepper-btn"
          onClick={() => setSafe(Math.max(100, Math.floor(value / 2)))}
          disabled={disabled}
        >
          ÷2
        </button>
        <div className="stepper-amount" style={{ flex: 1 }}>
          <span className="currency">COINS</span>
          <input
            type="number"
            value={value}
            onChange={(e) => setSafe(Number(e.target.value))}
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
            }}
          />
        </div>
        <button
          type="button"
          className="stepper-btn"
          onClick={() => setSafe(value * 2)}
          disabled={disabled}
        >
          ×2
        </button>
      </div>

      <div className="row" style={{ flexWrap: "wrap" }}>
        {presets.map((p) => (
          <button
            key={p}
            type="button"
            className="btn btn-ghost btn-sm"
            onClick={() => setSafe(p)}
            disabled={disabled}
          >
            {p.toLocaleString()}
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
