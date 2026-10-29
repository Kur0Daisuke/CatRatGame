import * as THREE from 'three';
import { Entity } from './entity.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { clampPositionToArena, resolveSphereOverlapXZ } from './collision.js';
import { debugSettings } from './debugSettings.js';

const RAT_MODELS = {
    dumb: './models/rat-dumb.glb',
    scout: './models/rat-scout.glb',
    pouncer: './models/rat-pouncer.glb'
};

const PERSONALITY_BY_KIND = {
    dumb: 'STRAIGHT_AWAY',
    scout: 'ERRATIC',
    pouncer: 'jumper'
};

export class Rat {
    constructor(scene, kind = 'dumb', index = 0) {
        this.scene = scene;
        this.kind = RAT_MODELS[kind] ? kind : 'dumb';
        this.ratModel = null;

        this.visionSphere = new THREE.Sphere();
        this.collisionSphere = new THREE.Sphere(); 
        
        // --- DEBUG WIREFRAME FOR RAT VISION SPHERE ---
        const debugVisionGeo = new THREE.SphereGeometry(2.5, 16, 16);
        const debugVisionMat = new THREE.MeshBasicMaterial({ color: 0x0000ff, wireframe: true, transparent: true, opacity: 0.3 });
        this.debugVisionSphere = new THREE.Mesh(debugVisionGeo, debugVisionMat);
        this.debugVisionSphere.visible = debugSettings.showWireframes;
        this.scene.add(this.debugVisionSphere);

        this.guessedPosition = new THREE.Vector3(0, 0, 0);
        
        // --- DEBUG MESH FOR GUESSED POSITION ---
        const debugGuessGeo = new THREE.SphereGeometry(0.3, 8, 8);
        const debugGuessMat = new THREE.MeshBasicMaterial({ color: 0xffff00, wireframe: true });
        this.guessMesh = new THREE.Mesh(debugGuessGeo, debugGuessMat);
        this.guessMesh.visible = debugSettings.showWireframes;
        this.scene.add(this.guessMesh);

        // Idle & Wandering State Variables
        this.state = 'IDLE'; 
        this.idleTimer = 0;
        this.idleDuration = 2.0; 
        this.targetDestination = new THREE.Vector3();
        
        // --- DEBUG MESH FOR TARGET DESTINATION ---
        const debugTargetGeo = new THREE.BoxGeometry(0.4, 0.4, 0.4);
        const debugTargetMat = new THREE.MeshBasicMaterial({ color: 0xff00ff, wireframe: true });
        this.debugTargetMesh = new THREE.Mesh(debugTargetGeo, debugTargetMat);
        this.debugTargetMesh.visible = debugSettings.showWireframes;
        this.scene.add(this.debugTargetMesh);

        this.ratSpeed = 1.0; 

        const personalityTypes = ['STRAIGHT_AWAY', 'jumper', 'ERRATIC', 'STARE_DOWN'];
        this.personality = PERSONALITY_BY_KIND[this.kind] || personalityTypes[Math.floor(Math.random() * personalityTypes.length)];

        this.stayInGroup = true;         
        this.groupRadius = 6.0;          
        this.groupingWeight = 0.4;       
        this.nearbyRats = [];            
        this.isSpeaking = false;         
        this.chatBubbleSprite = null;
        this.chatTimeout = null;
        this.groupUpdateTimer = Math.random(); 

        const bubbleColors = ['#ff5733', '#33ff57', '#3357ff', '#f3ff33', '#ff33f3', '#33fff3', '#ff9133'];
        this.chatColor = bubbleColors[Math.floor(Math.random() * bubbleColors.length)];

        this.conversationTopics = [
            "Squeak squeak!", "Is there cheese around?", "Keep your voice down!",
            "Did you hear that?", "Run if the cat comes!", "Nibble nibble...",
            "Stay close to the group.", "Found some crumbs earlier!",
            "Too bright out here...", "Let's hide under the floorboards.", "Did you see the big paws?"
        ];

        this.alertTopic = "Quiet! Someone's moving.";
        this.panicTopic = "OH MY GODD";
        this.stareDownTopic = "WHAT YOU WANT?";
        
        this.prerenderedTextures = {};
        this.initChatTextures();

        this._worldPosition = new THREE.Vector3();
        this.ratContainer = new THREE.Group();
        const spawnAngle = index * 2.39996 + (index % 3) * 0.7;
        const spawnRadius = 10 + (index % 6) * 2.8;
        this.ratContainer.position.set(
            15 + Math.cos(spawnAngle) * spawnRadius,
            0,
            15 + Math.sin(spawnAngle) * spawnRadius
        );

        this.scene.add(this.ratContainer);
        this.targetQuaternion = new THREE.Quaternion();
        this.tempMatrix = new THREE.Matrix4();
        this.slerpSpeed = 0.02;

        this.escapeTimer = 0;
        this.escapeDelay = 0.9;      
        this.escapeDuration = 2.5;
        this.isEscaping = false;
        this.currentEscapeDir = new THREE.Vector3();
        this.encounterTime = 0;
        this.hasStunnedCat = false;

        this.isPinned = false;
        this.isConsumed = false;
        this.flipProgress = 0;
        this.isFlipping = false;
        this.consumeProgress = 0;

        this.loadModel();
    }

