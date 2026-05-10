import { ImageResponse } from "next/og";

// Open Graph card for chat / social link previews. 1200×630 saloon
// banner. Visual focus is a fanned-out coin spread (the actual coin
// denominations the player clicks in the game), with the Lucas Games
// wordmark stacked above. No frame ornament, no cobbled pixel
// graphics — just a confident colour-blocked layout.

export const runtime = "edge";
export const contentType = "image/png";
export const size = { width: 1200, height: 630 };
export const alt = "Lucas Games — Pixel Saloon";

// Coin definitions mirror the in-game COINS catalog so the OG card
// always reflects the real palette. Drawn in CSS at 132px so the
// silhouettes read at thumbnail size.
const COINS: { id: string; label: string; face: string; edge: string }[] = [
  { id: "penny",   label: "1¢",  face: "#c87a3a", edge: "#7a4a23" },
  { id: "nickel",  label: "5¢",  face: "#c0c0c0", edge: "#5a5a5a" },
  { id: "dime",    label: "10¢", face: "#bcbcbc", edge: "#666666" },
  { id: "quarter", label: "25¢", face: "#d4d4d4", edge: "#7a7a7a" },
  { id: "half",    label: "50¢", face: "#e0e0e0", edge: "#888888" },
  { id: "dollar",  label: "$1",  face: "#e8c468", edge: "#7a5510" },
];

export default async function OGImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          // Layered saloon background — diagonal pinstripe woven
          // into a deep saddle vignette. Reads as a dark wooden
          // table from a card-room ceiling lamp.
          background:
            "radial-gradient(ellipse at 50% 35%, rgba(255, 232, 168, 0.18) 0%, transparent 55%), repeating-linear-gradient(45deg, rgba(0,0,0,0.05) 0 4px, transparent 4px 12px), linear-gradient(180deg, #4a2818 0%, #2a1810 100%)",
          color: "#fef6e4",
          padding: 64,
          position: "relative",
        }}
      >
        {/* Soft gold pin-light directly behind the wordmark — adds
            depth without a cheesy radial halo on the edges. */}
        <div
          style={{
            position: "absolute",
            top: 80,
            left: "50%",
            transform: "translateX(-50%)",
            width: 760,
            height: 240,
            background:
              "radial-gradient(ellipse at center, rgba(245, 200, 66, 0.26) 0%, transparent 70%)",
          }}
        />

        {/* Wordmark stack — the real headline. Big chunky letters
            in gold with a bold ink shadow so the typography sits
            forward of every other layer. */}
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            position: "relative",
            zIndex: 2,
            marginBottom: 36,
          }}
        >
          <div
            style={{
              fontSize: 168,
              fontWeight: 900,
              color: "#f5c842",
              letterSpacing: 8,
              textShadow:
                "10px 10px 0 #1a0f08, 0 0 30px rgba(245, 200, 66, 0.4)",
              textTransform: "uppercase",
              lineHeight: 0.9,
            }}
          >
            Lucas Games
          </div>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 18,
              marginTop: 22,
            }}
          >
            <Star size={20} />
            <div
              style={{
                fontSize: 38,
                color: "#fef6e4",
                letterSpacing: 8,
                textTransform: "uppercase",
                opacity: 0.92,
              }}
            >
              Pixel Saloon
            </div>
            <Star size={20} />
          </div>
        </div>

        {/* Coin spread — 6 disc faces fanned out in an arc. Stand-
            in for a "chips on the felt" arrangement; cheaper to
            draw than a full vector star and instantly reads as
            casino. */}
        <div
          style={{
            display: "flex",
            alignItems: "flex-end",
            justifyContent: "center",
            marginTop: 8,
            position: "relative",
            zIndex: 1,
          }}
        >
          {COINS.map((c, i) => {
            // 6-coin arc: outer coins lift higher, centre coins hug
            // the baseline. Each rotates a few degrees so the spread
            // reads as hand-fanned rather than rigid.
            const arcLift = [56, 22, 4, 4, 22, 56][i];
            const tilt = (i - 2.5) * 5;
            return (
              <div
                key={c.id}
                style={{
                  width: 132,
                  height: 132,
                  marginLeft: i === 0 ? 0 : -22,
                  marginBottom: arcLift,
                  transform: `rotate(${tilt}deg)`,
                  borderRadius: "50%",
                  // Three-stop radial gradient mirrors the in-game
                  // coin face — bright pin-light on top-left,
                  // body colour, dark edge.
                  background: `radial-gradient(circle at 32% 28%, #ffffff 0%, ${c.face} 38%, ${c.face} 62%, ${c.edge} 100%)`,
                  border: `5px solid ${c.edge}`,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontSize: 32,
                  fontWeight: 900,
                  color: c.id === "dollar" || c.id === "penny" ? "#1a0f08" : "#1a1a1a",
                  textShadow: "1px 1px 0 rgba(255,255,255,0.5)",
                  boxShadow:
                    "inset 0 -6px 0 rgba(0,0,0,0.3), inset 0 6px 0 rgba(255,255,255,0.4), 6px 8px 0 rgba(0,0,0,0.5)",
                }}
              >
                {c.label}
              </div>
            );
          })}
        </div>

        {/* Tagline — small, single line of muted parchment text. */}
        <div
          style={{
            marginTop: 48,
            fontSize: 26,
            color: "#d4a574",
            letterSpacing: 2,
            position: "relative",
            zIndex: 2,
          }}
        >
          A casino of free-to-play mini-games · spin · slot · click · win
        </div>
      </div>
    ),
    { ...size },
  );
}

/**
 * 5-pointed star drawn with a single clip-path polygon — sits
 * cleanly inside the wordmark line without needing to ship a font
 * with star glyphs or rasterise an SVG.
 */
function Star({ size }: { size: number }) {
  return (
    <div
      style={{
        width: size,
        height: size,
        background: "#f5c842",
        clipPath:
          "polygon(50% 0%, 61% 35%, 98% 35%, 68% 57%, 79% 91%, 50% 70%, 21% 91%, 32% 57%, 2% 35%, 39% 35%)",
        boxShadow: "0 0 8px rgba(245, 200, 66, 0.6)",
      }}
    />
  );
}
