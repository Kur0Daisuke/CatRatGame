/** Player/rats/clutter stay inside this radius (well before the fence ring). */
export const PLAY_RADIUS = 40;

/** Wooden fence ring — outside the playable limit. */
export const FENCE_RADIUS = 46;

/** Bushes/decor spawn inside the fenced yard (not outside the gate line). */
export const YARD_SPAWN_RADIUS = FENCE_RADIUS - 2.8;

export function isInsideFencedYard(x, z, radius = YARD_SPAWN_RADIUS) {
    return Math.hypot(x, z) <= radius;
}

/** Uniform random XZ inside a circle. */
export function randomPointInDisk(radius) {
    const t = Math.random() * Math.PI * 2;
    const r = Math.sqrt(Math.random()) * radius;
    return { x: Math.cos(t) * r, z: Math.sin(t) * r };
}
