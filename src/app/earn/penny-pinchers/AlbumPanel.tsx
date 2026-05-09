"use client";

import { COINS, TRAIT_COLOR, type CoinId } from "@/lib/games/penny-pinchers/catalog";
import {
  ALBUM_PAGE_COINS,
  albumPageComplete,
  albumSlotsFilled,
  albumTraitBonus,
  type AlbumPage,
  type AlbumState,
} from "@/lib/games/penny-pinchers/engine";

const PAGE_LABEL: Record<AlbumPage, string> = {
  shiny:     "Shiny",
  sticky:    "Sticky",
  foreign:   "Foreign",
  bent:      "Bent",
  cursed:    "Cursed",
  ancient:   "Ancient",
  lightning: "Lightning",
  frosted:   "Frosted",
  lucky:     "Lucky",
};

const PAGE_BLURB: Record<AlbumPage, string> = {
  shiny:     "Each filled slot adds +0.5% shiny chance. Complete the page for an extra +5%.",
  sticky:    "Each filled slot adds +1% sticky chance. Complete the page for an extra +3%.",
  foreign:   "Each filled slot adds +0.5% PC on every click. Complete the page for an extra +5%.",
  bent:      "Each filled slot adds +0.5% bent-coin chance. Complete the page for an extra +5%.",
  cursed:    "Each filled slot adds +0.3% cursed-coin chance. Complete the page for an extra +3%.",
  ancient:   "Each filled slot adds +0.05% ancient-coin chance. Complete the page for an extra +0.5%.",
  lightning: "Each filled slot adds +0.3% lightning chance. Complete the page for an extra +3%.",
  frosted:   "Each filled slot adds +0.5% frosted chance. Complete the page for an extra +5%.",
  lucky:     "Each filled slot adds +0.5% lucky chance. Complete the page for an extra +5%.",
};

