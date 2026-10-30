# FirstWebsite

Three.js cat stealth game (Vite).

## Project layout

```
public/          Static assets (models, textures)
src/
  main.js        Entry point
  core/          Shared utilities (collision, entity registry, debug)
  game/          Player and rat actors
  world/         Terrain, bushes, fences, flowers, backdrop
  systems/       Pounce QTE, cat sound, sound visuals
  scene/         Renderer, lights, sky, post-processing
  styles/        CSS
```

## Commands

- `npm run dev` — local dev server
- `npm run build` — production build to `dist/`

The top-right Settings menu selects the original cat or the orange, white, and blue coat variants, and toggles collision wireframes. Press Esc to release mouse capture before opening Settings. H also toggles wireframes.

Cat variants are standalone GLB models in `public/models/`. Run `node scripts/create-cat-variants.cjs` to regenerate them from `public/car.glb`, preserving its geometry, fur detail, and animations.
