import * as THREE from 'three';

const _closest = new THREE.Vector3();

/** XZ distance from a point to an axis-aligned box (0 when inside on XZ). */
export function xzDistanceToBox(point, box) {
    const cx = THREE.MathUtils.clamp(point.x, box.min.x, box.max.x);
    const cz = THREE.MathUtils.clamp(point.z, box.min.z, box.max.z);
    return Math.hypot(point.x - cx, point.z - cz);
}

/**
 * 0 = open field, 1 = fully inside bush cover.
 * Uses a soft falloff outside the bush footprint so enter/exit eases in.
 */
export function computeBushBlend(position, bushes, fadeRadius = 0.45) {
    if (!bushes || bushes.length === 0) return 0;

    let blend = 0;
    for (const bush of bushes) {
        if (!bush.box) continue;
        const dist = xzDistanceToBox(position, bush.box);
        const local = 1 - THREE.MathUtils.smoothstep(0, fadeRadius, dist);
        blend = Math.max(blend, local);
    }
    return THREE.MathUtils.clamp(blend, 0, 1);
}

export function clampPositionToArena(position, halfExtent = 48, margin = 0.6) {
    const limit = halfExtent - margin;
    position.x = THREE.MathUtils.clamp(position.x, -limit, limit);
    position.z = THREE.MathUtils.clamp(position.z, -limit, limit);
}

/** Push overlapping dynamic spheres apart on XZ. */
export function resolveSphereOverlapXZ(centerA, radiusA, centerB, radiusB, outA, outB) {
    const dx = centerB.x - centerA.x;
    const dz = centerB.z - centerA.z;
    let distSq = dx * dx + dz * dz;
    const minDist = radiusA + radiusB;

    if (distSq >= minDist * minDist) return false;

    if (distSq < 1e-8) {
        distSq = 1e-8;
    }

    const dist = Math.sqrt(distSq);
    const overlap = minDist - dist;
    const nx = dx / dist;
    const nz = dz / dist;
    const push = overlap * 0.5;

    outA.x -= nx * push;
    outA.z -= nz * push;
    outB.x += nx * push;
    outB.z += nz * push;
    return true;
}

export function closestPointOnBoxXZ(point, box, target = _closest) {
    target.set(
        THREE.MathUtils.clamp(point.x, box.min.x, box.max.x),
        point.y,
        THREE.MathUtils.clamp(point.z, box.min.z, box.max.z)
    );
    return target;
}
