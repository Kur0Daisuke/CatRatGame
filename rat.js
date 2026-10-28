import * as THREE from 'three';
import { Entity } from './entity.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

export class Rat {
    constructor(scene) {
        this.scene = scene;
        this.ratModel = null;

        this.visionSphere = new THREE.Sphere();
        this.debugVisionSphere = null;

        this.guessedPosition = new THREE.Vector3(0, 0, 0);
        this.guessMesh;

        this.roamingX = 0;
        this._worldPosition = new THREE.Vector3();
        this.ratContainer = new THREE.Group();
        this.scene.add(this.ratContainer);
        this.targetQuaternion = new THREE.Quaternion();
        this.tempMatrix = new THREE.Matrix4();
        this.slerpSpeed = 0.005;

        this.escapeTimer = 0;
        this.escapeDelay = 0.7;
        this.escapeDuration = 2.5;
        this.isEscaping = false;
        this.currentEscapeDir = new THREE.Vector3();

        this.loadModel();
    }

    loadModel() {
        const loader = new GLTFLoader();
        loader.load("./rat.glb", (gltf) => {
            this.ratModel = gltf.scene;
            this.ratModel.position.set(0, 0.1, 0);
            this.ratModel.rotation.y = Math.PI;
            this.ratModel.scale.set(0.15, 0.15, 0.15);
            
            this.ratModel.traverse((child) => {
                if (child.isMesh) {
                    child.castShadow = true;
                }
            });

            this.visionSphere.radius = 2;

            const visionRadius = 2; 
            const debugGeo = new THREE.SphereGeometry(visionRadius, 16, 16);
            const debugMat = new THREE.MeshBasicMaterial({ color: 0xff0000, wireframe: true });
            this.debugVisionSphere = new THREE.Mesh(debugGeo, debugMat);

            const guessRadius = 0.1; 
            const debugGuessGeo = new THREE.SphereGeometry(guessRadius, 16, 16);
            const debugGuessMat = new THREE.MeshBasicMaterial({ color: 0xff0000, wireframe: true });
            this.guessMesh = new THREE.Mesh(debugGuessGeo, debugGuessMat);
            this.scene.add(this.guessMesh);
            this.scene.add(this.debugVisionSphere);

            this.ratContainer.add(this.ratModel);
            Entity.appendEntity("entity", this, 2);

            const coneRadius = 5;
            const coneHeight = 20;
            const coneGeo = new THREE.ConeGeometry(coneRadius, coneHeight, 16, 1, true);
            coneGeo.rotateX(Math.PI / 2);
            coneGeo.translate(0, 0, -10);

            const coneMat = new THREE.MeshBasicMaterial({
                color: 0xffff00,
                transparent: true,
                opacity: 0.25,
                wireframe: false
            });

            this.visionCone = new THREE.Mesh(coneGeo, coneMat);
            this.ratModel.add(this.visionCone);
        }, undefined, (err) => console.log(err));
    }

    updateGuessPosition(catCenter, ratCenter) {
        const distance = catCenter.distanceTo(ratCenter);
        const db = Math.max(50 - 20 * Math.log10(Math.max(distance, 0.1) / 1), 0);
                
        const error = 10 * (1 - Math.min(db / 50, 1));
        const guessedX = catCenter.x + (Math.random() - 0.5) * error;
        const guessedZ = catCenter.z + (Math.random() - 0.5) * error;
        
        this.guessedPosition.set(guessedX, 0, guessedZ);
        this.guessMesh.position.set(guessedX, 0.2, guessedZ);
    }

    rotateTowards(targetPos) {
        targetPos.y = this.ratContainer.position.y;
        const direction = new THREE.Vector3().subVectors(targetPos, this.ratContainer.position);
        const correctedTarget = this.ratContainer.position.clone().sub(direction);

        this.tempMatrix.lookAt(this.ratContainer.position, correctedTarget, new THREE.Vector3(0, 1, 0));
        this.targetQuaternion.setFromRotationMatrix(this.tempMatrix);
        this.ratContainer.quaternion.slerp(this.targetQuaternion, this.slerpSpeed);
    }

    triggerEscape(catPos) {
        if (!this.isEscaping) {
            this.isEscaping = true;
            this.escapeTimer = 0;
            this.currentEscapeDir.subVectors(this.ratContainer.position, catPos).normalize();
            this.currentEscapeDir.y = 0;
        }
    }

    update(deltaTime) {
        if (!this.ratModel || !Entity.player) return;

        const playerEntity = Entity.player.entity;
        const catCenter = playerEntity.aerialSphere.center;
        const ratCenter = this.visionSphere.center;
        const ratPos = this.ratContainer.position;

        if (!this.isEscaping) {
            if (playerEntity.stoppedMoving && playerEntity.aerialSphere.intersectsSphere(this.visionSphere)) {
                this.updateGuessPosition(catCenter, ratCenter);
            }

            const targetPosition = this.guessedPosition.clone();
            targetPosition.y = ratPos.y;
            const dirToGuess = new THREE.Vector3().subVectors(targetPosition, ratPos).normalize();
            const ratForward = new THREE.Vector3(0, 0, 1).applyQuaternion(this.ratContainer.quaternion);
            
            const rotationAlignment = ratForward.dot(dirToGuess);

            let dangerDetected = false;
			console.log(rotationAlignment)
            if (playerEntity.collisionSphere.intersectsSphere(this.visionSphere)) {
                dangerDetected = true;
            } else if (rotationAlignment >= 0.9) {
				console.log("checking")
                const maxDistance = 4;
                const distanceToCat = ratPos.distanceTo(catCenter);
				console.log(distanceToCat)
                if (distanceToCat <= maxDistance) {
					
                    const dirToCat = new THREE.Vector3().subVectors(catCenter, ratPos).normalize();
                    const dotProduct = ratForward.dot(dirToCat);
                    const fovThreshold = 0.5;

                    if (dotProduct >= fovThreshold) {
                        dangerDetected = true;
                    }
                }
            }

            if (dangerDetected) {
                this.triggerEscape(catCenter);
            }
        }

        if (this.isEscaping) {
            this.escapeTimer += deltaTime;

            const lookTarget = ratPos.clone().add(this.currentEscapeDir);
            this.rotateTowards(lookTarget);

            if (this.escapeTimer >= this.escapeDelay) {
                const ratSpeed = 4;
                this.ratContainer.position.addScaledVector(this.currentEscapeDir, ratSpeed * deltaTime);
            }

            if (this.escapeTimer >= this.escapeDuration) {
                this.isEscaping = false;
            }
        } else {
            if (this.guessedPosition.lengthSq() > 0) {
                this.rotateTowards(this.guessedPosition.clone());
            }
        }

        this.roamingX += 2 * deltaTime;

        this.ratModel.getWorldPosition(this._worldPosition);
        this.visionSphere.center.copy(this._worldPosition);

        if (this.debugVisionSphere) {
            this.debugVisionSphere.position.copy(this._worldPosition);
        }
    }
}