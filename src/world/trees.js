import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import {
    isInsideYard,
    randomPointInDisk,
    YARD_CENTER_X,
    YARD_CENTER_Z,
    YARD_SPAWN_RADIUS
} from '../core/worldBounds.js';
import { isClearOfPuddles } from './puddles.js';
import { applyTerrainPose, sampleTerrainHeight } from '../core/collision.js';

const TREE_MODEL_URL = '/models/tree_low_poly_lowpoly.glb';
const TREE_PUDDLE_CLEARANCE = 2.4;
const CAT_LANDING_CLEAR_RADIUS = 11;
const TARGET_TREE_HEIGHT = 4.6;

/** Playable yard gets this many climbable trees (inclusive range). */
export function rollTreeCount(min = 5, max = 10) {
    return min + Math.floor(Math.random() * (max - min + 1));
}

export function loadTrees(scene, terrain = null, puddles = [], count = rollTreeCount()) {
    const loader = new GLTFLoader();
    const trees = [];

    loader.load(
        TREE_MODEL_URL,
        (gltf) => {
            const template = gltf.scene;
            template.updateMatrixWorld(true);
            const bounds = new THREE.Box3().setFromObject(template);
            const size = bounds.getSize(new THREE.Vector3());
            const baseScale = TARGET_TREE_HEIGHT / Math.max(size.y, 0.01);

            const placed = [];
            const maxAttempts = count * 40;

            for (let attempt = 0; attempt < maxAttempts && placed.length < count; attempt++) {
                const disk = randomPointInDisk(YARD_SPAWN_RADIUS - 6);
                const x = YARD_CENTER_X + disk.x;
                const z = YARD_CENTER_Z + disk.z;

                if (Math.hypot(x - YARD_CENTER_X, z - YARD_CENTER_Z) < CAT_LANDING_CLEAR_RADIUS) continue;
                if (!isInsideYard(x, z)) continue;
                if (!isClearOfPuddles(x, z, TREE_PUDDLE_CLEARANCE, puddles)) continue;

                let tooClose = false;
                for (const other of placed) {
                    if (Math.hypot(x - other.x, z - other.z) < 9.5) {
                        tooClose = true;
                        break;
                    }
                }
                if (tooClose) continue;

                const scaleJitter = 0.88 + Math.random() * 0.28;
                const treeScale = baseScale * scaleJitter;
                const yaw = Math.random() * Math.PI * 2;

                const instance = template.clone(true);
                instance.scale.setScalar(treeScale);
                instance.position.set(x, 0, z);
                applyTerrainPose(instance, yaw, 0);

                instance.traverse((child) => {
                    if (child.isMesh) child.castShadow = true;
                });

                scene.add(instance);
                instance.updateMatrixWorld(true);

                const worldBox = new THREE.Box3().setFromObject(instance);
                const trunkCenter = worldBox.getCenter(new THREE.Vector3());
                const trunkX = trunkCenter.x;
                const trunkZ = trunkCenter.z;
                const groundY = sampleTerrainHeight(trunkX, trunkZ);
                const tipY = worldBox.max.y;
                const perchY = tipY - 0.35;
                const climbHeight = Math.max(1.2, perchY - groundY);

                const trunkRadius = 0.42 + treeScale * 0.14;

                const entry = {
                    mesh: instance,
                    x: trunkX,
                    z: trunkZ,
                    yaw,
                    scale: treeScale,
                    trunkRadius,
                    climbHeight,
                    groundY,
                    tipY: perchY,
                    interactRadius: trunkRadius + 0.95
                };
                placed.push(entry);
                trees.push(entry);
            }
        },
        undefined,
        (err) => console.error('tree model load failed', err)
    );

    return trees;
}

/** Keep the cat outside solid trunks on XZ. */
export function resolveTreeTrunkOverlapXZ(position, radius, trees, out = position) {
    if (!trees?.length) return false;
    let moved = false;
    for (const tree of trees) {
        const dx = out.x - tree.x;
        const dz = out.z - tree.z;
        const distSq = dx * dx + dz * dz;
        const minDist = radius + tree.trunkRadius;
        if (distSq >= minDist * minDist) continue;

        let dist = Math.sqrt(distSq);
        if (dist < 1e-5) {
            dist = 1e-5;
        }
        const overlap = minDist - dist;
        const nx = dx / dist;
        const nz = dz / dist;
        out.x += nx * overlap;
        out.z += nz * overlap;
        moved = true;
    }
    return moved;
}

/** Point on the trunk shell facing `fromX/fromZ`. */
export function getTreeTrunkPoint(tree, fromX, fromZ, surfaceOffset = 0.1) {
    const dx = fromX - tree.x;
    const dz = fromZ - tree.z;
    const dist = Math.hypot(dx, dz) || 1;
    const r = tree.trunkRadius + surfaceOffset;
    return {
        x: tree.x + (dx / dist) * r,
        z: tree.z + (dz / dist) * r
    };
}

export function findNearestClimbableTree(position, trees, maxGapFromTrunk = 0.92) {
    if (!trees?.length) return null;
    let best = null;
    let bestGap = maxGapFromTrunk;
    const px = position.x;
    const pz = position.z;

    for (const tree of trees) {
        const dist = Math.hypot(px - tree.x, pz - tree.z);
        const gap = dist - tree.trunkRadius;
        if (gap > maxGapFromTrunk) continue;
        if (gap < bestGap) {
            bestGap = gap;
            best = tree;
        }
    }
    return best;
}
