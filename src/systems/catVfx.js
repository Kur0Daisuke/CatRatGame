import * as THREE from 'three';
import { sampleTerrainHeight } from '../core/collision.js';
import { createSoftPointsMaterial } from './softParticleTexture.js';

const SMOKE_COUNT = 72;
const LEAF_COLORS = [0x4a7c34, 0x5f9a42, 0x3d5c28, 0x8b7355, 0x6b8f4e];

function makeBurst(scene, count, color, size, life, spawnFn) {
    const positions = new Float32Array(count * 3);
    const velocities = [];
    const colors = new Float32Array(count * 3);
    const c = new THREE.Color(color);

    for (let i = 0; i < count; i++) {
        spawnFn(i, positions, velocities, colors, c);
    }

    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    const material = createSoftPointsMaterial({
        size,
        opacity: 0.55,
        vertexColors: true,
        blending: THREE.NormalBlending
    });
    const points = new THREE.Points(geometry, material);
    scene.add(points);

    return {
        points,
        geometry,
        material,
        velocities,
        life,
        maxLife: life,
        drag: 0.96,
        gravity: 0
    };
}

export class CatVfx {
    constructor(scene) {
        this.scene = scene;
        this.bursts = [];
        this._ground = new THREE.Vector3();
    }

    spawnLandingSmoke(worldPos) {
        const y = sampleTerrainHeight(worldPos.x, worldPos.z) + 0.08;
        this._ground.set(worldPos.x, y, worldPos.z);

        const burst = makeBurst(
            this.scene,
            SMOKE_COUNT,
            0xb8b8b8,
            0.38,
            1.35,
            (i, positions, velocities, colors, base) => {
                const angle = Math.random() * Math.PI * 2;
                const rad = Math.random() * 0.35;
                positions[i * 3] = this._ground.x + Math.cos(angle) * rad;
                positions[i * 3 + 1] = this._ground.y + Math.random() * 0.12;
                positions[i * 3 + 2] = this._ground.z + Math.sin(angle) * rad;

                const spread = 1.8 + Math.random() * 2.2;
                velocities.push(
                    new THREE.Vector3(
                        Math.cos(angle) * spread * (0.4 + Math.random() * 0.6),
                        0.6 + Math.random() * 1.8,
                        Math.sin(angle) * spread * (0.4 + Math.random() * 0.6)
                    )
                );

                const shade = 0.72 + Math.random() * 0.28;
                colors[i * 3] = base.r * shade;
                colors[i * 3 + 1] = base.g * shade;
                colors[i * 3 + 2] = base.b * shade;
            }
        );
        burst.gravity = -0.28;
        burst.drag = 0.94;
        burst.expand = 1.004;
        this.bursts.push(burst);

        const ring = makeBurst(
            this.scene,
            28,
            0xd4d4d4,
            0.26,
            0.85,
            (i, positions, velocities, colors, base) => {
                const angle = (i / 28) * Math.PI * 2 + Math.random() * 0.2;
                positions[i * 3] = this._ground.x + Math.cos(angle) * 0.15;
                positions[i * 3 + 1] = this._ground.y + 0.05;
                positions[i * 3 + 2] = this._ground.z + Math.sin(angle) * 0.15;
                velocities.push(
                    new THREE.Vector3(Math.cos(angle) * 2.8, 0.25 + Math.random() * 0.4, Math.sin(angle) * 2.8)
                );
                colors[i * 3] = base.r;
                colors[i * 3 + 1] = base.g;
                colors[i * 3 + 2] = base.b;
            }
        );
        ring.gravity = -0.2;
        ring.drag = 0.88;
        this.bursts.push(ring);
    }

    /** @param {THREE.Vector3} worldPos @param {number} strength 0–1 @param {boolean} [light] */
    spawnBushLeaves(worldPos, strength = 0.5, light = false) {
        const count = light ? 8 + Math.floor(Math.random() * 6) : 22 + Math.floor(strength * 26);
        const size = light ? 0.14 : 0.2;
        const life = light ? 0.65 : 1.05;

        const burst = makeBurst(this.scene, count, LEAF_COLORS[0], size, life, (i, positions, velocities, colors) => {
            const color = new THREE.Color(LEAF_COLORS[Math.floor(Math.random() * LEAF_COLORS.length)]);
            positions[i * 3] = worldPos.x + (Math.random() - 0.5) * 0.9;
            positions[i * 3 + 1] = worldPos.y + 0.35 + Math.random() * 0.55;
            positions[i * 3 + 2] = worldPos.z + (Math.random() - 0.5) * 0.9;

            velocities.push(
                new THREE.Vector3(
                    (Math.random() - 0.5) * (light ? 1.4 : 2.2),
                    0.35 + Math.random() * (light ? 0.9 : 1.4),
                    (Math.random() - 0.5) * (light ? 1.4 : 2.2)
                )
            );
            colors[i * 3] = color.r;
            colors[i * 3 + 1] = color.g;
            colors[i * 3 + 2] = color.b;
        });
        burst.gravity = -1.6;
        burst.drag = 0.985;
        burst.flutter = true;
        this.bursts.push(burst);
    }

    update(delta) {
        for (let b = this.bursts.length - 1; b >= 0; b--) {
            const burst = this.bursts[b];
            burst.life -= delta;
            const t = 1 - burst.life / burst.maxLife;
            burst.material.opacity = Math.max(0, (1 - t * 1.05) * 0.62);

            const attr = burst.geometry.attributes.position;
            const arr = attr.array;
            for (let i = 0; i < burst.velocities.length; i++) {
                const v = burst.velocities[i];
                v.y += (burst.gravity ?? 0) * delta;
                if (burst.flutter) {
                    v.x += Math.sin(burst.life * 14 + i * 0.7) * delta * 0.45;
                    v.z += Math.cos(burst.life * 11 + i * 0.5) * delta * 0.45;
                }
                v.x *= burst.drag ?? 0.96;
                v.z *= burst.drag ?? 0.96;
                arr[i * 3] += v.x * delta;
                arr[i * 3 + 1] += v.y * delta;
                arr[i * 3 + 2] += v.z * delta;
            }
            if (burst.expand) {
                burst.material.size *= burst.expand;
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
