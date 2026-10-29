import * as THREE from 'three';

const POUNCE_RANGE = 2.35;
const LEAP_DURATION = 0.42;
const PIN_DURATION = 0.38;
const CAMERA_BLEND = 7.5;

/** Dead by Daylight–style check tuning per rat type. */
const QTE_BY_KIND = {
    dumb: { speed: 0.78, zoneWidth: 0.19, duration: 4.4, speedJitter: 0.08 },
    scout: { speed: 1.42, zoneWidth: 0.11, duration: 3.5, speedJitter: 0.18 },
    pouncer: { speed: 1.05, zoneWidth: 0.14, duration: 3.8, speedJitter: 0.35 }
};

export class PounceSystem {
    constructor({ camera, renderer, player, rats }) {
        this.camera = camera;
        this.renderer = renderer;
        this.player = player;
        this.rats = rats;

        this.state = 'idle';
        this.targetRat = null;
        this.promptRat = null;
        this.elapsed = 0;
        this.score = 0;
        this.resolved = false;

        this.qteMarker = 0;
        this.qteDirection = 1;
        this.qteZoneStart = 0.35;
        this.qteConfig = null;
        this.qteSpeed = 1;

        this._world = new THREE.Vector3();
        this._screen = new THREE.Vector3();
        this._camTarget = new THREE.Vector3();
        this._camLook = new THREE.Vector3();
        this._side = new THREE.Vector3();
        this._behind = new THREE.Vector3();

        this.buildUI();
        this.bindInput();
    }

    isActive() {
        return this.state !== 'idle';
    }

    controlsCamera() {
        return this.state === 'leaping' || this.state === 'pinning' || this.state === 'qte' || this.state === 'consuming';
    }

    buildUI() {
        this.scoreEl = document.createElement('div');
        this.scoreEl.className = 'pounce-score';
        this.scoreEl.textContent = 'Caught: 0';
        document.body.appendChild(this.scoreEl);

        this.promptEl = document.createElement('div');
        this.promptEl.className = 'pounce-prompt';
        this.promptEl.innerHTML = '<span class="pounce-prompt-key">E</span>';
        this.promptEl.hidden = true;
        document.body.appendChild(this.promptEl);

        this.overlayEl = document.createElement('div');
        this.overlayEl.className = 'pounce-qte-overlay';
        this.overlayEl.hidden = true;
        this.overlayEl.innerHTML = `
            <div class="pounce-qte">
                <div class="pounce-qte-label">Press <kbd class="pounce-qte-key">SPACE</kbd> in the zone</div>
                <div class="pounce-qte-track">
                    <div class="pounce-qte-zone"></div>
                    <div class="pounce-qte-marker"></div>
                </div>
                <div class="pounce-qte-timer"><div class="pounce-qte-timer-fill"></div></div>
            </div>
        `;
        document.body.appendChild(this.overlayEl);
        this.zoneEl = this.overlayEl.querySelector('.pounce-qte-zone');
        this.markerEl = this.overlayEl.querySelector('.pounce-qte-marker');
        this.timerFillEl = this.overlayEl.querySelector('.pounce-qte-timer-fill');
        this.qteLabelEl = this.overlayEl.querySelector('.pounce-qte-label');

        this.toastEl = document.createElement('div');
        this.toastEl.className = 'pounce-toast';
        this.toastEl.hidden = true;
        document.body.appendChild(this.toastEl);
    }

    bindInput() {
        window.addEventListener('keydown', (event) => {
            if (event.repeat) return;

            if (event.code === 'Space' && this.state === 'qte' && !this.resolved) {
                event.preventDefault();
                this.resolveQte(this.isMarkerInZone());
                return;
            }

            if (event.code !== 'KeyE') return;
            if (this.isActive()) return;
            this.tryStart();
        });

        this.overlayEl.addEventListener('contextmenu', (event) => event.preventDefault());
    }

    buildQteConfig(rat) {
        const base = QTE_BY_KIND[rat?.kind] || QTE_BY_KIND.dumb;
        const speedMul = 1 + (Math.random() * 2 - 1) * base.speedJitter;
        return {
            speed: base.speed * speedMul,
            zoneWidth: base.zoneWidth,
            duration: base.duration
        };
    }

