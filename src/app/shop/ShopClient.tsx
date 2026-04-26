"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { CosmeticItem, Rarity } from "@/lib/shop/catalog";
import { rarityOf, RARITY_COLOR, DECK_PALETTES } from "@/lib/shop/catalog";
import { Avatar } from "@/components/Avatar";

type Equipped = {
  avatar_color: string;
  frame: string | null;
  card_deck: string;
  theme: string;
  hat: string | null;
};

const PACK_PRICE = 10_000;
const PACK_SIZE = 5;

const KIND_LABEL: Record<CosmeticItem["kind"], string> = {
  avatar_color: "Avatar Colors",
  frame: "Frames",
  hat: "Hats",
  card_deck: "Card Decks",
  theme: "Themes",
};

const THEME_SWATCHES: Record<string, string[]> = {
  saloon:    ["#fef6e4", "#f5c842", "#e05a3c", "#6ba84f"],
  frontier:  ["#f4ecdc", "#d4a574", "#c93a2c", "#8a8077"],
  sunset:    ["#5a1a1a", "#e87a3a", "#f5c842", "#5a3a78"],
  midnight:  ["#1a0f08", "#3d2418", "#f5c842", "#5fa8d3"],
};

// Same weights as the server roller — for the "What's in the pack" preview.
const RARITY_WEIGHT: Record<Rarity, number> = {
  common: 60,
  rare: 25,
  epic: 12,
  legendary: 3,
};

