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
        background: "var(--surface-highlight)",
        cursor: "pointer",
        textAlign: "left",
        font: "inherit",
      }}
    >
      {/* CSS rule scoped to the 2×2 collage so each grandchild
          <img> fills its quadrant, mirroring how the regular tiles
          handle .tile-art > img. The rule lives inline because it
          applies only here. */}
      <style>{`
        .free-games-collage > div { overflow: hidden; }
        .free-games-collage > div > img {
          width: 100%; height: 100%;
          object-fit: cover;
          display: block;
        }
      `}</style>
      <div
        className="tile-art free-games-collage"
        style={{
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
              border: "2px solid var(--stroke)",
              minWidth: 0,
              minHeight: 0,
            }}
          >
            <GameIcon name={g.icon} size={128} />
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
