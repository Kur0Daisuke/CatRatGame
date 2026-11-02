import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import {
    applyTerrainPose,
    clampPositionToArena,
    deflectDirFromArenaEdge,
    resolveSphereOverlapXZ
} from '../core/collision.js';
import { PLAY_RADIUS } from '../core/worldBounds.js';
import { applyWalkBob, createWalkBob } from '../systems/walkBob.js';
import { isPointInVisionConeFromYaw } from './ratVision.js';
import { SpeechBubble } from '../ui/speechBubble.js';
import {
    DOG_ACK,
    DOG_CHASE,
    DOG_ESCAPE,
    DOG_GREET,
    DOG_LOST,
    RAT_GREET,
    pickLine
} from './dogLines.js';

const MODEL_URL = '/models/shiba_inu.glb';
const TARGET_HEIGHT = 0.95;
const WANDER_SPEED = 1.45;
const HUNT_SPEED = 3.2;
const CATCH_RADIUS = 1.2;
const GREET_RANGE = 2.45;
const VISION_RANGE = 7.4;
const VISION_HALF_DEG = 68;
/** Tight circles still get spotted, the way a rat notices something on its tail. */
const PROXIMITY = 2.8;

/**
 * Shiba that wanders until a scout reports the cat, then runs to that exact spot.
 * Spawned on the far rim of the yard from the cat.
 */
export class Dog {
    constructor(scene, catX, catZ) {
        this.scene = scene;
        this.container = new THREE.Group();
        this.container.name = 'shiba';
        const spawn = farSideFrom(catX, catZ);
        this.container.position.set(spawn.x, 0, spawn.z);
        this.scene.add(this.container);

        this.model = null;
        this.footY = 0;
        this.modelHeight = TARGET_HEIGHT;
        this.headingYaw = Math.atan2(-spawn.x, -spawn.z);
        this.walkBob = createWalkBob();
        this.playTime = 0;
        this.seeingCat = false;
        this.speech = new SpeechBubble(this.container, { y: 1.15, color: '#f3d2a4' });

        this.state = 'wander';
        this.wanderX = spawn.x;
        this.wanderZ = spawn.z;
        this.idleLeft = 0.4;
        this.worldTime = 0;

        this.huntPoint = new THREE.Vector3();
        this.hasHuntPoint = false;
        this.huntAfterStun = false;
        this.barkCooldown = 2;
        this.onHuntStart = null;

        this.greetRat = null;
        this.greetLeft = 0;
        this.greetCooldown = 1.5;
        this.greetMemory = new Map();

        this.stunTimer = 0;
        this.stunEntry = 0;
        this.recover = 0;
        this.catchImmunity = 0;
        this.catchRadius = CATCH_RADIUS;
        this.collisionRadius = 0.42;

        this.pickWander();
        applyTerrainPose(this.container, this.headingYaw, 0);
        this.loadModel();
    }

    loadModel() {
        new GLTFLoader().load(
            MODEL_URL,
            (gltf) => {
                const model = gltf.scene;
                model.traverse((child) => {
                    if (!child.isMesh) return;
                    child.castShadow = true;
                    child.receiveShadow = true;
                });
                const bounds = new THREE.Box3().setFromObject(model);
                const size = bounds.getSize(new THREE.Vector3());
                const scale = TARGET_HEIGHT / Math.max(size.y, 0.001);
                model.scale.setScalar(scale);
                model.updateMatrixWorld(true);
                const fitted = new THREE.Box3().setFromObject(model);
                this.footY = -fitted.min.y;
                this.modelHeight = fitted.max.y - fitted.min.y;
                model.position.y = this.footY;
                this.speech.setHeight(this.footY + this.modelHeight + 0.18);
                this.model = model;
                this.container.add(model);
            },
            undefined,
            (error) => console.error('Could not load shiba:', error)
        );
    }

    say(text) {
        this.speech.say(text);
    }

