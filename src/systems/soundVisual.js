import * as THREE from 'three';
import { dbToMeterFill, dbToVisualRadius } from './catSound.js';
import { sampleTerrainHeight } from '../core/collision.js';

export class CatSoundVisual {
    constructor(scene) {
        this.scene = scene;
        this.soundTime = 0;
        this.pulseIndex = 0;
        this.lastPulseDb = 0;

        this.rings = [];
        const ringMat = new THREE.MeshBasicMaterial({
            color: 0xfff0a8,
            transparent: true,
            opacity: 0.45,
            depthWrite: false,
            side: THREE.DoubleSide
        });

        for (let i = 0; i < 5; i++) {
            const mesh = new THREE.Mesh(new THREE.RingGeometry(0.92, 1, 48), ringMat.clone());
            mesh.rotation.x = -Math.PI / 2;
            mesh.visible = false;
            mesh.renderOrder = 2;
            this.scene.add(mesh);
            this.rings.push({ mesh, age: 999, maxAge: 0.85, startScale: 1, baseOpacity: 0.3 });
        }

        this.ambientRing = new THREE.Mesh(
            new THREE.RingGeometry(0.94, 1, 48),
            new THREE.MeshBasicMaterial({
                color: 0xfff0a8,
                transparent: true,
                opacity: 0.18,
                depthWrite: false,
                side: THREE.DoubleSide
            })
        );
        this.ambientRing.rotation.x = -Math.PI / 2;
        this.ambientRing.visible = false;
        this.scene.add(this.ambientRing);

        this.meterEl = document.createElement('div');
        this.meterEl.className = 'noise-meter';
        this.meterEl.innerHTML = `
          <div class="noise-meter-label">Sound</div>
          <div class="noise-meter-track">
            <div class="noise-meter-fill"></div>
          </div>
          <div class="noise-meter-value">0 dB</div>
        `;
        document.body.appendChild(this.meterEl);
        this.meterFill = this.meterEl.querySelector('.noise-meter-fill');
        this.meterValue = this.meterEl.querySelector('.noise-meter-value');
    }

    update(player, delta) {
        if (!player.container) return;

        const db = player.soundDecibel ?? 0;
        const pos = player.container.position;
        const groundY = sampleTerrainHeight(pos.x, pos.z) + 0.06;

        const fill = dbToMeterFill(db);
        this.meterFill.style.width = `${(fill * 100).toFixed(1)}%`;
        this.meterFill.style.background =
            fill > 0.72
                ? 'linear-gradient(90deg, #ff9a62, #ff4d4d)'
                : fill > 0.35
                  ? 'linear-gradient(90deg, #ffe58a, #f0b429)'
                  : 'linear-gradient(90deg, #a078ca, #d4a6ed)';
        this.meterValue.textContent = `${Math.round(db)} dB`;
        this.meterEl.classList.toggle('noise-meter--loud', fill > 0.65);

        const targetRadius = dbToVisualRadius(db);
        const dbJump = db - this.lastPulseDb;
        if (db > 38 && (dbJump > 8 || (player.isRunning && Math.random() < 0.08))) {
            this.spawnPulse(pos, groundY, targetRadius, db);
        }
        this.lastPulseDb = db;

        for (const ring of this.rings) {
            if (ring.age >= ring.maxAge) {
                ring.mesh.visible = false;
                continue;
            }
            ring.age += delta;
            const t = ring.age / ring.maxAge;
            const scale = ring.startScale * (1 + t * 2.2);
            ring.mesh.scale.set(scale, scale, 1);
            ring.mesh.material.opacity = (1 - t) * ring.baseOpacity;
            ring.mesh.position.set(pos.x, groundY, pos.z);
        }

        if (db > 18 && player.isMoving) {
            const scale = targetRadius * 0.4;
            this.ambientRing.visible = true;
            this.ambientRing.position.set(pos.x, groundY, pos.z);
            this.ambientRing.scale.set(scale, scale, 1);
            this.ambientRing.material.opacity = player.isRunning ? 0.28 : 0.16;
            this.ambientRing.material.color.setHex(player.isRunning ? 0xff8a65 : 0xfff0a8);
        } else {
            this.ambientRing.visible = false;
        }
    }

    spawnPulse(position, y, radius, db) {
        const ring = this.rings[this.pulseIndex];
        this.pulseIndex = (this.pulseIndex + 1) % this.rings.length;

        ring.age = 0;
        ring.maxAge = db > 80 ? 0.7 : 0.95;
        ring.startScale = Math.max(radius * 0.25, 0.4);
        ring.baseOpacity = db > 80 ? 0.5 : 0.32;
        ring.mesh.visible = true;
        ring.mesh.material.color.setHex(db > 80 ? 0xff6b4a : 0xffe082);
        ring.mesh.position.set(position.x, y, position.z);
        ring.mesh.scale.set(ring.startScale, ring.startScale, 1);
        ring.mesh.material.opacity = ring.baseOpacity;
    }
}
