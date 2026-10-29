import { loadBushes } from './environment.js';
import { buildBorderFences } from './fences.js';
import { scatterFlowers } from './flowers.js';
import { buildWorldBackdrop } from './backdrop.js';
import { spawnWaterPuddles } from './puddles.js';

export function loadWorld(scene, terrain) {
    const puddles = spawnWaterPuddles(scene, terrain);
    const bushes = loadBushes(scene, terrain, puddles);
    buildBorderFences(scene, terrain);
    scatterFlowers(scene, terrain);
    buildWorldBackdrop(scene, terrain);
    return { bushes, puddles };
}
