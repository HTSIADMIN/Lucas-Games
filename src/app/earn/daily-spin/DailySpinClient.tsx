"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import type { SpinSlice } from "@/lib/games/dailySpin/engine";

type Status = {
  ready: boolean;
  availableAt: string | null;
  slices: SpinSlice[];
};

type SpinResult = {
  sliceIndex: number;
  amount: number;
  label: string;
  availableAt: string;
  balance: number;
};

const TONE_COLOR: Record<SpinSlice["tone"], string> = {
  low: "var(--saddle-300)",
  mid: "var(--cactus-300)",
  high: "var(--crimson-300)",
  jackpot: "var(--gold-300)",
};

export function DailySpinClient() {
  const router = useRouter();
  const [status, setStatus] = useState<Status | null>(null);
  const [busy, setBusy] = useState(false);
  const [angle, setAngle] = useState(0);
  const [result, setResult] = useState<SpinResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [now, setNow] = useState(Date.now());

  useEffect(() => {
    fetch("/api/earn/daily-spin").then((r) => r.json()).then(setStatus);
    const tick = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(tick);
  }, []);

  async function spin() {
    if (!status?.ready || busy) return;
    setBusy(true);
    setError(null);
    setResult(null);

    const res = await fetch("/api/earn/daily-spin", { method: "POST" });
    const data = await res.json();
    if (!res.ok) {
      setBusy(false);
      setError(data.error ?? "error");
      return;
    }

    // Animate: spin to land sliceIndex at the top (12 o'clock = 0deg).
    const slices = status.slices.length;
    const sliceAngle = 360 / slices;
    const target = -(data.sliceIndex * sliceAngle); // negative = clockwise
    const finalAngle = 360 * 6 + target; // 6 full rotations then settle
    setAngle(finalAngle);

    setTimeout(() => {
      setResult(data);
      setStatus((s) => (s ? { ...s, ready: false, availableAt: data.availableAt } : s));
      setBusy(false);
      router.refresh();
    }, 4200);
  }

  if (!status) return <p className="text-mute">Loading wheel...</p>;

  const ready = status.ready;
  const cooldownLeftMs = status.availableAt ? Math.max(0, new Date(status.availableAt).getTime() - now) : 0;
  const hh = Math.floor(cooldownLeftMs / 3600000);
  const mm = Math.floor((cooldownLeftMs % 3600000) / 60000);
  const ss = Math.floor((cooldownLeftMs % 60000) / 1000);

  const slices = status.slices;
  const sliceAngle = 360 / slices.length;

  return (
    <div className="grid grid-2" style={{ alignItems: "start" }}>
      <div className="panel" style={{ padding: "var(--sp-6)" }}>
        <div className="panel-title">The Wheel</div>

        <div
          className="center"
          style={{
            background: "var(--saddle-500)",
            border: "4px solid var(--ink-900)",
            padding: "var(--sp-7)",
            minHeight: 420,
            position: "relative",
            flexDirection: "column",
            gap: "var(--sp-4)",
          }}
        >
          <div style={{ position: "relative", width: 320, height: 320 }}>
            {/* Pointer at top */}
            <div
              style={{
                position: "absolute",
                top: -14,
                left: "50%",
                transform: "translateX(-50%)",
                width: 0,
                height: 0,
                borderLeft: "16px solid transparent",
                borderRight: "16px solid transparent",
                borderTop: "28px solid var(--gold-300)",
                filter: "drop-shadow(0 0 0 2px var(--ink-900))",
                zIndex: 2,
              }}
            />
            <div
              style={{
                width: "100%",
                height: "100%",
                borderRadius: 999,
                border: "6px solid var(--ink-900)",
                boxShadow: "0 12px 0 0 var(--ink-900)",
                position: "relative",
                overflow: "hidden",
                transform: `rotate(${angle}deg)`,
                transition: busy ? "transform 4s cubic-bezier(0.2, 0.9, 0.3, 1)" : "none",
                background: "var(--saddle-200)",
              }}
            >
              {slices.map((s, i) => {
                const start = i * sliceAngle;
                return (
                  <div
                    key={i}
                    style={{
                      position: "absolute",
                      inset: 0,
                      clipPath: `polygon(50% 50%, ${50 + 50 * Math.sin((start * Math.PI) / 180)}% ${50 - 50 * Math.cos((start * Math.PI) / 180)}%, ${50 + 50 * Math.sin(((start + sliceAngle) * Math.PI) / 180)}% ${50 - 50 * Math.cos(((start + sliceAngle) * Math.PI) / 180)}%)`,
                      background: TONE_COLOR[s.tone],
                      borderRight: "2px solid var(--ink-900)",
                    }}
                  />
                );
              })}
              {slices.map((s, i) => {
                const mid = i * sliceAngle + sliceAngle / 2;
                return (
                  <div
                    key={`l${i}`}
                    style={{
                      position: "absolute",
                      top: "50%",
                      left: "50%",
                      transform: `rotate(${mid}deg) translate(0, -110px)`,
                      transformOrigin: "center",
                      fontFamily: "var(--font-display)",
                      fontSize: 18,
                      color: s.tone === "jackpot" ? "var(--ink-900)" : "var(--parchment-50)",
                      textShadow: "1px 1px 0 var(--ink-900)",
                      width: 60,
                      textAlign: "center",
                      marginLeft: -30,
                      marginTop: -10,
                    }}
                  >
                    {s.label}
                  </div>
                );
              })}
              {/* Hub */}
              <div
                style={{
                  position: "absolute",
                  top: "50%",
                  left: "50%",
                  width: 60,
                  height: 60,
                  borderRadius: 999,
                  background: "var(--gold-300)",
                  border: "4px solid var(--ink-900)",
                  transform: "translate(-50%, -50%)",
                }}
              />
            </div>
          </div>
        </div>

        {result && (
          <div
            className="sign"
            style={{
              marginTop: "var(--sp-5)",
              display: "block",
              textAlign: "center",
              background: "var(--gold-300)",
              color: "var(--ink-900)",
            }}
          >
            +{result.amount.toLocaleString()} ¢
          </div>
        )}
        {error && <p style={{ color: "var(--crimson-500)", marginTop: "var(--sp-3)" }}>{error}</p>}
      </div>

      <div className="panel" style={{ padding: "var(--sp-6)" }}>
        <div className="panel-title">{ready ? "Ready to Spin" : "On Cooldown"}</div>
        {ready ? (
          <div className="stack-lg">
            <p className="text-mute">Free Coins for showing up. Pull the lever.</p>
            <button className="btn btn-lg btn-block" onClick={spin} disabled={busy}>
              {busy ? "Spinning..." : "Spin"}
            </button>
          </div>
        ) : (
          <div className="stack-lg">
            <p className="text-mute">
              Next spin in <b>{String(hh).padStart(2, "0")}:{String(mm).padStart(2, "0")}:{String(ss).padStart(2, "0")}</b>
            </p>
            <button className="btn btn-lg btn-block" disabled>Locked</button>
          </div>
        )}

        <div style={{ marginTop: "var(--sp-5)" }}>
          <div className="label">Payouts</div>
          <table style={{ width: "100%", fontFamily: "var(--font-display)" }}>
            <tbody>
              {slices.slice().sort((a, b) => b.amount - a.amount).map((s) => (
                <tr key={s.amount} style={{ borderBottom: "2px dashed var(--saddle-300)" }}>
                  <td style={{ padding: "var(--sp-2)" }}>
                    <span
                      style={{
                        display: "inline-block",
                        width: 14,
                        height: 14,
                        background: TONE_COLOR[s.tone],
                        border: "2px solid var(--ink-900)",
                        marginRight: 8,
                        verticalAlign: "middle",
                      }}
                    />
                    {s.label}
                  </td>
                  <td style={{ padding: "var(--sp-2)", textAlign: "right" }} className="text-money">
                    {s.amount.toLocaleString()} ¢
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
