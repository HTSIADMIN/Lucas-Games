"use client";

// Static FAQ — explains the game's many systems in one place so
// new players don't have to reverse-engineer Pinch Streak / Pile
// It Up / Frugality / etc. from upgrade descriptions.

const SECTIONS: { title: string; lines: string[] }[] = [
  {
    title: "The Basics",
    lines: [
      "Click coins to bank Pinch Cents (PC). PC stays inside the game — you spend it on upgrades and helpers.",
      "Hit Bank It any time to convert your full PC pool into wallet ¢ at the standard ratio. No cooldown, no caps.",
      "Helpers tick PC on their own, even while you're not clicking. They keep working while you're away (capped at 8h offline by default).",
    ],
  },
  {
    title: "Pinch Streak",
    lines: [
      "Click within a 6-second window to build a streak. Tiers fire at 5, 15, and 30 clicks.",
      "Each tier multiplies the next click's payout: Warm 1.2× → Hot 1.5× → Money Frenzy 2×.",
      "Money Frenzy lights up the play area with extra coin spawns for 5 seconds.",
    ],
  },
  {
    title: "Pile It Up — auto-merging",
    lines: [
      "Buy the Pile It Up upgrade and any two coins near each other will fuse into one whose value is the sum of both.",
      "Each merge resets the new coin's lifetime, so chains can keep growing into massive single-click payouts.",
      "Server caps any single click at 5,000 PC base (multipliers stack on top), so don't expect a one-click jackpot.",
    ],
  },
  {
    title: "Rare Coin Traits",
    lines: [
      "✦ Shiny — gold halo, pays 5×.",
      "✦ Ancient — jade halo, very rare, pays 50×.",
      "× Cursed — red glow, pays 3× but pauses spawns for 5s afterward.",
      "○ Bent — tilted disc, pays half but lights a 5s lucky window for shiny rolls.",
      "+ Foreign — sky-blue swirl, normal payout but goes into the Foreign album page for a permanent +PC bonus.",
      "○ Sticky — cyan ring (penny / nickel only); on click, also picks up the two nearest coins.",
    ],
  },
  {
    title: "Coin Album",
    lines: [
      "Picking up a trait coin records it on the matching album page. Six pages, one per trait — Shiny, Sticky, Foreign, Bent, Cursed, Ancient.",
      "Each filled slot grants a small spawn-chance bonus for that trait; completing a page grants a bigger one.",
      "Bonuses: Shiny +0.5%/slot, +5% complete · Sticky +1% / +3% · Foreign +0.5% / +5% PC on every click · Bent +0.5% / +5% · Cursed +0.3% / +3% · Ancient +0.05% / +0.5%.",
      "The album survives Prestige — it's the lifetime collection meta.",
    ],
  },
  {
    title: "Relic Shop",
    lines: [
      "Open the Relics tab. Spend Frugality on chests — Bronze (2), Silver (6), Gold (15) — server rolls a random relic by tier rarity.",
      "Nine relics across common → legendary, each with up to 3-5 levels. Duplicates level up the relic you already own.",
      "Effects stack with everything else. Highlights: Lucky Charm (shiny chance), Midas Thumb (click PC), Helping Hand (helper rate), Rainmaker (Coin Storm trigger), Fortune's Eye (every coin worth +5 PC permanently per level).",
      "Relics persist through Prestige — they're the long-game power curve. Save your wallet returns.",
    ],
  },
  {
    title: "Bank It",
    lines: [
      "Converts your current PC into wallet ¢ at a 4 PC : 1 ¢ ratio.",
      "No cooldown, no caps — bank as often as you like.",
      "After banking, your PC pool resets to 0. Upgrades and helpers stay.",
    ],
  },
  {
    title: "Prestige",
    lines: [
      "First Prestige unlocks at 100k current cents. The threshold ramps with each prestige: +100k per rank for the first 10 prestiges (P10 = 1M), then +200k per rank through P20 (= 3M total), then +300k per rank through P30 (= 6M), etc.",
      "Cents are spent on tokens — sqrt curve: floor(sqrt(cents / 4000)). At the entry threshold you always pocket 5 tokens; sitting on extra cents above it earns more (200k ≈ 7, 500k ≈ 11, 1M ≈ 15) but with diminishing returns.",
      "Spend Tokens in the ★ Tokens tab on permanent upgrades that survive every future Prestige.",
      "Each Prestige adds a permanent PC multiplier on every coin pickup: first one is +300% (×4), and each subsequent +100% (×5, ×6, ...).",
      "Your prestige count rides the leaderboard as a ★ N Prestige badge — gold at first, then emerald (5+), ruby (10+), sapphire (15+), amethyst (20+), and diamond rainbow (25+).",
      "Higher Ceilings (perm) adds +10 to the max level of every base upgrade per level — five tiers (5, 7, 10, 14, 20★, total 56★) take Coin Value from 20 → 70, Sharper Eyes 10 → 60, etc. Spawn unlocks (Vending / Parking / Laundry / Boardwalk / Grandpa) and Pile It Up are exempt because their meaningful work is the first 5 ranks.",
      "Bigger Pockets (perm) is quadratic: lvl 1 seeds 1k, lvl 5 seeds 25k, maxed seeds 100k cents into the next cycle so the grind back to the first-prestige threshold is automatic at full ranks.",
      "Prestige Tithe (perm, 5★ × 1.7^lvl) is the new payoff for high-prestige players — each rank multiplies Frugality gained on every Roll It Up (L1 0.5× → L5 1.0×). The grant is floor(prestige count × multiplier), capped at +50.",
    ],
  },
  {
    title: "Frugality",
    lines: [
      "The Lost Wallet event lets you Return It (+1 Frugality) or Keep the Change (-1 Frugality + 500 PC).",
      "Each positive Frugality point grants +0.5% PC on every coin. Maxed at +50 → +25% PC across the run.",
      "Negative Frugality has no penalty for now. Future updates may add cursed-coin chance / risk variants.",
    ],
  },
];

