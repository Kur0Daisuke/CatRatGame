import * as THREE from 'three';
import { Entity } from './entity.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

export class Player {
    constructor(scene) {
        this.scene = scene;
        this.container = new THREE.Group();
        
        this.container.position.set(15, 0, 15);
        this.scene.add(this.container);

        this.carModel = null;
        this.speed = 2;
        this.walkDirectionX = 0;
        this.walkDirectionZ = 0;

        this.targetQuaternion = new THREE.Quaternion();
        this.tempMatrix = new THREE.Matrix4();
        this.slerpSpeed = 0.1;

        this.translationX = 0;
        this.translationY = 0;
        this.stoppedMoving = false;

        this.soundDecibel = 0;
        this.aerialSphere = new THREE.Sphere();
        this.collisionSphere = new THREE.Sphere();

        // Stun & Recovery Configuration
        this.isStunned = false;
        this.stunTimer = 0;
        this.stunEntryProgress = 0; 
        this.isRecovering = false;
        this.recoveryProgress = 0;

        // Bush Stealth & Sound Flags
        this.hiddenInBush = false;
        this.isMoving = false;

        this.initControls();
        this.loadModel();
    }

    loadModel() {
        const loader = new GLTFLoader();
        loader.load("./car.glb", (gltf) => {
            this.carModel = gltf.scene;
            this.container.add(this.carModel);
            this.carModel.traverse((child) => {
                if (child.isMesh) {
                    child.castShadow = true;
                }
            });
            this.targetQuaternion.copy(this.container.quaternion);

            this.aerialSphere.radius = 4;
            this.collisionSphere.radius = 0.05;

            // --- DEBUG WIREFRAMES FOR PLAYER ---
            const debugAerialGeo = new THREE.SphereGeometry(this.aerialSphere.radius, 16, 16);
            const debugAerialMat = new THREE.MeshBasicMaterial({ color: 0xff0000, wireframe: true });
            const debugAerialMesh = new THREE.Mesh(debugAerialGeo, debugAerialMat);
            this.carModel.add(debugAerialMesh);

            const debugCollisionGeo = new THREE.SphereGeometry(this.collisionSphere.radius, 8, 8);
            const debugCollisionMat = new THREE.MeshBasicMaterial({ color: 0x00ff00, wireframe: true });
            const debugCollisionMesh = new THREE.Mesh(debugCollisionGeo, debugCollisionMat);
            this.carModel.add(debugCollisionMesh);

            Entity.appendEntity("player", this, 1);
        }, undefined, (err) => console.log(err));
    }

    initControls() {
        window.addEventListener("keydown", (e) => {
            if (this.isStunned || this.isRecovering) return;
            switch(e.key) {
                case "d": this.walkDirectionX = 1; break;
                case "a": this.walkDirectionX = -1; break;
                case "w": this.walkDirectionZ = -1; break;
                case "s": this.walkDirectionZ = 1; break;
            }
        });

        window.addEventListener("keyup", (e) => {
            switch(e.key) {
                case "d":
                case "a": this.walkDirectionX = 0; break;
                case "w":
                case "s": this.walkDirectionZ = 0; break;
            }
        });
    }

    stun(duration = 1.5) {
        if (!this.isStunned && !this.isRecovering) {
            this.isStunned = true;
            this.stunTimer = duration;
            this.stunEntryProgress = 0; 
            this.walkDirectionX = 0;
            this.walkDirectionZ = 0;
        }
    }

    isInBush(bushes) {
        if (!bushes || bushes.length === 0) return false;
        const playerPos = this.container.position;
        
        for (const bush of bushes) {
            if (bush.box && bush.box.containsPoint(playerPos)) {
                return true;
            }
        }
        return false;
    }

    update(delta, bushes = []) {
        if(!this.aerialSphere || !this.collisionSphere) return;

        this.aerialSphere.center.copy(this.container.position);
        this.collisionSphere.center.copy(this.container.position);

        this.hiddenInBush = this.isInBush(bushes);
        this.isMoving = this.walkDirectionX !== 0 || this.walkDirectionZ !== 0;

        if (this.isMoving) {
            this.soundDecibel = 65.0; 
        } else {
            this.soundDecibel = 10.0; 
        }

        if (this.carModel) {
            this.carModel.traverse((child) => {
                if (child.isMesh && !child.geometry.type.includes('Sphere')) { // Keep debug meshes solid/unaffected
                    child.material.transparent = true;
                    child.material.opacity = this.hiddenInBush ? 0.3 : 1.0;
                }
            });
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

        let moveDirection = new THREE.Vector3(-this.walkDirectionX, 0, -this.walkDirectionZ);
        
        if (moveDirection.lengthSq() > 0) {
            moveDirection.normalize();
            this.tempMatrix.lookAt(new THREE.Vector3(0, 0, 0), moveDirection, new THREE.Vector3(0, 1, 0));
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

        this.container.position.x += this.walkDirectionX * this.speed * delta;
        this.container.position.z += this.walkDirectionZ * this.speed * delta;
    }
}