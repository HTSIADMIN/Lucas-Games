import { ImageResponse } from "next/og";

// Open Graph card for chat / social link previews. 1200×630.
//
// Self-contained — no external font / image fetches at request
// time. An earlier version pulled VT323 from Google Fonts on every
// scrape, which ate Discord's tight OG-scrape timeout and caused
// the card to fail. Now renders entirely with Satori's bundled
// sans + CSS visual elements, so the route is essentially as
// stable as a static PNG.
//
// To swap in a designer-made banner instead, delete this file and
// drop a 1200×630 image at `src/app/opengraph-image.png` — Next.js
// auto-uses it.

export const runtime = "edge";
export const contentType = "image/png";
export const size = { width: 1200, height: 630 };
export const alt = "Lucas Games — Pixel Saloon";

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
          // Layered saloon backdrop:
          //   1. Vertical plank stripes every 96px — barn-wood feel.
          //   2. 45° pinstripe weave at low opacity — texture so
          //      the surface isn't flat poster paper.
          //   3. Saddle vertical gradient with a soft amber pin-
          //      light at the wordmark height.
          background:
            "repeating-linear-gradient(90deg, transparent 0 95px, rgba(0,0,0,0.18) 95px 96px), repeating-linear-gradient(45deg, rgba(0,0,0,0.05) 0 6px, transparent 6px 14px), radial-gradient(ellipse at 50% 32%, rgba(255, 232, 168, 0.22) 0%, transparent 56%), linear-gradient(180deg, #4a2818 0%, #2a1810 100%)",
          position: "relative",
        }}
      >
        {/* Wordmark stack — LUCAS / GAMES on two lines as a show-
            poster brand. Each word fits the card with breathing
            room. The ink-step + cream highlight + golden glow
            sells the 'old-saloon sign' feel without the title
            looking like flat web text. */}
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            lineHeight: 0.92,
            marginBottom: 24,
          }}
        >
          {(["LUCAS", "GAMES"] as const).map((word, idx) => (
            <div
              key={word}
              style={{
                fontSize: 192,
                color: "#f5c842",
                letterSpacing: 8,
                // Step shadow stacks for a chunky pixel drop +
                // soft golden bloom behind it.
                textShadow:
                  "8px 8px 0 #1a0f08, 0 0 28px rgba(245, 200, 66, 0.55)",
                marginTop: idx === 0 ? 0 : -22,
              }}
            >
              {word}
            </div>
          ))}
        </div>

        {/* Divider — '★ PIXEL SALOON ★' flanked by thin gold
            rules. Anchors the wordmark in a horizontal axis. */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 18,
            marginBottom: 18,
          }}
        >
          <Rule width={140} />
          <Star size={22} />
          <div
            style={{
              fontSize: 36,
              color: "#fef6e4",
              letterSpacing: 14,
            }}
          >
            PIXEL SALOON
          </div>
          <Star size={22} />
          <Rule width={140} />
        </div>

        {/* Coin spread — 6 distinct disc faces fanned along an
            arc. Per-coin tilt + arc-lift give the 'hand-tossed
            on the felt' look. Two-stop radial body + small soft
            top-left pin-light + inset rim shadows mirror the
            in-game CoinSprite. */}
        <div
          style={{
            display: "flex",
            alignItems: "flex-end",
            justifyContent: "center",
            marginTop: 6,
          }}
        >
          {COINS.map((c, i) => {
            const arcLift = [50, 22, 4, 4, 22, 50][i];
            const tilt = (i - 2.5) * 5;
            const SIZE = 130;
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
                  background: `radial-gradient(circle at 50% 55%, ${c.inner} 0%, ${c.face} 45%, ${c.face} 100%)`,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  position: "relative",
                  boxShadow:
                    "inset 0 -8px 0 rgba(0,0,0,0.32), inset 0 8px 0 rgba(255,255,255,0.4), 6px 9px 0 rgba(0,0,0,0.55)",
                }}
              >
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
                    fontSize: 44,
                    color: c.ink,
                    letterSpacing: 1,
                    textShadow: "1px 1px 0 rgba(255,255,255,0.5)",
                  }}
                >
                  {c.label}
                </div>
              </div>
            );
          })}
        </div>

        {/* Tagline — high-contrast cream text on a slim ink pill so
            it reads cleanly against the dark wood without competing
            with the wordmark. Was saddle-tan #d4a574 which buried
            into the planks; cream + pill background fixes that. */}
        <div
          style={{
            position: "absolute",
            bottom: 28,
            display: "flex",
            alignItems: "center",
            padding: "8px 22px",
            background: "rgba(26, 15, 8, 0.7)",
            border: "2px solid rgba(245, 200, 66, 0.45)",
            borderRadius: 999,
            fontSize: 26,
            color: "#fef6e4",
            letterSpacing: 6,
          }}
        >
          A CASINO OF MINI-GAMES · SPIN · SLOT · CLICK · WIN
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

/** 5-pointed star drawn with a clip-path polygon. Bullets the divider. */
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
