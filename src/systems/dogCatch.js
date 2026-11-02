import * as THREE from 'three';
import { applyTerrainPose, clampPositionToArena, sampleTerrainHeight } from '../core/collision.js';
import {
    CAT_CAUGHT,
    CAT_CHASE,
    CAT_ESCAPE,
    CAT_FAIL,
    DOG_CAUGHT,
    DOG_FAIL,
    pickLine
} from '../game/dogLines.js';
import { SpeechBubble } from '../ui/speechBubble.js';

const GRAB_SECONDS = 0.42;
const FAIL_CAT_STUN = 1.35;
const ESCAPE_KNOCK = 2.7;

/** Same sweeping marker as the rat pounce check. Round count is 3 to 5. */
const DOG_QTE = { speed: 0.94, zoneWidth: 0.16, speedJitter: 0.08 };

/**
 * Caught scene uses the rat skill-check bar.
 * Clearing every round stuns the dog for 5 seconds.
 */
export class DogCatchSystem {
    constructor({ camera, renderer, player, dog, isPounceActive }) {
        this.camera = camera;
        this.renderer = renderer;
        this.player = player;
        this.dog = dog;
        this.isPounceActive = isPounceActive ?? (() => false);

        this.state = 'idle';
        this.elapsed = 0;
        this.resolved = false;
        this.qteMarker = 0;
        this.qteZoneStart = 0.35;
        this.qteConfig = null;
        this.qteRound = 1;

        this._camTarget = new THREE.Vector3();
        this._camLook = new THREE.Vector3();
        this._behind = new THREE.Vector3();
        this._side = new THREE.Vector3();

        this.catSpeech = new SpeechBubble(player.container, { y: 0.95, color: '#f7f1e4' });
        dog.onHuntStart = () => {
            if (!player.isDeployed) return;
            this.catSpeech.say(pickLine(CAT_CHASE));
        };

        this.buildUI();
        this.bindInput();
    }

    isActive() {
        return this.state !== 'idle';
    }

    controlsCamera() {
        return this.state === 'grab' || this.state === 'qte';
    }

