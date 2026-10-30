import * as THREE from 'three';
import { Entity } from '../core/entity.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { clampPositionToArena, computeBushBlend, resolveSphereOverlapXZ, applyTerrainHeight, sampleTerrainHeight } from '../core/collision.js';
import { computeCatSourceDecibels } from '../systems/catSound.js';
import { findPuddleAtPosition } from '../world/puddles.js';

export const CAT_MODELS = [
    { id: 'original', label: 'Original', url: '/car.glb' },
    { id: 'orange', label: 'Orange', url: '/models/cat-orange.glb' },
    { id: 'white', label: 'White', url: '/models/cat-white.glb' },
    { id: 'blue', label: 'Blue', url: '/models/cat-blue.glb' }
];

export class Player {
    constructor(scene) {
        this.scene = scene;
        this.container = new THREE.Group();
        
        this.container.position.set(15, 0, 15);
        this.scene.add(this.container);

        this.carModel = null;
        this.catModelId = 'original';
        this.modelCache = new Map();
        this.modelRequest = 0;
        this.controlsBlocked = false;
        this.isDeployed = false;
        this.walkSpeed = 2;
        this.runSpeed = 4.85;
        this.sneakSpeed = 1.15;
        this.speed = this.walkSpeed;
        this.walkDirectionX = 0;
        this.walkDirectionZ = 0;
        this.isRunning = false;
        this.isSneaking = false;
        this.shiftHeld = false;
        this.ctrlHeld = false;
        this.soundTime = 0;

        this.targetQuaternion = new THREE.Quaternion();
        this.tempMatrix = new THREE.Matrix4();
        this.slerpSpeed = 0.1;

        this.translationX = 0;
        this.translationY = 0;
        this.stoppedMoving = false;

        this.soundDecibel = 0;
        this.aerialSphere = new THREE.Sphere();
        this.sightSphere = new THREE.Sphere();
        this.collisionSphere = new THREE.Sphere();
        this.baseAerialRadius = 4;

        // Stun & Recovery Configuration
        this.isStunned = false;
        this.stunTimer = 0;
        this.stunEntryProgress = 0; 
        this.isRecovering = false;
        this.recoveryProgress = 0;

        // Bush Stealth & Sound Flags
        this.hiddenInBush = false;
        this.bushBlend = 0;
        this.targetBushBlend = 0;
        this.isMoving = false;

        this.staminaMax = 100;
        this.stamina = 100;
        this.runStaminaDrain = 26;
        this.runMinStamina = 8;
        this.drinkRate = 38;
        this.isDrinking = false;

        this.isLocked = false;
        this.leapActive = false;
        this.leapElapsed = 0;
        this.leapDuration = 0.42;
        this.leapFrom = new THREE.Vector3();
        this.leapTo = new THREE.Vector3();

        this.initControls();
        this.loadModel();
    }

    loadModel() {
        this.aerialSphere.radius = this.baseAerialRadius;
        this.sightSphere.radius = this.baseAerialRadius;
        this.collisionSphere.radius = 0.5;
        Entity.appendEntity('player', this, 1);
        this.ready = this.setCatModel('original');
        this.ready.catch((error) => console.error('Could not load cat:', error));
    }

    async setCatModel(id) {
        const variant = CAT_MODELS.find((model) => model.id === id);
        if (!variant) throw new Error(`Unknown cat model: ${id}`);
        const request = ++this.modelRequest;
        if (!this.modelCache.has(id)) {
            const pending = new GLTFLoader().loadAsync(variant.url).then(({ scene }) => {
                scene.traverse((child) => {
                    if (!child.isMesh) return;
                    child.castShadow = true;
                    const materials = Array.isArray(child.material) ? child.material : [child.material];
                    materials.filter(Boolean).forEach((material) => {
                        material.transparent = false;
                        material.opacity = 1;
                    });
                });
                return scene;
            }).catch((error) => {
                this.modelCache.delete(id);
                throw error;
            });
            this.modelCache.set(id, pending);
        }
        const model = await this.modelCache.get(id);
        if (request !== this.modelRequest) return;
        if (this.carModel) {
            model.position.copy(this.carModel.position);
            model.quaternion.copy(this.carModel.quaternion);
            this.container.remove(this.carModel);
        }
        this.carModel = model;
        this.catModelId = id;
        this.container.add(model);
    }

    setControlsBlocked(blocked) {
        this.controlsBlocked = blocked;
        this.walkDirectionX = 0;
        this.walkDirectionZ = 0;
        this.shiftHeld = false;
        this.ctrlHeld = false;
    }