    receiveCatReport(catPos) {
        if (!catPos) return;
        this.huntPoint.set(catPos.x, 0, catPos.z);
        this.hasHuntPoint = true;
        if (this.state === 'stunned' || this.state === 'recover' || this.state === 'caught') {
            this.huntAfterStun = true;
            return;
        }
        this.beginHunt(true);
    }

    beginHunt(fromReport = false) {
        if (!this.hasHuntPoint) return;
        const starting = this.state !== 'hunt';
        this.state = 'hunt';
        this.greetRat = null;
        this.huntAfterStun = false;
        if (starting) {
            this.say(pickLine(fromReport ? DOG_ACK : DOG_CHASE));
            this.barkCooldown = 2.6;
            this.onHuntStart?.();
        }
    }

    forceHunt(catPos) {
        this.huntPoint.set(catPos.x, 0, catPos.z);
        this.hasHuntPoint = true;
        this.huntAfterStun = false;
        this.state = 'hunt';
        this.greetRat = null;
        this.barkCooldown = 1.6;
    }

    clearHunt() {
        this.hasHuntPoint = false;
        this.huntAfterStun = false;
        this.seeingCat = false;
    }

    resetFar(catX, catZ) {
        const spawn = farSideFrom(catX, catZ);
        this.container.position.set(spawn.x, 0, spawn.z);
        this.headingYaw = Math.atan2(-spawn.x, -spawn.z);
        this.clearHunt();
        this.state = 'wander';
        this.idleLeft = 0.4;
        this.stunTimer = 0;
        this.stunEntry = 0;
        this.recover = 0;
        this.catchImmunity = 0;
        this.greetRat = null;
        this.greetLeft = 0;
        this.playTime = 0;
        this.resetPose();
        this.pickWander();
        applyTerrainPose(this.container, this.headingYaw, 0);
    }

    stun(seconds = 5) {
        this.state = 'stunned';
        this.stunTimer = seconds;
        this.stunEntry = 0;
        this.recover = 0;
        this.greetRat = null;
        this.say(pickLine(DOG_ESCAPE));
    }

    pickWander() {
        const limit = PLAY_RADIUS - 3.2;
        if (Math.random() < 0.62) {
            const angle = Math.random() * Math.PI * 2;
            const radius = Math.sqrt(Math.random()) * (limit - 2);
            this.wanderX = Math.cos(angle) * radius;
            this.wanderZ = Math.sin(angle) * radius;
            return;
        }
        const angle = Math.random() * Math.PI * 2;
        const dist = 3.5 + Math.random() * 7;
        this.wanderX = this.container.position.x + Math.cos(angle) * dist;
        this.wanderZ = this.container.position.z + Math.sin(angle) * dist;
        const fromOrigin = Math.hypot(this.wanderX, this.wanderZ);
        if (fromOrigin > limit) {
            this.wanderX = (this.wanderX / fromOrigin) * limit;
            this.wanderZ = (this.wanderZ / fromOrigin) * limit;
        }
    }

    update(delta, player, rats = []) {
        this.worldTime += delta;
        if (this.catchImmunity > 0) this.catchImmunity = Math.max(0, this.catchImmunity - delta);
        if (this.greetCooldown > 0) this.greetCooldown = Math.max(0, this.greetCooldown - delta);

        this.sensePlayer(player);

        let moving = false;

        if (this.state === 'caught') {
            if (player?.container) {
                this.face(player.container.position.x, player.container.position.z, delta);
            }
        } else if (this.state === 'stunned') {
            this.stunTimer -= delta;
            this.stunEntry = Math.min(1, this.stunEntry + delta * 2.8);
            this.poseStun(this.stunEntry);
            if (this.stunTimer <= 0) {
                this.state = 'recover';
                this.recover = 0;
            }
        } else if (this.state === 'recover') {
            this.recover += delta * 2.4;
            this.poseStun(1 - Math.min(1, this.recover));
            if (this.recover >= 1) {
                this.resetPose();
                if (this.huntAfterStun && this.hasHuntPoint) this.beginHunt();
                else {
                    this.state = 'wander';
                    this.idleLeft = 0.5;
                }
            }
        } else if (this.state === 'greet') {
            this.updateGreet(delta);
        } else if (this.state === 'hunt') {
            moving = this.updateHunt(delta, player);
        } else {
            moving = this.updateWander(delta, rats);
        }

        if (this.model && this.state !== 'stunned' && this.state !== 'recover') {
            const playful = this.state === 'wander' || this.state === 'greet';
            if (playful) this.applyPlayBounce(moving, delta);
            else {
                this.model.rotation.x = 0;
                applyWalkBob(this.walkBob, this.model, moving, delta, this.footY);
            }
        }

        this.separateFromRats(rats);
        applyTerrainPose(this.container, this.headingYaw, 0, delta);
    }

