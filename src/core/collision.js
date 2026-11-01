import * as THREE from 'three';
import { PLAY_RADIUS, YARD_CENTER_X, YARD_CENTER_Z, ARENA_EDGE_MARGIN } from './worldBounds.js';

/** Soft falloff beyond each bush's hard cover radius (world units). */
export const BUSH_COVER_FADE = 0.28;

/** Target blend at/above this = in bush (HUD, stealth). */
export const BUSH_COVER_ENTER = 0.42;
export const BUSH_COVER_EXIT = 0.08;

const _bushWorld = new THREE.Vector3();

export function computeBushBlend(position, bushes, fadeRadius = BUSH_COVER_FADE) {
    if (!bushes || bushes.length === 0) return 0;

    const px = position.x;
    const pz = position.z;
    let blend = 0;

    for (const bush of bushes) {
        let bx;
        let bz;
        let radius = bush.coverRadius;

        if (bush.mesh) {
            bush.mesh.getWorldPosition(_bushWorld);
            bx = _bushWorld.x;
            bz = _bushWorld.z;
        } else if (bush.x != null && bush.coverRadius != null) {
            bx = bush.x;
            bz = bush.z;
        } else {
            continue;
        }

        if (radius == null || !Number.isFinite(radius)) radius = 0.32;

        const dist = Math.hypot(px - bx, pz - bz);
        if (dist > radius + fadeRadius) continue;

        const local = 1 - THREE.MathUtils.smoothstep(radius, radius + fadeRadius, dist);
        if (local > blend) blend = local;
        if (blend >= 1) break;
    }

    return THREE.MathUtils.clamp(blend, 0, 1);
}

/** In-bush flag from target blend only (no sticky middle band). */
export function isInBushCover(targetBlend, wasActive) {
    const t = THREE.MathUtils.clamp(targetBlend, 0, 1);
    if (t >= BUSH_COVER_ENTER) return true;
    if (t <= BUSH_COVER_EXIT) return false;
    return wasActive;
}

const _closest = new THREE.Vector3();
const _normal = new THREE.Vector3();
const _targetQuat = new THREE.Quaternion();
const _worldUp = new THREE.Vector3(0, 1, 0);
const _forward = new THREE.Vector3();
const _lookMatrix = new THREE.Matrix4();
const _lookTarget = new THREE.Vector3();

let _terrainHeightAt = null;
let _terrainNormalAt = null;

/** Register (x, z) => height for terrain following. */
export function setTerrainSampler(fn) {
    _terrainHeightAt = typeof fn === 'function' ? fn : null;
}

/** Register (x, z) => THREE.Vector3 normal (optional). */
export function setTerrainNormalSampler(fn) {
    _terrainNormalAt = typeof fn === 'function' ? fn : null;
}

export function sampleTerrainHeight(x, z, fallback = 0) {
    if (!_terrainHeightAt) return fallback;
    return _terrainHeightAt(x, z);
}

export function sampleTerrainNormal(x, z) {
    if (_terrainNormalAt) {
        const n = _terrainNormalAt(x, z);
        if (n) return _normal.copy(n).normalize();
    }
    const eps = 0.38;
    const dhdx =
        (sampleTerrainHeight(x + eps, z) - sampleTerrainHeight(x - eps, z)) / (2 * eps);
    const dhdz =
        (sampleTerrainHeight(x, z + eps) - sampleTerrainHeight(x, z - eps)) / (2 * eps);
    return _normal.set(-dhdx, 1, -dhdz).normalize();
}

export function applyTerrainHeight(position, footOffset = 0) {
    position.y = sampleTerrainHeight(position.x, position.z) + footOffset;
}

function quatFromSurfaceHeading(normal, headingYaw, position, targetQuat) {
    const flipped = headingYaw + Math.PI;
    _forward.set(Math.sin(flipped), 0, Math.cos(flipped));
    _forward.addScaledVector(normal, -_forward.dot(normal));
    if (_forward.lengthSq() < 1e-8) _forward.set(0, 0, 1);
    _forward.normalize();

    _lookTarget.copy(position).add(_forward);
    _lookMatrix.lookAt(position, _lookTarget, normal);
    return targetQuat.setFromRotationMatrix(_lookMatrix);
}

/**
 * Y-up characters: stand on slope, local −Z points along heading on the tangent plane.
 */
