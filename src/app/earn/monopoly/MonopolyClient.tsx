"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import * as Sfx from "@/lib/sfx";
import {
  BOARD_SIZE,
  LEVEL_MULTIPLIER,
  MAX_LEVEL,
  PACK_PRICE,
  PACK_SIZE,
  PROPERTIES,
  UPGRADE_CARDS,
  UPGRADE_COINS,
  gridPos,
  type Property,
  type PropertyTier,
  type SpaceType,
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
  space: { kind: string; propertyName: string | null };
  totalPayout: number;
  earnedFromProperty: { name: string; level: number; payout: number } | null;
  mystery: { card: { kind: string; label: string }; effect: string } | null;
  freeReroll: boolean;
  nextRollAt: string | null;
  balance: number;
};

export function MonopolyClient() {
  const router = useRouter();
  const [board, setBoard] = useState<SpaceType[]>([]);
  const [state, setState] = useState<State | null>(null);
  const [owned, setOwned] = useState<Owned>({});
  const [balance, setBalance] = useState<number | null>(null);
  const [serverOffset, setServerOffset] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [rolling, setRolling] = useState(false);
  const [diceShown, setDiceShown] = useState<[number, number]>([1, 1]);
  const [rollResult, setRollResult] = useState<RollResult | null>(null);
  const [animPosition, setAnimPosition] = useState<number>(0);

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
    Sfx.play("card.deal");

    const r = await fetch("/api/earn/monopoly/roll", { method: "POST" });
    const d = await r.json();
    if (!r.ok) {
      setRolling(false); setBusy(false);
      setError(labelFor(d.error ?? "error"));
      return;
    }

    setTimeout(async () => {
      setRolling(false);
      setDiceShown(d.dice);

      // Walk one tile every 200ms.
      const path: number[] = [];
      let p = d.fromPosition;
      for (let i = 0; i < d.move; i++) {
        p = (p + 1) % BOARD_SIZE;
        path.push(p);
      }
      for (let i = 0; i < path.length; i++) {
        await new Promise((res) => setTimeout(res, 200));
        setAnimPosition(path[i]);
      }
      // If mystery teleported, finish on the actual end.
      if (d.toPosition !== path[path.length - 1]) {
        await new Promise((res) => setTimeout(res, 400));
        setAnimPosition(d.toPosition);
      }

      setRollResult(d);
      setBalance(d.balance);
      setBusy(false);
      // Tier the landing chime by what the player got.
      const payout = d.payout ?? 0;
      if (payout >= 50_000) Sfx.play("win.big");
      else if (payout >= 5_000) Sfx.play("win.levelup");
      else if (payout > 0) Sfx.play("coins.clink");
      else if (d.cardsAwarded && d.cardsAwarded > 0) Sfx.play("card.place");
      else Sfx.play("ui.notify");
      refresh();
      router.refresh();
    }, 1100);
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
    Sfx.play("pack.open");
    for (let i = 0; i < (d.cards as Property[]).length; i++) {
      setTimeout(() => {
        setRevealedCount(i + 1);
        Sfx.play("card.deal");
      }, 350 + i * 350);
    }
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
    Sfx.play("win.levelup");
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
      {/* === BOARD RING === */}
      <div className="panel" style={{ padding: "var(--sp-5)", marginBottom: "var(--sp-6)" }}>
        <div className="panel-title">The Board</div>

        <div
          style={{
            position: "relative",
            display: "grid",
            gridTemplateColumns: "repeat(10, 1fr)",
            gridTemplateRows: "repeat(10, 1fr)",
            aspectRatio: "1 / 1",
            background: "var(--saddle-500)",
            border: "4px solid var(--ink-900)",
            padding: 4,
            gap: 3,
            maxWidth: 760,
            margin: "0 auto",
          }}
        >
          {board.map((space, i) => {
            const pos = gridPos(i);
            const here = animPosition === i;
            const o = space.kind === "property" ? owned[space.property.id] : undefined;
            const lvl = o?.level ?? 0;
            return (
              <BoardCell
                key={i}
                space={space}
                index={i}
                row={pos.row}
                col={pos.col}
                here={here}
                level={lvl}
              />
            );
          })}

          {/* Center info panel */}
          <div
            style={{
              gridRowStart: 2,
              gridRowEnd: 10,
              gridColumnStart: 2,
              gridColumnEnd: 10,
              background: "var(--saddle-500)",
              border: "3px solid var(--ink-900)",
              padding: "var(--sp-5)",
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              justifyContent: "center",
              gap: "var(--sp-4)",
              backgroundImage:
                "repeating-linear-gradient(0deg, rgba(74,40,24,0.15) 0, rgba(74,40,24,0.15) 2px, transparent 2px, transparent 8px)",
            }}
          >
            <div className="row-lg" style={{ justifyContent: "center" }}>
              <Die value={diceShown[0]} rolling={rolling} />
              <Die value={diceShown[1]} rolling={rolling} />
            </div>

            <button
              className={`btn btn-lg${state.ready && !busy && !rolling ? " action-ready" : ""}`}
              onClick={roll}
              disabled={busy || !state.ready}
              style={{ width: "min(220px, 100%)" }}
            >
              {rolling ? "Rolling..." : state.ready ? "Roll Dice" : `Next roll in ${cooldownStr}`}
            </button>

            {rollResult && (
              <ResultCard r={rollResult} />
            )}

            <div className="row" style={{ gap: "var(--sp-3)" }}>
              <Stat label="Rolls" value={String(state.totalRolls)} />
              <Stat label="Earned" value={`${state.totalEarned.toLocaleString()} ¢`} money />
            </div>

            {error && <p style={{ color: "var(--crimson-300)" }}>{error}</p>}
          </div>
        </div>
      </div>

      {/* === PACK STORE === */}
      <div className="panel" style={{ padding: "var(--sp-5)", marginBottom: "var(--sp-6)" }}>
        <div className="panel-title">Card Pack Store</div>
        <div className="row-lg" style={{ flexWrap: "wrap" }}>
          <p className="text-mute" style={{ flex: "1 1 200px", minWidth: 0 }}>
            {PACK_SIZE} property cards per pack. Higher tiers are rarer.
          </p>
          <button
            className="btn btn-lg"
            onClick={buyPack}
            disabled={busy || (balance != null && balance < PACK_PRICE)}
            style={{ flex: "1 1 200px" }}
          >
            Buy Pack ({PACK_PRICE.toLocaleString()} ¢)
          </button>
        </div>
      </div>

      {/* === INVENTORY === */}
      <section className="panel" style={{ padding: "var(--sp-5)" }}>
        <div className="panel-title">Property Inventory</div>
        {Object.keys(owned).length === 0 ? (
          <p className="text-mute">No cards yet. Buy a pack to start collecting.</p>
        ) : (
          <div className="grid grid-3">
            {PROPERTIES.map((p) => ({ p, o: owned[p.id] }))
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
                    <div style={{ fontFamily: "var(--font-display)", fontSize: "var(--fs-h4)", marginTop: 6 }}>
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
                        Upgrade · {cost.cards}🏷 · {cost.coins.toLocaleString()} ¢
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
          80%  { opacity: 1; }
          100% { opacity: 0.95; }
        }
        @keyframes diceTumble {
          0%   { transform: rotate(0deg) translateY(0); }
          25%  { transform: rotate(180deg) translateY(-8px); }
          50%  { transform: rotate(360deg) translateY(0); }
          75%  { transform: rotate(540deg) translateY(-4px); }
          100% { transform: rotate(720deg) translateY(0); }
        }
        @keyframes packShine {
          0%   { transform: translateX(-110%) skewX(-20deg); }
          100% { transform: translateX(220%) skewX(-20deg); }
        }
      `}</style>
    </>
  );
}

function BoardCell({
  space,
  row,
  col,
  here,
  level,
}: {
  space: SpaceType;
  index: number;
  row: number;
  col: number;
  here: boolean;
  level: number;
}) {
  const isCorner = (row === 0 || row === 9) && (col === 0 || col === 9);
  const baseStyle: React.CSSProperties = {
    gridRow: row + 1,
    gridColumn: col + 1,
    border: here ? "3px solid var(--gold-300)" : "2px solid var(--ink-900)",
    boxShadow: here ? "var(--glow-gold)" : "var(--bevel-light)",
    padding: 3,
    fontFamily: "var(--font-display)",
    overflow: "hidden",
    position: "relative",
    minHeight: 0,
  };

  if (space.kind === "property") {
    const fg = TIER_FG[space.property.tier];
    const onDark = fg !== "var(--ink-900)";
    return (
      <div
        style={{
          ...baseStyle,
          background: TIER_BG[space.property.tier],
          color: fg,
          fontSize: 11,
          lineHeight: 1.05,
          padding: 4,
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
        }}
      >
        <div
          style={{
            textShadow: onDark
              ? "1px 1px 0 rgba(26,15,8,0.85)"
              : "1px 1px 0 rgba(255,246,228,0.7)",
            wordBreak: "break-word",
          }}
        >
          {space.property.name}
        </div>
        <div
          style={{
            alignSelf: "flex-start",
            marginTop: 2,
            padding: "1px 4px",
            background: "rgba(26,15,8,0.78)",
            color: "var(--gold-300)",
            fontSize: 11,
            letterSpacing: "var(--ls-loose)",
            border: "1px solid rgba(0,0,0,0.45)",
          }}
        >
          {space.property.basePayout >= 1000 ? `${space.property.basePayout / 1000}k` : space.property.basePayout}
        </div>
        {level > 0 && (
          <div style={{ position: "absolute", bottom: 2, right: 2, display: "flex", gap: 1 }}>
            {Array.from({ length: level }).map((_, j) => (
              <span
                key={j}
                style={{
                  width: 5, height: 5,
                  background: "var(--gold-300)",
                  border: "1px solid var(--ink-900)",
                }}
              />
            ))}
          </div>
        )}
        {here && <Token />}
      </div>
    );
  }
  if (space.kind === "go") {
    return (
      <div
        style={{
          ...baseStyle,
          background: "var(--gold-300)",
          color: "var(--ink-900)",
          fontSize: 18,
          textAlign: "center",
          alignContent: "center",
          letterSpacing: "var(--ls-loose)",
          textShadow: "1px 1px 0 var(--gold-100)",
        }}
      >
        GO
        {here && <Token />}
      </div>
    );
  }
  if (space.kind === "free_parking") {
    return (
      <div
        style={{
          ...baseStyle,
          background: "var(--cactus-500)",
          color: "var(--parchment-50)",
          fontSize: 13,
          textAlign: "center",
          alignContent: "center",
          lineHeight: 1.05,
          letterSpacing: "var(--ls-loose)",
          textShadow: "1px 1px 0 rgba(26,15,8,0.7)",
        }}
      >
        FREE<br/>PARK
        {here && <Token />}
      </div>
    );
  }
  if (space.kind === "reroll") {
    return (
      <div
        style={{
          ...baseStyle,
          background: "var(--saddle-200)",
          color: "var(--ink-900)",
          fontSize: 12,
          textAlign: "center",
          alignContent: "center",
          letterSpacing: "var(--ls-loose)",
          textShadow: "1px 1px 0 rgba(255,246,228,0.6)",
        }}
      >
        REROLL
        {here && <Token />}
      </div>
    );
  }
  // mystery
  return (
    <div
      style={{
        ...baseStyle,
        background: "var(--crimson-500)",
        color: "var(--gold-300)",
        fontSize: 22,
        fontWeight: "bold",
        textAlign: "center",
        alignContent: "center",
        textShadow: "2px 2px 0 var(--ink-900)",
      }}
    >
      ?
      {here && <Token />}
    </div>
  );
}

function Token() {
  return (
    <div
      style={{
        position: "absolute",
        top: -2,
        left: "50%",
        transform: "translateX(-50%)",
        width: 12,
        height: 12,
        background: "var(--gold-300)",
        border: "2px solid var(--ink-900)",
        borderRadius: 999,
        boxShadow: "var(--glow-gold)",
        zIndex: 5,
      }}
    />
  );
}

function ResultCard({ r }: { r: RollResult }) {
  const positive = r.totalPayout > 0;
  const negative = r.totalPayout < 0;
  return (
    <div
      style={{
        animation: "flashFade 0.6s var(--ease-snap)",
        background: positive ? "var(--cactus-500)" : negative ? "var(--crimson-500)" : "var(--saddle-200)",
        border: "3px solid var(--ink-900)",
        padding: "var(--sp-3) var(--sp-4)",
        color: "var(--parchment-50)",
        fontFamily: "var(--font-display)",
        textAlign: "center",
        maxWidth: "100%",
        wordBreak: "break-word",
      }}
    >
      {r.earnedFromProperty && (
        <div style={{ fontSize: 14 }}>
          {r.earnedFromProperty.name}
          {r.earnedFromProperty.level > 0 && ` · L${r.earnedFromProperty.level}`}
        </div>
      )}
      {r.mystery && (
        <div style={{ fontSize: 13, marginTop: 4 }}>
          ? {r.mystery.effect}
        </div>
      )}
      {r.space.kind === "reroll" && !r.mystery && (
        <div style={{ fontSize: 14 }}>Reroll! Your dice are hot.</div>
      )}
      {r.space.kind === "go" && (
        <div style={{ fontSize: 14 }}>Welcome back to GO!</div>
      )}
      {r.space.kind === "free_parking" && (
        <div style={{ fontSize: 14 }}>Free Parking — small bonus.</div>
      )}
      <div style={{ fontSize: 22, marginTop: 6, color: "var(--gold-300)", textShadow: "2px 2px 0 var(--ink-900)" }}>
        {positive ? "+" : ""}{r.totalPayout.toLocaleString()} ¢
      </div>
      {r.freeReroll && (
        <div className="badge badge-gold" style={{ marginTop: 6 }}>FREE REROLL UNLOCKED</div>
      )}
    </div>
  );
}

function Stat({ label, value, money }: { label: string; value: string; money?: boolean }) {
  return (
    <div
      style={{
        background: "var(--saddle-600)",
        border: "2px solid var(--ink-900)",
        padding: "4px 10px",
        fontFamily: "var(--font-display)",
        color: "var(--parchment-50)",
      }}
    >
      <span style={{ fontSize: 10, color: "var(--saddle-200)", marginRight: 6 }}>{label}</span>
      <span style={{ fontSize: 14, color: money ? "var(--gold-300)" : "var(--parchment-50)" }}>
        {value}
      </span>
    </div>
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
        width: 56,
        height: 56,
        background: "var(--parchment-50)",
        border: "4px solid var(--ink-900)",
        boxShadow: "var(--sh-card-rest)",
        display: "grid",
        gridTemplateColumns: "repeat(3, 1fr)",
        gridTemplateRows: "repeat(3, 1fr)",
        padding: 5,
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
            }}
          />
        );
      })}
    </div>
  );
}

function PackCard({ card, revealed }: { card: Property; revealed: boolean }) {
  return (
    <div style={{ perspective: 800, height: 160 }}>
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
          {card.tier === 5 && (
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