export function AlbumPanel({ album }: { album: AlbumState }) {
  // Completed pages sink to the bottom so the still-collecting
  // pages stay at the top of the scroll container.
  const pages = (Object.keys(ALBUM_PAGE_COINS) as AlbumPage[]).slice().sort((a, b) => {
    const aDone = albumPageComplete(album, a);
    const bDone = albumPageComplete(album, b);
    if (aDone !== bDone) return aDone ? 1 : -1;
    return 0;
  });
  return (
    <div className="stack pp-shop-scroll" style={{ gap: "var(--sp-3)" }}>
      <style>{`
        @keyframes pp-album-emblem-spin { to { transform: rotate(360deg); } }
        @keyframes pp-album-emblem-pulse {
          0%, 100% { transform: scale(0.95); opacity: 0.7; }
          50%      { transform: scale(1.08); opacity: 1; }
        }
        @keyframes pp-album-slot-shimmer {
          0%, 100% { box-shadow: 0 0 0 0 transparent, 0 0 0 0 transparent; }
          50%      { box-shadow: 0 0 0 2px rgba(255,255,255,0.18), 0 0 10px rgba(255,255,255,0.18); }
        }
      `}</style>
      {pages.map((page) => (
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
  const accent = TRAIT_COLOR[page];
  const pct = Math.round((filled / total) * 100);
  return (
    <section
      style={{
        background: complete ? "var(--surface-highlight)" : "var(--parchment-100)",
        // Left accent bar in the trait's signature colour — turns
        // each page into a colour-coded card without needing a
        // separate header bg per trait.
        borderLeft: `6px solid ${accent}`,
        border: `3px solid ${complete ? "var(--gold-300)" : "var(--saddle-300)"}`,
        borderLeftWidth: 6,
        borderLeftColor: accent,
        padding: "var(--sp-3)",
        color: "var(--ink-900)",
        position: "relative",
        boxShadow: complete ? `0 0 0 2px ${accent}55, 0 0 16px ${accent}33` : undefined,
      }}
    >
      {/* Header — animated trait emblem on the left, label + count on the right. */}
      <div className="row" style={{ alignItems: "center", gap: 10, marginBottom: 6 }}>
        <TraitEmblem page={page} />
        <div style={{ display: "flex", flexDirection: "column", flex: 1, gap: 2 }}>
          <div className="row" style={{ justifyContent: "space-between", alignItems: "baseline" }}>
            <span
              style={{
                fontFamily: "var(--font-display)",
                fontSize: 16,
                color: "var(--ink-900)",
                letterSpacing: "var(--ls-loose)",
                textTransform: "uppercase",
              }}
            >
              {PAGE_LABEL[page]} {complete ? "★" : ""}
            </span>
            <span
              style={{
                fontFamily: "var(--font-display)",
                fontSize: 12,
                color: complete ? "var(--gold-500)" : "var(--saddle-400)",
              }}
            >
              {filled}/{total} · +{bonusPct}%
            </span>
          </div>
          {/* Per-page progress bar — fills with the trait's accent colour. */}
          <div
            aria-hidden
            style={{
              height: 5,
              background: "var(--parchment-200)",
              border: "1px solid var(--ink-900)",
              overflow: "hidden",
            }}
          >
            <div
              style={{
                width: `${pct}%`,
                height: "100%",
                background: accent,
                transition: "width 320ms",
                boxShadow: complete ? `0 0 6px ${accent}` : undefined,
              }}
            />
          </div>
        </div>
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

/**
 * Mini animated emblem on each page header — visualises the trait's
 * signature effect in a 32px disc. Reuses the same animation
 * vocabulary as the in-play CoinSprite so the album reads as a
 * preview of what each trait actually does on the play area.
 */
function TraitEmblem({ page }: { page: AlbumPage }) {
  const accent = TRAIT_COLOR[page];
  const SIZE = 32;
  // Pick the per-trait halo style based on the trait's identity.
  const halo: { background: string; animation: string; filter: string } | null = (() => {
    switch (page) {
      case "shiny":
      case "ancient":
      case "lightning":
      case "lucky":
      case "foreign":
        // Rotating conic gradient — same vocab as the in-play halo.
        return {
          background: `conic-gradient(from 0deg, ${accent}, transparent 30%, ${accent} 50%, transparent 80%, ${accent})`,
          filter: "blur(5px)",
          animation: `pp-album-emblem-spin ${page === "ancient" ? "8s" : page === "shiny" ? "5s" : page === "lightning" ? "4.5s" : page === "lucky" ? "6s" : "7s"} linear infinite`,
        };
      case "cursed":
      case "frosted":
      case "sticky":
        // Radial pulse for the pulsing traits.
        return {
          background: `radial-gradient(circle, ${accent} 0%, transparent 70%)`,
          filter: "blur(3px)",
          animation: "pp-album-emblem-pulse 1.6s ease-in-out infinite",
        };
      case "bent":
        // Static glow — bent's identity is the tilt, not a halo.
        return null;
    }
  })();
  return (
    <span
      aria-hidden
      style={{
        position: "relative",
        width: SIZE + 12,
        height: SIZE + 12,
        flex: "0 0 auto",
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      {halo && (
        <span
          style={{
            position: "absolute",
            inset: 0,
            borderRadius: "50%",
            background: halo.background,
            filter: halo.filter,
            animation: halo.animation,
          }}
        />
      )}
      <span
        style={{
          position: "relative",
          width: SIZE,
          height: SIZE,
          borderRadius: "50%",
          background: page === "ancient"
            ? "radial-gradient(circle at 35% 30%, #b9e5c4 0%, #5fa17a 55%, #2d6240 100%)"
            : page === "cursed"
            ? "radial-gradient(circle at 35% 30%, #e0a0a0 0%, #a04040 55%, #4a0a0a 100%)"
            : page === "sticky"
            ? "radial-gradient(circle at 35% 30%, #ffd0e6 0%, #ff82c8 55%, #b8366f 100%)"
            : `radial-gradient(circle at 35% 30%, ${lighten(accent, 0.4)} 0%, ${accent} 55%, ${darken(accent, 0.35)} 100%)`,
          border: `3px solid ${darken(accent, 0.4)}`,
          boxShadow: `0 0 0 2px ${accent}, 0 0 12px ${accent}88, 2px 2px 0 rgba(0,0,0,0.4)`,
          transform: page === "bent" ? "rotate(-14deg)" : undefined,
        }}
      />
    </span>
  );
}

function Slot({ page, coin, count }: { page: AlbumPage; coin: CoinId; count: number }) {
  const got = count > 0;
  const def = COINS[coin];
  const accent = TRAIT_COLOR[page];
  return (
    <div
      title={`${def.label} · ${count}`}
      style={{
        aspectRatio: "1 / 1",
        background: got ? "var(--surface-highlight)" : "var(--parchment-200)",
        border: `2px solid ${got ? accent : "var(--saddle-300)"}`,
        display: "grid",
        placeItems: "center",
        opacity: got ? 1 : 0.5,
        position: "relative",
        boxShadow: got ? `inset 0 0 12px ${accent}40` : undefined,
        transition: "border-color 200ms, box-shadow 200ms",
      }}
    >
      {/* Got-slot halo behind the disc — glow tint matched to the
          trait so the slot reads as 'this denomination has been
          captured with this trait' instead of a plain checkmark. */}
      {got && (
        <span
          aria-hidden
          style={{
            position: "absolute",
            inset: 6,
            borderRadius: "50%",
            background: `radial-gradient(circle, ${accent}66 0%, transparent 70%)`,
            filter: "blur(3px)",
            pointerEvents: "none",
          }}
        />
      )}
      <span
        style={{
          position: "relative",
          width: 24,
          height: 24,
          borderRadius: "50%",
          background: got ? def.color : "#aaa",
          border: `2px solid ${got ? def.edge : "#777"}`,
          boxShadow: got
            ? `0 0 0 2px ${accent}, 0 0 8px ${accent}99`
            : undefined,
          transform: got && page === "bent" ? "rotate(-14deg)" : undefined,
        }}
      />
      {count > 1 && (
        <span
          style={{
            position: "absolute",
            bottom: 1,
            right: 3,
            fontFamily: "var(--font-display)",
            fontSize: 10,
            color: "var(--ink-900)",
            background: "rgba(255,255,255,0.85)",
            padding: "0 3px",
            borderRadius: 3,
            lineHeight: "12px",
          }}
        >
          ×{count}
        </span>
      )}
    </div>
  );
}

// ============================================================
// Tiny colour helpers — saturate / desaturate the trait accent
// for the disc gradient stops without dragging in a colour lib.
// ============================================================
function lighten(hex: string, t: number): string {
  return mix(hex, "#ffffff", t);
}
function darken(hex: string, t: number): string {
  return mix(hex, "#000000", t);
}
function mix(a: string, b: string, t: number): string {
  const ar = parseInt(a.slice(1, 3), 16);
  const ag = parseInt(a.slice(3, 5), 16);
  const ab = parseInt(a.slice(5, 7), 16);
  const br = parseInt(b.slice(1, 3), 16);
  const bg = parseInt(b.slice(3, 5), 16);
  const bb = parseInt(b.slice(5, 7), 16);
  const r = Math.round(ar + (br - ar) * t);
  const g = Math.round(ag + (bg - ag) * t);
  const bl = Math.round(ab + (bb - ab) * t);
  return `#${r.toString(16).padStart(2, "0")}${g.toString(16).padStart(2, "0")}${bl.toString(16).padStart(2, "0")}`;
}
