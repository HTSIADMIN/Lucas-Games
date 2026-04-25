/* ============================================================
   LUCAS GAMES — SHARED REACT COMPONENTS
   Loaded via <script type="text/babel" src="components.jsx"></script>
   Exposes window.LG = { Header, Card, Chip, Coin, Die, ... }
   ============================================================ */

const SUIT_COLOR = {
  spades:   "var(--suit-spades)",
  clubs:    "var(--suit-clubs)",
  hearts:   "var(--suit-hearts)",
  diamonds: "var(--suit-diamonds)",
};

const SUIT_GLYPH = {
  spades:   "♠",
  clubs:    "♣",
  hearts:   "♥",
  diamonds: "♦",
};

/* ============================================================
   HEADER — site nav, used on every page
   ============================================================ */
function Header({ current }) {
  const links = [
    { href: "index.html",       label: "Home" },
    { href: "tokens.html",      label: "Tokens" },
    { href: "components.html",  label: "Components" },
    { href: "games.html",       label: "Games" },
    { href: "screens.html",     label: "Screens" },
  ];
  return (
    <header className="site-header">
      <a className="brand" href="index.html">
        <img src="assets/logo-mark.svg" alt="" className="brand-mark" />
        <div>
          <div className="brand-name">Lucas Games</div>
          <div className="brand-tag">Pixel Saloon · Est. 1881</div>
        </div>
      </a>
      <nav className="site-nav">
        {links.map(l => (
          <a key={l.href} href={l.href}
             aria-current={current === l.href ? "page" : undefined}>
            {l.label}
          </a>
        ))}
      </nav>
    </header>
  );
}

/* ============================================================
   PAGE HERO
   ============================================================ */
function PageHero({ eyebrow, title, lede }) {
  return (
    <div className="page-hero">
      {eyebrow && <div className="eyebrow">{eyebrow}</div>}
      <h1>{title}</h1>
      {lede && <p>{lede}</p>}
    </div>
  );
}

/* ============================================================
   SECTION
   ============================================================ */
function Section({ num, title, children, action }) {
  return (
    <section className="section">
      <div className="section-head">
        <div style={{display:"flex", alignItems:"baseline", gap:"var(--sp-3)"}}>
          {num && <span className="section-num">§{num}</span>}
          <h2>{title}</h2>
        </div>
        {action}
      </div>
      {children}
    </section>
  );
}

/* ============================================================
   SUIT GLYPH (pixel) — uses the SVG suit asset
   ============================================================ */
function Suit({ kind, size = 24 }) {
  const file = kind.replace(/s$/, "");
  return (
    <img src={`assets/suit-${file}.svg`} alt={kind}
         style={{width: size, height: size, display: "inline-block"}} />
  );
}

/* ============================================================
   PLAYING CARD — pixel-styled
   ============================================================ */
const FACE_RANKS = { J: "j", Q: "q", K: "k" };

function PlayingCard({ rank = "A", suit = "spades", faceDown = false,
                      size = "md", style, hoverable = false }) {
  const sizes = {
    sm: { w: 64,  h: 96,  rank: 18, suit: 16, suitBig: 36 },
    md: { w: 96,  h: 144, rank: 28, suit: 24, suitBig: 56 },
    lg: { w: 144, h: 216, rank: 40, suit: 32, suitBig: 88 },
  };
  const s = sizes[size];
  const color = SUIT_COLOR[suit];
  const isFace = FACE_RANKS[rank];

  if (faceDown) {
    return (
      <div className={"pcard pcard-back" + (hoverable ? " is-hoverable" : "")}
           style={{ width: s.w, height: s.h, ...style }}>
        <div className="pcard-back-pattern"></div>
        <div className="pcard-back-emblem">★</div>
      </div>
    );
  }

  return (
    <div className={"pcard" + (hoverable ? " is-hoverable" : "")}
         style={{ width: s.w, height: s.h, ...style }}>
      <div className="pcard-corner pcard-corner-tl" style={{ color, zIndex: 2 }}>
        <div className="pcard-rank" style={{ fontSize: s.rank }}>{rank}</div>
        <Suit kind={suit} size={s.suit} />
      </div>
      <div className="pcard-center">
        {isFace ? (
          <div className="pcard-face-frame" style={{ borderColor: color }}>
            <img src={`assets/face-${isFace}-${suit}.svg`} alt={rank}
                 style={{ width:"100%", height:"100%", objectFit:"contain",
                          display:"block" }} />
          </div>
        ) : (
          <Suit kind={suit} size={s.suitBig} />
        )}
      </div>
      <div className="pcard-corner pcard-corner-br" style={{ color, zIndex: 2 }}>
        <div className="pcard-rank" style={{ fontSize: s.rank }}>{rank}</div>
        <Suit kind={suit} size={s.suit} />
      </div>
    </div>
  );
}

/* ============================================================
   POKER CHIP
   ============================================================ */
const CHIP_COLORS = {
  white:   { face: "#fef6e4", edge: "#d4a574", text: "#1a0f08", value: "$1" },
  red:     { face: "#e05a3c", edge: "#8b3a3a", text: "#fef6e4", value: "$5" },
  blue:    { face: "#5fa8d3", edge: "#2c6a8e", text: "#fef6e4", value: "$25" },
  green:   { face: "#6ba84f", edge: "#3d6b2e", text: "#fef6e4", value: "$100" },
  black:   { face: "#2a1810", edge: "#1a0f08", text: "#f5c842", value: "$500" },
  gold:    { face: "#f5c842", edge: "#c8941d", text: "#1a0f08", value: "$1K" },
};