    initChatTextures() {
        this.prerenderedTextures = {};
        const allPhrases = [...this.conversationTopics, this.alertTopic, this.panicTopic, this.stareDownTopic];

        for (const quote of allPhrases) {
            let canvas = document.createElement('canvas');
            canvas.width = 256;
            canvas.height = 128;
            let context = canvas.getContext('2d');
            
            context.clearRect(0, 0, canvas.width, canvas.height);
            context.fillStyle = this.chatColor; 
            context.beginPath();
            if (context.roundRect) {
                context.roundRect(10, 10, 236, 80, 16);
            } else {
                context.rect(10, 10, 236, 80); 
            }
            context.fill();

            context.strokeStyle = '#ffffff';
            context.lineWidth = 4;
            context.stroke();

            context.fillStyle = '#000000';
            context.font = 'bold 15px Arial';
            context.textAlign = 'center';
            context.textBaseline = 'middle';
            context.fillText(quote, 128, 50, 220);
            
            const texture = new THREE.CanvasTexture(canvas);
            texture.needsUpdate = true;
            this.prerenderedTextures[quote] = texture;
        }
    }

    loadModel() {
        const loader = new GLTFLoader();
        const modelPath = RAT_MODELS[this.kind];
        loader.load(modelPath, (gltf) => {
            this.ratModel = gltf.scene;
            this.ratModel.position.set(0, 0.1, 0); 
            this.ratModel.rotation.y = Math.PI;
            this.ratModel.scale.set(0.15, 0.15, 0.15);
            
            this.ratModel.traverse((child) => {
                if (child.isMesh) {
                    child.castShadow = true;
                }
            });

            this.visionSphere.radius = 4.0; 
            this.collisionSphere.radius = 0.35;
            this.visionSphere.center.copy(this.ratContainer.position);
            this.collisionSphere.center.copy(this.ratContainer.position);
            this.ratContainer.add(this.ratModel);
            Entity.appendEntity("entity", this, 2);
        }, undefined, (err) => console.error(`Failed to load rat model (${this.kind}):`, err));
    }

    setDebugVisible(visible) {
        if (this.debugVisionSphere) this.debugVisionSphere.visible = visible;
        if (this.guessMesh) this.guessMesh.visible = visible;
        if (this.debugTargetMesh) this.debugTargetMesh.visible = visible;
    }

    canBePounced() {
        return Boolean(this.ratModel && this.ratContainer && !this.isPinned && !this.isConsumed);
    }

    hideChat() {
        if (this.chatTimeout) {
            clearTimeout(this.chatTimeout);
            this.chatTimeout = null;
        }
        if (this.chatBubbleSprite) {
            this.ratContainer.remove(this.chatBubbleSprite);
            this.chatBubbleSprite = null;
        }
        this.isSpeaking = false;
    }

    beginPin() {
        this.isPinned = true;
        this.isEscaping = false;
        this.state = 'PINNED';
        this.flipProgress = 0;
        this.isFlipping = false;
        this.hasStunnedCat = true;
        this.hideChat();
        if (this.ratModel) {
            this.ratModel.position.y = 0.1;
        }
    }

    playFlip() {
        this.isFlipping = true;
        this.flipProgress = 0;
    }