    initControls() {
        window.addEventListener("keydown", (e) => {
            if (this.controlsBlocked) return;
            if (e.code === 'ShiftLeft' || e.code === 'ShiftRight') this.shiftHeld = true;
            if (e.code === 'ControlLeft' || e.code === 'ControlRight') this.ctrlHeld = true;
            if (this.isStunned || this.isRecovering || this.isLocked) return;
            switch(e.key) {
                case "d": this.walkDirectionX = 1; break;
                case "a": this.walkDirectionX = -1; break;
                case "w": this.walkDirectionZ = -1; break;
                case "s": this.walkDirectionZ = 1; break;
            }
        });

        window.addEventListener("keyup", (e) => {
            if (e.code === 'ShiftLeft' || e.code === 'ShiftRight') this.shiftHeld = false;
            if (e.code === 'ControlLeft' || e.code === 'ControlRight') this.ctrlHeld = false;
            switch(e.key) {
                case "d":
                case "a": this.walkDirectionX = 0; break;
                case "w":
                case "s": this.walkDirectionZ = 0; break;
            }
        });
    }

    stun(duration = 1.5) {
        if (!this.isDeployed) return;
        if (this.isLocked) return;
        if (!this.isStunned && !this.isRecovering) {
            this.isStunned = true;
            this.stunTimer = duration;
            this.stunEntryProgress = 0; 
            this.walkDirectionX = 0;
            this.walkDirectionZ = 0;
        }
    }

    beginLeap(targetPos, duration = 0.42) {
        this.isLocked = true;
        this.leapActive = true;
        this.leapElapsed = 0;
        this.leapDuration = duration;
        this.leapFrom.copy(this.container.position);
        this.leapTo.copy(targetPos);
        this.leapTo.y = sampleTerrainHeight(this.leapTo.x, this.leapTo.z);
        this.walkDirectionX = 0;
        this.walkDirectionZ = 0;
        this.isMoving = false;
    }

    endPounce() {
        this.isLocked = false;
        this.leapActive = false;
        if (this.carModel && !this.isStunned && !this.isRecovering) {
            this.carModel.position.y = 0;
            this.carModel.rotation.x = 0;
        }
    }

    updateLeap(delta) {
        this.leapElapsed += delta;
        const t = Math.min(this.leapElapsed / this.leapDuration, 1);
        const eased = t * t * (3 - 2 * t);
        this.container.position.lerpVectors(this.leapFrom, this.leapTo, eased);
        clampPositionToArena(this.container.position);

        const dx = this.leapTo.x - this.leapFrom.x;
        const dz = this.leapTo.z - this.leapFrom.z;
        if (dx * dx + dz * dz > 1e-6) {
            this.tempMatrix.lookAt(
                new THREE.Vector3(0, 0, 0),
                new THREE.Vector3(-dx, 0, -dz),
                new THREE.Vector3(0, 1, 0)
            );
            this.targetQuaternion.setFromRotationMatrix(this.tempMatrix);
            this.container.quaternion.slerp(this.targetQuaternion, 0.35);
        }

        if (this.carModel) {
            this.carModel.position.y = Math.sin(t * Math.PI) * 1.15;
            this.carModel.rotation.z = 0;
        }

        if (t >= 1) {
            this.leapActive = false;
            if (this.carModel) this.carModel.position.y = 0;
        }
    }

