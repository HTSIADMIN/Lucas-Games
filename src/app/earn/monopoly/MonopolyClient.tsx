"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  LEVEL_MULTIPLIER,
  MAX_LEVEL,
  PACK_PRICE,
  PACK_SIZE,
  UPGRADE_CARDS,
  UPGRADE_COINS,
  type Property,
  type PropertyTier,
} from "@/lib/games/monopoly/board";

const TIER_BG: Record<PropertyTier, string> = {
  1: "var(--saddle-300)",
  2: "var(--cactus-300)",
  3: "var(--sky-300)",
  4: "var(--crimson-300)",
  5: "var(--gold-300)",
};
const TIER_FG: Record<PropertyTier, string> = {
  1: "var(--ink-900)",
  2: "var(--parchment-50)",
  3: "var(--parchment-50)",
  4: "var(--parchment-50)",
  5: "var(--ink-900)",
};
const TIER_LABEL: Record<PropertyTier, string> = {
  1: "Common",
  2: "Uncommon",
  3: "Rare",
  4: "Epic",
  5: "Legendary",
};

type State = {
  position: number;
  nextRollAt: string | null;
  totalRolls: number;
  totalEarned: number;
  ready: boolean;
};

type Owned = Record<string, { level: number; cards: number }>;

type RollResult = {
  dice: [number, number];
  fromPosition: number;
  toPosition: number;
  property: Property;
  level: number;
  payout: number;
};

