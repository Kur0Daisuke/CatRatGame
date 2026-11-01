import * as THREE from 'three';
import { sampleTerrainHeight } from '../core/collision.js';
import { triggerKillPanic } from '../game/ratKillPanic.js';
import { interruptRatConversation } from '../game/ratConversation.js';
import { onCatAttacksRat } from '../game/ratCouncilResponse.js';

const POUNCE_RANGE = 2.85;
const POUNCE_ARM_DELAY = 0.78;
const POUNCE_AIM_HALF_ANGLE_DEG = 48;
const POUNCE_AIM_MIN_DOT = Math.cos((POUNCE_AIM_HALF_ANGLE_DEG * Math.PI) / 180);
const LEAP_DURATION = 0.42;
const PIN_DURATION = 0.38;
const CAMERA_BLEND = 7.5;
/** At full bush cover, E pounce charge fills this much faster than in the open. */
const BUSH_POUNCE_CHARGE_MAX_MUL = 1.9;

/** One pass of the marker per round. Round count is fixed by rat type. */
const QTE_BY_KIND = {
    dumb: { speed: 0.72, zoneWidth: 0.2, rounds: 1, speedJitter: 0.06 },
    scout: { speed: 1.05, zoneWidth: 0.14, rounds: 2, speedJitter: 0.08 },
    pouncer: { speed: 0.9, zoneWidth: 0.15, rounds: 3, speedJitter: 0.08 }
};

