import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

export function loadEnvironment(scene) {
    const loader = new GLTFLoader();

    // Load Bushes
    loader.load("./bush.glb", (gltf) => {
        for (let i = 0; i < 300; i++) {
            const bushInstance = gltf.scene.clone();
            let randomPosX = (Math.random() * 100) - 50;
            let randomPosZ = (Math.random() * 100) - 50;
            bushInstance.position.set(randomPosX, 0, randomPosZ);
            
            let bushSize = 0.4;
            bushInstance.scale.set(bushSize, bushSize, bushSize);
            bushInstance.traverse((child) => {
                if (child.isMesh) {
                    child.castShadow = true;
                }
            });
            scene.add(bushInstance);
        }
    }, undefined, (err) => console.log(err));

    
}