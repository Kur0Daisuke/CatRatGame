import * as THREE from 'three';
import { findPuddleAtPosition, pushPuddleRipple, updatePuddleWaveTime } from '../world/puddles.js';

const RING_POOL = 28;

export class PuddleWaveSystem {
    constructor(scene, puddles) {
        this.scene = scene;
        this.puddles = puddles;
        this.time = 0;
        this.rings = [];
        this.tracked = new Map();

        const ringMat = new THREE.MeshBasicMaterial({
            color: 0xa8dcff,
            transparent: true,
            opacity: 0.45,
            depthWrite: false,
            side: THREE.DoubleSide
        });

        for (let i = 0; i < RING_POOL; i++) {
            const mesh = new THREE.Mesh(new THREE.RingGeometry(0.08, 0.14, 32), ringMat.clone());
            mesh.rotation.x = -Math.PI / 2;
            mesh.visible = false;
            mesh.renderOrder = 3;
            scene.add(mesh);
            this.rings.push({ mesh, age: 999, maxAge: 1.1, startScale: 1, strength: 1 });
        }
    }

    trackEntity(id, x, z, moving, strength = 0.75) {
        const prev = this.tracked.get(id);
        const puddle = findPuddleAtPosition(this.puddles, x, z, 0.15);
        const inWater = !!puddle;
        let lastRipple = prev?.lastRipple ?? 0;

        if (puddle && moving) {
            const prevInSame = prev?.puddle === puddle;
            const movedEnough =
                !prev ||
                Math.hypot(x - prev.x, z - prev.z) > 0.12 ||
                !prevInSame;

            if (!prev?.inWater && inWater) {
                this.spawnRipple(puddle, x, z, strength * 1.15);
                lastRipple = this.time;
            } else if (movedEnough && this.time - lastRipple > 0.28) {
                this.spawnRipple(puddle, x, z, strength);
                lastRipple = this.time;
            }
        }

        this.tracked.set(id, {
            x,
            z,
            inWater,
            puddle,
            lastRipple
        });
    }

    spawnRipple(puddle, worldX, worldZ, strength) {
        pushPuddleRipple(puddle, worldX, worldZ, strength, this.time);

        const ring = this.rings.find((r) => r.age >= r.maxAge);
        if (!ring) return;

        const y = puddle.mesh.position.y + 0.025;
        ring.age = 0;
        ring.maxAge = 0.85 + strength * 0.35;
        ring.startScale = 0.35 + strength * 0.2;
        ring.strength = strength;
        ring.mesh.visible = true;
        ring.mesh.position.set(worldX, y, worldZ);
        ring.mesh.scale.set(ring.startScale, ring.startScale, 1);
        ring.mesh.material.opacity = 0.22 + strength * 0.18;
    }

    update(delta, player, rats = []) {
        this.time += delta;
        updatePuddleWaveTime(this.puddles, this.time);

        if (player?.container) {
            const pos = player.container.position;
            const moving = player.isMoving || player.leapActive;
            const strength = player.isRunning ? 1.05 : player.isDrinking ? 0.55 : 0.8;
            this.trackEntity('player', pos.x, pos.z, moving, strength);
        }

        rats.forEach((rat, index) => {
            if (!rat.ratContainer || rat.isConsumed) return;
            const pos = rat.ratContainer.position;
            const prev = this.tracked.get(`rat-${index}`);
            const moving =
                !prev ||
                Math.hypot(pos.x - prev.x, pos.z - prev.z) > delta * 0.35;
            this.trackEntity(`rat-${index}`, pos.x, pos.z, moving, 0.55);
        });

        for (const ring of this.rings) {
            if (ring.age >= ring.maxAge) {
                ring.mesh.visible = false;
                continue;
            }
            ring.age += delta;
            const t = ring.age / ring.maxAge;
            const scale = ring.startScale * (1 + t * 3.2);
            ring.mesh.scale.set(scale, scale, 1);
            ring.mesh.material.opacity = (1 - t) * (0.2 + ring.strength * 0.22);
        }
    }
}