export class PounceSystem {
    constructor({ camera, renderer, player, rats, eatVfx = null }) {
        this.camera = camera;
        this.renderer = renderer;
        this.player = player;
        this.rats = rats;
        this.eatVfx = eatVfx;

        this.state = 'idle';
        this.targetRat = null;
        this.promptRat = null;
        this.elapsed = 0;
        this.score = 0;
        this.resolved = false;

        this.qteMarker = 0;
        this.qteZoneStart = 0.35;
        this.qteConfig = null;
        this.qteSpeed = 1;
        this.qteRound = 1;
        this.qteRoundsTotal = 1;

        this._world = new THREE.Vector3();
        this._screen = new THREE.Vector3();
        this._camTarget = new THREE.Vector3();
        this._camLook = new THREE.Vector3();
        this._side = new THREE.Vector3();
        this._behind = new THREE.Vector3();
        this._aimDir = new THREE.Vector3();
        this._toRat = new THREE.Vector3();
        this.aimYaw = 0;
        this.promptCharge = 0;
        this.promptTarget = null;
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
            if (this.player.controlsBlocked) return;
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
            rounds: base.rounds
        };
    }

    /** Cat must be looking toward the rat (camera yaw on XZ). */
    isRatInAim(rat) {
        const playerPos = this.player.container.position;
        const ratPos = rat.ratContainer.position;
        this._toRat.set(ratPos.x - playerPos.x, 0, ratPos.z - playerPos.z);
        const dist = this._toRat.length();
        if (dist < 0.05 || dist > POUNCE_RANGE) return false;
        this._toRat.multiplyScalar(1 / dist);
        this._aimDir.set(-Math.sin(this.aimYaw), 0, -Math.cos(this.aimYaw));
        return this._toRat.dot(this._aimDir) >= POUNCE_AIM_MIN_DOT;
    }

    findPounceableRat() {
        const playerPos = this.player.container.position;
        let closest = null;
        let bestDot = POUNCE_AIM_MIN_DOT - 0.001;
        let closestDist = POUNCE_RANGE;
        for (const rat of this.rats) {
            if (!rat.canBePounced()) continue;
            const dist = playerPos.distanceTo(rat.ratContainer.position);
            if (dist > POUNCE_RANGE) continue;
            this._toRat.set(
                rat.ratContainer.position.x - playerPos.x,
                0,
                rat.ratContainer.position.z - playerPos.z
            );
            if (this._toRat.lengthSq() < 1e-4) {
                if (dist < closestDist) {
                    closest = rat;
                    closestDist = dist;
                }
                continue;
            }
            this._toRat.normalize();
            this._aimDir.set(-Math.sin(this.aimYaw), 0, -Math.cos(this.aimYaw));
            const dot = this._toRat.dot(this._aimDir);
            if (dot < POUNCE_AIM_MIN_DOT) continue;
            if (dot > bestDot || (dot === bestDot && dist < closestDist)) {
                closest = rat;
                bestDot = dot;
                closestDist = dist;
            }
        }
        return closest;
    }

    tryStart() {
        if (this.player.isStunned || this.player.isRecovering || this.player.isLocked) return;
        const rat = this.findPounceableRat();
        if (!rat || !this.isRatInAim(rat)) return;
        if (this.promptCharge < POUNCE_ARM_DELAY) return;

        this.targetRat = rat;
        this.state = 'leaping';
        this.elapsed = 0;
        this.resolved = false;
        this.hidePrompt();
        interruptRatConversation(rat);
        onCatAttacksRat(rat, this.player.container.position, this.rats);
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
            sampleTerrainHeight(to.x - (dx / len) * 0.55, to.z - (dz / len) * 0.55),
            to.z - (dz / len) * 0.55
        );
    }

    update(delta, aimYaw = 0) {
        this.aimYaw = aimYaw;
        this.updatePrompt(delta);

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
            rat.stayPinned?.();
            if (!this.player.leapActive) {
                this.state = 'pinning';
                this.elapsed = 0;
                rat.playFlip();
            }
            return;
        }

        if (this.state === 'pinning') {
            rat.stayPinned?.();
            if (this.elapsed >= PIN_DURATION) {
                this.beginQte();
            }
            return;
        }

        if (this.state === 'qte') {
            rat.stayPinned?.();
            this.updateQte(delta);
            return;
        }

        if (this.state === 'consuming') {
            rat.stayPinned?.();
            if (!rat.updateConsume(delta)) return;
            this.finishConsume(rat);
            this.showToast('Caught! +1', 'success');
            this.returnToIdle(true);
        }
    }

    beginQte() {
        const rat = this.targetRat;
        this.state = 'qte';
        this.resolved = false;
        this.qteConfig = this.buildQteConfig(rat);
        this.qteSpeed = this.qteConfig.speed;
        this.qteRoundsTotal = this.qteConfig.rounds;
        this.qteRound = 1;
        rat?.stayPinned?.();

        this.overlayEl.hidden = false;
        if (document.pointerLockElement) {
            document.exitPointerLock();
        }
        this.startQteRound();
    }

    startQteRound() {
        const cfg = this.qteConfig;
        if (!cfg) return;
        this.elapsed = 0;
        this.resolved = false;
        this.qteMarker = 0;
        const margin = 0.34;
        const maxStart = 1 - cfg.zoneWidth - 0.08;
        this.qteZoneStart = margin + Math.random() * Math.max(maxStart - margin, 0.05);
        if (this.qteLabelEl) {
            const kindLabel = this.targetRat?.kind ? ` · ${this.targetRat.kind}` : '';
            this.qteLabelEl.innerHTML =
                `Round ${this.qteRound}/${this.qteRoundsTotal}${kindLabel} — press <kbd class="pounce-qte-key">SPACE</kbd> in the zone`;
        }
        this.applyQteVisuals();
    }

    applyQteVisuals() {
        const cfg = this.qteConfig;
        if (!cfg) return;
        this.zoneEl.style.width = `${cfg.zoneWidth * 100}%`;
        this.zoneEl.style.left = `${this.qteZoneStart * 100}%`;
        this.markerEl.style.left = `${this.qteMarker * 100}%`;
        const zoneEnd = this.qteZoneStart + cfg.zoneWidth;
        const remaining = 1 - THREE.MathUtils.clamp(this.qteMarker / Math.max(zoneEnd, 0.01), 0, 1);
        this.timerFillEl.style.transform = `scaleX(${remaining})`;
    }

    updateQte(delta) {
        const cfg = this.qteConfig;
        if (!cfg || this.resolved) return;

        this.qteMarker += cfg.speed * delta;
        const zoneEnd = this.qteZoneStart + cfg.zoneWidth + 0.012;
        if (this.qteMarker > zoneEnd) {
            this.resolveQte(false);
            return;
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

        const rat = this.targetRat;
        if (success && rat && this.qteRound < this.qteRoundsTotal) {
            this.qteRound += 1;
            this.startQteRound();
            return;
        }

        this.resolved = true;
        this.overlayEl.hidden = true;

        if (success && rat) {
            this.score += 1;
            this.scoreEl.textContent = `Caught: ${this.score}`;
            this.scoreEl.classList.remove('pulse');
            void this.scoreEl.offsetWidth;
            this.scoreEl.classList.add('pulse');
            triggerKillPanic(rat, this.player.container.position, this.rats);
            this.eatVfx?.spawnFromRat(rat);
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
        this.eatVfx?.spawnFromRat(rat);
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

        const groundY = sampleTerrainHeight(ratPos.x, ratPos.z);
        const focusY = Math.max(ratPos.y, groundY);
        this._camTarget.copy(ratPos)
            .addScaledVector(this._behind, 1.15)
            .addScaledVector(this._side, 0.28);
        this._camTarget.y = focusY + 0.72;
        this._camLook.set(ratPos.x, focusY + 0.22, ratPos.z);

        const follow = 1 - Math.exp(-CAMERA_BLEND * delta);
        this.camera.position.lerp(this._camTarget, follow);
        this.camera.lookAt(this._camLook);
    }

    updatePrompt(delta = 0.016) {
        this.player.pounceAimRat = null;
        this.player.pounceAimCharge = 0;

        if (this.isActive() || this.player.isStunned || this.player.isRecovering) {
            this.hidePrompt();
            this.promptCharge = 0;
            this.promptTarget = null;
            return;
        }

        const rat = this.findPounceableRat();
        const inAim = rat && this.isRatInAim(rat);
        if (!inAim) {
            this.promptCharge = 0;
            this.promptTarget = null;
            this.hidePrompt();
            return;
        }

        if (this.promptTarget !== rat) {
            this.promptTarget = rat;
            this.promptCharge = 0;
        }
        const sneak = THREE.MathUtils.clamp(this.player.bushBlend ?? 0, 0, 1);
        const chargeMul = 1 + sneak * (BUSH_POUNCE_CHARGE_MAX_MUL - 1);
        this.promptCharge = Math.min(POUNCE_ARM_DELAY, this.promptCharge + delta * chargeMul);
        this.player.pounceAimRat = rat;
        this.player.pounceAimCharge = this.promptCharge;
        const ready = this.promptCharge >= POUNCE_ARM_DELAY;
        const sneaking = sneak > 0.28;

        this.promptRat = rat;
        this._screen.copy(rat.ratContainer.position);
        this._screen.y += 0.95;
        this._screen.project(this.camera);
        if (this._screen.z > 1) {
            this.hidePrompt();
            return;
        }
        const x = (this._screen.x * 0.5 + 0.5) * window.innerWidth;
        const y = (-this._screen.y * 0.5 + 0.5) * window.innerHeight;
        this.promptEl.hidden = false;
        this.promptEl.classList.toggle('pounce-prompt-sneak', sneaking);
        const pct = Math.round((this.promptCharge / POUNCE_ARM_DELAY) * 100);
        if (ready) {
            this.promptEl.innerHTML = '<span class="pounce-prompt-key">E</span>';
            this.promptEl.classList.remove('pounce-prompt-charging');
        } else {
            this.promptEl.innerHTML = `<span class="pounce-prompt-key pounce-prompt-wait">${pct}%</span>`;
            this.promptEl.classList.add('pounce-prompt-charging');
        }
        this.promptEl.style.transform = `translate(${x}px, ${y}px) translate(-50%, -120%)`;
    }

    hidePrompt() {
        this.promptEl.hidden = true;
        this.promptRat = null;
        this.promptEl.classList.remove('pounce-prompt-charging');
        this.promptEl.classList.remove('pounce-prompt-sneak');
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
        this.qteRound = 1;
        this.qteRoundsTotal = 1;
        this.overlayEl.hidden = true;
        this.player.endPounce();
        if (relock) this.relockPointer();
    }

    abortToIdle() {
        this.overlayEl.hidden = true;
        this.returnToIdle(true);
    }
}
