import { ImageResponse } from "next/og";

// Open Graph card for chat / social link previews. 1200×630.
//
// Composition: two-row vertical stack centered in the card.
//   • LUCAS / GAMES — the words split onto two lines as a giant
//     show-poster wordmark, gold ink-shadowed text on dark wood.
//   • A "PIXEL SALOON" divider with star bullets and gold rules
//     anchoring the brand axis.
//   • Six coin discs fanned along the bottom in an arc, in their
//     real per-denomination colours so the card reads as
//     'this is a casino of mini-games' at a glance.
//   • A muted parchment tagline on the bottom edge.
//
// No frame ornament, no inner box — just typography + atmosphere.

export const runtime = "edge";
export const contentType = "image/png";
export const size = { width: 1200, height: 630 };
export const alt = "Lucas Games — Pixel Saloon";

// Per-denomination palettes. Each coin gets a face colour, a rim
// edge, and a darker shade used for the inner gradient stop so
// the disc reads as a 3D coin rather than a flat circle.
//
// Penny is bronzed; nickel/dime/quarter/half walk a cooler silver
// scale (slightly cooler & lighter as the denomination climbs);
// dollar is the marquee Sacajawea gold.
const COINS: {
  id: string;
  label: string;
  face: string;
  rim: string;
  inner: string;
  ink: string;
}[] = [
  { id: "penny",   label: "1¢",  face: "#c87a3a", rim: "#5a2f12", inner: "#a05822", ink: "#2a1408" },
  { id: "nickel",  label: "5¢",  face: "#a6a6a6", rim: "#4a4a4a", inner: "#7a7a7a", ink: "#1a1a1a" },
  { id: "dime",    label: "10¢", face: "#bababa", rim: "#535353", inner: "#888888", ink: "#1a1a1a" },
  { id: "quarter", label: "25¢", face: "#cecece", rim: "#5c5c5c", inner: "#969696", ink: "#1a1a1a" },
  { id: "half",    label: "50¢", face: "#dcdcdc", rim: "#666666", inner: "#a0a0a0", ink: "#1a1a1a" },
  { id: "dollar",  label: "$1",  face: "#e8c468", rim: "#7a5510", inner: "#c89a2a", ink: "#3a2408" },
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
          color: "#fef6e4",
          // Saloon background — three layers stacked:
          //   1. Vertical plank stripes (faint, every 96px) for a
          //      barn-wood feel.
          //   2. Diagonal pinstripe weave so the surface doesn't
          //      read as flat poster paper.
          //   3. Saddle-brown vertical gradient with a soft amber
          //      glow at the wordmark height.
          background:
            "repeating-linear-gradient(90deg, transparent 0 95px, rgba(0,0,0,0.18) 95px 96px), repeating-linear-gradient(45deg, rgba(0,0,0,0.05) 0 6px, transparent 6px 14px), radial-gradient(ellipse at 50% 32%, rgba(255, 232, 168, 0.22) 0%, transparent 56%), linear-gradient(180deg, #4a2818 0%, #2a1810 100%)",
          position: "relative",
        }}
      >
        {/* Wordmark — LUCAS and GAMES stacked on two lines as a
            show-poster brand. Each word fits the card with room
            to breathe instead of squeezing onto one line that
            overflows. The ink drop shadow + golden inner glow
            give the letters the 'carved into wood' read. */}
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            lineHeight: 0.92,
            marginBottom: 28,
          }}
        >
          {(["LUCAS", "GAMES"] as const).map((word, idx) => (
            <div
              key={word}
              style={{
                fontSize: 188,
                fontWeight: 900,
                color: "#f5c842",
                letterSpacing: 6,
                textShadow:
                  "10px 10px 0 #1a0f08, -1px -1px 0 #fff2a8, 0 0 28px rgba(245, 200, 66, 0.45)",
                marginTop: idx === 0 ? 0 : -8,
              }}
            >
              {word}
            </div>
          ))}
        </div>

        {/* Divider line + PIXEL SALOON caption. Two short gold
            rules flanking the centre text + star bullets. Anchors
            the wordmark in a horizontal axis instead of letting
            it float free above the coins. */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 18,
            marginBottom: 16,
          }}
        >
          <Rule width={140} />
          <Star size={20} />
          <div
            style={{
              fontSize: 28,
              color: "#fef6e4",
              letterSpacing: 12,
              textTransform: "uppercase",
            }}
          >
            Pixel Saloon
          </div>
          <Star size={20} />
          <Rule width={140} />
        </div>

        {/* Coin spread — 6 distinct disc faces fanned along the
            bottom arc. Per-coin tilt + arc-lift give it the
            'hand-tossed across the felt' read. Gradient layering:
            small soft pin-light at top-left, radial body shading
            from face → inner → rim. Inset rim + drop shadow
            mirror the in-game CoinSprite so the OG matches the
            real play area. */}
        <div
          style={{
            display: "flex",
            alignItems: "flex-end",
            justifyContent: "center",
            marginTop: 8,
          }}
        >
          {COINS.map((c, i) => {
            // 6-coin arc: outer coins lift highest, centre coins
            // hug the baseline. Tilt is symmetric around centre.
            const arcLift = [50, 22, 4, 4, 22, 50][i];
            const tilt = (i - 2.5) * 5;
            const SIZE = 138;
            return (
              <div
                key={c.id}
                style={{
                  width: SIZE,
                  height: SIZE,
                  marginLeft: i === 0 ? 0 : -22,
                  marginBottom: arcLift,
                  transform: `rotate(${tilt}deg)`,
                  borderRadius: "50%",
                  border: `5px solid ${c.rim}`,
                  // Two-stop radial: face colour for the outer
                  // 60%, inner darker for the deep core. Reads as
                  // a struck coin face under flat light.
                  background: `radial-gradient(circle at 50% 55%, ${c.inner} 0%, ${c.face} 45%, ${c.face} 100%)`,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  position: "relative",
                  boxShadow:
                    "inset 0 -8px 0 rgba(0,0,0,0.32), inset 0 8px 0 rgba(255,255,255,0.4), 6px 9px 0 rgba(0,0,0,0.55)",
                }}
              >
                {/* Pin-light highlight at the top-left — small soft
                    circle that sells the 3D-coin read without
                    drowning the body colour the way a full white
                    centre stop would. */}
                <div
                  style={{
                    position: "absolute",
                    top: "12%",
                    left: "18%",
                    width: "30%",
                    height: "22%",
                    borderRadius: "50%",
                    background:
                      "radial-gradient(ellipse at center, rgba(255,255,255,0.7) 0%, rgba(255,255,255,0) 70%)",
                  }}
                />
                <div
                  style={{
                    fontSize: 38,
                    fontWeight: 900,
                    color: c.ink,
                    letterSpacing: 1,
                    // Subtle white shadow lifts the label off the
                    // disc face on the lighter denominations.
                    textShadow: "1px 1px 0 rgba(255,255,255,0.55)",
                  }}
                >
                  {c.label}
                </div>
              </div>
            );
          })}
        </div>

        {/* Tagline — single muted line pinned to the bottom edge,
            below the coin arc. Letter-spaced so it reads as
            small-caps signage. */}
        <div
          style={{
            position: "absolute",
            bottom: 32,
            fontSize: 22,
            color: "#d4a574",
            letterSpacing: 4,
            textTransform: "uppercase",
          }}
        >
          A casino of mini-games · spin · slot · click · win
        </div>
      </div>
    ),
    { ...size },
  );
}

/** Thin horizontal gold rule used flanking the PIXEL SALOON line. */
function Rule({ width }: { width: number }) {
  return (
    <div
      style={{
        width,
        height: 2,
        background: "#f5c842",
        boxShadow: "0 0 6px rgba(245, 200, 66, 0.5)",
      }}
    />
  );
}

/**
 * 5-pointed star drawn with a clip-path polygon. Used as bullets
 * around the divider caption.
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
        boxShadow: "0 0 10px rgba(245, 200, 66, 0.7)",
      }}
    />
  );
}
