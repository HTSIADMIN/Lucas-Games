"use client";

import { useEffect, useState } from "react";

// Shown to a player on their first lobby visit after registering.
// The sign-in flow stamps localStorage["lg.welcomeNew"] = "1" right
// before pushing /lobby; this modal reads that flag, renders, and
// clears it on dismiss so refreshes don't replay it. The flag is
// per-browser (no DB column needed) — fine for friends-only scope.

const STORAGE_KEY = "lg.welcomeNew";

export function WelcomeModal({ startingBalance = 25_000 }: { startingBalance?: number }) {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    try {
      if (window.localStorage.getItem(STORAGE_KEY) === "1") setOpen(true);
    } catch { /* ignore */ }
  }, []);

  function dismiss() {
    try { window.localStorage.removeItem(STORAGE_KEY); } catch { /* ignore */ }
    setOpen(false);
  }

  if (!open) return null;
  return (
    <div
      onClick={dismiss}
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 220,
        background: "rgba(26, 15, 8, 0.85)",
        backdropFilter: "blur(3px)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: "var(--sp-4)",
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="panel-wood"
        style={{
          width: "min(440px, 100%)",
          padding: "var(--sp-6)",
          border: "4px solid var(--ink-900)",
          boxShadow: "var(--sh-popover), var(--glow-gold)",
          textAlign: "center",
          color: "var(--ink-900)",
          animation: "scratch-poster-slam 0.5s cubic-bezier(.4,1.8,.4,1) both",
        }}
      >
        <div
          style={{
            fontFamily: "var(--font-display)",
            fontSize: "var(--fs-h2)",
            color: "var(--gold-700)",
            textShadow: "2px 2px 0 var(--gold-100)",
            letterSpacing: "var(--ls-loose)",
            marginBottom: "var(--sp-3)",
          }}
        >
          ★ WELCOME ★
        </div>
        <p style={{ fontSize: "var(--fs-body-lg)", margin: "0 0 var(--sp-4)" }}>
          You just sat down at the table with
        </p>
        <div
          style={{
            fontFamily: "var(--font-display)",
            fontSize: 48,
            color: "var(--gold-700)",
            textShadow: "3px 3px 0 var(--ink-900), 0 0 18px rgba(245, 200, 66, 0.5)",
            marginBottom: "var(--sp-4)",
          }}
        >
          {startingBalance.toLocaleString()} ¢
        </div>
        <p style={{ fontSize: 13, marginBottom: "var(--sp-5)", color: "var(--saddle-700)" }}>
          Spin the wheel, hit the slots, take a seat at the poker table.
          Daily challenges + free arcade games refill your roll if it runs dry.
        </p>
        <button
          type="button"
          onClick={dismiss}
          className="btn btn-lg action-ready"
          style={{ width: "100%" }}
          autoFocus
        >
          Get Playing →
        </button>
      </div>
    </div>
  );
}