    buildUI() {
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
            if (event.code !== 'Space' || this.state !== 'qte' || this.resolved || event.repeat) return;
            event.preventDefault();
            this.resolveRound(this.isMarkerInZone());
        });
    }

    update(delta) {
        if (this.state === 'idle') {
            if (this.canStart()) this.begin();
            return;
        }

        this.elapsed += delta;
        this.updateCamera(delta);

        if (this.state === 'grab' && this.elapsed >= GRAB_SECONDS) {
            this.beginQte();
            return;
        }

        if (this.state === 'qte' && !this.resolved) this.updateQte(delta);
    }

    canStart() {
        const dog = this.dog;
        const player = this.player;
        if (!dog || !player?.isDeployed || !player.container) return false;
        if (dog.state === 'stunned' || dog.state === 'recover' || dog.state === 'caught') return false;
        if (dog.catchImmunity > 0) return false;
        if (player.isStunned || player.isRecovering || player.isLocked || player.leapActive) return false;
        if (this.isPounceActive()) return false;
        const dx = player.container.position.x - dog.container.position.x;
        const dz = player.container.position.z - dog.container.position.z;
        return Math.hypot(dx, dz) <= dog.catchRadius;
    }

    begin() {
        this.state = 'grab';
        this.elapsed = 0;
        this.resolved = false;
        this.player.isLocked = true;
        this.player.walkDirectionX = 0;
        this.player.walkDirectionZ = 0;
        this.dog.state = 'caught';
        this.dog.say(pickLine(DOG_CAUGHT));
        this.catSpeech.say(pickLine(CAT_CAUGHT));
        if (document.pointerLockElement) document.exitPointerLock();
    }

    beginQte() {
        const rounds = 3 + Math.floor(Math.random() * 3);
        const speedMul = 1 + (Math.random() * 2 - 1) * DOG_QTE.speedJitter;
        this.qteConfig = {
            speed: DOG_QTE.speed * speedMul,
            zoneWidth: DOG_QTE.zoneWidth,
            rounds
        };
        this.qteRound = 1;
        this.resolved = false;
        this.state = 'qte';
        this.overlayEl.hidden = false;
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
            this.qteLabelEl.innerHTML =
                `Round ${this.qteRound}/${cfg.rounds} — press <kbd class="pounce-qte-key">SPACE</kbd> in the zone`;
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
            this.resolveRound(false);
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

    resolveRound(success) {
        if (this.resolved || this.state !== 'qte') return;
        if (success && this.qteRound < this.qteConfig.rounds) {
            this.qteRound += 1;
            this.startQteRound();
            return;
        }
        this.finish(success);
    }

    finish(success) {
        if (this.resolved && this.state === 'idle') return;
        this.resolved = true;
        this.overlayEl.hidden = true;
        this.state = 'idle';
        this.player.isLocked = false;

        if (success) {
            this.knockCatFree();
            this.dog.clearHunt();
            this.dog.catchImmunity = 1.15;
            this.dog.stun(5);
            this.catSpeech.say(pickLine(CAT_ESCAPE));
            this.showToast('Slipped free — dog stunned', 'success');
        } else {
            const pos = this.player.container.position;
            this.dog.catchImmunity = 1.85;
            this.dog.forceHunt(pos);
            this.dog.say(pickLine(DOG_FAIL));
            this.catSpeech.say(pickLine(CAT_FAIL));
            this.player.stun(FAIL_CAT_STUN);
            this.showToast('Missed the skill check!', 'fail');
        }

        this.relockPointer();
    }

    abort() {
        this.state = 'idle';
        this.resolved = false;
        this.qteConfig = null;
        this.overlayEl.hidden = true;
        this.toastEl.hidden = true;
        if (this.player) this.player.isLocked = false;
    }

    knockCatFree() {
        const cat = this.player.container.position;
        const dog = this.dog.container.position;
        let dx = cat.x - dog.x;
        let dz = cat.z - dog.z;
        const len = Math.hypot(dx, dz) || 1;
        dx /= len;
        dz /= len;
        cat.x += dx * ESCAPE_KNOCK;
        cat.z += dz * ESCAPE_KNOCK;
        clampPositionToArena(cat);
        applyTerrainPose(this.player.container, this.player.headingYaw, 0);
    }

    updateCamera(delta) {
        const dogPos = this.dog.container.position;
        const catPos = this.player.container.position;
        this._behind.set(dogPos.x - catPos.x, 0, dogPos.z - catPos.z);
        if (this._behind.lengthSq() < 1e-5) this._behind.set(0, 0, 1);
        else this._behind.normalize();
        this._side.set(-this._behind.z, 0, this._behind.x);

        const midX = (dogPos.x + catPos.x) * 0.5;
        const midZ = (dogPos.z + catPos.z) * 0.5;
        const groundY = sampleTerrainHeight(midX, midZ);
        this._camTarget.set(midX, groundY, midZ)
            .addScaledVector(this._behind, 3.5)
            .addScaledVector(this._side, 0.9);
        this._camTarget.y = groundY + 1.55;
        this._camLook.set(midX, groundY + 0.42, midZ);

        const follow = 1 - Math.exp(-7.5 * delta);
        this.camera.position.lerp(this._camTarget, follow);
        this.camera.lookAt(this._camLook);
    }

    showToast(text, kind) {
        this.toastEl.textContent = text;
        this.toastEl.className = `pounce-toast ${kind}`;
        this.toastEl.hidden = false;
        clearTimeout(this.toastTimer);
        this.toastTimer = setTimeout(() => {
            this.toastEl.hidden = true;
        }, 1300);
    }

    relockPointer() {
        const canvas = this.renderer.domElement;
        if (document.pointerLockElement === canvas) return;
        canvas.requestPointerLock?.();
    }
}
