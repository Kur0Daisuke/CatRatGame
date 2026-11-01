import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { isInsideYard, randomPointInDisk, YARD_CENTER_X, YARD_CENTER_Z, YARD_SPAWN_RADIUS } from '../core/worldBounds.js';
import { isClearOfPuddles } from './puddles.js';
import { applyTerrainPose } from '../core/collision.js';

const BUSH_PUDDLE_CLEARANCE = 1.85;
const CAT_LANDING_CLEAR_RADIUS = 11;

export function loadBushes(scene, terrain = null, puddles = []) {
    const loader = new GLTFLoader();
    const bushes = [];

    loader.load('/bush.glb', (gltf) => {
        const totalBushes = 520;
        const numberOfClusters = 34;
        const clusterSpreadMax = 7.5;

        const clusters = [];
        for (let c = 0; c < numberOfClusters; c++) {
            const center = randomPointInDisk(YARD_SPAWN_RADIUS - clusterSpreadMax - 1);
            clusters.push({
                x: YARD_CENTER_X + center.x,
                z: YARD_CENTER_Z + center.z,
                spread: 4 + Math.random() * clusterSpreadMax
            });
        }

        for (let i = 0; i < totalBushes; i++) {
            let randomPosX = 0;
            let randomPosZ = 0;
            let placed = false;

            for (let attempt = 0; attempt < 20; attempt++) {
                const cluster = clusters[Math.floor(Math.random() * clusters.length)];
                const angle = Math.random() * Math.PI * 2;
                const distance = Math.random() * cluster.spread;
                randomPosX = cluster.x + Math.cos(angle) * distance;
                randomPosZ = cluster.z + Math.sin(angle) * distance;
                const distFromLanding = Math.hypot(
                    randomPosX - YARD_CENTER_X,
                    randomPosZ - YARD_CENTER_Z
                );
                if (distFromLanding < CAT_LANDING_CLEAR_RADIUS) continue;
                if (isInsideYard(randomPosX, randomPosZ) &&
                    isClearOfPuddles(randomPosX, randomPosZ, BUSH_PUDDLE_CLEARANCE, puddles)) {
                    placed = true;
                    break;
                }
            }
            if (!placed) continue;

            const bushInstance = gltf.scene.clone();
            const bushYaw = Math.random() * Math.PI * 2;
            bushInstance.position.set(randomPosX, 0, randomPosZ);

            const bushSize = 0.25 + Math.random() * 0.35;
            bushInstance.scale.set(bushSize, bushSize, bushSize);
            applyTerrainPose(bushInstance, bushYaw, 0);

            bushInstance.traverse((child) => {
                if (child.isMesh) child.castShadow = true;
            });
            scene.add(bushInstance);
            bushInstance.updateMatrixWorld(true);

            const coverRadius = 0.22 + bushSize * 0.32;

            bushes.push({
                mesh: bushInstance,
                x: randomPosX,
                z: randomPosZ,
                coverRadius
            });
        }
    }, undefined, (err) => console.error('bush.glb load failed', err));

    return bushes;
}