export function FaqModal({ onClose }: { onClose: () => void }) {
  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Penny Pinchers help"
      onClick={onClose}
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 9_500,
        background: "rgba(26,15,8,0.7)",
        display: "grid",
        placeItems: "center",
        padding: 16,
        backdropFilter: "blur(2px)",
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="panel-wood"
        style={{
          width: "min(640px, 100%)",
          maxHeight: "calc(100vh - 32px)",
          overflowY: "auto",
          padding: "var(--sp-5)",
          border: "4px solid var(--ink-900)",
          boxShadow: "var(--sh-popover), var(--glow-gold)",
        }}
      >
        <div className="row" style={{ justifyContent: "space-between", alignItems: "center", marginBottom: "var(--sp-3)" }}>
          <div
            className="uppercase"
            style={{
              fontFamily: "var(--font-display)",
              fontSize: "var(--fs-h3)",
              color: "var(--gold-300)",
              letterSpacing: "var(--ls-loose)",
              textShadow: "2px 2px 0 var(--ink-900)",
            }}
          >
            How to Play
          </div>
          <button type="button" className="btn btn-sm btn-ghost" onClick={onClose} aria-label="Close">
            ✕
          </button>
        </div>
        <div className="stack" style={{ gap: "var(--sp-3)" }}>
          {SECTIONS.map((s) => (
            <section
              key={s.title}
              style={{
                background: "var(--parchment-100)",
                border: "3px solid var(--saddle-300)",
                padding: "var(--sp-3)",
                color: "var(--ink-900)",
              }}
            >
              <div
                style={{
                  fontFamily: "var(--font-display)",
                  fontSize: 14,
                  letterSpacing: "0.04em",
                  marginBottom: 6,
                  color: "var(--ink-900)",
                }}
              >
                {s.title}
              </div>
              <ul style={{ margin: 0, paddingLeft: 16, color: "var(--ink-900)" }}>
                {s.lines.map((line, i) => (
                  <li key={i} style={{ fontSize: 13, lineHeight: 1.5, marginBottom: 4 }}>
                    {line}
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      </div>
    </div>
  );
}
