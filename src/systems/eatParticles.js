import * as THREE from 'three';

const POOL_SIZE = 48;

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
                (Math.random() - 0.5) * 2.4,
                0.8 + Math.random() * 2.2,
                (Math.random() - 0.5) * 2.4
            );
            velocities.push(v);
        }

        const geometry = new THREE.BufferGeometry();
        geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
        const material = new THREE.PointsMaterial({
            color: 0xcc1111,
            size: 0.14,
            transparent: true,
            opacity: 0.95,
            depthWrite: false,
            sizeAttenuation: true
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
                v.y -= delta * 4.2;
                arr[i * 3] += v.x * delta;
                arr[i * 3 + 1] += v.y * delta;
                arr[i * 3 + 2] += v.z * delta;
            }
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
