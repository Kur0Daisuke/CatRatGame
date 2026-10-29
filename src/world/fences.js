import * as THREE from 'three';
import { FENCE_RADIUS } from '../core/worldBounds.js';

export function buildBorderFences(scene, terrain) {
    const group = new THREE.Group();
    group.name = 'border-fences';

    const postMat = new THREE.MeshStandardMaterial({ color: 0x9a7344, roughness: 0.92, metalness: 0 });
    const railMat = new THREE.MeshStandardMaterial({ color: 0xc4a574, roughness: 0.88, metalness: 0 });
    const segments = 72;
    const postGeo = new THREE.BoxGeometry(0.14, 1.05, 0.14);
    const railGeo = new THREE.BoxGeometry(0.08, 0.08, 1);

    const points = [];
    for (let i = 0; i <= segments; i++) {
        const t = (i / segments) * Math.PI * 2;
        const x = Math.cos(t) * FENCE_RADIUS;
        const z = Math.sin(t) * FENCE_RADIUS;
        const y = terrain.getHeightAt(x, z);
        points.push(new THREE.Vector3(x, y, z));

        const post = new THREE.Mesh(postGeo, postMat);
        post.position.set(x, y + 0.52, z);
        post.rotation.y = -t + Math.PI * 0.5;
        post.castShadow = true;
        post.receiveShadow = true;
        group.add(post);
    }

    for (let i = 0; i < segments; i++) {
        const a = points[i];
        const b = points[i + 1];
        const mid = a.clone().add(b).multiplyScalar(0.5);
        const len = a.distanceTo(b);
        const railLow = new THREE.Mesh(railGeo, railMat);
        railLow.scale.set(1, 1, len);
        railLow.position.copy(mid);
        railLow.position.y = a.y + 0.32;
        railLow.lookAt(b.x, railLow.position.y, b.z);
        railLow.castShadow = true;
        group.add(railLow);

        const railHigh = railLow.clone();
        railHigh.position.y = a.y + 0.72;
        group.add(railHigh);
    }

    scene.add(group);
    return group;
}