    updateFlip(delta) {
        if (!this.ratModel || !this.isPinned) return;
        if (this.isFlipping) {
            this.flipProgress = Math.min(1, this.flipProgress + delta * 4.2);
        }
        const t = this.flipProgress;
        this.ratModel.rotation.x = t * Math.PI;
        const lift = Math.sin(t * Math.PI) * 0.28;
        this.ratModel.position.y = 0.12 + t * 0.06 + lift;
    }

    releaseAndFlee(catPos) {
        this.isPinned = false;
        this.isFlipping = false;
        this.flipProgress = 0;
        this.isEscaping = false;
        if (this.ratModel) {
            this.ratModel.rotation.x = 0;
            this.ratModel.position.y = 0.1;
        }
        this.triggerEscape(catPos);
    }

    beginConsume() {
        this.isConsumed = true;
        this.consumeProgress = 0;
        this.hideChat();
    }

    updateConsume(delta) {
        this.consumeProgress += delta / 0.45;
        const t = Math.min(1, this.consumeProgress);
        const scale = Math.max(0.01, 1 - t);
        this.ratContainer.scale.setScalar(scale);
        this.ratContainer.position.y = t * 0.35;
        if (this.ratModel) {
            this.ratModel.rotation.x = Math.PI;
        }
        return t >= 1;
    }

    dispose() {
        this.isConsumed = true;
        this.hideChat();
        if (this.chatTimeout) clearTimeout(this.chatTimeout);
        if (this.debugVisionSphere) this.scene.remove(this.debugVisionSphere);
        if (this.guessMesh) this.scene.remove(this.guessMesh);
        if (this.debugTargetMesh) this.scene.remove(this.debugTargetMesh);
        this.scene.remove(this.ratContainer);
        for (const texture of Object.values(this.prerenderedTextures)) {
            texture.dispose?.();
        }
        Entity.removeEntity(this);
    }

    updateGuessPosition(catCenter, ratCenter) {
        const distance = catCenter.distanceTo(ratCenter);
        const sourceDb = 80;       
        const attenuation = 40; // Adjusted attenuation for smoother scaling    
        const db = Math.max(sourceDb - attenuation * Math.log10(Math.max(distance, 0.1)), 0);
                
        const error = 10 * (1 - Math.min(db / 80, 1));
        const guessedX = catCenter.x + (Math.random() - 0.5) * error;
        const guessedZ = catCenter.z + (Math.random() - 0.5) * error;
                
        this.guessedPosition.set(guessedX, 0, guessedZ);
        if (this.guessMesh) {
            this.guessMesh.position.set(guessedX, 0.2, guessedZ);
        }
    }

    rotateTowards(targetPos, customSpeed = null) {
        targetPos.y = this.ratContainer.position.y;
        const direction = new THREE.Vector3().subVectors(targetPos, this.ratContainer.position);
        const correctedTarget = this.ratContainer.position.clone().sub(direction);

        this.tempMatrix.lookAt(this.ratContainer.position, correctedTarget, new THREE.Vector3(0, 1, 0));
        this.targetQuaternion.setFromRotationMatrix(this.tempMatrix);
        
        const turnRate = customSpeed !== null ? customSpeed : (this.isEscaping ? THREE.MathUtils.lerp(0.15, 0.4, 1.0 - (this.escapeDelay / 0.9)) : this.slerpSpeed);
        this.ratContainer.quaternion.slerp(this.targetQuaternion, turnRate);
    }

