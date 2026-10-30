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

The opening menu overlays the live garden. Choose a cat and read the rat profiles, then start to drop from the sky. Controls unlock after landing. The bottom-left HUD shows stamina, sound, and catches. Escape toggles settings and pauses gameplay, including skill checks. Click the garden after resuming to capture the mouse. H toggles wireframes.

Cat variants are standalone GLB models in `public/models/`. Run `node scripts/create-cat-variants.cjs` to regenerate them from `public/car.glb`, preserving its geometry, fur detail, and animations.
