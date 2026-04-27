"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { GameIcon, type GameIconName } from "@/components/GameIcon";

type FreeGame = { slug: string; name: string; tag: string; icon: GameIconName };

const FREE_GAMES: FreeGame[] = [
  { slug: "daily-spin",  name: "Daily Spin",        tag: "ONCE / DAY", icon: "lobby.daily_spin" },
  { slug: "monopoly",    name: "Frontier Monopoly", tag: "EVERY HOUR", icon: "lobby.monopoly" },
  { slug: "crossy-road", name: "Crossy Road",       tag: "FREE",       icon: "lobby.crossy_road" },
  { slug: "flappy",      name: "Flappy",            tag: "FREE",       icon: "lobby.flappy" },
];

export function FreeGamesButton() {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  return (
    <>
      <button
        type="button"
        className="btn btn-gold btn-sm"
        onClick={() => setOpen(true)}
      >
        Free Games
      </button>
      {open && (
        <div
          onClick={() => setOpen(false)}
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(26, 15, 8, 0.7)",
            backdropFilter: "blur(3px)",
            zIndex: 200,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: "var(--sp-4)",
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="panel panel-wood"
            style={{
              width: "min(520px, 100%)",
              padding: "var(--sp-5)",
              background: "var(--parchment-100)",
              color: "var(--ink-900)",
              backgroundImage: "none",
              position: "relative",
            }}
          >
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                marginBottom: "var(--sp-4)",
              }}
            >
              <div
                className="uppercase"
                style={{
                  fontFamily: "var(--font-display)",
                  fontSize: "var(--fs-h3)",
                  color: "var(--gold-700)",
                }}
              >
                Free Games
              </div>
              <button
                type="button"
                onClick={() => setOpen(false)}
                aria-label="close"
                style={{
                  background: "var(--saddle-200)",
                  color: "var(--parchment-50)",
                  border: "3px solid var(--ink-900)",
                  width: 32,
                  height: 32,
                  fontFamily: "var(--font-display)",
                  fontSize: 18,
                  cursor: "pointer",
                  lineHeight: 1,
                }}
              >
                ×
              </button>
            </div>
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "1fr 1fr",
                gap: "var(--sp-3)",
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
                    <GameIcon name={g.icon} size={96} />
                  </div>
                  <div className="tile-name" style={{ fontSize: "var(--fs-body-lg)" }}>
                    {g.name}
                  </div>
                  <div className="tile-meta">
                    <span className="badge badge-gold">{g.tag}</span>
                    <span>Play →</span>
                  </div>
                </Link>
              ))}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