    update(delta, bushes = [], cameraYaw = 0, puddles = []) {
        if (!this.aerialSphere || !this.sightSphere || !this.collisionSphere) return;

        if (this.leapActive) {
            this.updateLeap(delta);
        }

        const bodyCenter = this.container.position;
        const sphereY = bodyCenter.y + 0.35;
        this.aerialSphere.center.set(bodyCenter.x, sphereY, bodyCenter.z);
        this.aerialSphere.radius = this.baseAerialRadius;
        this.sightSphere.center.set(bodyCenter.x, sphereY, bodyCenter.z);
        this.collisionSphere.center.set(bodyCenter.x, bodyCenter.y + 0.25, bodyCenter.z);

        this.targetBushBlend = computeBushBlend(bodyCenter, bushes);
        const bushLerp = 1 - Math.exp(-10 * delta);
        this.bushBlend = THREE.MathUtils.lerp(this.bushBlend, this.targetBushBlend, bushLerp);
        this.hiddenInBush = this.bushBlend > 0.52;
        this.sightSphere.radius = THREE.MathUtils.lerp(
            this.baseAerialRadius,
            0.15,
            this.bushBlend
        );
        this.isMoving = this.walkDirectionX !== 0 || this.walkDirectionZ !== 0;
        const wantsRun = this.isMoving && this.shiftHeld && !this.ctrlHeld;
        const canRun = this.stamina > this.runMinStamina;
        this.isRunning = wantsRun && canRun;
        this.isSneaking = this.isMoving && this.ctrlHeld && !this.shiftHeld;
        this.speed = this.isRunning
            ? this.runSpeed
            : this.isSneaking
              ? this.sneakSpeed
              : this.walkSpeed;

        if (this.isRunning && !this.isStunned && !this.isRecovering && !this.leapActive) {
            this.stamina = Math.max(0, this.stamina - this.runStaminaDrain * delta);
        }

        this.isDrinking = false;
        if (!this.leapActive && !this.isStunned && puddles.length > 0) {
            const puddle = findPuddleAtPosition(puddles, bodyCenter.x, bodyCenter.z);
            if (puddle) {
                this.stamina = Math.min(this.staminaMax, this.stamina + this.drinkRate * delta);
                this.isDrinking = true;
            }
        }

        this.soundTime += delta;
        this.soundDecibel = computeCatSourceDecibels(this, this.soundTime);

        if (this.leapActive || this.isLocked) {
            return;
        }

        if (this.isStunned) {
            this.stunTimer -= delta;
            if (this.carModel) {
                if (this.stunEntryProgress < 1.0) {
                    this.stunEntryProgress += delta * 4.0;
                }
                const progress = Math.min(this.stunEntryProgress, 1.0);
                this.carModel.rotation.x = progress * Math.PI;
                const flipArc = Math.sin(progress * Math.PI) * 0.8;
                this.carModel.position.y = 0.4 * progress + flipArc;
                this.carModel.rotation.z = 0;
            }
            if (this.stunTimer <= 0) {
                this.isStunned = false;
                this.isRecovering = true;
                this.recoveryProgress = 0;
            }
            return; 
        }

        if (this.isRecovering) {
            this.recoveryProgress += delta * 3.5; 
            if (this.carModel) {
                const progress = Math.min(this.recoveryProgress, 1.0);
                this.carModel.rotation.x = Math.PI + progress * (Math.PI * 2);
                const jumpHeight = Math.sin(progress * Math.PI) * 1.2;
                this.carModel.position.y = 0.4 * (1.0 - progress) + jumpHeight;
                this.carModel.rotation.z = 0;
            }
            if (this.recoveryProgress >= 1.0) {
                this.isRecovering = false;
                if (this.carModel) {
                    this.carModel.rotation.x = 0;
                    this.carModel.position.y = 0;
                }
            }
            return; 
        }

        const forwardX = -Math.sin(cameraYaw);
        const forwardZ = -Math.cos(cameraYaw);
        const rightX = -forwardZ;
        const rightZ = forwardX;
        const inputForward = -this.walkDirectionZ;
        const inputRight = this.walkDirectionX;
        let moveX = forwardX * inputForward + rightX * inputRight;
        let moveZ = forwardZ * inputForward + rightZ * inputRight;
        const moveLen = Math.hypot(moveX, moveZ);
        if (moveLen > 0) {
            moveX /= moveLen;
            moveZ /= moveLen;
        }

        let moveDirection = new THREE.Vector3(moveX, 0, moveZ);
        
        if (moveDirection.lengthSq() > 0) {
            moveDirection.normalize();
            this.tempMatrix.lookAt(new THREE.Vector3(0, 0, 0), new THREE.Vector3(-moveX, 0, -moveZ), new THREE.Vector3(0, 1, 0));
            this.targetQuaternion.setFromRotationMatrix(this.tempMatrix);

            this.translationX += 0.04;
            this.translationY += 0.08;
            this.stoppedMoving = true;
        } 
        else if (this.stoppedMoving) {
            this.translationY += 0.08;
            if (Math.abs(Math.sin(this.translationY * 0.8)) < 0.05) {
                this.stoppedMoving = false;
            }
        }

        if (Math.sin(this.translationX) >= 0.1 || Math.sin(this.translationX) <= -0.1) {
            this.translationX += 0.04;
        }

        this.container.quaternion.slerp(this.targetQuaternion, this.slerpSpeed);

        if (this.carModel) {
            this.carModel.rotation.z = Math.sin(this.translationX) * 2 * delta;
            if (!this.stoppedMoving && moveDirection.lengthSq() === 0) {
                this.carModel.position.y = 0;
            } else {
                this.carModel.position.y = Math.abs(Math.sin(this.translationY * 0.8)) * 2 * delta;
            }
        }

        this.container.position.x += moveX * this.speed * delta;
        this.container.position.z += moveZ * this.speed * delta;
        clampPositionToArena(this.container.position);

        const rats = Entity.getEntitiesByType('entity');
        for (const rat of rats) {
            if (!rat.collisionSphere || !rat.ratContainer) continue;
            if (rat.isPinned || rat.isConsumed) continue;
            resolveSphereOverlapXZ(
                this.container.position,
                this.collisionSphere.radius,
                rat.ratContainer.position,
                rat.collisionSphere.radius,
                this.container.position,
                rat.ratContainer.position
            );
        }

        applyTerrainHeight(this.container.position);
    }
}
