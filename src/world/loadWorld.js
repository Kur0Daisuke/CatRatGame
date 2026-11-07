import { loadBushes } from './environment.js';
import { buildBorderFences } from './fences.js';
import { scatterFlowers } from './flowers.js';
import { buildWorldBackdrop } from './backdrop.js';
import { spawnWaterPuddles } from './puddles.js';
import { loadTrees } from './trees.js';
import { createSkyClouds } from './clouds.js';

export function loadWorld(scene, terrain) {
    const puddles = spawnWaterPuddles(scene, terrain);
    const bushes = loadBushes(scene, terrain, puddles);
    const trees = loadTrees(scene, terrain, puddles);
    buildBorderFences(scene, terrain);
    scatterFlowers(scene, terrain);
    buildWorldBackdrop(scene, terrain);
    const clouds = createSkyClouds(scene);
    return { bushes, puddles, trees, clouds };
}
