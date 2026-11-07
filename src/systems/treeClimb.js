import * as THREE from 'three';
import { sampleTerrainHeight, applyTerrainPose } from '../core/collision.js';
import { findNearestClimbableTree, getTreeTrunkPoint } from '../world/trees.js';

const CLIMB_DURATION = 1.35;
const DESCEND_DURATION = 0.65;
const TRUNK_SURFACE_OFFSET = 0.08;

/**
 * Press F at the trunk to climb straight up to the treetop, perch, F again to drop.
 */
export class TreeClimbSystem {
    constructor({ player, trees, camera }) {
        this.player = player;
        this.trees = trees;
        this.camera = camera;

        this.state = 'idle';
        this.activeTree = null;
        this.elapsed = 0;
        this.anchorX = 0;
        this.anchorZ = 0;
        this.climbGroundY = 0;
        this.climbTopY = 0;
        this.climbHeading = 0;

        this._euler = new THREE.Euler(0, 0, 0, 'YXZ');
        this._screen = new THREE.Vector3();
        this.buildUI();
        this.bindInput();
    }

    isActive() {
        return this.state !== 'idle';
    }

    blocksMovement() {
        return this.state === 'climbing' || this.state === 'perched' || this.state === 'descending';
    }

    buildUI() {
        this.promptEl = document.createElement('div');
        this.promptEl.className = 'pounce-prompt';
        const promptKey = document.body.classList.contains('touch-ui') ? 'UP' : 'F';
        this.promptEl.innerHTML = `<span class="pounce-prompt-key">${promptKey}</span>`;
        this.promptEl.hidden = true;
        document.body.appendChild(this.promptEl);

        this.hudEl = document.createElement('div');
        this.hudEl.className = 'hud-stat hud-stat--tree';
        this.hudEl.textContent = 'In tree';
        this.hudEl.hidden = true;
    }

    requestUse() {
        if (!this.player.isDeployed || this.player.controlsBlocked) return false;
        if (this.player.isStunned || this.player.isRecovering) return false;
        if (this.player.leapActive || (this.player.isLocked && this.state === 'idle')) return false;

        if (this.state === 'perched') {
            this.beginDescend();
            return true;
        }

        if (this.state !== 'idle') return false;

        const tree = findNearestClimbableTree(this.player.container.position, this.trees);
        if (!tree) return false;
        this.beginClimb(tree);
        return true;
    }

    bindInput() {
        window.addEventListener('keydown', (event) => {
            if (event.code !== 'KeyF' || event.repeat) return;
            if (this.requestUse()) event.preventDefault();
        });
    }

    snapAnchorOnTrunk(tree) {
        const px = this.player.container.position.x;
        const pz = this.player.container.position.z;
        const onTrunk = getTreeTrunkPoint(tree, px, pz, TRUNK_SURFACE_OFFSET);
        this.anchorX = onTrunk.x;
        this.anchorZ = onTrunk.z;
        this.climbGroundY = sampleTerrainHeight(this.anchorX, this.anchorZ);
        const top = tree.tipY ?? this.climbGroundY + tree.climbHeight;
        this.climbTopY = top;
        const toTreeX = tree.x - this.anchorX;
        const toTreeZ = tree.z - this.anchorZ;
        this.climbHeading = Math.atan2(toTreeX, toTreeZ);
    }

    applyClimbTransform(y, leanT = 0) {
        this.player.container.position.set(this.anchorX, y, this.anchorZ);
        this.player.headingYaw = this.climbHeading;
        this._euler.set(-0.55 * leanT, this.climbHeading, 0);
        this.player.container.quaternion.setFromEuler(this._euler);

        if (this.player.carModel) {
            this.player.carModel.rotation.z = 0;
        }
    }

    beginClimb(tree) {
        this.activeTree = tree;
        this.state = 'climbing';
        this.elapsed = 0;
        this.player.isTreeClimbing = true;
        this.player.isTreePerched = false;
        this.player.isLocked = true;
        this.player.walkDirectionX = 0;
        this.player.walkDirectionZ = 0;
        this.player.isMoving = false;
        this.snapAnchorOnTrunk(tree);
    }

    beginDescend() {
        if (!this.activeTree) {
            this.reset();
            return;
        }
        this.state = 'descending';
        this.elapsed = 0;
        this.player.isTreeClimbing = true;
        this.player.isTreePerched = false;
    }

