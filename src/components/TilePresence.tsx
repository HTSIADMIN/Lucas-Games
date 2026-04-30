"use client";

import { useLive } from "@/components/social/LiveProvider";
import { Avatar } from "@/components/Avatar";

// Mini active-player count + avatar stack for a lobby game tile.
// Reads the live presence from <LiveProvider> (already mounted by
// AppLive on the lobby page) and filters by the tile's game slug.
// Renders nothing if no one's actively at that game — keeps idle
// tiles clean instead of cluttering with "0 playing".

/** Map a lobby tile slug to the presence `game` value. Both
 *  blackjack tables share one presence channel (legacy), so
 *  blackjack-mp counts everyone there. The free-arcade games are
 *  not in the lobby tile grid; if one ever gets added it can map
 *  to its own presence slug here. */
const SLUG_TO_PRESENCE: Record<string, string[]> = {
  "blackjack-mp": ["blackjack"],
  "poker": ["poker"],
  "coinflip": ["coinflip"],
  "coinflip-duel": ["coinflip-duel"],
  "dice": ["dice"],
  "scratch": ["scratch"],
  "slots": ["slots"],
  "roulette": ["roulette"],
  "mines": ["mines"],
  "plinko": ["plinko"],
  "crash": ["crash"],
};

const MAX_AVATARS = 3;

export function TilePresence({ slug }: { slug: string }) {
  const { presence, ready } = useLive();
  if (!ready) return null;
  const targets = SLUG_TO_PRESENCE[slug] ?? [slug];
  // De-dup by user id — players bouncing between tabs / pages can
  // briefly appear twice in the presence channel.
  const seen = new Set<string>();
  const here = presence.filter((p) => {
    if (!p.game || !targets.includes(p.game)) return false;
    if (seen.has(p.userId)) return false;
    seen.add(p.userId);
    return true;
  });
  if (here.length === 0) return null;

  const shown = here.slice(0, MAX_AVATARS);
  const overflow = here.length - shown.length;

  return (
    <span
      title={`${here.length} active`}
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 4,
        padding: "2px 6px",
        background: "var(--saddle-600)",
        border: "2px solid var(--ink-900)",
        color: "var(--gold-300)",
        fontFamily: "var(--font-display)",
        fontSize: 10,
        letterSpacing: "var(--ls-loose)",
        textTransform: "uppercase",
      }}
    >
      <span aria-hidden style={{
        width: 6,
        height: 6,
        borderRadius: 999,
        background: "var(--cactus-300)",
        boxShadow: "0 0 6px rgba(107,168,79,0.7)",
        animation: "tile-presence-pulse 1.4s ease-in-out infinite",
      }} />
      <span style={{ display: "inline-flex", marginLeft: 2 }}>
        {shown.map((p, i) => (
          <span
            key={p.userId}
            style={{
              marginLeft: i === 0 ? 0 : -6,
              outline: "2px solid var(--saddle-600)",
              borderRadius: 999,
              display: "inline-flex",
            }}
          >
            <Avatar
              initials={p.initials}
              color={p.avatarColor}
              size={18}
              fontSize={9}
              frame={null}
              hat={null}
            />
          </span>
        ))}
      </span>
      <span style={{ marginLeft: 4 }}>
        {here.length}
        {overflow > 0 && <span style={{ opacity: 0.7 }}>+</span>}
      </span>
    </span>
  );
}