    updateWander(delta, rats) {
        if (this.idleLeft > 0) {
            this.idleLeft -= delta;
            this.tryGreet(rats);
            return false;
        }
        const left = this.moveToward(this.wanderX, this.wanderZ, WANDER_SPEED, delta);
        if (left <= 0.4) {
            this.idleLeft = 0.8 + Math.random() * 1.7;
            this.pickWander();
            return false;
        }
        this.tryGreet(rats);
        return true;
    }

    sensePlayer(player) {
        this.seeingCat = false;
        if (!player?.isDeployed || !player.container) return;
        if (this.state === 'stunned' || this.state === 'recover' || this.state === 'caught') return;
        if (player.bushCoverActive) return;

        const cat = player.container.position;
        const dist = distanceXZ(this.container.position, cat);
        const inCone = isPointInVisionConeFromYaw(
            this.container.position,
            this.headingYaw,
            cat,
            VISION_RANGE,
            VISION_HALF_DEG
        );
        if (!inCone && dist > PROXIMITY) return;

        this.seeingCat = true;
        this.huntPoint.set(cat.x, 0, cat.z);
        this.hasHuntPoint = true;
        if (this.state !== 'hunt') this.beginHunt();
    }

    applyPlayBounce(moving, delta) {
        if (!this.model) return;
        const rate = moving ? 8.6 : 3.6;
        this.playTime += delta * rate;
        const wave = Math.sin(this.playTime);
        const hop = Math.abs(wave);
        this.model.position.y = this.footY + hop * (moving ? 0.22 : 0.09);
        this.model.rotation.z = wave * (moving ? 0.2 : 0.1);
        this.model.rotation.x = moving ? -Math.max(0, wave) * 0.26 : hop * 0.06;
    }

    updateHunt(delta, player) {
        if (!this.hasHuntPoint) {
            this.state = 'wander';
            return false;
        }
        if (this.seeingCat && player?.container) {
            this.huntPoint.set(player.container.position.x, 0, player.container.position.z);
        }
        const left = this.moveToward(this.huntPoint.x, this.huntPoint.z, HUNT_SPEED, delta);
        this.barkCooldown -= delta;
        if (this.barkCooldown <= 0) {
            this.say(pickLine(DOG_CHASE));
            this.barkCooldown = 3.4 + Math.random() * 2;
        }
        const catDist = distanceXZ(this.container.position, player?.container?.position);
        const catNear = player?.isDeployed && catDist <= this.catchRadius + 0.35;
        if (left < 0.8 && !catNear) {
            this.hasHuntPoint = false;
            this.state = 'wander';
            this.idleLeft = 0.35;
            this.say(pickLine(DOG_LOST));
            return false;
        }
        return left >= 0.2;
    }

    updateGreet(delta) {
        const rat = this.greetRat;
        this.greetLeft -= delta;
        if (!rat?.ratContainer || rat.isConsumed || rat.isEscaping || rat.isWarning || this.greetLeft <= 0) {
            this.endGreet();
            return;
        }
        const dist = distanceXZ(this.container.position, rat.ratContainer.position);
        if (dist > GREET_RANGE + 1.3) {
            this.endGreet();
            return;
        }
        this.face(rat.ratContainer.position.x, rat.ratContainer.position.z, delta);
    }