function Chip({ color = "red", value, size = 64, style, stack = 0 }) {
  const c = CHIP_COLORS[color] || CHIP_COLORS.red;
  const v = value || c.value;
  const px = size;
  const fontSize = Math.round(px * 0.28);

  return (
    <div className="chip-wrap" style={{ width: px, height: px + stack * 4, ...style }}>
      {Array.from({length: stack}).map((_, i) => (
        <div key={i} className="chip chip-stack-layer"
             style={{
               width: px, height: px,
               background: c.face,
               borderColor: c.edge,
               bottom: i * 4,
             }} />
      ))}
      <div className="chip" style={{
            width: px, height: px,
            background: c.face,
            borderColor: c.edge,
            bottom: stack * 4,
          }}>
        {/* notches */}
        <div className="chip-notches" style={{ background:
          `repeating-conic-gradient(${c.edge} 0deg 12deg, transparent 12deg 36deg)` }} />
        {/* inner */}
        <div className="chip-inner" style={{ background: c.face, borderColor: c.edge }}>
          <div className="chip-value" style={{ color: c.text, fontSize }}>{v}</div>
        </div>
      </div>
    </div>
  );
}

/* ============================================================
   COIN
   ============================================================ */
function Coin({ side = "heads", size = 80, style }) {
  return (
    <div className="coin" style={{ width: size, height: size, ...style }}>
      <div className="coin-face">
        {side === "heads" ? (
          <span className="coin-glyph">★</span>
        ) : (
          <span className="coin-glyph" style={{fontSize: size*0.45}}>L</span>
        )}
      </div>
    </div>
  );
}

/* ============================================================
   DIE
   ============================================================ */
function Die({ value = 1, size = 64, style, color = "ivory" }) {
  // 3-column × 3-row pip grid, traditional 5-pattern
  const dotPositions = {
    1: [[1,1]],
    2: [[0,0],[2,2]],
    3: [[0,0],[1,1],[2,2]],
    4: [[0,0],[0,2],[2,0],[2,2]],
    5: [[0,0],[0,2],[1,1],[2,0],[2,2]],
    6: [[0,0],[0,1],[0,2],[2,0],[2,1],[2,2]],
  };
  const dots = dotPositions[value] || [];
  const palette = color === "crimson"
    ? { face: "var(--crimson-300)", edge: "var(--crimson-700)", pip: "#fef6e4", pipShade: "var(--crimson-700)" }
    : { face: "var(--parchment-50)", edge: "var(--saddle-300)", pip: "var(--ink-900)", pipShade: "var(--saddle-400)" };

  const dotSize = Math.max(6, Math.round(size * 0.16));
  // grid cells positioned via CSS grid for perfect symmetry
  return (
    <div className="die" style={{
      width: size, height: size, ...style,
      background: palette.face,
      borderColor: "var(--ink-900)",
      boxShadow: `inset 0 ${Math.max(3, size*0.08)}px 0 0 rgba(255,255,255,0.5),
                  inset 0 -${Math.max(3, size*0.08)}px 0 0 ${palette.edge},
                  inset ${Math.max(3, size*0.08)}px 0 0 0 rgba(255,255,255,0.18),
                  inset -${Math.max(3, size*0.08)}px 0 0 0 ${palette.edge},
                  0 4px 0 0 var(--ink-900)`,
    }}>
      {dots.map(([col,row], i) => {
        const pad = size * 0.22;
        const inner = size - pad*2 - dotSize;
        return (
          <div key={i} style={{
            position: "absolute",
            width: dotSize, height: dotSize,
            left: pad + (inner/2)*col,
            top:  pad + (inner/2)*row,
            background: palette.pip,
            boxShadow: `inset 0 -2px 0 0 ${palette.pipShade},
                        1px 1px 0 0 rgba(255,255,255,0.4)`,
            borderRadius: 0,
          }} />
        );
      })}
    </div>
  );
}

/* ============================================================
   STAT CALLOUT — generic readout
   ============================================================ */
function Stat({ label, value, color = "money", glow = false }) {
  const palette = {
    money:   { c: "var(--gold-300)",    s: "var(--gold-700)" },
    win:     { c: "var(--cactus-300)",  s: "var(--cactus-700)" },
    loss:    { c: "var(--crimson-300)", s: "var(--crimson-700)" },
    info:    { c: "var(--sky-300)",     s: "var(--sky-700)" },
  };
  const p = palette[color] || palette.money;
  return (
    <div className="stat-callout" style={glow ? {boxShadow:"var(--glow-gold)"} : {}}>
      <div className="stat-label">{label}</div>
      <div className="stat-value" style={{color: p.c, textShadow:`2px 2px 0 ${p.s}`}}>
        {value}
      </div>
    </div>
  );
}

/* ============================================================
   EXPORT
   ============================================================ */
Object.assign(window, {
  LG_Header: Header,
  PageHero, Section,
  Suit, PlayingCard,
  Chip, Coin, Die,
  Stat,
  SUIT_COLOR, SUIT_GLYPH,
});