    triggerEscape(catPos) {
        if (!this.isEscaping) {
            this.isEscaping = true;
            this.escapeTimer = 0;
            this.state = 'ESCAPING';
            this.isSpeaking = true;
            this.hasStunnedCat = false;

            const baseDirAway = new THREE.Vector3().subVectors(this.ratContainer.position, catPos).normalize();
            baseDirAway.y = 0;
            const panicJitter = Math.min(this.encounterTime * 0.15, Math.PI * 0.35);

            switch (this.personality) {
                case 'STRAIGHT_AWAY':
                    const jitterAngle = (Math.random() - 0.5) * panicJitter;
                    this.currentEscapeDir.copy(baseDirAway).applyAxisAngle(new THREE.Vector3(0, 1, 0), jitterAngle).normalize();
                    this.escapeDelay = Math.max(0.3, 0.5 - (this.encounterTime * 0.05)); 
                    this.showChatBubble(this.panicTopic);
                    break;

                case 'jumper':
                    const dirToCat = new THREE.Vector3().subVectors(catPos, this.ratContainer.position).normalize();
                    dirToCat.y = 0;
                    this.currentEscapeDir.copy(dirToCat);
                    this.escapeDelay = 0.9; 
                    this.escapeDuration = 2.5;
                    this.showChatBubble(this.panicTopic);
                    break;

                case 'ERRATIC':
                    const randomAngle = (Math.random() - 0.5) * Math.PI * (0.8 + this.encounterTime * 0.1);
                    this.currentEscapeDir.copy(baseDirAway).applyAxisAngle(new THREE.Vector3(0, 1, 0), randomAngle).normalize();
                    this.escapeDelay = Math.max(0.3, 0.6 - (this.encounterTime * 0.05));
                    this.showChatBubble(this.panicTopic);
                    break;

                case 'STARE_DOWN':
                    this.currentEscapeDir.copy(baseDirAway);
                    this.escapeDelay = Math.max(0.6, 1.6 - (this.encounterTime * 0.15)); 
                    this.showChatBubble(this.stareDownTopic);
                    break;
            }
        }
    }

    showChatBubble(text) {
        if (this.chatBubbleSprite) {
            this.ratContainer.remove(this.chatBubbleSprite);
            this.chatBubbleSprite = null;
        }

        let texture = this.prerenderedTextures[text] || this.prerenderedTextures["Squeak squeak!"];
        const spriteMaterial = new THREE.SpriteMaterial({ map: texture, transparent: true });
        this.chatBubbleSprite = new THREE.Sprite(spriteMaterial);
        this.chatBubbleSprite.scale.set(1.5, 0.75, 1);
        this.chatBubbleSprite.position.set(0, 0.8, 0);

        this.ratContainer.add(this.chatBubbleSprite);

        if (this.chatTimeout) clearTimeout(this.chatTimeout);
        this.chatTimeout = setTimeout(() => {
            if (this.chatBubbleSprite) {
                this.ratContainer.remove(this.chatBubbleSprite);
                this.chatBubbleSprite = null;
            }
            this.isSpeaking = false;
        }, 3000);
    }

    async trySmallTalk() {
        if (this.nearbyRats.length > 0 && !this.isSpeaking && Entity.player && Entity.player.entity) {
            const playerEntity = Entity.player.entity;
            const isColliding = playerEntity.aerialSphere.intersectsSphere(this.visionSphere);
            const isMovingKeys = playerEntity.walkDirectionX !== 0 || playerEntity.walkDirectionZ !== 0;

            if (isColliding && isMovingKeys && Math.random() < 0.2) {
                this.isSpeaking = true;
                const catCenter = playerEntity.aerialSphere.center;
                this.rotateTowards(catCenter.clone());
                this.showChatBubble(this.alertTopic);
                this.idleDuration += 3.0;
                return;
            }
        }
    }

    pickRandomDestination() {
        const radius = 3 + Math.random() * 4; 
        const angle = Math.random() * Math.PI * 2;
        
        let randomX = this.ratContainer.position.x + Math.cos(angle) * radius;
        let randomZ = this.ratContainer.position.z + Math.sin(angle) * radius;

        if (this.stayInGroup && this.nearbyRats.length > 0) {
            let centerSumX = 0, centerSumZ = 0;
            for (const otherRat of this.nearbyRats) {
                centerSumX += otherRat.ratContainer.position.x;
                centerSumZ += otherRat.ratContainer.position.z;
            }
            const groupCenterX = centerSumX / this.nearbyRats.length;
            const groupCenterZ = centerSumZ / this.nearbyRats.length;

            randomX = THREE.MathUtils.lerp(randomX, groupCenterX, this.groupingWeight);
            randomZ = THREE.MathUtils.lerp(randomZ, groupCenterZ, this.groupingWeight);
        }

        this.targetDestination.set(randomX, this.ratContainer.position.y, randomZ);
        if (this.debugTargetMesh) {
            this.debugTargetMesh.position.copy(this.targetDestination);
        }
    }