    reset() {
        this.state = 'idle';
        this.activeTree = null;
        this.elapsed = 0;
        this.player.isTreeClimbing = false;
        this.player.isTreePerched = false;
        if (!this.player.leapActive) {
            this.player.isLocked = false;
        }
        if (this.player.carModel) {
            this.player.carModel.position.y = 0;
            this.player.carModel.rotation.x = 0;
            this.player.carModel.rotation.z = 0;
        }
        this.hidePrompt();
    }

    cancelForReset() {
        if (this.state === 'idle') return;
        if (this.activeTree) {
            this.snapAnchorOnTrunk(this.activeTree);
            this.player.container.position.set(this.anchorX, this.climbGroundY, this.anchorZ);
            applyTerrainPose(this.player.container, this.player.headingYaw, 0);
        }
        this.reset();
    }

    hidePrompt() {
        this.promptEl.hidden = true;
    }

    placePromptAtWorld(x, y, z) {
        if (!this.camera) {
            this.hidePrompt();
            return;
        }
        this._screen.set(x, y, z);
        this._screen.project(this.camera);
        if (this._screen.z > 1) {
            this.hidePrompt();
            return;
        }
        const sx = (this._screen.x * 0.5 + 0.5) * window.innerWidth;
        const sy = (-this._screen.y * 0.5 + 0.5) * window.innerHeight;
        this.promptEl.hidden = false;
        const promptKey = document.body.classList.contains('touch-ui') ? 'UP' : 'F';
        this.promptEl.innerHTML = `<span class="pounce-prompt-key">${promptKey}</span>`;
        this.promptEl.style.transform = `translate(${sx}px, ${sy}px) translate(-50%, -120%)`;
    }

    update(delta) {
        this.updatePrompt();

        if (this.state === 'idle') {
            this.hudEl.hidden = true;
            return;
        }

        this.hudEl.hidden = !this.player.isTreePerched;

        const tree = this.activeTree;
        if (!tree) {
            this.reset();
            return;
        }

        if (this.state === 'climbing') {
            this.elapsed += delta;
            const t = Math.min(this.elapsed / CLIMB_DURATION, 1);
            const eased = t * t * (3 - 2 * t);
            const y = THREE.MathUtils.lerp(this.climbGroundY, this.climbTopY, eased);

            this.applyClimbTransform(y, eased);

            if (this.player.carModel) {
                this.player.carModel.position.y = eased * 0.12;
                this.player.carModel.rotation.x = -0.15 * Math.sin(t * Math.PI);
            }

            if (t >= 1) {
                this.state = 'perched';
                this.player.isTreeClimbing = false;
                this.player.isTreePerched = true;
                this.player.isLocked = true;
                this.applyClimbTransform(this.climbTopY, 0.15);
                if (this.player.carModel) {
                    this.player.carModel.position.y = 0.08;
                    this.player.carModel.rotation.x = -0.05;
                }
            }
            return;
        }

        if (this.state === 'perched') {
            this.applyClimbTransform(this.climbTopY, 0.12);
            return;
        }

        if (this.state === 'descending') {
            this.elapsed += delta;
            const t = Math.min(this.elapsed / DESCEND_DURATION, 1);
            const eased = t * t;
            const y = THREE.MathUtils.lerp(this.climbTopY, this.climbGroundY, eased);

            this.applyClimbTransform(y, 1 - eased);

            if (this.player.carModel) {
                this.player.carModel.rotation.x = -0.2 * (1 - t);
            }

            if (t >= 1) {
                this.player.isLocked = false;
                applyTerrainPose(this.player.container, this.climbHeading, 0);
                this.reset();
            }
        }
    }

    updatePrompt() {
        if (
            !this.player.isDeployed ||
            this.player.controlsBlocked ||
            this.player.leapActive ||
            this.player.isStunned ||
            this.player.isRecovering ||
            this.state === 'climbing' ||
            this.state === 'descending'
        ) {
            this.hidePrompt();
            return;
        }

        if (this.state === 'perched') {
            const p = this.player.container.position;
            this.placePromptAtWorld(p.x, p.y + 0.55, p.z);
            return;
        }

        const tree = findNearestClimbableTree(this.player.container.position, this.trees);
        if (!tree) {
            this.hidePrompt();
            return;
        }

        const px = this.player.container.position.x;
        const pz = this.player.container.position.z;
        const onTrunk = getTreeTrunkPoint(tree, px, pz, TRUNK_SURFACE_OFFSET);
        const groundY = sampleTerrainHeight(onTrunk.x, onTrunk.z);
        this.placePromptAtWorld(onTrunk.x, groundY + 0.85, onTrunk.z);
    }
}