    findPounceableRat() {
        const playerPos = this.player.container.position;
        let closest = null;
        let closestDist = POUNCE_RANGE;
        for (const rat of this.rats) {
            if (!rat.canBePounced()) continue;
            const dist = playerPos.distanceTo(rat.ratContainer.position);
            if (dist <= closestDist) {
                closest = rat;
                closestDist = dist;
            }
        }
        return closest;
    }

    tryStart() {
        if (this.player.isStunned || this.player.isRecovering || this.player.isLocked) return;
        const rat = this.findPounceableRat();
        if (!rat) return;

        this.targetRat = rat;
        this.state = 'leaping';
        this.elapsed = 0;
        this.resolved = false;
        this.hidePrompt();
        rat.beginPin();
        rat.markAlerted?.(5);
        this.player.beginLeap(this.landingSpot(rat), LEAP_DURATION);
    }

    landingSpot(rat) {
        const from = this.player.container.position;
        const to = rat.ratContainer.position;
        const dx = to.x - from.x;
        const dz = to.z - from.z;
        const len = Math.hypot(dx, dz) || 1;
        return new THREE.Vector3(
            to.x - (dx / len) * 0.55,
            0,
            to.z - (dz / len) * 0.55
        );
    }

    update(delta) {
        this.updatePrompt();

        if (this.state === 'idle') return;

        this.elapsed += delta;
        const rat = this.targetRat;

        if (!rat || (rat.isConsumed && this.state !== 'consuming')) {
            this.abortToIdle();
            return;
        }

        if (this.controlsCamera() && rat.ratContainer) {
            this.updatePounceCamera(delta, rat);
        }

        if (this.state === 'leaping') {
            if (!this.player.leapActive) {
                this.state = 'pinning';
                this.elapsed = 0;
                rat.playFlip();
            }
            return;
        }

        if (this.state === 'pinning') {
            if (this.elapsed >= PIN_DURATION) {
                this.beginQte();
            }
            return;
        }

        if (this.state === 'qte') {
            this.updateQte(delta);
            if (this.elapsed >= this.qteConfig.duration && !this.resolved) {
                this.resolveQte(false);
            }
            return;
        }

        if (this.state === 'consuming') {
            if (!rat.updateConsume(delta)) return;
            this.finishConsume(rat);
            this.showToast('Caught! +1', 'success');
            this.returnToIdle(true);
        }
    }

    beginQte() {
        const rat = this.targetRat;
        this.state = 'qte';
        this.elapsed = 0;
        this.resolved = false;
        this.qteConfig = this.buildQteConfig(rat);
        this.qteSpeed = this.qteConfig.speed;
        this.qteMarker = Math.random() < 0.5 ? 0.08 : 0.92;
        this.qteDirection = this.qteMarker < 0.5 ? 1 : -1;

        const margin = 0.08;
        const maxStart = 1 - this.qteConfig.zoneWidth - margin;
        this.qteZoneStart = margin + Math.random() * Math.max(maxStart - margin, 0.05);

        this.overlayEl.hidden = false;
        if (this.qteLabelEl) {
            const kindLabel = rat?.kind ? ` (${rat.kind})` : '';
            this.qteLabelEl.innerHTML =
                `Press <kbd class="pounce-qte-key">SPACE</kbd> in the zone${kindLabel}`;
        }
        if (document.pointerLockElement) {
            document.exitPointerLock();
        }
        this.applyQteVisuals();
    }

    applyQteVisuals() {
        const cfg = this.qteConfig;
        if (!cfg) return;
        this.zoneEl.style.width = `${cfg.zoneWidth * 100}%`;
        this.zoneEl.style.left = `${this.qteZoneStart * 100}%`;
        this.markerEl.style.left = `${this.qteMarker * 100}%`;
        const remaining = 1 - THREE.MathUtils.clamp(this.elapsed / cfg.duration, 0, 1);
        this.timerFillEl.style.transform = `scaleX(${remaining})`;
    }

    updateQte(delta) {
        const cfg = this.qteConfig;
        if (!cfg) return;

        const wobble = 1 + Math.sin(this.elapsed * 7.5) * 0.04;
        this.qteMarker += this.qteDirection * cfg.speed * wobble * delta;
        if (this.qteMarker >= 1) {
            this.qteMarker = 1;
            this.qteDirection = -1;
        } else if (this.qteMarker <= 0) {
            this.qteMarker = 0;
            this.qteDirection = 1;
        }

        this.applyQteVisuals();
    }

