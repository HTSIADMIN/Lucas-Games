"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { GameIcon } from "@/components/GameIcon";
import { FREE_GAMES } from "@/lib/games/freeGames";

// Pops once when a player's balance first hits zero, pointing them
// at the free-games hub so they don't think they have to top up with
// real money to keep playing. Listens to the `lg:balance` window
// event (dispatched by LiveBalance after every poll) so we don't
// need our own /api/wallet/balance poll.
//
// Once-per-browser via localStorage — the goal is discovery, not
// nagging. If they bust again later they already know free games
// exist.

const FLAG_KEY = "lg-broke-modal-shown";

export function BrokeModal() {
  const [open, setOpen] = useState(false);
  const shownRef = useRef(false);

  useEffect(() => {
    // Already-seen check happens lazily so SSR doesn't poke localStorage.
    try {
      shownRef.current = localStorage.getItem(FLAG_KEY) === "1";
    } catch { /* private mode etc. */ }
  }, []);

  useEffect(() => {
    function onBalance(e: Event) {
      const ce = e as CustomEvent<number>;
      const n = typeof ce.detail === "number" ? ce.detail : null;
      if (n !== 0) return;
      if (shownRef.current) return;
      shownRef.current = true;
      try { localStorage.setItem(FLAG_KEY, "1"); } catch { /* ignore */ }
      setOpen(true);
    }
    window.addEventListener("lg:balance", onBalance as EventListener);
    return () => window.removeEventListener("lg:balance", onBalance as EventListener);
  }, []);

  if (!open) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Out of coins"
      onClick={() => setOpen(false)}
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 9_500,
        background: "rgba(26,15,8,0.7)",
        display: "grid",
        placeItems: "center",
        padding: "var(--sp-3, 16px)",
        backdropFilter: "blur(2px)",
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="panel-wood"
        style={{
          width: "min(560px, 100%)",
          maxHeight: "calc(100vh - 32px)",
          overflowY: "auto",
          padding: "var(--sp-5)",
          border: "4px solid var(--ink-900)",
          boxShadow: "var(--sh-popover), var(--glow-gold)",
        }}
      >
        <div
          className="uppercase"
          style={{
            fontFamily: "var(--font-display)",
            fontSize: "var(--fs-h3)",
            color: "var(--gold-300)",
            letterSpacing: "var(--ls-loose)",
            textShadow: "2px 2px 0 var(--ink-900)",
            marginBottom: "var(--sp-2)",
            textAlign: "center",
          }}
        >
          Out of Coins
        </div>
        <p style={{ margin: "0 0 var(--sp-4) 0", textAlign: "center" }}>
          Tapped out? No worries — these <b>Free Games</b> top your stash up
          without spending a cent. Daily Spin, Frontier Monopoly and three
          arcade classics, all on the house.
        </p>

        <div
          style={{
            display: "grid",
            gridTemplateColumns: "1fr 1fr",
            gap: "var(--sp-3)",
            marginBottom: "var(--sp-4)",
          }}
        >
          {FREE_GAMES.map((g) => (
            <Link
              key={g.slug}
              href={`/earn/${g.slug}`}
              className="tile"
              onClick={() => setOpen(false)}
              style={{
                background: "var(--gold-100)",
                padding: "var(--sp-3)",
                gap: "var(--sp-2)",
              }}
            >
              <div className="tile-art" style={{ background: "var(--gold-200)" }}>
                <GameIcon name={g.icon} size={88} />
              </div>
              <div className="tile-name" style={{ fontSize: "var(--fs-body)" }}>
                {g.name}
              </div>
              <div className="tile-meta">
                <span className="badge badge-gold">{g.tag}</span>
                <span>Play →</span>
              </div>
            </Link>
          ))}
        </div>

        <div className="row" style={{ justifyContent: "center" }}>
          <button
            type="button"
            className="btn btn-ghost"
            onClick={() => setOpen(false)}
          >
            Maybe later
          </button>
        </div>
      </div>
    </div>
  );
}