    update(deltaTime) {
        if (!this.ratModel || !Entity.player || this.isConsumed) return;

        if (this.isPinned) {
            this.ratModel.getWorldPosition(this._worldPosition);
            this.visionSphere.center.copy(this._worldPosition);
            this.collisionSphere.center.set(this._worldPosition.x, this.ratContainer.position.y + 0.2, this._worldPosition.z);
            this.updateFlip(deltaTime);
            if (this.debugVisionSphere) {
                this.debugVisionSphere.position.copy(this.visionSphere.center);
            }
            return;
        }

        this.groupUpdateTimer += deltaTime;
        if (this.groupUpdateTimer >= 0.3) {
            this.groupUpdateTimer = 0;
            this.nearbyRats = [];
            const allEntities = Entity.getEntitiesByType("entity"); 
            if (allEntities) {
                for (const otherEntity of allEntities) {
                    if (otherEntity !== this && otherEntity.ratContainer && !otherEntity.isConsumed && !otherEntity.isPinned) {
                        const dist = this.ratContainer.position.distanceTo(otherEntity.ratContainer.position);
                        if (dist <= this.groupRadius) {
                            this.nearbyRats.push(otherEntity);
                        }
                    }
                }
            }
        }

        const playerEntity = Entity.player.entity;
        const ratPos = this.ratContainer.position;

        this.ratModel.getWorldPosition(this._worldPosition);
        this.visionSphere.center.copy(this._worldPosition);
        this.collisionSphere.center.set(this._worldPosition.x, ratPos.y + 0.2, this._worldPosition.z);

        const catCenter = playerEntity.aerialSphere.center;
        const ratCenter = this.visionSphere.center;
        const playerMoving = playerEntity.isMoving;

        if (!this.isEscaping) {
            let directCollision = playerEntity.collisionSphere.intersectsSphere(this.collisionSphere);
            let inVisionRange = playerEntity.aerialSphere.intersectsSphere(this.visionSphere);

            // --- DISTANCE-BASED DECIBEL ATTENUATION FORMULA ---
            const distanceToCat = ratPos.distanceTo(catCenter);
            const sourceDecibels = playerMoving ? 85.0 : 15.0; // Base sound emitted by moving vs idle cat
            const attenuationFactor = 40.0;
            const perceivedDecibels = Math.max(sourceDecibels - attenuationFactor * Math.log10(Math.max(distanceToCat, 0.2)), 0.0);
            const hearingThreshold = 30.0; // Minimum decibels required for a rat to notice

            // Hearing check: Rats hear louder sounds when nearer, quieter/none when far
            let canHearCat = inVisionRange && (perceivedDecibels >= hearingThreshold);
            let canSeeCat = inVisionRange && ((1 - playerEntity.bushBlend) > 0.35 || playerMoving);

            if (canHearCat) {
                // Sound heard: guess position and turn toward the noise source
                this.updateGuessPosition(catCenter, ratCenter);
                this.rotateTowards(this.guessedPosition.clone());
            }

            let dangerDetected = false;
            if (directCollision) {
                dangerDetected = true;
            } else if (canSeeCat) {
                const ratForward = new THREE.Vector3(0, 0, 1).applyQuaternion(this.ratContainer.quaternion);
                if (distanceToCat <= 4) {
                    const dirToCat = new THREE.Vector3().subVectors(catCenter, ratPos).normalize();
                    const dotProduct = ratForward.dot(dirToCat);
                    if (dotProduct >= 0.5) {
                        dangerDetected = true; // Fully spotted by sight
                    }
                }
            }

            if (!dangerDetected && this.nearbyRats.length > 0) {
                for (const otherRat of this.nearbyRats) {
                    if (otherRat.isEscaping) {
                        dangerDetected = true;
                        break;
                    }
                }
            }

            if (dangerDetected) {
                this.triggerEscape(catCenter);
                this.encounterTime++;
            } else {
                if (this.state === 'IDLE') {
                    this.idleTimer += deltaTime;
                    if (this.idleTimer >= this.idleDuration) {
                        this.pickRandomDestination();
                        this.state = 'TURNING';
                    }
                } else if (this.state === 'TURNING') {
                    this.rotateTowards(this.targetDestination.clone());
                    const forward = new THREE.Vector3(0, 0, 1).applyQuaternion(this.ratContainer.quaternion);
                    const toTarget = new THREE.Vector3().subVectors(this.targetDestination, ratPos).normalize();
                    toTarget.y = 0;
                    if (forward.dot(toTarget) > 0.95) {
                        this.state = 'WALKING';
                    }
                } else if (this.state === 'WALKING') {
                    const dirToDest = new THREE.Vector3().subVectors(this.targetDestination, ratPos);
                    dirToDest.y = 0;
                    if (dirToDest.length() < 0.2) {
                        this.state = 'IDLE';
                        this.idleTimer = 0;
                        this.idleDuration = 1.5 + Math.random() * 3.0; 
                        this.trySmallTalk();
                    } else {
                        dirToDest.normalize();
                        this.ratContainer.position.addScaledVector(dirToDest, this.ratSpeed * deltaTime);
                        this.rotateTowards(this.targetDestination.clone());
                        clampPositionToArena(this.ratContainer.position);
                    }
                }
            }
        }

        if (this.isEscaping) {
            this.escapeTimer += deltaTime;

            if (this.personality === 'jumper') {
                if (this.escapeTimer < this.escapeDelay) {
                    const chargeSpeed = 4.2;
                    this.ratContainer.position.addScaledVector(this.currentEscapeDir, chargeSpeed * deltaTime);
                    clampPositionToArena(this.ratContainer.position);

                    const jumpProgress = this.escapeTimer / this.escapeDelay;
                    const highJumpHeight = Math.sin(jumpProgress * Math.PI) * 2.8;
                    this.ratModel.position.y = 0.1 + Math.max(0, highJumpHeight);

                    if (!this.hasStunnedCat && jumpProgress >= 0.2 && jumpProgress <= 0.85) {
                        const distToCat = ratPos.distanceTo(catCenter);
                        if (distToCat < 3.5 && playerEntity.stun) {
                            playerEntity.stun(1.5);
                            this.hasStunnedCat = true;
                        }
                    }
                } else {
                    if (this.escapeTimer - deltaTime < this.escapeDelay) {
                        const baseDirAway = new THREE.Vector3().subVectors(ratPos, catCenter).normalize();
                        baseDirAway.y = 0;
                        this.currentEscapeDir.copy(baseDirAway);
                    }
                    const escapeSpeed = 3.8;
                    this.ratContainer.position.addScaledVector(this.currentEscapeDir, escapeSpeed * deltaTime);
                    clampPositionToArena(this.ratContainer.position);
                    this.ratModel.position.y = 0.1;
                }
            } else {
                if (this.escapeTimer >= this.escapeDelay) {
                    const escapeSpeed = Math.min(3.5 + (this.encounterTime * 0.2), 5.2); 
                    this.ratContainer.position.addScaledVector(this.currentEscapeDir, escapeSpeed * deltaTime);
                    clampPositionToArena(this.ratContainer.position);
                    this.ratModel.position.y = 0.1; 
                } else {
                    const jumpProgress = this.escapeTimer / this.escapeDelay;
                    const smallHopHeight = Math.sin(jumpProgress * Math.PI) * 0.5;
                    this.ratModel.position.y = 0.1 + Math.max(0, smallHopHeight);
                }
            }

            let lookTarget = (this.personality === 'STARE_DOWN' && this.escapeTimer < this.escapeDelay)
                ? catCenter.clone() 
                : ratPos.clone().add(this.currentEscapeDir);

            const panicTurnSpeed = THREE.MathUtils.lerp(0.2, 0.6, 1.0 - (this.escapeDelay / 0.9));
            this.rotateTowards(lookTarget, panicTurnSpeed);

            if (this.escapeTimer >= this.escapeDuration) {
                this.isEscaping = false;
                this.state = 'IDLE';
                this.idleTimer = 0;
                this.ratModel.position.y = 0.1;
            }
        } else {
            this.ratModel.position.y = 0.1; 
            if (this.state === 'IDLE' && this.guessedPosition.lengthSq() > 0) {
                this.rotateTowards(this.guessedPosition.clone());
            }
        }

        for (const otherRat of this.nearbyRats) {
            if (!otherRat.collisionSphere || otherRat.isPinned || otherRat.isConsumed) continue;
            resolveSphereOverlapXZ(
                this.ratContainer.position,
                this.collisionSphere.radius,
                otherRat.ratContainer.position,
                otherRat.collisionSphere.radius,
                this.ratContainer.position,
                otherRat.ratContainer.position
            );
        }

        if (this.debugVisionSphere) {
            this.debugVisionSphere.position.copy(this.visionSphere.center);
        }
    }
}