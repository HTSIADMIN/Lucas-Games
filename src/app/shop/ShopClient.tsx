"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { CosmeticItem, Rarity } from "@/lib/shop/catalog";
import { rarityOf, RARITY_COLOR, DECK_PALETTES, isDefaultItem } from "@/lib/shop/catalog";
import { Avatar } from "@/components/Avatar";
import { ModalShell, ModalCloseButton } from "@/components/ModalShell";
import { PACK_TIERS, PACK_TIER_ORDER, type PackTier } from "@/lib/shop/packs";
import * as Sfx from "@/lib/sfx";

type Equipped = {
  avatar_color: string;
  frame: string | null;
  card_deck: string;
  theme: string;
  hat: string | null;
};

const PACK_SIZE = 5;
const RARITY_ORDER: Rarity[] = ["common", "rare", "epic", "legendary", "mythic"];

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

  // Pack state. Pulls is the per-slot list; each slot is either a
  // claimable cosmetic (`card`) or a coin trade-in (already credited
  // server-side, just for display).
  type ShopPull =
    | { kind: "card"; item: CosmeticItem }
    | { kind: "tradein"; coins: number; rarity: Rarity };
  const [packPulls, setPackPulls] = useState<ShopPull[] | null>(null);
  const [packToken, setPackToken] = useState<string | null>(null);
  const [packTradeInTotal, setPackTradeInTotal] = useState(0);
  const [revealedCount, setRevealedCount] = useState(0);
  const [chosenId, setChosenId] = useState<string | null>(null);
  const [keptId, setKeptId] = useState<string | null>(null);

  // Loadout modal
  const [showLoadout, setShowLoadout] = useState(false);
  // Showcase (full collection) modal
  const [showShowcase, setShowShowcase] = useState(false);
  // Currently selected pack tier — defaults to the cheapest.
  const [tier, setTier] = useState<PackTier>("dust");

  async function buyPack(tierId: PackTier) {
    if (busy) return;
    setTier(tierId);
    setBusy(true);
    setError(null);
    setPackPulls(null);
    setPackToken(null);
    setPackTradeInTotal(0);
    setRevealedCount(0);
    setChosenId(null);
    setKeptId(null);
    const res = await fetch("/api/shop/pack/buy", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ tier: tierId }),
    });
    const data = await res.json();
    setBusy(false);
    if (!res.ok) {
      setError(labelFor(data.error ?? "error"));
      return;
    }
    setBalance(data.balance);
    const pulls = (data.pulls as ShopPull[] | undefined) ?? [];
    setPackPulls(pulls);
    setPackToken(data.packToken);
    setPackTradeInTotal(typeof data.tradeInCoins === "number" ? data.tradeInCoins : 0);
    Sfx.play("pack.open");
    // Stagger the card reveals (350ms apart, same cadence as monopoly packs).
    for (let i = 0; i < pulls.length; i++) {
      setTimeout(() => {
        setRevealedCount((c) => Math.max(c, i + 1));
        Sfx.play("card.deal");
      }, 350 + i * 350);
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
    Sfx.play("win.levelup");
    router.refresh();
  }

  function closePack() {
    setPackPulls(null);
    setPackToken(null);
    setPackTradeInTotal(0);
    setRevealedCount(0);
    setChosenId(null);
    setKeptId(null);
  }

  async function equip(item: CosmeticItem) {
    if (busy) return;
    setBusy(true);
    setError(null);
    Sfx.play("chip.lay");
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

  // Pool counts for the showcase + pack preview. Default items don't
  // roll into packs; we still display them in the showcase.
  const rollableCatalog = catalog.filter((c) => !isDefaultItem(c));
  const rarityCounts: Record<Rarity, number> = { common: 0, rare: 0, epic: 0, legendary: 0, mythic: 0 };
  for (const c of rollableCatalog) rarityCounts[rarityOf(c.price)]++;

  const ownedItems = catalog.filter((c) => owned.has(c.id) || isDefaultItem(c));

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
              className="btn"
              onClick={() => setShowShowcase(true)}
            >
              Collection ({ownedItems.length} / {catalog.length})
            </button>
            <button
              className="btn"
              onClick={() => setShowLoadout(true)}
            >
              My Loadout
            </button>
          </div>
        </div>
        {error && <p style={{ color: "var(--crimson-300)", marginTop: "var(--sp-3)" }}>{error}</p>}
      </div>

      {/* === Pack tiers === */}
      <div className="panel" style={{ padding: "var(--sp-5)" }}>
        <div className="panel-title">Cosmetic Packs</div>
        <p className="text-mute" style={{ fontSize: 13, marginBottom: "var(--sp-4)" }}>
          Pricier packs roll better odds. Items you already own never appear; defaults are off the table.
          Each pack draws {PACK_SIZE} cosmetics; you keep 1.
        </p>
        <div className="grid grid-4" style={{ gap: "var(--sp-3)" }}>
          {PACK_TIER_ORDER.map((id) => {
            const t = PACK_TIERS[id];
            const totalWeight = (Object.values(t.weights) as number[]).reduce((a, b) => a + b, 0);
            const canAfford = balance >= t.price;
            return (
              <div
                key={id}
                className={`pack-tier${t.animated ? " is-vault" : ""}`}
                style={{
                  background: t.primary,
                  color: "var(--ink-900)",
                  border: `4px solid ${t.border}`,
                  padding: "var(--sp-3)",
                  display: "flex",
                  flexDirection: "column",
                  gap: "var(--sp-2)",
                  boxShadow: t.glow ?? "var(--sh-card-rest)",
                  opacity: canAfford ? 1 : 0.55,
                }}
              >
                <div className="between" style={{ alignItems: "baseline" }}>
                  <span
                    style={{
                      fontFamily: "var(--font-display)",
                      fontSize: 18,
                      letterSpacing: "0.06em",
                      textTransform: "uppercase",
                      color: "var(--ink-900)",
                      textShadow: `1px 1px 0 ${t.secondary}`,
                    }}
                  >
                    {t.name}
                  </span>
                  <span style={{ fontFamily: "var(--font-display)", fontSize: 28, opacity: 0.7 }}>
                    {t.glyph}
                  </span>
                </div>
                <p className="text-mute" style={{ fontSize: 11, lineHeight: 1.3, color: "var(--ink-900)", opacity: 0.85, minHeight: 32 }}>
                  {t.blurb}
                </p>
                <div className="stack" style={{ gap: 2 }}>
                  {RARITY_ORDER.map((r) => {
                    const w = t.weights[r];
                    if (w <= 0) return null;
                    const pct = (w / totalWeight) * 100;
                    const tone = RARITY_COLOR[r];
                    return (
                      <div key={r} className="row" style={{ gap: 4, fontSize: 11, fontFamily: "var(--font-display)" }}>
                        <span
                          className={r === "mythic" ? "rarity-mythic" : ""}
                          style={{
                            background: r !== "mythic" ? tone.bg : undefined,
                            color: r !== "mythic" ? tone.fg : undefined,
                            border: "2px solid var(--ink-900)",
                            padding: "1px 5px",
                            letterSpacing: "0.06em",
                            textTransform: "uppercase",
                            minWidth: 64,
                            textAlign: "center",
                          }}
                        >
                          {r}
                        </span>
                        <span>{pct.toFixed(0)}%</span>
                      </div>
                    );
                  })}
                </div>
                <button
                  className="btn btn-block"
                  disabled={busy || !canAfford}
                  onClick={() => buyPack(id)}
                  style={{
                    fontSize: "var(--fs-h4)",
                    background: t.secondary,
                    color: "var(--parchment-50)",
                    textShadow: "1px 1px 0 var(--ink-900)",
                  }}
                >
                  {t.price.toLocaleString()} ¢
                </button>
              </div>
            );
          })}
        </div>
        <p className="text-mute" style={{ fontSize: 11, marginTop: "var(--sp-3)" }}>
          Pool: {rollableCatalog.length} non-default items ·
          {" "}{rarityCounts.common} common · {rarityCounts.rare} rare · {rarityCounts.epic} epic ·
          {" "}{rarityCounts.legendary} legendary · <span className="rarity-mythic" style={{ padding: "0 4px" }}>{rarityCounts.mythic} mythic</span>
        </p>
      </div>

      {/* === Pack opening overlay === */}
      {packPulls && (
        <PackOpeningOverlay
          pulls={packPulls}
          tradeInTotal={packTradeInTotal}
          revealedCount={revealedCount}
          chosenId={chosenId}
          keptId={keptId}
          busy={busy}
          onChoose={chooseFromPack}
          onClose={closePack}
        />
      )}

      {/* === Showcase: full collection === */}
      <ShowcaseModal
        open={showShowcase}
        onClose={() => setShowShowcase(false)}
        catalog={catalog}
        owned={owned}
      />

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
type PackPull =
  | { kind: "card"; item: CosmeticItem }
  | { kind: "tradein"; coins: number; rarity: Rarity };

function PackOpeningOverlay({
  pulls,
  tradeInTotal,
  revealedCount,
  chosenId,
  keptId,
  busy,
  onChoose,
  onClose,
}: {
  pulls: PackPull[];
  tradeInTotal: number;
  revealedCount: number;
  chosenId: string | null;
  keptId: string | null;
  busy: boolean;
  onChoose: (item: CosmeticItem) => void;
  onClose: () => void;
}) {
  const allRevealed = revealedCount === pulls.length;
  const cardCount = pulls.filter((p) => p.kind === "card").length;
  // If every slot traded in (player has nothing left to pull at-or-
  // above any allowed rarity), there's nothing to pick — jump
  // straight to the kept state once reveals finish so the close
  // button shows up alongside the trade-in summary.
  const phase: "revealing" | "picking" | "kept" =
    keptId || (allRevealed && cardCount === 0)
      ? "kept"
      : allRevealed
      ? "picking"
      : "revealing";
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
        className="panel-wood pack-modal"
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
          {phase === "revealing" ? "PACK OPENING" : phase === "picking" ? "PICK ONE" : cardCount === 0 ? "TRADED IN" : "YOURS!"}
        </div>
        <p
          style={{
            color: "var(--parchment-200)",
            fontSize: 13,
            marginBottom: "var(--sp-5)",
          }}
        >
          {phase === "revealing"
            ? `${pulls.length} slots rolled. Hold tight...`
            : phase === "picking"
            ? cardCount === 1
              ? "Only one fresh cosmetic in this pack — claim it below."
              : `Click one of the ${cardCount} cosmetics to keep it. The rest vanish.`
            : cardCount === 0
            ? "You've already collected what this pack could roll. Coins traded in instead."
            : "Item added to your loadout. The rest of the pack vanished."}
        </p>

        <div
          className="pack-grid"
          style={{
            display: "grid",
            gridTemplateColumns: `repeat(${pulls.length}, minmax(0, 1fr))`,
            gap: "var(--sp-3)",
            marginBottom: "var(--sp-5)",
          }}
        >
          {pulls.map((pull, i) => {
            const revealed = i < revealedCount;
            if (pull.kind === "tradein") {
              return (
                <TradeInCard
                  key={`tradein-${i}`}
                  rarity={pull.rarity}
                  coins={pull.coins}
                  revealed={revealed}
                  fade={phase === "kept" && cardCount > 0}
                />
              );
            }
            const item = pull.item;
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

        {tradeInTotal > 0 && (
          <p
            className="text-money"
            style={{
              fontFamily: "var(--font-display)",
              fontSize: "var(--fs-h4)",
              marginBottom: "var(--sp-3)",
            }}
          >
            Trade-in bonus · +{tradeInTotal.toLocaleString()} ¢
          </p>
        )}
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
      className="pack-card"
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
          className="pack-card-front"
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
            className="pack-card-name"
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
            className="text-mute pack-card-desc"
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
// Trade-in slot — drawn in place of a regular PackCard when the
// pack rolls a rarity the player has fully collected. The coins
// are already credited at /buy time; this is purely a "you got this
// instead" display so the user understands where the bonus came
// from.
// ============================================================
function TradeInCard({
  rarity,
  coins,
  revealed,
  fade,
}: {
  rarity: Rarity;
  coins: number;
  revealed: boolean;
  fade: boolean;
}) {
  const tone = RARITY_COLOR[rarity];
  return (
    <div
      className="pack-card"
      style={{
        perspective: 800,
        height: 240,
        transition: "opacity 400ms, transform 400ms",
        opacity: fade ? 0 : 1,
        transform: fade ? "scale(0.85) translateY(20px)" : "scale(1)",
      }}
    >
      <div
        style={{
          position: "relative",
          width: "100%",
          height: "100%",
          transformStyle: "preserve-3d",
          transition: "transform 0.5s var(--ease-snap)",
          transform: revealed ? "rotateY(0deg)" : "rotateY(180deg)",
        }}
      >
        <div
          style={{
            position: "absolute",
            inset: 0,
            backfaceVisibility: "hidden",
            background: "linear-gradient(180deg, var(--gold-300), var(--saddle-500))",
            color: "var(--ink-900)",
            border: `4px solid ${tone.bg}`,
            boxShadow: "var(--glow-gold)",
            padding: "var(--sp-3)",
            display: "flex",
            flexDirection: "column",
            justifyContent: "space-between",
            overflow: "hidden",
          }}
        >
          <div
            style={{
              position: "absolute",
              top: 0, left: 0,
              width: 60,
              height: "100%",
              background: "linear-gradient(90deg, transparent, rgba(255,255,255,0.5), transparent)",
              animation: "packShine 1.6s linear infinite",
              pointerEvents: "none",
            }}
          />
          <span
            className="badge"
            style={{
              alignSelf: "flex-start",
              background: "var(--ink-900)",
              color: "var(--gold-300)",
              borderColor: "var(--gold-300)",
            }}
          >
            TRADE-IN
          </span>
          <div style={{ fontFamily: "var(--font-display)", fontSize: 20, lineHeight: 1.1 }}>
            All {rarity} owned
          </div>
          <div style={{ fontFamily: "var(--font-display)", fontSize: 26, color: "var(--ink-900)", textShadow: "1px 1px 0 var(--gold-100)" }}>
            +{coins.toLocaleString()} ¢
          </div>
        </div>
        <div
          style={{
            position: "absolute",
            inset: 0,
            backfaceVisibility: "hidden",
            transform: "rotateY(180deg)",
            background: "var(--saddle-500)",
            backgroundImage: "repeating-linear-gradient(45deg, var(--saddle-400) 0 8px, var(--saddle-600) 8px 16px)",
            border: "4px solid var(--ink-900)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            color: "var(--gold-300)",
            fontFamily: "var(--font-display)",
            fontSize: 24,
            textShadow: "2px 2px 0 var(--ink-900)",
            letterSpacing: "var(--ls-loose)",
          }}
        >
          ★
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
    case "mythic":    return "linear-gradient(180deg, var(--neon-gold), var(--crimson-500))";
  }
}

// =============================================================
// Showcase modal — full catalog grouped by kind, with owned /
// unowned visual state. Read-only; no equip from here. Default
// items are always shown as owned because they're implicit.
// =============================================================
function ShowcaseModal({
  open,
  onClose,
  catalog,
  owned,
}: {
  open: boolean;
  onClose: () => void;
  catalog: CosmeticItem[];
  owned: Set<string>;
}) {
  const groups = (Object.keys(KIND_LABEL) as CosmeticItem["kind"][]).map((k) => ({
    kind: k,
    items: catalog.filter((c) => c.kind === k).sort((a, b) => a.price - b.price),
  }));
  const totalOwned = catalog.filter((c) => owned.has(c.id) || isDefaultItem(c)).length;
  return (
    <ModalShell open={open} onClose={onClose} width={920}>
      <div className="between" style={{ marginBottom: "var(--sp-4)" }}>
        <div>
          <div className="uppercase" style={{ fontFamily: "var(--font-display)", fontSize: "var(--fs-h3)", color: "var(--gold-700)" }}>
            Collection
          </div>
          <p className="text-mute" style={{ fontSize: "var(--fs-small)", marginTop: 4 }}>
            {totalOwned} of {catalog.length} cosmetics. Greyed-out tiles haven't been pulled yet.
          </p>
        </div>
        <ModalCloseButton onClose={onClose} />
      </div>
      <div className="stack-lg">
        {groups.map(({ kind, items }) => (
          <section key={kind}>
            <div className="divider" style={{ marginBottom: "var(--sp-3)" }}>{KIND_LABEL[kind]}</div>
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fill, minmax(110px, 1fr))",
                gap: "var(--sp-2)",
              }}
            >
              {items.map((it) => {
                const isOwned = owned.has(it.id) || isDefaultItem(it);
                const r = rarityOf(it.price);
                const tone = RARITY_COLOR[r];
                return (
                  <div
                    key={it.id}
                    title={it.name}
                    style={{
                      background: "var(--parchment-100)",
                      border: `3px solid ${isOwned ? "var(--ink-900)" : "var(--saddle-300)"}`,
                      padding: "var(--sp-2)",
                      display: "flex",
                      flexDirection: "column",
                      alignItems: "center",
                      gap: 4,
                      filter: isOwned ? undefined : "grayscale(0.85) opacity(0.55)",
                      boxShadow: r === "mythic" && isOwned ? "var(--glow-gold)" : undefined,
                    }}
                  >
                    <div style={{ width: 56, height: 56, display: "flex", alignItems: "center", justifyContent: "center" }}>
                      <ItemPreview item={it} />
                    </div>
                    <div
                      style={{
                        fontFamily: "var(--font-display)",
                        fontSize: 11,
                        textAlign: "center",
                        lineHeight: 1.05,
                        color: "var(--ink-900)",
                      }}
                    >
                      {it.name}
                    </div>
                    <span
                      className={r === "mythic" ? "rarity-mythic" : ""}
                      style={{
                        background: r !== "mythic" ? tone.bg : undefined,
                        color: r !== "mythic" ? tone.fg : undefined,
                        border: "2px solid var(--ink-900)",
                        padding: "1px 5px",
                        fontFamily: "var(--font-display)",
                        fontSize: 9,
                        letterSpacing: "var(--ls-loose)",
                        textTransform: "uppercase",
                      }}
                    >
                      {r}
                    </span>
                  </div>
                );
              })}
            </div>
          </section>
        ))}
      </div>
    </ModalShell>
  );
}

function labelFor(code: string) {
  const labels: Record<string, string> = {
    insufficient_funds: "Not enough Coins for that pack tier.",
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
