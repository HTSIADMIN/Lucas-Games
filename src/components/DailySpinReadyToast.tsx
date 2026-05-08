"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useAppSnapshot } from "@/components/AppSnapshotProvider";

// Once-per-UTC-day nudge. When the player first loads the site on
// a new day and their Daily Spin cooldown has expired, slide in a
// gold toast at the top-right inviting them to spin. Dismiss
// (either via CTA click or the close button) stamps localStorage
// so it doesn't re-fire on every page navigation. The cue is
// soft — slide-in, no modal, no overlay — so it doesn't block a
// player who just wants to start playing.

const SHOWN_KEY = "lg-daily-spin-prompt-day";

const todayUtc = () => new Date().toISOString().slice(0, 10);

export function DailySpinReadyToast() {
  const { snapshot } = useAppSnapshot();
  const ready = snapshot?.earn.dailySpin.ready === true;
  const [open, setOpen] = useState(false);

  // Decide visibility once we have a snapshot. Re-evaluates if the
  // player banks a spin in another tab and the readiness flips.
  useEffect(() => {
    if (!ready) return;
    let stampedToday = false;
    try {
      const seen = localStorage.getItem(SHOWN_KEY);
      stampedToday = seen === todayUtc();
    } catch { /* private mode */ }
    if (!stampedToday) setOpen(true);
  }, [ready]);

  function dismiss() {
    setOpen(false);
    try { localStorage.setItem(SHOWN_KEY, todayUtc()); } catch { /* ignore */ }
  }

  if (!open) return null;

  return (
    <>
      <style>{`
        @keyframes daily-spin-toast-in {
          0%   { transform: translateX(120%); opacity: 0; }
          70%  { transform: translateX(-6px); opacity: 1; }
          100% { transform: translateX(0);   opacity: 1; }
        }
        @keyframes daily-spin-toast-shimmer {
          0%   { background-position: 0% 50%; }
          100% { background-position: 200% 50%; }
        }
      `}</style>
      <div
        role="status"
        aria-live="polite"
        style={{
          position: "fixed",
          top: 88,
          right: 16,
          zIndex: 250,
          maxWidth: 340,
          fontFamily: "var(--font-display)",
          color: "var(--ink-900)",
          background: "linear-gradient(90deg, var(--gold-300), var(--neon-gold), var(--gold-300))",
          backgroundSize: "200% 100%",
          border: "4px solid var(--ink-900)",
          padding: "12px 14px",
          boxShadow: "var(--sh-popover), 0 0 22px rgba(255, 196, 64, 0.55)",
          animation:
            "daily-spin-toast-in 480ms cubic-bezier(.2, .9, .3, 1.2) backwards, " +
            "daily-spin-toast-shimmer 4s linear infinite",
        }}
      >
        <div className="row" style={{ justifyContent: "space-between", alignItems: "baseline", gap: "var(--sp-2)" }}>
          <div
            style={{
              fontSize: "var(--fs-body-lg)",
              letterSpacing: "var(--ls-loose)",
              textTransform: "uppercase",
              textShadow: "1px 1px 0 var(--gold-100)",
            }}
          >
            ★ Daily Spin Ready
          </div>
          <button
            type="button"
            onClick={dismiss}
            aria-label="Dismiss"
            style={{
              background: "var(--ink-900)",
              color: "var(--gold-300)",
              border: "2px solid var(--ink-900)",
              padding: "0 6px",
              cursor: "pointer",
              fontFamily: "var(--font-display)",
              fontSize: 12,
              lineHeight: "16px",
            }}
          >
            ✕
          </button>
        </div>
        <p
          style={{
            margin: "6px 0 10px",
            fontFamily: "var(--font-body)",
            fontSize: 12,
            color: "var(--ink-900)",
            opacity: 0.85,
          }}
        >
          Free spin of the day is on the house. Don&rsquo;t leave it on the wheel.
        </p>
        <Link
          href="/earn/daily-spin"
          onClick={dismiss}
          className="btn btn-sm"
          style={{
            display: "inline-block",
            textDecoration: "none",
            background: "var(--ink-900)",
            color: "var(--gold-300)",
            border: "2px solid var(--ink-900)",
            padding: "6px 14px",
            fontFamily: "var(--font-display)",
            letterSpacing: "var(--ls-loose)",
            textTransform: "uppercase",
          }}
        >
          ✦ Spin the Wheel →
        </Link>
      </div>
    </>
  );
}
