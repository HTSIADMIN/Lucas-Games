"use client";

import { COINS, type CoinId } from "@/lib/games/penny-pinchers/catalog";
import {
  ALBUM_PAGE_COINS,
  albumPageComplete,
  albumSlotsFilled,
  albumTraitBonus,
  type AlbumPage,
  type AlbumState,
} from "@/lib/games/penny-pinchers/engine";

const PAGE_LABEL: Record<AlbumPage, string> = {
  shiny:   "Shiny",
  sticky:  "Sticky",
  foreign: "Foreign",
};

const PAGE_BLURB: Record<AlbumPage, string> = {
  shiny:   "Each filled slot adds +0.5% shiny chance. Complete the page for an extra +5%.",
  sticky:  "Each filled slot adds +1% sticky chance. Complete the page for an extra +3%.",
  foreign: "Each filled slot adds +0.5% PC on every click. Complete the page for an extra +5%.",
};

export function AlbumPanel({ album }: { album: AlbumState }) {
  return (
    <div className="stack" style={{ gap: "var(--sp-3)", overflowY: "auto", maxHeight: 480 }}>
      {(Object.keys(ALBUM_PAGE_COINS) as AlbumPage[]).map((page) => (
        <Page key={page} page={page} album={album} />
      ))}
    </div>
  );
}

function Page({ page, album }: { page: AlbumPage; album: AlbumState }) {
  const filled = albumSlotsFilled(album, page);
  const total = ALBUM_PAGE_COINS[page].length;
  const complete = albumPageComplete(album, page);
  const bonusPct = (albumTraitBonus(album, page) * 100).toFixed(1);
  return (
    <section
      style={{
        background: complete ? "var(--gold-100)" : "var(--parchment-100)",
        border: `3px solid ${complete ? "var(--gold-300)" : "var(--saddle-300)"}`,
        padding: "var(--sp-3)",
        color: "var(--ink-900)",
      }}
    >
      <div className="row" style={{ justifyContent: "space-between", alignItems: "baseline", marginBottom: 4 }}>
        <span style={{ fontFamily: "var(--font-display)", fontSize: 13, color: "var(--ink-900)" }}>
          {PAGE_LABEL[page]} {complete ? "★" : ""}
        </span>
        <span
          style={{
            fontFamily: "var(--font-display)",
            fontSize: 11,
            color: complete ? "var(--gold-500)" : "var(--saddle-400)",
          }}
        >
          {filled}/{total} · +{bonusPct}%
        </span>
      </div>
      <p className="text-mute" style={{ fontSize: 11, margin: "0 0 8px 0" }}>
        {PAGE_BLURB[page]}
      </p>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 6 }}>
        {ALBUM_PAGE_COINS[page].map((coin) => (
          <Slot key={coin} page={page} coin={coin} count={album[page]?.[coin] ?? 0} />
        ))}
      </div>
    </section>
  );
}

function Slot({ page, coin, count }: { page: AlbumPage; coin: CoinId; count: number }) {
  const got = count > 0;
  const def = COINS[coin];
  const ringColor = page === "shiny" ? "#f5c842" : page === "sticky" ? "#78dcff" : "#a8d4ff";
  return (
    <div
      title={`${def.label} · ${count}`}
      style={{
        aspectRatio: "1 / 1",
        background: got ? "var(--gold-100)" : "var(--parchment-200)",
        border: `2px solid ${got ? ringColor : "var(--saddle-300)"}`,
        display: "grid",
        placeItems: "center",
        opacity: got ? 1 : 0.55,
        position: "relative",
      }}
    >
      <span
        style={{
          width: 22,
          height: 22,
          borderRadius: "50%",
          background: got ? def.color : "#aaa",
          border: `2px solid ${def.edge}`,
          display: "block",
          boxShadow: got && page === "shiny"
            ? `0 0 0 2px ${ringColor}, 0 0 8px ${ringColor}`
            : got && (page === "sticky" || page === "foreign")
            ? `0 0 0 2px ${ringColor}`
            : undefined,
        }}
      />
      {count > 1 && (
        <span
          style={{
            position: "absolute",
            bottom: 2,
            right: 4,
            fontFamily: "var(--font-display)",
            fontSize: 10,
            color: "var(--ink-900)",
          }}
        >
          ×{count}
        </span>
      )}
    </div>
  );
}
