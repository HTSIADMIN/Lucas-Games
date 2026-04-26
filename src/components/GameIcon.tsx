// Centralized icon registry. Currently emoji-backed; swap entries for SVG
// when real pixel art exists. Call sites stay the same.

const REGISTRY = {
  // Slot symbols
  "slot.boot":    { glyph: "👢", color: "var(--saddle-300)" },
  "slot.gun":     { glyph: "🔫", color: "var(--ink-800)" },
  "slot.star":    { glyph: "⭐", color: "var(--gold-300)" },
  "slot.gold":    { glyph: "💰", color: "var(--gold-500)" },
  "slot.sheriff": { glyph: "🤠", color: "var(--crimson-300)" },

  // Mines
  "mines.bomb": { glyph: "💣", color: "var(--crimson-300)" },
  "mines.gem":  { glyph: "★",  color: "var(--cactus-300)" },

  // Plinko
  "plinko.chip": { glyph: "●", color: "var(--gold-300)" },

  // Reactions (placeholders — replace with custom pixel SVGs later)
  "react.fire":   { glyph: "🔥", color: "var(--crimson-300)" },
  "react.skull":  { glyph: "💀", color: "var(--ink-900)"     },
  "react.party":  { glyph: "🎉", color: "var(--gold-300)"    },
  "react.clown":  { glyph: "🤡", color: "var(--crimson-300)" },
  "react.money":  { glyph: "💸", color: "var(--cactus-300)"  },
  "react.cowboy": { glyph: "🤠", color: "var(--saddle-300)"  },

  // Actions
  "ui.tip":  { glyph: "🎁", color: "var(--gold-300)" },
  "ui.crown": { glyph: "👑", color: "var(--gold-300)" },
  "ui.dot":  { glyph: "●", color: "var(--cactus-500)" },

  // Coin
  "coin.heads": { glyph: "H", color: "var(--ink-900)" },
  "coin.tails": { glyph: "T", color: "var(--ink-900)" },
} as const;

export type IconName = keyof typeof REGISTRY;

export function GameIcon({
  name,
  size = 24,
  className,
  style,
}: {
  name: IconName;
  size?: number;
  className?: string;
  style?: React.CSSProperties;
}) {
  const def = REGISTRY[name];
  return (
    <span
      className={className}
      aria-hidden
      style={{
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        width: size,
        height: size,
        fontSize: size * 0.85,
        lineHeight: 1,
        color: def.color,
        ...style,
      }}
    >
      {def.glyph}
    </span>
  );
}
