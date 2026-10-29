import * as THREE from 'three';
import { FENCE_RADIUS } from '../core/worldBounds.js';

function createGrassMaterial(grassTexture, tint = 0xffffff, repeat = 6) {
    if (!grassTexture) {
        return new THREE.MeshStandardMaterial({ color: tint, roughness: 1, metalness: 0, fog: true });
    }
    const map = grassTexture.clone();
    map.wrapS = THREE.RepeatWrapping;
    map.wrapT = THREE.RepeatWrapping;
    map.repeat.set(repeat, repeat);
    map.needsUpdate = true;
    return new THREE.MeshStandardMaterial({
        map,
        color: tint,
        roughness: 0.94,
        metalness: 0,
        fog: true
    });
}

/** Low rolling hills outside the fence — no sharp mountain cones. */
export function buildWorldBackdrop(scene, terrain) {
    const group = new THREE.Group();
    group.name = 'world-backdrop';

    const grass = terrain.grassTexture;
    const hillMat = createGrassMaterial(grass, 0xd8f5a8, 8);
    const farMat = createGrassMaterial(grass, 0xc8e8b8, 10);

    const hillLayers = [
        { inner: FENCE_RADIUS + 1, outer: FENCE_RADIUS + 14, count: 36, height: 0.55, width: 11, mat: hillMat },
        { inner: FENCE_RADIUS + 8, outer: FENCE_RADIUS + 28, count: 28, height: 0.75, width: 14, mat: farMat },
        { inner: FENCE_RADIUS + 18, outer: FENCE_RADIUS + 42, count: 20, height: 0.9, width: 17, mat: farMat }
    ];

    for (const layer of hillLayers) {
        for (let i = 0; i < layer.count; i++) {
            const angle = (i / layer.count) * Math.PI * 2 + Math.random() * 0.15;
            const radius = THREE.MathUtils.lerp(layer.inner, layer.outer, Math.random());
            const x = Math.cos(angle) * radius;
            const z = Math.sin(angle) * radius;
            const baseY = terrain.getHeightAt(x, z);

            const w = layer.width * (0.85 + Math.random() * 0.35);
            const h = layer.height * (0.8 + Math.random() * 0.4);
            const bump = new THREE.Mesh(new THREE.SphereGeometry(1, 14, 10, 0, Math.PI * 2, 0, Math.PI * 0.42), layer.mat);
            bump.scale.set(w * 0.5, h, w * 0.5);
            bump.position.set(x, baseY + h * 0.15, z);
            bump.receiveShadow = true;
            bump.castShadow = true;
            group.add(bump);
        }
    }

    buildOuterGroundRing(group, terrain, grass);
    scene.add(group);
    return group;
}

/** Grass ramp beyond the fence so the horizon never shows empty void. */
function buildOuterGroundRing(group, terrain, grassTexture) {
    const segments = 72;
    const innerR = FENCE_RADIUS - 0.5;
    const outerR = FENCE_RADIUS + 52;
    const mat = createGrassMaterial(grassTexture, 0xb8dfa0, 12);
    mat.side = THREE.DoubleSide;

    const positions = [];
    const uvs = [];
    const indices = [];

    for (let i = 0; i <= segments; i++) {
        const t = (i / segments) * Math.PI * 2;
        const cos = Math.cos(t);
        const sin = Math.sin(t);

        const xIn = cos * innerR;
        const zIn = sin * innerR;
        const xOut = cos * outerR;
        const zOut = sin * outerR;

        const yIn = terrain.getHeightAt(xIn, zIn) + 0.04;
        const yOut = terrain.getHeightAt(xOut, zOut) * 0.35 + 0.25;

        positions.push(xIn, yIn, zIn, xOut, yOut, zOut);
        uvs.push(i / segments, 0, i / segments, 1);
    }

    for (let i = 0; i < segments; i++) {
        const a = i * 2;
        const b = a + 1;
        const c = a + 2;
        const d = a + 3;
        indices.push(a, c, b, b, c, d);
    }

    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
    geo.setIndex(indices);
    geo.computeVertexNormals();

    const ring = new THREE.Mesh(geo, mat);
    ring.name = 'outer-ground-ring';
    ring.receiveShadow = true;
    group.add(ring);
}