    isMarkerInZone() {
        const cfg = this.qteConfig;
        if (!cfg) return false;
        const pad = 0.012;
        return (
            this.qteMarker >= this.qteZoneStart - pad &&
            this.qteMarker <= this.qteZoneStart + cfg.zoneWidth + pad
        );
    }

    resolveQte(success) {
        if (this.resolved || this.state !== 'qte') return;
        this.resolved = true;
        this.overlayEl.hidden = true;

        const rat = this.targetRat;
        if (success && rat) {
            this.score += 1;
            this.scoreEl.textContent = `Caught: ${this.score}`;
            this.scoreEl.classList.remove('pulse');
            void this.scoreEl.offsetWidth;
            this.scoreEl.classList.add('pulse');
            this.state = 'consuming';
            this.elapsed = 0;
            rat.beginConsume();
            this.relockPointer();
            return;
        }

        if (rat) {
            rat.releaseAndFlee(this.player.container.position);
        }
        this.showToast('Missed the skill check!', 'fail');
        this.returnToIdle(true);
    }

    finishConsume(rat) {
        const index = this.rats.indexOf(rat);
        if (index >= 0) this.rats.splice(index, 1);
        rat.dispose();
    }

    updatePounceCamera(delta, rat) {
        const ratPos = rat.ratContainer.position;
        const catPos = this.player.container.position;
        this._behind.set(ratPos.x - catPos.x, 0, ratPos.z - catPos.z);
        if (this._behind.lengthSq() < 1e-6) {
            this._behind.set(0, 0, 1);
        } else {
            this._behind.normalize();
        }
        this._side.set(-this._behind.z, 0, this._behind.x);

        this._camTarget.copy(ratPos)
            .addScaledVector(this._behind, 1.15)
            .addScaledVector(this._side, 0.28);
        this._camTarget.y = ratPos.y + 0.62;
        this._camLook.set(ratPos.x, ratPos.y + 0.18, ratPos.z);

        const follow = 1 - Math.exp(-CAMERA_BLEND * delta);
        this.camera.position.lerp(this._camTarget, follow);
        this.camera.lookAt(this._camLook);
    }

    updatePrompt() {
        if (this.isActive() || this.player.isStunned || this.player.isRecovering) {
            this.hidePrompt();
            return;
        }

        const rat = this.findPounceableRat();
        this.promptRat = rat;
        if (!rat) {
            this.hidePrompt();
            return;
        }

        this._world.copy(rat.ratContainer.position);
        this._world.y += 0.95;
        this._world.applyMatrix4(this.camera.matrixWorldInverse);
        if (this._world.z > -0.15) {
            this.hidePrompt();
            return;
        }

        this._screen.copy(rat.ratContainer.position);
        this._screen.y += 0.95;
        this._screen.project(this.camera);
        const x = (this._screen.x * 0.5 + 0.5) * window.innerWidth;
        const y = (-this._screen.y * 0.5 + 0.5) * window.innerHeight;
        this.promptEl.hidden = false;
        this.promptEl.style.transform = `translate(${x}px, ${y}px) translate(-50%, -120%)`;
    }

    hidePrompt() {
        this.promptEl.hidden = true;
        this.promptRat = null;
    }

    showToast(text, kind) {
        this.toastEl.textContent = text;
        this.toastEl.className = `pounce-toast ${kind}`;
        this.toastEl.hidden = false;
        clearTimeout(this.toastTimer);
        this.toastTimer = setTimeout(() => {
            this.toastEl.hidden = true;
        }, 1100);
    }

    relockPointer() {
        const canvas = this.renderer.domElement;
        if (document.pointerLockElement === canvas) return;
        canvas.requestPointerLock?.();
    }

    returnToIdle(relock) {
        this.state = 'idle';
        this.targetRat = null;
        this.elapsed = 0;
        this.resolved = false;
        this.qteConfig = null;
        this.overlayEl.hidden = true;
        this.player.endPounce();
        if (relock) this.relockPointer();
    }

    abortToIdle() {
        this.overlayEl.hidden = true;
        this.returnToIdle(true);
    }
}
