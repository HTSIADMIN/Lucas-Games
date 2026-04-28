# Textures

Drop bitmap textures here. They're served at `/textures/<name>` by Next.

## Used by the app

- `scratch-foil.jpg` — paper / grain texture for the **ticket
  background** (the parchment behind the foil and symbols). The
  ticket div in `src/app/games/scratch/ScratchClient.tsx` sets it as
  a tiled `background-image` and multiply-blends with the design's
  paper colour (`spec.paper`), so the texture provides the grain and
  the design provides the hue. The metallic pixel-art foil stays
  painted by the canvas on top — this image is *behind* the foil.
