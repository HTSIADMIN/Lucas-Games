"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { CosmeticItem } from "@/lib/shop/catalog";
import { rarityOf, RARITY_COLOR } from "@/lib/shop/catalog";

type Equipped = {
  avatar_color: string;
  frame: string | null;
  card_deck: string;
  theme: string;
};

const KIND_LABEL: Record<CosmeticItem["kind"], string> = {
  avatar_color: "Avatar Colors",
  frame: "Frames",
  card_deck: "Card Decks",
  theme: "Themes",
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
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function buy(item: CosmeticItem) {
    setBusy(item.id);
    setError(null);
    const res = await fetch("/api/shop/buy", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ itemId: item.id }),
    });
    const data = await res.json();
    setBusy(null);
    if (!res.ok) {
      setError(data.error ?? "error");
      return;
    }
    setOwned((p) => new Set(p).add(item.id));
    setBalance(data.balance);
    router.refresh();
  }

  async function equip(item: CosmeticItem) {
    setBusy(item.id);
    setError(null);
    const res = await fetch("/api/shop/equip", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ itemId: item.id }),
    });
    const data = await res.json();
    setBusy(null);
    if (!res.ok) {
      setError(data.error ?? "error");
      return;
    }
    setEquipped((eq) => {
      switch (item.kind) {
        case "avatar_color":
          return { ...eq, avatar_color: (item.meta as { color?: string }).color ?? eq.avatar_color };
        case "frame":
          return { ...eq, frame: item.id };
        case "card_deck":
          return { ...eq, card_deck: item.id };
        case "theme":
          return { ...eq, theme: item.id };
      }
    });
    router.refresh();
  }

  function isEquipped(item: CosmeticItem): boolean {
    switch (item.kind) {
      case "avatar_color":
        return equipped.avatar_color === (item.meta as { color?: string }).color;
      case "frame":
        return equipped.frame === item.id;
      case "card_deck":
        return equipped.card_deck === item.id;
      case "theme":
        return equipped.theme === item.id;
    }
  }

  const groups: Record<CosmeticItem["kind"], CosmeticItem[]> = {
    avatar_color: [],
    frame: [],
    card_deck: [],
    theme: [],
  };
  for (const c of catalog) groups[c.kind].push(c);

  return (
    <>
      <div className="row-lg" style={{ marginBottom: "var(--sp-7)" }}>
        <div className="balance">{balance.toLocaleString()} ¢</div>
        {error && <span style={{ color: "var(--crimson-500)" }}>{labelFor(error)}</span>}
      </div>

      {(Object.keys(groups) as CosmeticItem["kind"][]).map((kind) =>
        groups[kind].length === 0 ? null : (
          <section key={kind} style={{ marginBottom: "var(--sp-8)" }}>
            <div className="divider" style={{ marginBottom: "var(--sp-5)" }}>{KIND_LABEL[kind]}</div>
            <div className="grid grid-3">
              {groups[kind].map((item) => {
                const ownedNow = owned.has(item.id) || item.price === 0;
                const equippedNow = isEquipped(item);
                const cantAfford = !ownedNow && balance < item.price;
                const rarity = rarityOf(item.price);
                const rarityTone = RARITY_COLOR[rarity];
                return (
                  <div
                    key={item.id}
                    className="tile"
                    style={{
                      position: "relative",
                      boxShadow: rarity === "legendary"
                        ? "var(--sh-card-rest), var(--glow-gold)"
                        : "var(--sh-card-rest)",
                    }}
                  >
                    {/* Rarity badge top-right */}
                    <span
                      style={{
                        position: "absolute",
                        top: 8,
                        right: 8,
                        background: rarityTone.bg,
                        color: rarityTone.fg,
                        border: "2px solid var(--ink-900)",
                        padding: "2px 6px",
                        fontFamily: "var(--font-display)",
                        fontSize: 10,
                        textTransform: "uppercase",
                        letterSpacing: "var(--ls-loose)",
                        zIndex: 2,
                      }}
                    >
                      {rarity}
                    </span>
                    {/* Equipped pin top-left */}
                    {equippedNow && (
                      <span
                        style={{
                          position: "absolute",
                          top: 8,
                          left: 8,
                          background: "var(--cactus-300)",
                          color: "var(--parchment-50)",
                          border: "2px solid var(--ink-900)",
                          padding: "2px 6px",
                          fontFamily: "var(--font-display)",
                          fontSize: 10,
                          textTransform: "uppercase",
                          letterSpacing: "var(--ls-loose)",
                          textShadow: "1px 1px 0 var(--cactus-700)",
                          zIndex: 2,
                        }}
                      >
                        Equipped
                      </span>
                    )}
                    <div
                      className="tile-art"
                      style={{
                        background: rarityBg(rarity),
                      }}
                    >
                      <ItemPreview item={item} />
                    </div>
                    <div className="tile-name">{item.name}</div>
                    <div className="text-mute" style={{ fontSize: "var(--fs-small)" }}>
                      {item.description}
                    </div>
                    <div className="tile-meta">
                      <span className="text-money" style={{ fontFamily: "var(--font-display)" }}>
                        {item.price === 0 ? "FREE" : `${item.price.toLocaleString()} ¢`}
                      </span>
                      {equippedNow ? (
                        <span className="badge badge-cactus">EQUIPPED</span>
                      ) : ownedNow ? (
                        <button
                          className="btn btn-sm"
                          onClick={() => equip(item)}
                          disabled={busy === item.id}
                        >
                          Equip
                        </button>
                      ) : (
                        <button
                          className="btn btn-sm"
                          onClick={() => buy(item)}
                          disabled={busy === item.id || cantAfford}
                        >
                          {busy === item.id ? "..." : "Buy"}
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </section>
        )
      )}
    </>
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

function ItemPreview({ item }: { item: CosmeticItem }) {
  if (item.kind === "avatar_color") {
    return (
      <div
        className="avatar avatar-lg"
        style={{ background: (item.meta as { color?: string }).color, fontSize: 24 }}
      >
        ?
      </div>
    );
  }
  if (item.kind === "frame") {
    const m = item.meta as { width?: number; color?: string; badge?: string; glow?: boolean };
    return (
      <div
        className="avatar avatar-lg"
        style={{
          background: "var(--gold-300)",
          border: `${m.width ?? 6}px solid ${m.color}`,
          fontSize: 22,
          boxShadow: m.glow ? `0 0 16px ${m.color}` : undefined,
        }}
      >
        {m.badge ?? "?"}
      </div>
    );
  }
  if (item.kind === "card_deck") {
    return (
      <div className="row" style={{ gap: 4 }}>
        <span style={{ fontSize: 32, color: "var(--parchment-50)", textShadow: "2px 2px 0 var(--ink-900)" }}>♠</span>
        <span style={{ fontSize: 32, color: "var(--crimson-300)", textShadow: "2px 2px 0 var(--ink-900)" }}>♥</span>
        <span style={{ fontSize: 32, color: "var(--ink-900)", textShadow: "2px 2px 0 var(--parchment-50)" }}>♣</span>
        <span style={{ fontSize: 32, color: "var(--sky-300)", textShadow: "2px 2px 0 var(--ink-900)" }}>♦</span>
      </div>
    );
  }
  // theme
  return (
    <div className="row" style={{ gap: 6 }}>
      {["var(--saddle-300)", "var(--gold-300)", "var(--crimson-300)", "var(--cactus-300)"].map((c) => (
        <span
          key={c}
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

function labelFor(code: string) {
  const labels: Record<string, string> = {
    insufficient_funds: "Not enough Coins.",
    already_owned: "You already own this.",
    item_not_found: "Item not in catalog.",
    not_owned: "You don't own that yet.",
  };
  return labels[code] ?? "Something went wrong.";
}
