import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { PLAY_RADIUS } from '../core/worldBounds.js';

const FLOWER_MODEL = '/models/purple_flower_patch.glb';

export function scatterFlowers(scene, terrain, count = 140) {
    const group = new THREE.Group();
    group.name = 'flowers';
    scene.add(group);

    const loader = new GLTFLoader();
    loader.load(
        FLOWER_MODEL,
        (gltf) => {
            const template = gltf.scene;
            template.traverse((child) => {
                if (child.isMesh) {
                    child.castShadow = true;
                    child.receiveShadow = true;
                }
            });

            const playLimit = PLAY_RADIUS - 2.5;
            let placed = 0;
            let attempts = 0;

            while (placed < count && attempts < count * 20) {
                attempts++;
                const x = (Math.random() * 2 - 1) * playLimit;
                const z = (Math.random() * 2 - 1) * playLimit;
                if (Math.hypot(x, z) > playLimit) continue;

                const y = terrain.getHeightAt(x, z);
                if (y < 0.35) continue;

                const slope = Math.abs(terrain.getHeightAt(x + 0.3, z) - terrain.getHeightAt(x - 0.3, z));
                if (slope > 0.42) continue;

                const flower = template.clone(true);
                const scale = 0.35 + Math.random() * 0.45;
                flower.scale.setScalar(scale);
                flower.rotation.y = Math.random() * Math.PI * 2;
                flower.position.set(x, y, z);
                group.add(flower);
                placed++;
            }
        },
        undefined,
        (err) => console.error('Flower model load failed:', err)
    );

    return group;
}
