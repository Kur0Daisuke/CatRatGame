/** Player/rats/clutter stay inside this radius (well before the fence ring). */
export const PLAY_RADIUS = 40;

/** Main garden focus — rats steer inward toward here near the edge. */
export const YARD_CENTER_X = 15;
export const YARD_CENTER_Z = 15;

/** Soft band before hard clamp where rats pick alternate paths. */
export const ARENA_EDGE_MARGIN = 3.2;

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
