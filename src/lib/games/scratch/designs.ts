// Ticket designs. Each cost tier is a different theme + foil colour
// + symbol palette tweak. Pricing is fixed (no arbitrary bets) so the
// math + the visual hierarchy stay tight.

export type ScratchDesign = "golden-bounty" | "train-robber" | "outlaws-last-stand";

export type ScratchDesignSpec = {
  id: ScratchDesign;
  /** Header line on the poster ("WANTED — GOLDEN BOUNTY"). */
  name: string;
  /** Fixed ticket cost in coins. */
  cost: number;
  /** Foil layer colour stops for the linear gradient (3 stops). */
  foil: [string, string, string];
  /** Foil edge glow when scratching (subtle). */
  foilGlow: string;
  /** Body parchment colour (fallback under the SVG bg). */
  paper: string;
  /** Header bar accent colour (the WANTED stripe). */
  accent: string;
  /** Decorative subtitle. */
  subtitle: string;
  /** Per-design SVG poster background (full ticket card). */
  bgUrl: string;
};

export const SCRATCH_DESIGNS: Record<ScratchDesign, ScratchDesignSpec> = {
  "golden-bounty": {
    id: "golden-bounty",
    name: "GOLDEN BOUNTY",
    cost: 10_000,
    foil: ["#9a9a9a", "#e5e5e5", "#9a9a9a"],
    foilGlow: "rgba(229,229,229,0.45)",
    paper: "#f4e8d0",
    accent: "#9b2c2c",
    subtitle: "3-IN-A-ROW · MATCH THE LUCKY",
    bgUrl: "/textures/card-bg-golden-bounty.svg",
  },
  "train-robber": {
    id: "train-robber",
    name: "TRAIN ROBBER",
    cost: 100_000,
    foil: ["#7a5510", "#f5c842", "#c8941d"],
    foilGlow: "rgba(245,200,66,0.55)",
    paper: "#f1d9b3",
    accent: "#4a2818",
    subtitle: "HIGH ROLLER · 10× THE PAYOUT",
    bgUrl: "/textures/card-bg-train-robber.svg",
  },
  "outlaws-last-stand": {
    id: "outlaws-last-stand",
    name: "OUTLAW'S LAST STAND",
    cost: 1_000_000,
    foil: ["#4a1a1a", "#9b2c2c", "#4a1a1a"],
    foilGlow: "rgba(255,85,68,0.6)",
    paper: "#fef6e4",
    accent: "#1a0f08",
    subtitle: "WHALE TICKET · 100× MULTIPLIER POOL",
    bgUrl: "/textures/card-bg-outlaws-last-stand.svg",
  },
};

export const SCRATCH_DESIGN_ORDER: ScratchDesign[] = [
  "golden-bounty",
  "train-robber",
  "outlaws-last-stand",
];

/** Look up a design by its fixed cost; throws on a custom value. */
export function designForCost(cost: number): ScratchDesignSpec {
  const found = Object.values(SCRATCH_DESIGNS).find((d) => d.cost === cost);
  if (!found) throw new Error("invalid_ticket_cost");
  return found;
}

export function isValidScratchCost(cost: unknown): cost is number {
  return typeof cost === "number"
    && Number.isInteger(cost)
    && Object.values(SCRATCH_DESIGNS).some((d) => d.cost === cost);
}