    tryGreet(rats) {
        if (this.greetCooldown > 0 || this.state !== 'wander') return;
        let best = null;
        let bestDist = GREET_RANGE;
        for (const rat of rats) {
            if (!this.ratOpenToGreet(rat)) continue;
            const last = this.greetMemory.get(rat) ?? -999;
            if (this.worldTime - last < 14) continue;
            const dist = distanceXZ(this.container.position, rat.ratContainer.position);
            if (dist < bestDist) {
                best = rat;
                bestDist = dist;
            }
        }
        if (!best) return;
        this.state = 'greet';
        this.greetRat = best;
        this.greetLeft = 2.3 + Math.random() * 1.1;
        this.greetMemory.set(best, this.worldTime);
        this.say(pickLine(DOG_GREET));
        const pool = RAT_GREET[best.kind] ?? RAT_GREET.dumb;
        best.showChatBubble?.(pickLine(pool));
    }

    ratOpenToGreet(rat) {
        if (!rat?.ratContainer || rat.isConsumed || rat.isPinned) return false;
        if (rat.isEscaping || rat.isWarning || rat.isEngaging || rat.isInvestigating) return false;
        if (rat.isEscorting || rat.isBeingEscorted) return false;
        return true;
    }

    endGreet() {
        this.greetRat = null;
        this.greetCooldown = 1.6;
        if (this.state === 'greet') {
            this.state = 'wander';
            this.idleLeft = 0.25;
        }
    }

    moveToward(x, z, speed, delta) {
        const pos = this.container.position;
        let dx = x - pos.x;
        let dz = z - pos.z;
        const len = Math.hypot(dx, dz);
        if (len < 0.08) return len;
        dx /= len;
        dz /= len;
        const deflected = deflectDirFromArenaEdge(pos.x, pos.z, dx, dz);
        pos.x += deflected.x * speed * delta;
        pos.z += deflected.z * speed * delta;
        clampPositionToArena(pos);
        this.face(pos.x + deflected.x, pos.z + deflected.z, delta);
        return len;
    }

    face(x, z, delta) {
        const dx = x - this.container.position.x;
        const dz = z - this.container.position.z;
        if (dx * dx + dz * dz < 1e-6) return;
        const targetYaw = Math.atan2(dx, dz);
        let yawDelta = targetYaw - this.headingYaw;
        while (yawDelta > Math.PI) yawDelta -= Math.PI * 2;
        while (yawDelta < -Math.PI) yawDelta += Math.PI * 2;
        const turn = 1 - Math.exp(-10 * delta);
        this.headingYaw += yawDelta * turn;
    }

    separateFromRats(rats) {
        for (const rat of rats) {
            if (!rat?.ratContainer || !rat.collisionSphere || rat.isPinned || rat.isConsumed) continue;
            resolveSphereOverlapXZ(
                this.container.position,
                this.collisionRadius,
                rat.ratContainer.position,
                rat.collisionSphere.radius,
                this.container.position,
                rat.ratContainer.position
            );
        }
    }

    poseStun(amount) {
        if (!this.model) return;
        const t = THREE.MathUtils.clamp(amount, 0, 1);
        this.model.rotation.x = t * (Math.PI * 0.5);
        this.model.rotation.z = 0;
        this.model.position.y = this.footY + Math.sin(t * Math.PI) * 0.12;
    }

    resetPose() {
        if (!this.model) return;
        this.model.rotation.x = 0;
        this.model.rotation.z = 0;
        this.model.position.y = this.footY;
    }
}

function farSideFrom(catX, catZ) {
    const limit = PLAY_RADIUS - 3.4;
    let dx = -catX;
    let dz = -catZ;
    const len = Math.hypot(dx, dz) || 1;
    dx /= len;
    dz /= len;
    return { x: dx * limit, z: dz * limit };
}

function distanceXZ(a, b) {
    if (!a || !b) return Infinity;
    return Math.hypot(a.x - b.x, a.z - b.z);
}