export function applyTerrainPose(object, yaw = 0, footOffset = 0, delta = null) {
    const x = object.position.x;
    const z = object.position.z;
    const groundY = sampleTerrainHeight(x, z);
    const normal = sampleTerrainNormal(x, z);

    object.position.set(x, groundY, z);
    if (footOffset !== 0) {
        object.position.addScaledVector(normal, footOffset);
    }

    quatFromSurfaceHeading(normal, yaw, object.position, _targetQuat);

    if (delta == null || delta <= 0) {
        object.quaternion.copy(_targetQuat);
    } else {
        const t = 1 - Math.exp(-11 * delta);
        object.quaternion.slerp(_targetQuat, t);
    }
}

/**
 * Horizontal decals (puddles): parent aligns Y to terrain normal; child uses rotation.x = −π/2.
 */
export function applyPuddleAnchor(anchor, surfaceYaw = 0, footOffset = 0) {
    const x = anchor.position.x;
    const z = anchor.position.z;
    const groundY = sampleTerrainHeight(x, z);
    const normal = sampleTerrainNormal(x, z);

    anchor.position.set(x, groundY, z);
    if (footOffset !== 0) {
        anchor.position.addScaledVector(normal, footOffset);
    }

    anchor.quaternion.setFromUnitVectors(_worldUp, normal);

    const mesh = anchor.children[0];
    if (mesh) {
        mesh.rotation.set(-Math.PI / 2, 0, surfaceYaw);
    }
}

export function yawFromObject(object) {
    const forward = new THREE.Vector3(0, 0, -1).applyQuaternion(object.quaternion);
    return Math.atan2(forward.x, forward.z);
}

/** XZ distance from a point to an axis-aligned box (0 when inside on XZ). */
export function xzDistanceToBox(point, box) {
    const cx = THREE.MathUtils.clamp(point.x, box.min.x, box.max.x);
    const cz = THREE.MathUtils.clamp(point.z, box.min.z, box.max.z);
    return Math.hypot(point.x - cx, point.z - cz);
}

export function clampPositionToArena(position, radius = PLAY_RADIUS, margin = 0.55, footOffset = 0) {
    const limit = radius - margin;
    const dist = Math.hypot(position.x, position.z);
    if (dist > limit && dist > 1e-6) {
        const scale = limit / dist;
        position.x *= scale;
        position.z *= scale;
    }
    applyTerrainHeight(position, footOffset);
}

/** Distance from hard arena edge (positive = room left before clamp). */
export function clearanceFromArenaEdge(x, z, radius = PLAY_RADIUS, margin = 0.55) {
    const limit = radius - margin;
    return limit - Math.hypot(x, z);
}

/**
 * Blend movement direction away from the fence so rats don't bee-line into the border.
 */
export function deflectDirFromArenaEdge(x, z, dirX, dirZ, radius = PLAY_RADIUS, softMargin = ARENA_EDGE_MARGIN) {
    const dist = Math.hypot(x, z);
    if (dist < 1e-5) return { x: dirX, z: dirZ };

    const limit = radius - 0.55;
    const edgeStart = limit - softMargin;
    if (dist < edgeStart) return { x: dirX, z: dirZ };

    const outwardX = x / dist;
    const outwardZ = z / dist;
    const inwardX = (YARD_CENTER_X - x);
    const inwardZ = (YARD_CENTER_Z - z);
    const inwardLen = Math.hypot(inwardX, inwardZ) || 1;
    const inX = inwardX / inwardLen;
    const inZ = inwardZ / inwardLen;

    const t = THREE.MathUtils.clamp((dist - edgeStart) / Math.max(softMargin, 0.01), 0, 1);
    const outDot = dirX * outwardX + dirZ * outwardZ;
    let dx = dirX;
    let dz = dirZ;
    if (outDot > 0) {
        dx -= outwardX * outDot * t;
        dz -= outwardZ * outDot * t;
    }
    dx = dx * (1 - t * 0.35) + inX * (t * 0.65);
    dz = dz * (1 - t * 0.35) + inZ * (t * 0.65);
    const len = Math.hypot(dx, dz);
    if (len < 1e-5) return { x: inX, z: inZ };
    return { x: dx / len, z: dz / len };
}

export function nudgePointFromArenaEdge(point, radius = PLAY_RADIUS, softMargin = ARENA_EDGE_MARGIN) {
    const clear = clearanceFromArenaEdge(point.x, point.z, radius);
    if (clear > softMargin * 0.5) return point;
    const t = THREE.MathUtils.clamp(1 - clear / (softMargin * 0.5), 0, 1);
    point.x = THREE.MathUtils.lerp(point.x, YARD_CENTER_X, t * 0.45);
    point.z = THREE.MathUtils.lerp(point.z, YARD_CENTER_Z, t * 0.45);
    clampPositionToArena(point);
    return point;
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
