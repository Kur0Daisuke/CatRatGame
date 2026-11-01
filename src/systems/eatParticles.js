import * as THREE from 'three';
import { createSoftPointsMaterial } from './softParticleTexture.js';

const POOL_SIZE = 56;

export class EatParticleBurst {
    constructor(scene) {
        this.scene = scene;
        this.bursts = [];
        this._world = new THREE.Vector3();
    }

    spawn(worldPos) {
        const count = POOL_SIZE;
        const positions = new Float32Array(count * 3);
        const velocities = [];

        for (let i = 0; i < count; i++) {
            positions[i * 3] = worldPos.x + (Math.random() - 0.5) * 0.25;
            positions[i * 3 + 1] = worldPos.y + 0.15 + Math.random() * 0.35;
            positions[i * 3 + 2] = worldPos.z + (Math.random() - 0.5) * 0.25;

            const v = new THREE.Vector3(
                (Math.random() - 0.5) * 1.8,
                0.55 + Math.random() * 1.6,
                (Math.random() - 0.5) * 1.8
            );
            v.multiplyScalar(0.85 + Math.random() * 0.35);
            velocities.push(v);
        }

        const geometry = new THREE.BufferGeometry();
        geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
        const tint = 0.78 + Math.random() * 0.22;
        const material = createSoftPointsMaterial({
            color: new THREE.Color(0.9 * tint, 0.08 * tint, 0.1 * tint),
            size: 0.28 + Math.random() * 0.08,
            opacity: 0.72,
            blending: THREE.NormalBlending
        });
        const points = new THREE.Points(geometry, material);
        this.scene.add(points);

        this.bursts.push({
            points,
            geometry,
            material,
            velocities,
            life: 0.85,
            maxLife: 0.85
        });
    }

    spawnFromRat(rat) {
        if (!rat?.ratContainer) return;
        rat.ratContainer.getWorldPosition(this._world);
        this.spawn(this._world);
    }

    update(delta) {
        for (let b = this.bursts.length - 1; b >= 0; b--) {
            const burst = this.bursts[b];
            burst.life -= delta;
            const t = 1 - burst.life / burst.maxLife;
            burst.material.opacity = Math.max(0, 1 - t * 1.15);

            const attr = burst.geometry.attributes.position;
            const arr = attr.array;
            for (let i = 0; i < burst.velocities.length; i++) {
                const v = burst.velocities[i];
                v.y -= delta * 3.4;
                v.x *= 0.985;
                v.z *= 0.985;
                arr[i * 3] += v.x * delta;
                arr[i * 3 + 1] += v.y * delta;
                arr[i * 3 + 2] += v.z * delta;
            }
            burst.material.size *= 1 + delta * 0.35;
            attr.needsUpdate = true;

            if (burst.life <= 0) {
                this.scene.remove(burst.points);
                burst.geometry.dispose();
                burst.material.dispose();
                this.bursts.splice(b, 1);
            }
        }
    }
}
