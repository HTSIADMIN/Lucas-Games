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
          padding: 4,
          gap: 4,
        }}
      >
        {icons.map((g) => (
          <div
            key={g.slug}
            style={{
              border: "2px solid var(--ink-900)",
              overflow: "hidden",
              minWidth: 0,
              minHeight: 0,
              position: "relative",
            }}
          >
            {/* Force the icon to fill the quadrant — GameIcon's
                default <img width=size> attributes get overridden
                by style:100% so the art reads at the full cell
                size instead of looking like a 48px chip floating
                in cream space. */}
            <GameIcon
              name={g.icon}
              size={128}
              style={{
                position: "absolute",
                inset: 0,
                width: "100%",
                height: "100%",
                objectFit: "cover",
                display: "block",
              }}
            />
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
