import * as THREE from 'three';

const _forward = new THREE.Vector3();
const _toTarget = new THREE.Vector3();

/**
 * Forward-facing vision cone on XZ (rat local +Z).
 */
export function isPointInVisionCone(
    ratPosition,
    ratQuaternion,
    targetPoint,
    range = 4,
    halfAngleDeg = 52
) {
    _toTarget.subVectors(targetPoint, ratPosition);
    _toTarget.y = 0;
    const dist = _toTarget.length();
    if (dist > range || dist < 0.05) return false;

    _toTarget.multiplyScalar(1 / dist);
    _forward.set(0, 0, 1).applyQuaternion(ratQuaternion);
    _forward.y = 0;
    if (_forward.lengthSq() < 1e-8) return false;
    _forward.normalize();

    const effectiveHalf = effectiveVisionHalfAngle(dist, halfAngleDeg);
    const minDot = Math.cos(THREE.MathUtils.degToRad(effectiveHalf));
    return _forward.dot(_toTarget) >= minDot;
}

/** Rats notice more around them when the cat is very close. */
export function effectiveVisionHalfAngle(distance, baseHalfAngleDeg) {
    if (distance <= 2.2) return Math.max(baseHalfAngleDeg, 108);
    if (distance <= 3.6) return Math.max(baseHalfAngleDeg, 78);
    return baseHalfAngleDeg;
}

export function createVisionConeHelper(range, halfAngleDeg, material) {
    const angleRad = THREE.MathUtils.degToRad(halfAngleDeg);
    const radius = range * Math.tan(angleRad);
    const geometry = new THREE.ConeGeometry(radius, range, 18, 1, true);
    geometry.rotateX(-Math.PI / 2);
    geometry.translate(0, 0, range * 0.5);
    const mesh = new THREE.Mesh(geometry, material);
    mesh.position.y = 0.15;
    return mesh;
}
