import { ImageResponse } from "next/og";

// Open Graph card rendered when the site is linked in chat / social.
// 1200×630 saloon-themed banner with the pixel sheriff-star logo on
// the left and the Lucas Games wordmark + tagline on the right.
//
// Next.js wires this up automatically — every route under /app/
// inherits the card unless overridden.

export const runtime = "edge";
export const contentType = "image/png";
export const size = { width: 1200, height: 630 };
export const alt = "Lucas Games — Pixel Saloon";

export default async function OGImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          padding: 80,
          // Saddle wood gradient — matches the saloon theme.
          background:
            "radial-gradient(ellipse at 20% 30%, #6b3f24 0%, #4a2818 55%, #2a1810 100%)",
          color: "#fef6e4",
          fontFamily: "monospace",
          position: "relative",
        }}
      >
        {/* Diagonal gold pinstripe overlay — light decorative frame. */}
        <div
          style={{
            position: "absolute",
            inset: 24,
            border: "8px solid #1a0f08",
            outline: "3px solid #f5c842",
            outlineOffset: -16,
            display: "flex",
            alignItems: "center",
            gap: 56,
            padding: "0 64px",
          }}
        >
          {/* Pixel sheriff-star mark — drawn directly with rects so we
              don't need to ship the SVG to Satori. Mirrors the proportions
              of /public/logo-mark.svg in a single block. */}
          <Logo />
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              gap: 18,
            }}
          >
            <div
              style={{
                fontSize: 116,
                color: "#f5c842",
                letterSpacing: 6,
                textShadow: "8px 8px 0 #1a0f08",
                textTransform: "uppercase",
                lineHeight: 1,
              }}
            >
              Lucas Games
            </div>
            <div
              style={{
                fontSize: 36,
                color: "#fef6e4",
                letterSpacing: 4,
                textTransform: "uppercase",
                opacity: 0.85,
              }}
            >
              ★ Pixel Saloon ★
            </div>
            <div
              style={{
                fontSize: 22,
                color: "#d4a574",
                marginTop: 8,
                letterSpacing: 1,
              }}
            >
              A wild-west casino of mini-games. Spin · Slot · Click · Win.
            </div>
          </div>
        </div>
      </div>
    ),
    { ...size },
  );
}

/**
 * Sheriff-star pixel logo, hand-built from coloured <div>s scaled
 * for the OG card. Each cell is 24px so the silhouette reads
 * crisply at thumbnail size on Twitter / Discord / Slack previews.
 */
function Logo() {
  // 12-column × 12-row grid sketching the star + ring outline. 1 =
  // ink-dark, 2 = gold body, 3 = gold highlight, 0 = transparent.
  const PX = 24;
  const grid = [
    "000011110000",
    "000012210000",
    "000122222100",
    "010122332210",
    "111223333221",
    "122233333322",
    "122233333322",
    "111223333221",
    "010122332210",
    "000122222100",
    "000012210000",
    "000011110000",
  ];
  const colour = (c: string) =>
    c === "1" ? "#1a0f08" : c === "2" ? "#f5c842" : c === "3" ? "#fff2a8" : "transparent";
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        flex: "0 0 auto",
        boxShadow: "16px 16px 0 #1a0f08",
      }}
    >
      {grid.map((row, ri) => (
        <div key={ri} style={{ display: "flex" }}>
          {row.split("").map((cell, ci) => (
            <div
              key={ci}
              style={{
                width: PX,
                height: PX,
                background: colour(cell),
              }}
            />
          ))}
        </div>
      ))}
    </div>
  );
}
