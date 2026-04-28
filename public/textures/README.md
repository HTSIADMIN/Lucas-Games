# Textures

Drop bitmap / SVG textures here. They're served at `/textures/<name>` by Next.

## Used by the app

- `card-bg-golden-bounty.svg`
- `card-bg-train-robber.svg`
- `card-bg-outlaws-last-stand.svg`

  Per-design poster backgrounds for the Golden Bounty scratcher.
  Each tier owns its own SVG, pointed at by `ScratchDesignSpec.bgUrl`
  in `src/lib/games/scratch/designs.ts`. The whole `.scratch-poster`
  card uses its design SVG as `background-image` (sized
  `100% 100%`), and the inner ticket area is transparent so the SVG
  bleeds through behind the cells. Each cell gets a slightly
  translucent parchment overlay so the symbol pixel art stays
  readable on top of the busier card background.

- `scratch-foil.jpg` _(legacy)_

  Old grain-only paper texture. Kept so the file path doesn't 404 if
  any older code still references it; the live scratcher no longer
  uses it.
