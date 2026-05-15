"use client";

import { useEffect, useState } from "react";
import { formatAmount } from "@/lib/format";

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
        padding: "var(--sp-3)",
      }}
    >
      <style>{`
        /* Phones get a tighter padded card so the 48px balance number
           and the tip stack fit comfortably without scrolling. */
        @media (max-width: 480px) {
          .pp-welcome-card {
            padding: var(--sp-4) !important;
          }
          .pp-welcome-card .pp-welcome-title {
            font-size: var(--fs-h3) !important;
            margin-bottom: var(--sp-2) !important;
          }
          .pp-welcome-card .pp-welcome-balance {
            font-size: 36px !important;
            margin-bottom: var(--sp-3) !important;
          }
          .pp-welcome-card .pp-welcome-tips {
            font-size: 12px !important;
            text-align: left;
          }
        }
      `}</style>
      <div
        onClick={(e) => e.stopPropagation()}
        className="panel-wood pp-welcome-card"
        style={{
          width: "min(440px, 100%)",
          maxHeight: "calc(100dvh - 32px)",
          overflowY: "auto",
          padding: "var(--sp-6)",
          border: "4px solid var(--ink-900)",
          boxShadow: "var(--sh-popover), var(--glow-gold)",
          textAlign: "center",
          color: "var(--ink-900)",
          animation: "scratch-poster-slam 0.5s cubic-bezier(.4,1.8,.4,1) both",
        }}
      >
        <div
          className="pp-welcome-title"
          style={{
            fontFamily: "var(--font-display)",
            fontSize: "var(--fs-h2)",
            color: "var(--gold-700)",
            textShadow: "2px 2px 0 var(--gold-100)",
            letterSpacing: "var(--ls-loose)",
            marginBottom: "var(--sp-3)",
          }}
        >
          ★ WELCOME TO THE SALOON ★
        </div>
        <p style={{ fontSize: "var(--fs-body-lg)", margin: "0 0 var(--sp-3)" }}>
          You just sat down at the table with
        </p>
        <div
          className="pp-welcome-balance"
          style={{
            fontFamily: "var(--font-display)",
            fontSize: 48,
            color: "var(--gold-700)",
            textShadow: "3px 3px 0 var(--ink-900), 0 0 18px rgba(245, 200, 66, 0.5)",
            marginBottom: "var(--sp-4)",
          }}
        >
          {formatAmount(startingBalance)} ¢
        </div>
        <ul
          className="pp-welcome-tips"
          style={{
            fontSize: 13,
            margin: "0 0 var(--sp-5)",
            paddingLeft: 18,
            color: "var(--saddle-700)",
            textAlign: "left",
            lineHeight: 1.5,
          }}
        >
          <li>
            <b>Penny Pinchers</b> — click coins, hire helpers, bank PC for wallet ¢. The main free path to a big stack.
          </li>
          <li>
            <b>House games</b> — slots, blackjack, crash, dice, mines, plinko, poker, roulette, scratch, coin flip.
          </li>
          <li>
            <b>Daily Spin + Daily Challenges</b> + free arcade games (Crossy Road, Flappy, Snake) keep your roll topped up.
          </li>
          <li>
            <b>Roll broke?</b> Free games never gate. You can&rsquo;t lose progress here.
          </li>
        </ul>
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
