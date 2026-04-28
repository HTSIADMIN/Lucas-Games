// Logical sound names → file paths. Adding a new SFX is a one-line
// edit here; everywhere else uses the logical name.
//
// • volume     — base volume for this sound (multiplied by master).
// • throttleMs — minimum gap between two consecutive plays of the
//                same name. Prevents 50 chips from stacking into a
//                wall of noise.
// • voices     — pool size for rapid replays (each play picks the
//                least-recently-used element so quick repeats don't
//                cut each other off).

export type SfxSpec = {
  src: string;
  volume: number;
  throttleMs: number;
  voices: number;
};

export const SFX_REGISTRY = {
  // Coins / wins
  "coin.drop":     { src: "/sfx/Coin-wining-drop.wav",                 volume: 0.7,  throttleMs: 120, voices: 3 },
  "coins.clink":   { src: "/sfx/clinking-coins.wav",                   volume: 0.55, throttleMs: 100, voices: 4 },
  "coins.handle":  { src: "/sfx/coins-handling.wav",                   volume: 0.45, throttleMs: 150, voices: 3 },
  "coins.shower":  { src: "/sfx/melodic-gold-wining_coins.wav",        volume: 0.75, throttleMs: 1000, voices: 1 },

  // Win stingers
  "win.notify":    { src: "/sfx/casino-win-notification.wav",          volume: 0.7,  throttleMs: 500, voices: 1 },
  "win.big":       { src: "/sfx/score-casino-counter-big-winner.wav",  volume: 0.85, throttleMs: 2000, voices: 1 },
  "win.levelup":   { src: "/sfx/casino-achievement_level-up.wav",      volume: 0.7,  throttleMs: 1000, voices: 1 },

  // Cards
  "card.shuffle":  { src: "/sfx/card-deck-shuffle.wav",                volume: 0.55, throttleMs: 200, voices: 2 },
  "card.deal":     { src: "/sfx/cards-deck-hits.wav",                  volume: 0.5,  throttleMs: 60,  voices: 5 },
  "card.place":    { src: "/sfx/poker-card-placement.wav",             volume: 0.5,  throttleMs: 60,  voices: 5 },

  // UI / generic
  "roulette.ball": { src: "/sfx/casino-roulette-ball.wav",             volume: 0.6,  throttleMs: 1000, voices: 1 },
  "ui.notify":     { src: "/sfx/retro-arcade-casino-notification.wav", volume: 0.5,  throttleMs: 400, voices: 2 },
  // Tight UI click — tap, modal-open, plinko drop. Mild and short.
  "ui.click":      { src: "/sfx/ui-click.mp3",                         volume: 0.55, throttleMs: 40,  voices: 5 },

  // Dice — punchy single-die toss; replaces card.deal on dice roll.
  "dice.throw":    { src: "/sfx/dice-throw.ogg",                       volume: 0.7,  throttleMs: 250, voices: 2 },

  // Chip table sounds.
  "chips.stack":   { src: "/sfx/chips-stack.ogg",                      volume: 0.7,  throttleMs: 200, voices: 3 },
  "chips.collide": { src: "/sfx/chips-collide.ogg",                    volume: 0.55, throttleMs: 80,  voices: 4 },

  // Card-pack tear — distinct sweep used when opening shop / monopoly packs.
  "pack.open":     { src: "/sfx/pack-open.ogg",                        volume: 0.7,  throttleMs: 800, voices: 1 },

  // Card-table action sounds (for poker / blackjack table flow).
  "card.slide":    { src: "/sfx/card-slide.ogg",                       volume: 0.55, throttleMs: 60,  voices: 5 },
  "card.fan":      { src: "/sfx/card-fan.ogg",                         volume: 0.6,  throttleMs: 200, voices: 2 },
  "card.shove":    { src: "/sfx/card-shove.ogg",                       volume: 0.55, throttleMs: 100, voices: 3 },

  // Chip-table action sounds — placing bets, handling stacks.
  "chip.lay":      { src: "/sfx/chip-lay.ogg",                         volume: 0.6,  throttleMs: 60,  voices: 5 },
  "chips.handle":  { src: "/sfx/chips-handle.ogg",                     volume: 0.5,  throttleMs: 200, voices: 3 },

  // Dice-table sounds — pre-throw rattle + single-die land.
  "dice.shake":    { src: "/sfx/dice-shake.ogg",                       volume: 0.65, throttleMs: 200, voices: 2 },
  "die.land":      { src: "/sfx/die-throw.ogg",                        volume: 0.6,  throttleMs: 60,  voices: 4 },

  // UI variants — drop-in alternatives to ui.click for distinct moments.
  "ui.wood":       { src: "/sfx/ui-wood.ogg",                          volume: 0.55, throttleMs: 50,  voices: 5 },
  "ui.confirm":    { src: "/sfx/ui-confirm.ogg",                       volume: 0.6,  throttleMs: 80,  voices: 3 },
  "ui.soft":       { src: "/sfx/ui-soft.ogg",                          volume: 0.5,  throttleMs: 50,  voices: 5 },
  "ui.bomb":       { src: "/sfx/ui-bomb.ogg",                          volume: 0.7,  throttleMs: 200, voices: 2 },
} as const satisfies Record<string, SfxSpec>;

export type SfxName = keyof typeof SFX_REGISTRY;
