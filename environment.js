import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

export function loadEnvironment(scene) {
    const loader = new GLTFLoader();
    const bushes = [];

    loader.load("./bush.glb", (gltf) => {
        const totalBushes = 600;
        const numberOfClusters = 40; 

        const clusters = [];
        for (let c = 0; c < numberOfClusters; c++) {
            clusters.push({
                x: (Math.random() * 90) - 45,
                z: (Math.random() * 90) - 45,
                spread: 8 + Math.random() * 10 
            });
        }

        for (let i = 0; i < totalBushes; i++) {
            const bushInstance = gltf.scene.clone();
            
            const cluster = clusters[Math.floor(Math.random() * clusters.length)];
            
            const angle = Math.random() * Math.PI * 2;
            const distance = Math.random() * cluster.spread;
            let randomPosX = cluster.x + Math.cos(angle) * distance;
            let randomPosZ = cluster.z + Math.sin(angle) * distance;

            bushInstance.position.set(randomPosX, 0, randomPosZ);
            
            let bushSize = 0.25 + Math.random() * 0.35; 
            bushInstance.scale.set(bushSize, bushSize, bushSize);
            bushInstance.rotation.y = Math.random() * Math.PI * 2;

            bushInstance.traverse((child) => {
                if (child.isMesh) {
                    child.castShadow = true;
                }
            });
            scene.add(bushInstance);
            bushInstance.updateMatrixWorld(true);

            const box = new THREE.Box3().setFromObject(bushInstance);
            const pad = 0.35;
            box.min.x -= pad;
            box.min.z -= pad;
            box.max.x += pad;
            box.max.z += pad;
            box.min.y = -0.05;
            box.max.y = 2.5;
            
            bushes.push({
                mesh: bushInstance,
                box: box
            });
        }
    }, undefined, (err) => console.log(err));

    return { bushes };
}