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
        this.guessMesh = null;

        // Idle & Wandering State Variables
        this.state = 'IDLE'; // 'IDLE', 'TURNING', 'WALKING'
        this.idleTimer = 0;
        this.idleDuration = 2.0; 
        this.targetDestination = new THREE.Vector3();
        this.debugTargetMesh = null;
        this.ratSpeed = 1.0; 

        // --- Grouping & Speech Configuration ---
        this.stayInGroup = true;         
        this.groupRadius = 6.0;          
        this.groupingWeight = 0.4;       
        this.nearbyRats = [];            
        this.isSpeaking = false;         
        this.chatBubbleSprite = null;
        this.chatTimeout = null;
        this.groupUpdateTimer = Math.random(); 

        // Unique vibrant color hex for this rat's chat bubbles
        const bubbleColors = ['#ff5733', '#33ff57', '#3357ff', '#f3ff33', '#ff33f3', '#33fff3', '#ff9133'];
        this.chatColor = bubbleColors[Math.floor(Math.random() * bubbleColors.length)];

        // General casual chatter (excludes the alert warning)
        this.conversationTopics = [
            "Squeak squeak!",
            "Is there cheese around?",
            "Keep your voice down!",
            "Did you hear that?",
            "Run if the cat comes!",
            "Nibble nibble...",
            "Stay close to the group.",
            "Found some crumbs earlier!",
            "Too bright out here...",
            "Let's hide under the floorboards.",
            "Did you see the big paws?"
        ];

        // Specific alert warning when player is moving in vision
        this.alertTopic = "Quiet! Someone's moving.";
        
        this.prerenderedTextures = {};
        this.initChatTextures();

        this._worldPosition = new THREE.Vector3();
        this.ratContainer = new THREE.Group();

        // --- DEBUG SPAWN: Spawning at 0,0,0 ---
        this.ratContainer.position.set(0, 0, 0);

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
        this.fearTimer = 0;

        this.loadModel();
    }

    // Pre-create textures for all conversation phrases and the alert warning
    initChatTextures() {
        const canvas = document.createElement('canvas');
        canvas.width = 256;
        canvas.height = 128;
        const context = canvas.getContext('2d');

        this.prerenderedTextures = {};
        const allPhrases = [...this.conversationTopics, this.alertTopic];

        for (const quote of allPhrases) {
            context.clearRect(0, 0, 256, 128);

            context.fillStyle = this.chatColor; 
            context.beginPath();
            if (context.roundRect) context.roundRect(10, 10, 236, 80, 16);
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
            this.prerenderedTextures[quote] = texture;
        }
        
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

            this.visionSphere.radius = 1;
            this.ratContainer.add(this.ratModel);
            Entity.appendEntity("entity", this, 2);
        }, undefined, (err) => console.log(err));
    }

    updateGuessPosition(catCenter, ratCenter) {
        const distance = catCenter.distanceTo(ratCenter);
        const sourceDb = 80;       
        const attenuation = 100;    
        const db = Math.max(sourceDb - attenuation * Math.log10(Math.max(distance, 0.1)), 0);
                
        const error = 10 * (1 - Math.min(db / 80, 1));
        const guessedX = catCenter.x + (Math.random() - 0.5) * error;
        const guessedZ = catCenter.z + (Math.random() - 0.5) * error;
                
        this.guessedPosition.set(guessedX, 0, guessedZ);
        if (this.guessMesh) {
            this.guessMesh.position.set(guessedX, 0.2, guessedZ);
        }
    }

    rotateTowards(targetPos) {
        targetPos.y = this.ratContainer.position.y;
        const direction = new THREE.Vector3().subVectors(targetPos, this.ratContainer.position);
        const correctedTarget = this.ratContainer.position.clone().sub(direction);

        this.tempMatrix.lookAt(this.ratContainer.position, correctedTarget, new THREE.Vector3(0, 1, 0));
        this.targetQuaternion.setFromRotationMatrix(this.tempMatrix);
        this.ratContainer.quaternion.slerp(this.targetQuaternion, this.slerpSpeed);
    }

    // --- ESCAPE CODE RESTORED (COMMENTED OUT FOR DEBUGGING) ---
    triggerEscape(catPos) {
        /*
        if (!this.isEscaping) {
            this.isEscaping = true;
            this.escapeTimer = 0;
            this.currentEscapeDir.subVectors(this.ratContainer.position, catPos).normalize();
            this.currentEscapeDir.y = 0;
            this.state = 'ESCAPING';
            if (this.chatBubbleSprite) {
                this.ratContainer.remove(this.chatBubbleSprite);
                this.chatBubbleSprite = null;
            }
            this.isSpeaking = false;
        }
        */
    }

    showChatBubble(text) {
        if (this.chatBubbleSprite) {
            this.ratContainer.remove(this.chatBubbleSprite);
            this.chatBubbleSprite = null;
        }

        let texture = this.prerenderedTextures[text];
        
        if (!texture) {
            texture = this.prerenderedTextures["Squeak squeak!"];
        }

        const spriteMaterial = new THREE.SpriteMaterial({ map: texture, transparent: true });
        this.chatBubbleSprite = new THREE.Sprite(spriteMaterial);
        this.chatBubbleSprite.scale.set(1.5, 0.75, 1);
        this.chatBubbleSprite.position.set(0, 0.8, 0);
        console.log(this.chatBubbleSprite)

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

    // Casual idle small talk
    // Casual idle small talk
    async trySmallTalk() {
        if (this.nearbyRats.length > 0 && !this.isSpeaking && Entity.player && Entity.player.entity) {
            const playerEntity = Entity.player.entity;
            const isColliding = playerEntity.aerialSphere.intersectsSphere(this.visionSphere);
            
                // Check if keys are pressed OR check if the player is actively changing position
            const isMovingKeys = playerEntity.walkDirectionX !== 0 || playerEntity.walkDirectionZ !== 0;

            // Only trigger alert if colliding AND keys are pressed
            if (isColliding && isMovingKeys && Math.random() < 0.2) {
                this.isSpeaking = true;
                const catCenter = playerEntity.aerialSphere.center;
                this.rotateTowards(catCenter.clone());
                this.showChatBubble(this.alertTopic);
                this.idleDuration += 3.0;
                return;
            }

            // Standard casual chatter
            if (Math.randomStr ? false : Math.random() < 0.4) {
                this.isSpeaking = true;
                const availablePeers = this.nearbyRats.filter(r => !r.isSpeaking);
                if (availablePeers.length > 0) {
                    const partner = availablePeers[Math.floor(Math.random() * availablePeers.length)];
                    this.rotateTowards(partner.ratContainer.position.clone());

                    const randomQuote = this.conversationTopics[Math.floor(Math.random() * this.conversationTopics.length)];
                    this.showChatBubble(randomQuote);
                    this.idleDuration += 3.0; 
                } else {
                    this.isSpeaking = false;
                }
            }
        }
    }
    pickRandomDestination() {
        const radius = 3 + Math.random() * 4; 
        const angle = Math.random() * Math.PI * 2;
        
        let randomX = this.ratContainer.position.x + Math.cos(angle) * radius;
        let randomZ = this.ratContainer.position.z + Math.sin(angle) * radius;

        if (this.stayInGroup && this.nearbyRats.length > 0) {
            let centerSumX = 0;
            let centerSumZ = 0;
            
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
        if (!this.ratModel || !Entity.player) return;

        // Throttled Neighbor Checks to optimize performance
        this.groupUpdateTimer += deltaTime;
        if (this.groupUpdateTimer >= 0.3) {
            this.groupUpdateTimer = 0;
            this.nearbyRats = [];
            const allEntities = Entity.getEntitiesByType("entity"); 
            if (allEntities) {
                for (const otherEntity of allEntities) {
                    if (otherEntity !== this && otherEntity.ratContainer) {
                        const dist = this.ratContainer.position.distanceTo(otherEntity.ratContainer.position);
                        if (dist <= this.groupRadius) {
                            this.nearbyRats.push(otherEntity);
                        }
                    }
                }
            }
        }

        if (this.fearTimer > 0) {
            this.fearTimer -= deltaTime;
        } else {
            this.encounterTime = 0;
            this.escapeDelay = 0.9;
        }

        const playerEntity = Entity.player.entity;
        const catCenter = playerEntity.aerialSphere.center;
        const ratCenter = this.visionSphere.center;
        const ratPos = this.ratContainer.position;

        if (!this.isEscaping) {
            if (playerEntity.aerialSphere.intersectsSphere(this.visionSphere)) {
                if (playerEntity.stoppedMoving) {
                    this.updateGuessPosition(catCenter, ratCenter);
                }
            }
            
            // ... rest of your state machine (IDLE, TURNING, WALKING)

            // --- ESCAPE / CONTAGIOUS PANIC CODE (COMMENTED OUT FOR DEBUGGING) ---
            /*
            const targetPosition = this.guessedPosition.clone();
            targetPosition.y = ratPos.y;
            const dirToGuess = new THREE.Vector3().subVectors(targetPosition, ratPos).normalize();
            const ratForward = new THREE.Vector3(0, 0, 1).applyQuaternion(this.ratContainer.quaternion);
            
            const rotationAlignment = ratForward.dot(dirToGuess);
            let dangerDetected = false;
            if (playerEntity.collisionSphere.intersectsSphere(this.visionSphere)) {
                dangerDetected = true;
            } else if (rotationAlignment >= 0.9) {
                const maxDistance = 4;
                const distanceToCat = ratPos.distanceTo(catCenter);
                if (distanceToCat <= maxDistance) {
                    const dirToCat = new THREE.Vector3().subVectors(catCenter, ratPos).normalize();
                    const dotProduct = ratForward.dot(dirToCat);
                    const fovThreshold = 0.5;

                    if (dotProduct >= fovThreshold) {
                        dangerDetected = true;
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
                this.fearTimer = 10; 

                const baseDelay = 0.9;
                this.escapeDelay = Math.max(0.1, baseDelay - (this.encounterTime * 0.15));
            } else {
            */
            
            {
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
                    const distanceToDest = dirToDest.length();

                    if (distanceToDest < 0.2) {
                        this.state = 'IDLE';
                        this.idleTimer = 0;
                        this.idleDuration = 1.5 + Math.random() * 3.0; 
                        this.trySmallTalk();
                    } else {
                        dirToDest.normalize();
                        this.ratContainer.position.addScaledVector(dirToDest, this.ratSpeed * deltaTime);
                        this.rotateTowards(this.targetDestination.clone());
                    }
                }
            }
        }

        if (this.isEscaping) {
            this.escapeTimer += deltaTime;

            const lookTarget = ratPos.clone().add(this.currentEscapeDir);
            this.rotateTowards(lookTarget);

            if (this.escapeTimer >= this.escapeDelay) {
                const escapeSpeed = 3.5; 
                this.ratContainer.position.addScaledVector(this.currentEscapeDir, escapeSpeed * deltaTime);
            }

            if (this.escapeTimer >= this.escapeDuration) {
                this.isEscaping = false;
                this.state = 'IDLE';
                this.idleTimer = 0;
            }
        } else {
            if (this.state === 'IDLE' && this.guessedPosition.lengthSq() > 0) {
                this.rotateTowards(this.guessedPosition.clone());
            }
        }

        this.ratModel.getWorldPosition(this._worldPosition);
        this.visionSphere.center.copy(this._worldPosition);

        if (this.debugVisionSphere) {
            this.debugVisionSphere.position.copy(this.visionSphere.center);
        }
    }
}