export function ShopClient({
  initialBalance,
  initialOwned,
  equipped: initialEquipped,
  catalog,
}: {
  initialBalance: number;
  initialOwned: string[];
  equipped: Equipped;
  catalog: CosmeticItem[];
}) {
  const router = useRouter();
  const [balance, setBalance] = useState(initialBalance);
  const [owned, setOwned] = useState<Set<string>>(new Set(initialOwned));
  const [equipped, setEquipped] = useState<Equipped>(initialEquipped);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Pack state
  const [packItems, setPackItems] = useState<CosmeticItem[] | null>(null);
  const [packToken, setPackToken] = useState<string | null>(null);
  const [revealedCount, setRevealedCount] = useState(0);
  const [chosenId, setChosenId] = useState<string | null>(null);
  const [keptId, setKeptId] = useState<string | null>(null);

  // Loadout modal
  const [showLoadout, setShowLoadout] = useState(false);

  async function buyPack() {
    if (busy) return;
    setBusy(true);
    setError(null);
    setPackItems(null);
    setPackToken(null);
    setRevealedCount(0);
    setChosenId(null);
    setKeptId(null);
    const res = await fetch("/api/shop/pack/buy", { method: "POST" });
    const data = await res.json();
    setBusy(false);
    if (!res.ok) {
      setError(labelFor(data.error ?? "error"));
      return;
    }
    setBalance(data.balance);
    setPackItems(data.items);
    setPackToken(data.packToken);
    // Stagger the card reveals (350ms apart, same cadence as monopoly packs).
    for (let i = 0; i < data.items.length; i++) {
      setTimeout(() => setRevealedCount((c) => Math.max(c, i + 1)), 350 + i * 350);
    }
    router.refresh();
  }

  async function chooseFromPack(item: CosmeticItem) {
    if (!packToken || chosenId || busy) return;
    setChosenId(item.id);
    setBusy(true);
    setError(null);
    const res = await fetch("/api/shop/pack/choose", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ packToken, itemId: item.id }),
    });
    const data = await res.json();
    setBusy(false);
    if (!res.ok) {
      setError(labelFor(data.error ?? "error"));
      // Allow retry by clearing chosenId if the choose failed.
      setChosenId(null);
      if (data.balance != null) setBalance(data.balance);
      return;
    }
    setOwned((p) => new Set(p).add(item.id));
    setKeptId(item.id);
    setBalance(data.balance);
    router.refresh();
  }

  function closePack() {
    setPackItems(null);
    setPackToken(null);
    setRevealedCount(0);
    setChosenId(null);
    setKeptId(null);
  }

  async function equip(item: CosmeticItem) {
    if (busy) return;
    setBusy(true);
    setError(null);
    const res = await fetch("/api/shop/equip", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ itemId: item.id }),
    });
    const data = await res.json();
    setBusy(false);
    if (!res.ok) {
      setError(labelFor(data.error ?? "error"));
      return;
    }
    setEquipped((eq) => {
      switch (item.kind) {
        case "avatar_color":
          return { ...eq, avatar_color: (item.meta as { color?: string }).color ?? eq.avatar_color };
        case "frame":     return { ...eq, frame: item.id };
        case "hat":       return { ...eq, hat: item.id };
        case "card_deck": return { ...eq, card_deck: item.id };
        case "theme":     return { ...eq, theme: item.id };
      }
    });
    router.refresh();
  }

  function isEquipped(item: CosmeticItem): boolean {
    switch (item.kind) {
      case "avatar_color":
        return equipped.avatar_color === (item.meta as { color?: string }).color;
      case "frame":     return equipped.frame === item.id;
      case "hat":       return equipped.hat === item.id;
      case "card_deck": return equipped.card_deck === item.id;
      case "theme":     return equipped.theme === item.id;
    }
  }

  // Build the "What's in the pack" preview with rarity counts
  const totalPool = catalog.length;
  const rarityCounts: Record<Rarity, number> = { common: 0, rare: 0, epic: 0, legendary: 0 };
  for (const c of catalog) rarityCounts[rarityOf(c.price)]++;

  const ownedItems = catalog.filter((c) => owned.has(c.id) || c.price === 0);

  return (
    <>
      <style>{SHOP_KEYFRAMES}</style>

      {/* === Header: balance + buy pack === */}
      <div
        className="panel"
        style={{
          padding: "var(--sp-5)",
          marginBottom: "var(--sp-4)",
          background: "linear-gradient(180deg, var(--saddle-500), var(--saddle-600))",
          color: "var(--parchment-50)",
          border: "4px solid var(--ink-900)",
        }}
      >
        <div className="between" style={{ flexWrap: "wrap", gap: "var(--sp-4)" }}>
          <div>
            <div
              style={{
                fontFamily: "var(--font-display)",
                fontSize: "var(--fs-h2)",
                color: "var(--gold-300)",
                textShadow: "3px 3px 0 var(--ink-900)",
              }}
            >
              Cosmetic Pack
            </div>
            <p style={{ fontSize: 14, marginTop: 4, color: "var(--parchment-200)" }}>
              Buy a pack, draw 5 random cosmetics, keep <b>1</b>. The other 4 vanish.
            </p>
            <p style={{ fontSize: 12, marginTop: 2, color: "var(--parchment-200)", opacity: 0.85 }}>
              Items you already own won't roll.
            </p>
          </div>
          <div className="row" style={{ gap: "var(--sp-3)", flexWrap: "wrap" }}>
            <div
              className="balance"
              style={{ background: "var(--saddle-600)", padding: "var(--sp-2) var(--sp-3)" }}
            >
              {balance.toLocaleString()} ¢
            </div>
            <button
              className="btn btn-lg"
              onClick={buyPack}
              disabled={busy || balance < PACK_PRICE}
              style={{
                background: "var(--gold-300)",
                color: "var(--ink-900)",
                fontSize: "var(--fs-h3)",
                animation: balance >= PACK_PRICE ? "shop-pack-pulse 1.6s ease-in-out infinite alternate" : undefined,
              }}
            >
              {busy ? "..." : `Buy Pack · ${PACK_PRICE.toLocaleString()}¢`}
            </button>
            <button
              className="btn"
              onClick={() => setShowLoadout(true)}
            >
              My Loadout ({ownedItems.length})
            </button>
          </div>
        </div>
        {error && <p style={{ color: "var(--crimson-300)", marginTop: "var(--sp-3)" }}>{error}</p>}
      </div>

      {/* === What's in the pack === */}
      <div className="panel" style={{ padding: "var(--sp-5)" }}>
        <div className="panel-title">What's In a Pack</div>
        <p className="text-mute" style={{ fontSize: 13, marginBottom: "var(--sp-3)" }}>
          Each pack draws {PACK_SIZE} random cosmetics from the catalog ({totalPool} items total)
          weighted by rarity. You pick 1.
        </p>
        <div className="grid grid-4" style={{ gap: "var(--sp-3)" }}>
          {(["common", "rare", "epic", "legendary"] as Rarity[]).map((r) => {
            const tone = RARITY_COLOR[r];
            const totalWeight = (Object.values(RARITY_WEIGHT) as number[]).reduce((a, b) => a + b, 0);
            const pct = (RARITY_WEIGHT[r] / totalWeight) * 100;
            return (
              <div
                key={r}
                style={{
                  background: tone.bg,
                  color: tone.fg,
                  border: "3px solid var(--ink-900)",
                  padding: "var(--sp-3)",
                  textAlign: "center",
                  boxShadow: r === "legendary" ? "var(--glow-gold)" : "var(--bevel-light)",
                }}
              >
                <div
                  style={{
                    fontFamily: "var(--font-display)",
                    fontSize: 14,
                    letterSpacing: "var(--ls-loose)",
                    textTransform: "uppercase",
                  }}
                >
                  {r}
                </div>
                <div style={{ fontFamily: "var(--font-display)", fontSize: 22, marginTop: 4 }}>
                  {pct.toFixed(0)}%
                </div>
                <div style={{ fontSize: 11, marginTop: 2, opacity: 0.85 }}>
                  {rarityCounts[r]} items
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* === Pack opening overlay === */}
      {packItems && (
        <PackOpeningOverlay
          items={packItems}
          revealedCount={revealedCount}
          chosenId={chosenId}
          keptId={keptId}
          busy={busy}
          onChoose={chooseFromPack}
          onClose={closePack}
        />
      )}

      {/* === Loadout modal === */}
      {showLoadout && (
        <LoadoutModal
          owned={ownedItems}
          equipped={equipped}
          isEquipped={isEquipped}
          busy={busy}
          onEquip={equip}
          onClose={() => setShowLoadout(false)}
        />
      )}
    </>
  );
}

// ============================================================
// Pack opening overlay (mirrors the monopoly card-back-to-face flip)
// ============================================================
function PackOpeningOverlay({
  items,
  revealedCount,
  chosenId,
  keptId,
  busy,
  onChoose,
  onClose,
}: {
  items: CosmeticItem[];
  revealedCount: number;
  chosenId: string | null;
  keptId: string | null;
  busy: boolean;
  onChoose: (item: CosmeticItem) => void;
  onClose: () => void;
}) {
  const allRevealed = revealedCount === items.length;
  const phase: "revealing" | "picking" | "kept" = keptId ? "kept" : allRevealed ? "picking" : "revealing";
  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(26, 15, 8, 0.86)",
        zIndex: 200,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: "var(--sp-4)",
        backdropFilter: "blur(3px)",
      }}
      onClick={(e) => {
        // Allow clicking outside only after the player has kept an item.
        if (phase === "kept" && e.target === e.currentTarget) onClose();
      }}
    >
      <div
        className="panel-wood"
        onClick={(e) => e.stopPropagation()}
        style={{
          padding: "var(--sp-5)",
          maxWidth: 1000,
          width: "100%",
          border: "4px solid var(--ink-900)",
          boxShadow: "var(--glow-gold)",
          textAlign: "center",
        }}
      >
        <div
          style={{
            fontFamily: "var(--font-display)",
            fontSize: "var(--fs-h2)",
            color: "var(--gold-300)",
            textShadow: "3px 3px 0 var(--ink-900)",
            letterSpacing: "var(--ls-loose)",
            marginBottom: "var(--sp-2)",
          }}
        >
          {phase === "revealing" ? "PACK OPENING" : phase === "picking" ? "PICK ONE" : "YOURS!"}
        </div>
        <p
          style={{
            color: "var(--parchment-200)",
            fontSize: 13,
            marginBottom: "var(--sp-5)",
          }}
        >
          {phase === "revealing"
            ? "Five cosmetics rolled. Hold tight..."
            : phase === "picking"
            ? "Click one card to keep it. The other four are gone."
            : "Item added to your loadout. The rest of the pack vanished."}
        </p>

        <div
          style={{
            display: "grid",
            gridTemplateColumns: `repeat(${items.length}, 1fr)`,
            gap: "var(--sp-3)",
            marginBottom: "var(--sp-5)",
          }}
        >
          {items.map((item, i) => {
            const revealed = i < revealedCount;
            const isChosen = item.id === chosenId;
            const isKept = item.id === keptId;
            const fade = phase === "kept" && !isKept;
            const clickable = phase === "picking" && !chosenId;
            return (
              <PackCard
                key={item.id}
                item={item}
                revealed={revealed}
                isChosen={isChosen}
                isKept={isKept}
                fade={fade}
                clickable={clickable}
                disabled={busy && !isChosen}
                onClick={() => clickable && !busy && onChoose(item)}
              />
            );
          })}
        </div>

        {phase === "kept" && (
          <button className="btn btn-lg" onClick={onClose}>
            Sweet
          </button>
        )}
        {phase === "picking" && (
          <p className="text-mute" style={{ fontSize: 12 }}>
            (Don't worry, you can equip it later from My Loadout.)
          </p>
        )}
      </div>
    </div>
  );
}

