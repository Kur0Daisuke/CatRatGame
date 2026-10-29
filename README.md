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
