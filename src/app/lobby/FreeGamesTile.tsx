"use client";

import { GameIcon } from "@/components/GameIcon";
import { FREE_GAMES } from "@/lib/games/freeGames";

// A second entry point to the Free Games modal — sits in the lobby
// grid alongside the paid games so players who don't notice the
// header button still find the hub. Click dispatches the same window
// event the FreeGamesButton listens for, so we don't need to lift
// the modal state into a context.

export function FreeGamesTile() {
  const open = () => window.dispatchEvent(new Event("lg:open-free-games"));
  // 2x2 montage of the free-game icons inside the tile-art slot —
  // signals "hub" rather than picking a single representative game.
  const icons = FREE_GAMES.slice(0, 4);
  return (
    <button
      type="button"
      onClick={open}
      className="tile"
      style={{
        background: "var(--gold-100)",
        cursor: "pointer",
        textAlign: "left",
        font: "inherit",
      }}
    >
      <div
        className="tile-art"
        style={{
          background: "var(--gold-200)",
          display: "grid",
          gridTemplateColumns: "1fr 1fr",
          gridTemplateRows: "1fr 1fr",
          padding: 6,
          gap: 4,
        }}
      >
        {icons.map((g) => (
          <div
            key={g.slug}
            style={{
              display: "grid",
              placeItems: "center",
              background: "var(--parchment-100)",
              border: "2px solid var(--ink-900)",
            }}
          >
            <GameIcon name={g.icon} size={48} />
          </div>
        ))}
      </div>
      <div className="tile-name">Free Games</div>
      <div className="tile-meta">
        <span className="badge badge-gold">FREE</span>
        <span>Open →</span>
      </div>
    </button>
  );
}