function PackCard({
  item,
  revealed,
  isChosen,
  isKept,
  fade,
  clickable,
  disabled,
  onClick,
}: {
  item: CosmeticItem;
  revealed: boolean;
  isChosen: boolean;
  isKept: boolean;
  fade: boolean;
  clickable: boolean;
  disabled: boolean;
  onClick: () => void;
}) {
  const rarity = rarityOf(item.price);
  const tone = RARITY_COLOR[rarity];
  return (
    <div
      style={{
        perspective: 800,
        height: 240,
        cursor: clickable && !disabled ? "pointer" : "default",
        transition: "opacity 400ms, transform 400ms",
        opacity: fade ? 0 : 1,
        transform: isKept ? "scale(1.06)" : fade ? "scale(0.85) translateY(20px)" : "scale(1)",
        animation: isKept ? "shop-card-keep 0.6s var(--ease-snap)" : undefined,
      }}
      onClick={onClick}
    >
      <div
        style={{
          position: "relative",
          width: "100%",
          height: "100%",
          transformStyle: "preserve-3d",
          transition: "transform 0.55s var(--ease-snap)",
          transform: revealed ? "rotateY(0deg)" : "rotateY(180deg)",
        }}
      >
        {/* Front */}
        <div
          style={{
            position: "absolute",
            inset: 0,
            backfaceVisibility: "hidden",
            background: "var(--parchment-100)",
            border: `4px solid ${isChosen ? "var(--gold-300)" : "var(--ink-900)"}`,
            boxShadow: isChosen
              ? "var(--glow-gold), 0 0 24px rgba(245,200,66,0.6)"
              : rarity === "legendary"
              ? "var(--glow-gold)"
              : "var(--bevel-light)",
            padding: "var(--sp-3)",
            display: "flex",
            flexDirection: "column",
            justifyContent: "space-between",
            overflow: "hidden",
          }}
        >
          {/* Shimmer for legendary */}
          {rarity === "legendary" && (
            <div
              style={{
                position: "absolute",
                top: 0,
                left: 0,
                width: 60,
                height: "100%",
                background: "linear-gradient(90deg, transparent, rgba(255,255,255,0.5), transparent)",
                animation: "packShine 1.6s linear infinite",
                pointerEvents: "none",
              }}
            />
          )}
          {/* Rarity badge */}
          <span
            style={{
              alignSelf: "flex-start",
              background: tone.bg,
              color: tone.fg,
              border: "2px solid var(--ink-900)",
              padding: "2px 8px",
              fontFamily: "var(--font-display)",
              fontSize: 10,
              letterSpacing: "var(--ls-loose)",
              textTransform: "uppercase",
            }}
          >
            {rarity}
          </span>
          {/* Item preview */}
          <div
            style={{
              flex: 1,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              margin: "var(--sp-3) 0",
            }}
          >
            <ItemPreview item={item} />
          </div>
          {/* Item name */}
          <div
            style={{
              fontFamily: "var(--font-display)",
              fontSize: 14,
              textAlign: "center",
              lineHeight: 1.1,
            }}
          >
            {item.name}
          </div>
          <div
            className="text-mute"
            style={{
              fontSize: 11,
              textAlign: "center",
              marginTop: 2,
            }}
          >
            {item.description}
          </div>
        </div>
        {/* Back */}
        <div
          style={{
            position: "absolute",
            inset: 0,
            backfaceVisibility: "hidden",
            transform: "rotateY(180deg)",
            background:
              "repeating-linear-gradient(45deg, var(--saddle-400) 0 8px, var(--saddle-500) 8px 16px)",
            border: "4px solid var(--ink-900)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <div
            style={{
              fontFamily: "var(--font-display)",
              fontSize: 32,
              color: "var(--gold-300)",
              textShadow: "2px 2px 0 var(--ink-900)",
              letterSpacing: "var(--ls-loose)",
            }}
          >
            ?
          </div>
        </div>
      </div>
    </div>
  );
}

// ============================================================
// Loadout modal — owned items grouped by kind, with equip controls
// ============================================================
function LoadoutModal({
  owned,
  equipped,
  isEquipped,
  busy,
  onEquip,
  onClose,
}: {
  owned: CosmeticItem[];
  equipped: Equipped;
  isEquipped: (item: CosmeticItem) => boolean;
  busy: boolean;
  onEquip: (item: CosmeticItem) => void;
  onClose: () => void;
}) {
  const groups: Record<CosmeticItem["kind"], CosmeticItem[]> = {
    avatar_color: [],
    frame: [],
    hat: [],
    card_deck: [],
    theme: [],
  };
  for (const c of owned) groups[c.kind].push(c);

  return (
    <div
      onClick={onClose}
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(26, 15, 8, 0.78)",
        zIndex: 200,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: "var(--sp-4)",
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="panel"
        style={{
          width: "min(900px, 100%)",
          maxHeight: "calc(100vh - 64px)",
          overflowY: "auto",
          padding: "var(--sp-5)",
          background: "var(--parchment-100)",
          border: "4px solid var(--ink-900)",
        }}
      >
        <div className="between" style={{ marginBottom: "var(--sp-4)" }}>
          <div className="panel-title" style={{ marginBottom: 0 }}>My Loadout</div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            style={{
              background: "var(--saddle-300)",
              color: "var(--parchment-50)",
              border: "2px solid var(--ink-900)",
              padding: "2px 10px",
              cursor: "pointer",
              fontFamily: "var(--font-display)",
              fontSize: 14,
            }}
          >
            ×
          </button>
        </div>

        {owned.length === 0 ? (
          <p className="text-mute">
            No cosmetics yet. Buy a pack to roll your first 5.
          </p>
        ) : (
          (Object.keys(groups) as CosmeticItem["kind"][]).map((kind) =>
            groups[kind].length === 0 ? null : (
              <section key={kind} style={{ marginBottom: "var(--sp-5)" }}>
                <div className="divider" style={{ marginBottom: "var(--sp-3)" }}>
                  {KIND_LABEL[kind]}
                </div>
                <div className="grid grid-3" style={{ gap: "var(--sp-3)" }}>
                  {groups[kind].map((item) => {
                    const equippedNow = isEquipped(item);
                    return (
                      <div
                        key={item.id}
                        className="tile"
                        style={{
                          padding: 0,
                          position: "relative",
                          boxShadow: equippedNow
                            ? "var(--glow-gold)"
                            : "var(--bevel-light)",
                          border: equippedNow
                            ? "4px solid var(--gold-300)"
                            : undefined,
                        }}
                      >
                        <div
                          className="tile-art"
                          style={{
                            background: rarityBg(rarityOf(item.price)),
                          }}
                        >
                          <ItemPreview item={item} />
                        </div>
                        <div className="tile-name">{item.name}</div>
                        <div
                          className="text-mute"
                          style={{ fontSize: 11, padding: "0 var(--sp-3)" }}
                        >
                          {item.description}
                        </div>
                        <div
                          className="tile-meta"
                          style={{ padding: "var(--sp-2) var(--sp-3) var(--sp-3)" }}
                        >
                          {equippedNow ? (
                            <span className="badge badge-cactus">EQUIPPED</span>
                          ) : (
                            <button
                              className="btn btn-sm"
                              onClick={() => onEquip(item)}
                              disabled={busy}
                            >
                              Equip
                            </button>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </section>
            )
          )
        )}

        <button className="btn btn-block" onClick={onClose}>Close</button>
      </div>
    </div>
  );
}

// ============================================================
// Item preview (used in pack cards and loadout)
// ============================================================
function ItemPreview({ item }: { item: CosmeticItem }) {
  if (item.kind === "avatar_color") {
    return (
      <Avatar
        initials="?"
        color={(item.meta as { color?: string }).color ?? "var(--saddle-300)"}
        size={64}
        fontSize={24}
      />
    );
  }
  if (item.kind === "frame") {
    return (
      <Avatar
        initials="?"
        color="var(--gold-300)"
        size={64}
        fontSize={24}
        frame={item.id}
      />
    );
  }
  if (item.kind === "hat") {
    return (
      <Avatar
        initials="?"
        color="var(--saddle-300)"
        size={64}
        fontSize={24}
        hat={item.id}
      />
    );
  }
  if (item.kind === "card_deck") {
    const palette = (item.meta as { palette?: string }).palette ?? "classic";
    const colors = DECK_PALETTES[palette] ?? DECK_PALETTES.classic;
    const suits: { glyph: string; color: string }[] = [
      { glyph: "♠", color: colors.spades },
      { glyph: "♥", color: colors.hearts },
      { glyph: "♣", color: colors.clubs },
      { glyph: "♦", color: colors.diamonds },
    ];
    return (
      <div className="row" style={{ gap: 4 }}>
        {suits.map((s, i) => (
          <span
            key={i}
            style={{
              fontSize: 32,
              color: s.color,
              textShadow: "2px 2px 0 var(--ink-900)",
              fontFamily: "var(--font-display)",
              lineHeight: 1,
            }}
          >
            {s.glyph}
          </span>
        ))}
      </div>
    );
  }
  // theme
  const themeKey = (item.meta as { theme?: string }).theme ?? "saloon";
  const swatches = THEME_SWATCHES[themeKey] ?? THEME_SWATCHES.saloon;
  return (
    <div className="row" style={{ gap: 6 }}>
      {swatches.map((c, i) => (
        <span
          key={i}
          style={{
            display: "inline-block",
            width: 24,
            height: 24,
            background: c,
            border: "2px solid var(--ink-900)",
          }}
        />
      ))}
    </div>
  );
}

function rarityBg(rarity: ReturnType<typeof rarityOf>): string {
  switch (rarity) {
    case "common":    return "linear-gradient(180deg, var(--saddle-400), var(--saddle-500))";
    case "rare":      return "linear-gradient(180deg, var(--sky-500), var(--saddle-500))";
    case "epic":      return "linear-gradient(180deg, var(--crimson-500), var(--saddle-500))";
    case "legendary": return "linear-gradient(180deg, var(--gold-500), var(--saddle-500))";
  }
}

function labelFor(code: string) {
  const labels: Record<string, string> = {
    insufficient_funds: `Need at least ${PACK_PRICE.toLocaleString()}¢ for a pack.`,
    all_owned: "You already own every cosmetic. Nothing left to roll.",
    not_owned: "You don't own that item.",
    item_not_found: "Item not found.",
    item_not_in_pack: "That item wasn't in this pack.",
    bad_token: "Pack expired. Buy a new one.",
    token_redeemed: "Pack already used.",
    already_owned: "You already own that — refunded.",
  };
  return labels[code] ?? "Something went wrong.";
}

const SHOP_KEYFRAMES = `
@keyframes packShine {
  0%   { transform: translateX(-110%) skewX(-20deg); }
  100% { transform: translateX(220%) skewX(-20deg); }
}
@keyframes shop-pack-pulse {
  0%, 100% { transform: scale(1); }
  100%     { transform: scale(1.04); }
}
@keyframes shop-card-keep {
  0%   { transform: scale(1); }
  35%  { transform: scale(1.18) rotate(-2deg); }
  60%  { transform: scale(1.12) rotate(2deg); }
  100% { transform: scale(1.06) rotate(0); }
}
`;
