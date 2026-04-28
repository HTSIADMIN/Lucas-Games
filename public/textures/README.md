# Textures

Drop bitmap textures here. They're served at `/textures/<name>` by Next.

## Used by the app

- `scratch-foil.jpg` — base foil texture for the scratcher cards.
  Paper / concrete grey grain ~1920×1280; the `paintFoil()` function
  in `src/app/games/scratch/ScratchClient.tsx` tiles it across the
  canvas and multiply-tints it with the design's foil colour
  (silver / gold / ruby), so the texture provides the grain and the
  design provides the hue.