export function MonopolyClient() {
  const router = useRouter();
  const [board, setBoard] = useState<Property[]>([]);
  const [state, setState] = useState<State | null>(null);
  const [owned, setOwned] = useState<Owned>({});
  const [balance, setBalance] = useState<number | null>(null);
  const [serverOffset, setServerOffset] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [rolling, setRolling] = useState(false);
  const [rollResult, setRollResult] = useState<RollResult | null>(null);
  const [animPosition, setAnimPosition] = useState<number>(0);
  const [showPayoutFlash, setShowPayoutFlash] = useState(false);

  const [packOpening, setPackOpening] = useState(false);
  const [packCards, setPackCards] = useState<Property[] | null>(null);
  const [revealedCount, setRevealedCount] = useState(0);

  const [, force] = useState(0);
  useEffect(() => {
    const t = setInterval(() => force((n) => n + 1), 500);
    return () => clearInterval(t);
  }, []);

  async function refresh() {
    try {
      const r = await fetch("/api/earn/monopoly/state");
      if (!r.ok) return;
      const d = await r.json();
      setBoard(d.board ?? []);
      setState(d.state ?? null);
      setOwned(d.owned ?? {});
      setBalance(d.balance ?? null);
      setServerOffset((d.serverNow ?? Date.now()) - Date.now());
      if (d.state) setAnimPosition(d.state.position);
    } catch { /* ignore */ }
  }
  useEffect(() => { refresh(); }, []);

  async function roll() {
    if (!state || !state.ready || busy) return;
    setBusy(true); setError(null); setRollResult(null);
    setRolling(true);

    const r = await fetch("/api/earn/monopoly/roll", { method: "POST" });
    const d = await r.json();
    if (!r.ok) {
      setRolling(false); setBusy(false);
      setError(labelFor(d.error ?? "error"));
      return;
    }

    // Fake the dice tumble for ~1.2s, then walk the token tile-by-tile.
    setTimeout(async () => {
      setRolling(false);
      // Walk one tile every 280ms.
      const path: number[] = [];
      let p = d.fromPosition;
      for (let i = 0; i < d.move; i++) {
        p = (p + 1) % board.length;
        path.push(p);
      }
      for (let i = 0; i < path.length; i++) {
        await new Promise((res) => setTimeout(res, 280));
        setAnimPosition(path[i]);
      }
      setRollResult(d);
      setShowPayoutFlash(true);
      setBalance(d.balance);
      setTimeout(() => setShowPayoutFlash(false), 2000);
      setBusy(false);
      // Refresh state to lock the cooldown timer.
      refresh();
      router.refresh();
    }, 1200);
  }

  async function buyPack() {
    setBusy(true); setError(null);
    const r = await fetch("/api/earn/monopoly/buy-pack", { method: "POST" });
    const d = await r.json();
    setBusy(false);
    if (!r.ok) { setError(labelFor(d.error ?? "error")); return; }
    setBalance(d.balance);
    setPackCards(d.cards as Property[]);
    setPackOpening(true);
    setRevealedCount(0);
    // Stagger reveal of each card.
    for (let i = 0; i < (d.cards as Property[]).length; i++) {
      setTimeout(() => setRevealedCount(i + 1), 350 + i * 350);
    }
    // Refresh inventory after the reveals finish.
    setTimeout(() => refresh(), 350 + (d.cards as Property[]).length * 350 + 200);
    router.refresh();
  }

  async function upgrade(propertyId: string) {
    setBusy(true); setError(null);
    const r = await fetch("/api/earn/monopoly/upgrade", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ propertyId }),
    });
    const d = await r.json();
    setBusy(false);
    if (!r.ok) { setError(labelFor(d.error ?? "error")); return; }
    setBalance(d.balance);
    refresh();
    router.refresh();
  }

  function closePack() {
    setPackOpening(false);
    setPackCards(null);
    setRevealedCount(0);
  }

  if (!state || board.length === 0) {
    return <p className="text-mute">Loading the board...</p>;
  }

  // Cooldown countdown
  let cooldownStr = "Ready";
  if (state.nextRollAt) {
    const ms = new Date(state.nextRollAt).getTime() - Date.now() - serverOffset;
    if (ms > 0) {
      const m = Math.floor(ms / 60000);
      const s = Math.floor((ms % 60000) / 1000);
      cooldownStr = `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
    }
  }

  return (
    <>
      <div className="grid grid-2" style={{ alignItems: "start" }}>
        {/* === BOARD + DICE === */}
        <div className="panel" style={{ padding: "var(--sp-6)" }}>
          <div className="panel-title">The Board</div>

          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(5, 1fr)",
              gap: 6,
              background: "var(--saddle-500)",
              border: "4px solid var(--ink-900)",
              padding: "var(--sp-4)",
            }}
          >
            {board.map((p, i) => {
              const here = animPosition === i;
              const o = owned[p.id];
              const lvl = o?.level ?? 0;
              return (
                <div
                  key={p.id}
                  style={{
                    background: TIER_BG[p.tier],
                    color: TIER_FG[p.tier],
                    border: here ? "4px solid var(--gold-300)" : "2px solid var(--ink-900)",
                    boxShadow: here ? "var(--glow-gold)" : "var(--bevel-light)",
                    padding: "6px 4px",
                    minHeight: 70,
                    fontFamily: "var(--font-display)",
                    position: "relative",
                    transition: "all var(--dur-quick)",
                  }}
                >
                  <div style={{ fontSize: 10, lineHeight: 1.1 }}>{p.name}</div>
                  <div style={{ fontSize: 11, marginTop: 4, opacity: 0.8 }}>
                    {p.basePayout >= 1000 ? `${p.basePayout / 1000}k` : p.basePayout}
                  </div>
                  {lvl > 0 && (
                    <div
                      style={{
                        position: "absolute",
                        bottom: 4,
                        right: 4,
                        display: "flex",
                        gap: 1,
                      }}
                    >
                      {Array.from({ length: lvl }).map((_, j) => (
                        <span
                          key={j}
                          style={{
                            width: 6,
                            height: 6,
                            background: "var(--gold-300)",
                            border: "1px solid var(--ink-900)",
                          }}
                        />
                      ))}
                    </div>
                  )}
                  {here && (
                    <div
                      style={{
                        position: "absolute",
                        top: -4,
                        left: -4,
                        width: 14,
                        height: 14,
                        background: "var(--gold-300)",
                        border: "2px solid var(--ink-900)",
                        borderRadius: 999,
                        boxShadow: "var(--sh-card-rest)",
                      }}
                    />
                  )}
                </div>
              );
            })}
          </div>

          {rollResult && showPayoutFlash && (
            <div
              className="sign"
              style={{
                marginTop: "var(--sp-4)",
                display: "block",
                textAlign: "center",
                background: "var(--gold-300)",
                color: "var(--ink-900)",
                animation: "flashFade 2s",
              }}
            >
              {rollResult.property.name} · +{rollResult.payout.toLocaleString()} ¢
            </div>
          )}
        </div>

        {/* === DICE + INFO === */}
        <div className="stack-lg">
          <div className="panel" style={{ padding: "var(--sp-6)" }}>
            <div className="panel-title">{state.ready ? "Ready to Roll" : "On Cooldown"}</div>
            <div className="row-lg" style={{ justifyContent: "center", marginBottom: "var(--sp-5)" }}>
              <Die value={rollResult?.dice[0] ?? 1} rolling={rolling} />
              <Die value={rollResult?.dice[1] ?? 1} rolling={rolling} />
            </div>
            <button
              className="btn btn-lg btn-block"
              onClick={roll}
              disabled={busy || !state.ready}
            >
              {rolling ? "Rolling..." : state.ready ? "Roll Dice" : `Next roll in ${cooldownStr}`}
            </button>
            <div className="grid grid-2" style={{ marginTop: "var(--sp-5)" }}>
              <div className="panel" style={{ background: "var(--parchment-200)", padding: "var(--sp-3)" }}>
                <div className="label">Total Rolls</div>
                <div style={{ fontSize: "var(--fs-h3)", fontFamily: "var(--font-display)" }}>{state.totalRolls}</div>
              </div>
              <div className="panel" style={{ background: "var(--gold-100)", padding: "var(--sp-3)" }}>
                <div className="label">Total Earned</div>
                <div className="text-money" style={{ fontSize: "var(--fs-h3)", fontFamily: "var(--font-display)" }}>
                  {state.totalEarned.toLocaleString()}
                </div>
              </div>
            </div>
            {error && <p style={{ color: "var(--crimson-500)", marginTop: "var(--sp-3)" }}>{error}</p>}
          </div>

          {/* === PACK STORE === */}
          <div className="panel" style={{ padding: "var(--sp-6)" }}>
            <div className="panel-title">Card Pack Store</div>
            <p className="text-mute" style={{ marginBottom: "var(--sp-3)" }}>
              {PACK_SIZE} property cards. Higher tiers are rarer.
            </p>
            <button
              className="btn btn-lg btn-block"
              onClick={buyPack}
              disabled={busy || (balance != null && balance < PACK_PRICE)}
            >
              Buy Pack ({PACK_PRICE.toLocaleString()} ¢)
            </button>
          </div>
        </div>
      </div>

      {/* === INVENTORY === */}
      <section className="panel" style={{ padding: "var(--sp-5)", marginTop: "var(--sp-6)" }}>
        <div className="panel-title">Property Inventory</div>
        {Object.keys(owned).length === 0 ? (
          <p className="text-mute">No cards yet. Buy a pack to start collecting.</p>
        ) : (
          <div className="grid grid-3">
            {board
              .map((p) => ({ p, o: owned[p.id] }))
              .filter(({ o }) => !!o)
              .sort((a, b) => b.p.tier - a.p.tier || (b.o?.level ?? 0) - (a.o?.level ?? 0))
              .map(({ p, o }) => {
                const lvl = o!.level;
                const cost = lvl < MAX_LEVEL
                  ? { cards: UPGRADE_CARDS[lvl], coins: UPGRADE_COINS[lvl] }
                  : null;
                const canUp = !!cost && o!.cards >= cost.cards && (balance == null || balance >= cost.coins);
                const currentMult = LEVEL_MULTIPLIER[lvl];
                const nextMult = lvl < MAX_LEVEL ? LEVEL_MULTIPLIER[lvl + 1] : null;
                return (
                  <div
                    key={p.id}
                    style={{
                      background: "var(--parchment-100)",
                      border: `4px solid ${TIER_BG[p.tier]}`,
                      padding: "var(--sp-3)",
                      boxShadow: "var(--sh-card-rest)",
                      position: "relative",
                    }}
                  >
                    <div className="between">
                      <span className="badge" style={{ background: TIER_BG[p.tier], color: TIER_FG[p.tier] }}>
                        T{p.tier}
                      </span>
                      <span className="text-mute" style={{ fontSize: 11 }}>
                        Cards: <b>{o!.cards}</b>
                      </span>
                    </div>
                    <div style={{
                      fontFamily: "var(--font-display)",
                      fontSize: "var(--fs-h4)",
                      marginTop: 6,
                    }}>
                      {p.name}
                    </div>
                    <div className="row" style={{ gap: 3, marginTop: 6 }}>
                      {Array.from({ length: MAX_LEVEL }).map((_, i) => (
                        <span
                          key={i}
                          style={{
                            width: 14,
                            height: 14,
                            background: i < lvl ? "var(--gold-300)" : "var(--parchment-50)",
                            border: "2px solid var(--ink-900)",
                          }}
                        />
                      ))}
                    </div>
                    <div className="text-mute" style={{ fontSize: 11, marginTop: 6 }}>
                      Now: <b className="text-money">×{currentMult}</b> ({(p.basePayout * currentMult).toLocaleString()} ¢)
                      {nextMult && <> · Next: ×{nextMult}</>}
                    </div>
                    {cost ? (
                      <button
                        className="btn btn-sm btn-block"
                        style={{ marginTop: 8 }}
                        onClick={() => upgrade(p.id)}
                        disabled={busy || !canUp}
                      >
                        Upgrade · {cost.cards} cards · {cost.coins.toLocaleString()} ¢
                      </button>
                    ) : (
                      <div
                        className="badge badge-gold"
                        style={{ marginTop: 8, justifyContent: "center", display: "flex" }}
                      >
                        MAX LEVEL
                      </div>
                    )}
                  </div>
                );
              })}
          </div>
        )}
      </section>

      {/* === PACK OPENING OVERLAY === */}
      {packOpening && packCards && (
        <div
          onClick={closePack}
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(26, 15, 8, 0.85)",
            zIndex: 200,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: "var(--sp-5)",
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="panel-wood"
            style={{
              padding: "var(--sp-6)",
              maxWidth: 700,
              width: "100%",
              border: "4px solid var(--ink-900)",
              boxShadow: "var(--sh-popover), var(--glow-gold)",
              textAlign: "center",
            }}
          >
            <div
              style={{
                fontFamily: "var(--font-display)",
                fontSize: "var(--fs-h2)",
                color: "var(--gold-300)",
                textShadow: "3px 3px 0 var(--ink-900)",
                marginBottom: "var(--sp-5)",
                letterSpacing: "var(--ls-loose)",
              }}
            >
              PACK OPENING
            </div>
            <div
              style={{
                display: "grid",
                gridTemplateColumns: `repeat(${packCards.length}, 1fr)`,
                gap: "var(--sp-3)",
                marginBottom: "var(--sp-5)",
              }}
            >
              {packCards.map((c, i) => (
                <PackCard key={i} card={c} revealed={i < revealedCount} />
              ))}
            </div>
            {revealedCount === packCards.length && (
              <button className="btn btn-lg" onClick={closePack}>
                Sweet
              </button>
            )}
          </div>
        </div>
      )}

      <style>{`
        @keyframes flashFade {
          0%   { transform: scale(0.85); opacity: 0; }
          15%  { transform: scale(1.05); opacity: 1; }
          80%  { transform: scale(1); opacity: 1; }
          100% { transform: scale(1); opacity: 0.95; }
        }
        @keyframes diceTumble {
          0%   { transform: rotate(0deg) translateY(0); }
          25%  { transform: rotate(180deg) translateY(-8px); }
          50%  { transform: rotate(360deg) translateY(0); }
          75%  { transform: rotate(540deg) translateY(-4px); }
          100% { transform: rotate(720deg) translateY(0); }
        }
        @keyframes packFlip {
          0%   { transform: rotateY(180deg); }
          100% { transform: rotateY(0deg); }
        }
        @keyframes packShine {
          0%   { transform: translateX(-110%) skewX(-20deg); }
          100% { transform: translateX(220%) skewX(-20deg); }
        }
      `}</style>
    </>
  );
}

function Die({ value, rolling }: { value: number; rolling: boolean }) {
  const dotPositions: Record<number, [number, number][]> = {
    1: [[1, 1]],
    2: [[0, 0], [2, 2]],
    3: [[0, 0], [1, 1], [2, 2]],
    4: [[0, 0], [0, 2], [2, 0], [2, 2]],
    5: [[0, 0], [0, 2], [1, 1], [2, 0], [2, 2]],
    6: [[0, 0], [0, 2], [1, 0], [1, 2], [2, 0], [2, 2]],
  };
  return (
    <div
      style={{
        width: 64,
        height: 64,
        background: "var(--parchment-50)",
        border: "4px solid var(--ink-900)",
        boxShadow: "var(--sh-card-rest)",
        display: "grid",
        gridTemplateColumns: "repeat(3, 1fr)",
        gridTemplateRows: "repeat(3, 1fr)",
        padding: 6,
        gap: 2,
        animation: rolling ? "diceTumble 0.8s linear infinite" : undefined,
      }}
    >
      {Array.from({ length: 9 }).map((_, idx) => {
        const r = Math.floor(idx / 3);
        const c = idx % 3;
        const has = dotPositions[value]?.some(([rr, cc]) => rr === r && cc === c);
        return (
          <div
            key={idx}
            style={{
              background: has ? "var(--ink-900)" : "transparent",
              borderRadius: 999,
              width: "100%",
              height: "100%",
            }}
          />
        );
      })}
    </div>
  );
}

function PackCard({ card, revealed }: { card: Property; revealed: boolean }) {
  return (
    <div
      style={{
        perspective: 800,
        height: 160,
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
        {/* Front face — revealed property */}
        <div
          style={{
            position: "absolute",
            inset: 0,
            backfaceVisibility: "hidden",
            background: TIER_BG[card.tier],
            color: TIER_FG[card.tier],
            border: "4px solid var(--ink-900)",
            padding: "var(--sp-3)",
            display: "flex",
            flexDirection: "column",
            justifyContent: "space-between",
            boxShadow: card.tier >= 4 ? "var(--glow-gold)" : "var(--sh-card-rest)",
            overflow: "hidden",
          }}
        >
          {/* Shine sweep on legendaries */}
          {card.tier === 5 && (
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
          <div
            className="badge"
            style={{
              alignSelf: "flex-start",
              background: "var(--ink-900)",
              color: TIER_BG[card.tier],
              borderColor: TIER_FG[card.tier],
            }}
          >
            {TIER_LABEL[card.tier]}
          </div>
          <div style={{ fontFamily: "var(--font-display)", fontSize: 18, lineHeight: 1.1 }}>
            {card.name}
          </div>
          <div style={{ fontFamily: "var(--font-display)", fontSize: 14, opacity: 0.85 }}>
            +{card.basePayout.toLocaleString()} ¢
          </div>
        </div>
        {/* Back face — pack art */}
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

function labelFor(code: string) {
  const m: Record<string, string> = {
    insufficient_funds: "Not enough Coins.",
    cooldown: "Still on cooldown.",
    not_owned: "You don't own that property.",
    not_enough_cards: "Not enough property cards.",
    max_level: "Already maxed out.",
    no_state: "No game state — try again.",
  };
  return m[code] ?? "Something went wrong.";
}
