import * as THREE from 'three';
import { Entity } from '../core/entity.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { clampPositionToArena, resolveSphereOverlapXZ, applyTerrainPose, nudgePointFromArenaEdge } from '../core/collision.js';
import { moveRatOnGround } from './ratMovement.js';
import { syncPouncerGuardAnchor } from './ratSpawn.js';
import { createAvoidDebugGroup, syncAvoidSpotDebug, disposeAvoidDebug } from './ratAvoidDebug.js';
import {
    getAllConversationPhrases,
    getAllEatPanicPhrases,
    interruptRatConversation,
    RAT_KIND_DEBUG_COLOR
} from './ratConversation.js';
import { getAllRoastPhrases, releaseAfterMiss, updateRoast } from './ratRoast.js';
import {
    tryStartScoutInvestigation,
    updateRatInvestigation,
    getAllInvestigationPhrases
} from './ratInvestigation.js';
import { updateScoutEscort, getAllCouncilResponsePhrases } from './ratCouncilResponse.js';
import { getAllKillPanicPhrases } from './ratKillPanic.js';
import { debugSettings } from '../core/debugSettings.js';
import { isPointInVisionCone, createVisionConeHelper } from './ratVision.js';
import { getRatKindConfig } from './ratConfig.js';
import {
    createAvoidanceList,
    alertRatsNearPouncer,
    steerDestinationFromAvoidance,
    pruneAvoidSpots
} from './ratIntel.js';
import { senseCat, threatLevelFromSenses, shouldFleeNow, shouldPouncerBreakCatAim } from './ratDetection.js';
import {
    startScoutWarning,
    updateScoutWarning,
    handleScoutIntel as runScoutIntel
} from './ratScout.js';
import {
    beginPouncerEngage,
    updatePouncerEngage as runPouncerEngage,
    canPouncerEngage,
    cancelPouncerEngage,
    getAllPouncerTauntPhrases
} from './ratPouncer.js';

const RAT_MODELS = {
    dumb: '/models/rat-dumb.glb',
    scout: '/models/rat-scout.glb',
    pouncer: '/models/rat-pouncer.glb'
};

const POUNCER_STAY_RADIUS = 3.35;

export class Rat {
    constructor(scene, kind = 'dumb', index = 0) {
        this.scene = scene;
        this.kind = RAT_MODELS[kind] ? kind : 'dumb';
        this.kindConfig = getRatKindConfig(this.kind);
        this.ratModel = null;

        this.visionSphere = new THREE.Sphere();
        this.collisionSphere = new THREE.Sphere();
        this.visionRange = this.kindConfig.visionRange;
        this.visionHalfAngleDeg = this.kindConfig.visionHalfAngleDeg;
        this.isAlerted = false;
        this.alertCooldown = 0;
        this.debugVisionCone = null;
        this.threatMeter = 0;
        this.avoidSpots = createAvoidanceList();
        this.avoidDebugMarkers = [];
        this.avoidDebugGroup = createAvoidDebugGroup(scene);
        this.avoidDebugSyncTimer = Math.random() * 0.1;
        this.pouncerGuardCheckTimer = Math.random() * 0.8;
        this.informedByScout = null;
        this.worldTime = 0;
        this.scoutBroadcastTimer = 0;
        this.pouncerAlarmCooldown = 0;
        this.guardClusterCenter = null;
        this.guardDumbRat = null;
        this.getAllRats = () => [];
        this.headingYaw = Math.random() * Math.PI * 2;
        this.isInvestigating = false;
        this.investigatePoint = null;
        this.investigatePartner = null;
        this.investigateTimer = 0;
        this.investigateChatted = false;
        this.roastTimer = 0;
        this.roastFleeFrom = null;
        this.isEscorting = false;
        this.escortPartner = null;
        this.escortTimer = 0;
        this.isBeingEscorted = false;
        this.escortLeader = null;

        const debugVisionGeo = new THREE.SphereGeometry(2.5, 16, 16);
        const kindColor = RAT_KIND_DEBUG_COLOR[this.kind] ?? RAT_KIND_DEBUG_COLOR.dumb;
        const debugVisionMat = new THREE.MeshBasicMaterial({
            color: kindColor,
            wireframe: true,
            transparent: true,
            opacity: 0.42,
            depthWrite: false
        });
        this.debugVisionSphere = new THREE.Mesh(debugVisionGeo, debugVisionMat);
        this.debugVisionSphere.visible = debugSettings.showWireframes;
        this.scene.add(this.debugVisionSphere);
        this._debugVisionBaseRadius = 2.5;
        this._debugKindColor = kindColor;

        this.guessedPosition = new THREE.Vector3(0, 0, 0);
        const debugGuessGeo = new THREE.SphereGeometry(0.3, 8, 8);
        const debugGuessMat = new THREE.MeshBasicMaterial({ color: 0xffff00, wireframe: true });
        this.guessMesh = new THREE.Mesh(debugGuessGeo, debugGuessMat);
        this.guessMesh.visible = debugSettings.showWireframes;
        this.scene.add(this.guessMesh);

        this.state = 'IDLE';
        this.idleTimer = 0;
        this.idleDuration = 2.0;
        this.targetDestination = new THREE.Vector3();
        this.listenTimer = 0;
        this.listenScanPhase = 0;
        this.turnTimer = 0;
        this.scanYaw = Math.random() * Math.PI * 2;

        const debugTargetGeo = new THREE.BoxGeometry(0.4, 0.4, 0.4);
        const debugTargetMat = new THREE.MeshBasicMaterial({ color: 0xff00ff, wireframe: true });
        this.debugTargetMesh = new THREE.Mesh(debugTargetGeo, debugTargetMat);
        this.debugTargetMesh.visible = debugSettings.showWireframes;
        this.scene.add(this.debugTargetMesh);

        this.ratSpeed = this.kindConfig.wanderSpeed;
        this.nearbyRats = [];
        this.isSpeaking = false;
        this.chatBubbleSprite = null;
        this.chatTimeout = null;
        this.groupUpdateTimer = Math.random();
        this.groupRadius = 6.5;
        this.groupUpdateInterval = 0.45;

        const bubbleColors = ['#ff5733', '#33ff57', '#3357ff', '#f3ff33', '#ff33f3', '#33fff3', '#ff9133'];
        this.chatColor = bubbleColors[Math.floor(Math.random() * bubbleColors.length)];

        this.conversationTopics = [
            'Squeak squeak!',
            'Nibble nibble...',
            'Too bright out here...'
        ];
        this.alertTopic = "Quiet! Someone's moving.";
        this.panicTopic = 'OH MY GODD';
        this.scoutTopic = 'Cat that way!';
        this.pouncerTopic = 'Your move, cat.';

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

        const ringGeo = new THREE.RingGeometry(0.32, 0.52, 14);
        const ringMat = new THREE.MeshBasicMaterial({
            color: this._debugKindColor,
            wireframe: true,
            transparent: true,
            opacity: 0.95,
            side: THREE.DoubleSide,
            depthWrite: false
        });
        this.debugKindRing = new THREE.Mesh(ringGeo, ringMat);
        this.debugKindRing.rotation.x = -Math.PI / 2;
        this.debugKindRing.position.y = 0.06;
        this.debugKindRing.visible = debugSettings.showWireframes;
        this.ratContainer.add(this.debugKindRing);

        const poleGeo = new THREE.CylinderGeometry(0.03, 0.03, 0.55, 6);
        const poleMat = new THREE.MeshBasicMaterial({
            color: this._debugKindColor,
            wireframe: true,
            transparent: true,
            opacity: 0.85
        });
        this.debugKindPole = new THREE.Mesh(poleGeo, poleMat);
        this.debugKindPole.position.y = 0.35;
        this.debugKindPole.visible = debugSettings.showWireframes;
        this.ratContainer.add(this.debugKindPole);

        this.targetQuaternion = new THREE.Quaternion();
        this.tempMatrix = new THREE.Matrix4();
        this.turnSlerpSpeed = 0.14;

        this.escapeTimer = 0;
        this.escapeDelay = this.kindConfig.fleeDelay;
        this.escapeDuration = this.kindConfig.fleeDuration;
        this.isEscaping = false;
        this.isEngaging = false;
        this.engageTimer = 0;
        this.pouncerJumpPhase = 'none';
        this.leapTimer = 0;
        this.pouncerEngageCooldown = 0;
        this.pouncerCircleSign = 1;
        this.isWarning = false;
        this.warningTimer = 0;
        this.warningBroadcastTimer = 0;
        this.warnTargetRat = null;
        this.scoutHearBroadcastTimer = 0;
        this.hearHoldTimer = 0;
        this._wasHearingCat = false;
        this.currentEscapeDir = new THREE.Vector3();
        this.encounterTime = 0;
        this.hasStunnedCat = false;
        this.conversationId = null;
        this.conversationSlot = 0;

        this.isPinned = false;
        this.isConsumed = false;
        this.flipProgress = 0;
        this.isFlipping = false;
        this.consumeProgress = 0;

        this.loadModel();
    }

    initChatTextures() {
        this.prerenderedTextures = {};
        const allPhrases = [
            ...this.conversationTopics,
            ...getAllConversationPhrases(),
            ...getAllRoastPhrases(),
            ...getAllInvestigationPhrases(),
            ...getAllEatPanicPhrases(),
            ...getAllCouncilResponsePhrases(),
            ...getAllKillPanicPhrases(),
            ...getAllPouncerTauntPhrases(),
            this.alertTopic,
            this.panicTopic,
            this.scoutTopic,
            this.pouncerTopic
        ];

        for (const quote of allPhrases) {
            const canvas = document.createElement('canvas');
            canvas.width = 256;
            canvas.height = 128;
            const context = canvas.getContext('2d');

            context.clearRect(0, 0, canvas.width, canvas.height);
            context.fillStyle = this.chatColor;
            context.beginPath();
            if (context.roundRect) context.roundRect(10, 10, 236, 80, 16);
            else context.rect(10, 10, 236, 80);
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
        loader.load(
            modelPath,
            (gltf) => {
                this.ratModel = gltf.scene;
                this.ratModel.position.set(0, 0.1, 0);
                this.ratModel.rotation.y = Math.PI;
                this.ratModel.scale.set(0.15, 0.15, 0.15);

                this.ratModel.traverse((child) => {
                    if (child.isMesh) child.castShadow = true;
                });

                this.visionSphere.radius = this.visionRange;
                this.collisionSphere.radius = 0.35;
                this.visionSphere.center.copy(this.ratContainer.position);
                this.collisionSphere.center.copy(this.ratContainer.position);
                this.ratContainer.add(this.ratModel);

                const coneMat = new THREE.MeshBasicMaterial({
                    color: RAT_KIND_DEBUG_COLOR[this.kind] ?? RAT_KIND_DEBUG_COLOR.dumb,
                    wireframe: true,
                    transparent: true,
                    opacity: 0.38,
                    depthWrite: false
                });
                this.debugVisionCone = createVisionConeHelper(
                    this.visionRange,
                    this.visionHalfAngleDeg,
                    coneMat
                );
                this.debugVisionCone.visible = debugSettings.showWireframes;
                this.ratContainer.add(this.debugVisionCone);

                Entity.appendEntity('entity', this, 2);
            },
            undefined,
            (err) => console.error(`Failed to load rat model (${this.kind}):`, err)
        );
    }

    setDebugVisible(visible) {
        if (this.debugVisionSphere) this.debugVisionSphere.visible = visible;
        if (this.debugVisionCone) this.debugVisionCone.visible = visible;
        if (this.guessMesh) this.guessMesh.visible = visible;
        if (this.debugTargetMesh) this.debugTargetMesh.visible = visible;
        if (this.avoidDebugGroup) this.avoidDebugGroup.visible = visible;
        if (this.debugKindRing) this.debugKindRing.visible = visible;
        if (this.debugKindPole) this.debugKindPole.visible = visible;
    }

    receiveNeighborAlarm(catPos, distFromPouncer, now) {
        const cfg = this.kindConfig;
        const urgency = 1 - distFromPouncer / (cfg.notifyRadius ?? 7);
        let bump = 0.4 + urgency * 0.45;
        if (this.kind === 'dumb') bump *= 0.45;
        this.threatMeter = Math.max(this.threatMeter, bump);
        this.markAlerted(2.5);
        pruneAvoidSpots(this.avoidSpots, now);
    }

    interruptForSoundCheck() {
        if (this.state === 'WALKING' || this.state === 'TURNING' || this.state === 'IDLE') {
            this.state = 'LISTENING';
            this.listenTimer = 0;
        }
    }

    isCheckingSurroundings(senses) {
        const cfg = this.kindConfig;
        if (!senses.canHear && this.hearHoldTimer <= 0) return false;
        return this.listenTimer < cfg.minSurroundingsCheck || this.hearHoldTimer > 0;
    }

    updateSoundReaction(delta, senses, catCenter, ratPos) {
        const cfg = this.kindConfig;
        const hearing = senses.canHear || this.hearHoldTimer > 0;

        if (senses.canHear) {
            this.hearHoldTimer = 0.65;
            this.updateGuessPosition(catCenter, this.visionSphere.center, senses.perceivedDecibels);
            if (!this._wasHearingCat) {
                this._wasHearingCat = true;
                this.interruptForSoundCheck();
            }
        } else {
            this._wasHearingCat = false;
            this.hearHoldTimer = Math.max(0, this.hearHoldTimer - delta);
        }

        if (!hearing) return false;

        this.listenScanPhase += delta * cfg.listenSweepSpeed;
        this.listenTimer += delta;

        const turn =
            this.kind === 'dumb'
                ? cfg.turnSpeed * 0.75
                : this.kind === 'scout'
                  ? cfg.turnSpeed * 1.35
                  : cfg.turnSpeed * 1.15;
        this.lookAtHeardSound(ratPos, turn);
        this.sweepWhileListening(ratPos, delta, cfg);

        if (Math.random() < 0.0025) this.showChatBubble(this.alertTopic);
        return this.isCheckingSurroundings(senses);
    }

    sweepWhileListening(ratPos, delta, cfg) {
        const sweep = Math.sin(this.listenScanPhase) * THREE.MathUtils.degToRad(28);
        const look = this.guessedPosition.clone();
        look.y = ratPos.y;
        const offset = new THREE.Vector3(Math.sin(sweep) * 2, 0, Math.cos(sweep) * 2);
        look.add(offset);
        this.rotateTowards(look, cfg.turnSpeed * 0.85);
    }

    updateScoutSearch(delta, senses, catCenter) {
        if (this.kind !== 'scout' || this.isEscaping || this.isEngaging) return;

        if (senses.canSee) {
            this.rotateTowards(catCenter, this.kindConfig.turnSpeed * 1.5);
            return;
        }

        if (senses.bushHidden) return;

        this.scanYaw += delta * this.kindConfig.scanTurnSpeed * 2.8;
        const look = this.ratContainer.position.clone();
        look.x += Math.sin(this.scanYaw) * 2.2;
        look.z += Math.cos(this.scanYaw) * 2.2;
        this.rotateTowards(look, this.kindConfig.scanTurnSpeed * 1.15);
    }

    markAlerted(duration = 2.5) {
        this.isAlerted = true;
        this.alertCooldown = duration;
    }

    updateGuessPosition(catCenter, ratCenter, perceivedDb = 50) {
        const cfg = this.kindConfig;
        const distance = catCenter.distanceTo(ratCenter);
        const error =
            (12 * (1 - Math.min(perceivedDb / 75, 1)) + distance * 0.08) * cfg.guessErrorMult;
        const guessedX = catCenter.x + (Math.random() - 0.5) * error;
        const guessedZ = catCenter.z + (Math.random() - 0.5) * error;

        this.guessedPosition.set(guessedX, 0, guessedZ);
        if (this.guessMesh) this.guessMesh.position.set(guessedX, 0.2, guessedZ);
    }

    rotateTowards(targetPos, customSpeed = null, delta = 0.016) {
        const ratPos = this.ratContainer.position;
        const dx = targetPos.x - ratPos.x;
        const dz = targetPos.z - ratPos.z;
        if (dx * dx + dz * dz > 1e-6) {
            const targetYaw = Math.atan2(dx, dz);
            let yawDelta = targetYaw - this.headingYaw;
            while (yawDelta > Math.PI) yawDelta -= Math.PI * 2;
            while (yawDelta < -Math.PI) yawDelta += Math.PI * 2;
            const base = this.isEscaping ? cfgTurnEscape(this) : this.kindConfig.turnSpeed;
            const turnRate = customSpeed !== null ? customSpeed : base;
            this.headingYaw += yawDelta * Math.min(1, turnRate * 3.5);
        }
    }

    lookAtHeardSound(ratPos, turnSpeed) {
        const target = this.guessedPosition.clone();
        target.y = ratPos.y;

        const toSound = new THREE.Vector3().subVectors(target, ratPos);
        toSound.y = 0;
        if (toSound.lengthSq() > 0.02) {
            toSound.normalize();
            const wiggle = Math.sin(this.listenScanPhase) * THREE.MathUtils.degToRad(16);
            toSound.applyAxisAngle(new THREE.Vector3(0, 1, 0), wiggle);
            target.copy(ratPos).add(toSound);
        }

        this.rotateTowards(target, turnSpeed);
    }

    beginFlee(catPos, reason = 'panic') {
        if (this.isEscaping || this.isEngaging) return;
        if (this.isBeingEscorted || this.isEscorting) return;
        if (
            this.kind === 'scout' &&
            reason === 'sight' &&
            !this.isInvestigating
        ) {
            const roster = this.getAllRats();
            if (tryStartScoutInvestigation(this, catPos, roster.length ? roster : [])) {
                return;
            }
        }
        interruptRatConversation(this);
        this.isWarning = false;
        this.warnTargetRat = null;
        this.isEscaping = true;
        this.escapeTimer = 0;
        this.state = 'ESCAPING';
        this.isSpeaking = true;
        this.markAlerted(4);
        this.encounterTime += 1;

        const cfg = this.kindConfig;
        const ratPos = this.ratContainer.position;
        const baseDirAway = new THREE.Vector3().subVectors(ratPos, catPos);
        baseDirAway.y = 0;
        if (baseDirAway.lengthSq() < 0.01) {
            baseDirAway.set(Math.random() - 0.5, 0, Math.random() - 0.5);
        }
        baseDirAway.normalize();

        if (this.kind === 'dumb') {
            const wrong =
                (Math.random() - 0.5) * cfg.directionErrorRad +
                (Math.random() < 0.35 ? Math.PI * 0.5 : 0);
            this.currentEscapeDir.copy(baseDirAway).applyAxisAngle(new THREE.Vector3(0, 1, 0), wrong);
            this.escapeDelay = cfg.fleeDelay + Math.random() * 0.35;
            this.showChatBubble(this.panicTopic);
        } else if (this.kind === 'scout') {
            const jitter = (Math.random() - 0.5) * 0.45;
            this.currentEscapeDir.copy(baseDirAway).applyAxisAngle(new THREE.Vector3(0, 1, 0), jitter);
            this.escapeDelay = cfg.fleeDelay;
            this.showChatBubble(reason === 'sight' ? this.scoutTopic : this.panicTopic);
        } else {
            this.currentEscapeDir.copy(baseDirAway);
            this.escapeDelay = cfg.fleeDelay;
            this.showChatBubble(reason === 'panic' ? 'Fine — backing off.' : this.pouncerTopic);
        }

        this.escapeDuration =
            this.kind === 'pouncer'
                ? (cfg.braveRetreatDuration ?? cfg.fleeDuration ?? 1.35)
                : cfg.fleeDuration;
        this.ratSpeed = cfg.fleeSpeed;
    }

    handlePouncerAlarm(senses, catCenter, now) {
        if (this.kind !== 'pouncer' || this.pouncerAlarmCooldown > 0) return;
        if (senses.bushHidden) return;
        const detected =
            senses.canSee ||
            (senses.canHear && senses.perceivedDecibels >= this.kindConfig.alertHearingDb);
        if (!detected) return;

        alertRatsNearPouncer(this, catCenter, this.kindConfig.avoidSpotTtl ?? 18, now);
        this.pouncerAlarmCooldown = this.kindConfig.alarmCooldown;
    }

    pickRandomDestination(now) {
        if (this.kind === 'pouncer' && this.guardDumbRat) {
            syncPouncerGuardAnchor(this);
        }

        let radius = 2.5 + Math.random() * 3.5;
        if (this.kind === 'pouncer' && this.guardClusterCenter) {
            radius *= 0.55;
        }
        const angle = Math.random() * Math.PI * 2;

        let randomX = this.ratContainer.position.x + Math.cos(angle) * radius;
        let randomZ = this.ratContainer.position.z + Math.sin(angle) * radius;

        if (this.guardClusterCenter) {
            const leash = this.kind === 'pouncer' ? 0.72 : 0.45;
            randomX = THREE.MathUtils.lerp(randomX, this.guardClusterCenter.x, leash);
            randomZ = THREE.MathUtils.lerp(randomZ, this.guardClusterCenter.z, leash);
        }

        if (this.kind === 'pouncer' && this.guardDumbRat?.ratContainer) {
            const dumbPos = this.guardDumbRat.ratContainer.position;
            const dist = this.ratContainer.position.distanceTo(dumbPos);
            if (dist > POUNCER_STAY_RADIUS) {
                randomX = THREE.MathUtils.lerp(randomX, dumbPos.x, 0.85);
                randomZ = THREE.MathUtils.lerp(randomZ, dumbPos.z, 0.85);
            }
        }

        this.targetDestination.set(randomX, this.ratContainer.position.y, randomZ);
        steerDestinationFromAvoidance(this.avoidSpots, this.ratContainer.position, this.targetDestination, now, 2.2);
        nudgePointFromArenaEdge(this.targetDestination);
        clampPositionToArena(this.targetDestination);
        if (this.debugTargetMesh) this.debugTargetMesh.position.copy(this.targetDestination);
    }

    canBePounced() {
        if (!this.ratModel || !this.ratContainer || this.isPinned || this.isConsumed) return false;
        if (this.kind === 'pouncer' && this.isEngaging) return false;
        return true;
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
        this.isEngaging = false;
        this.pouncerJumpPhase = 'none';
        this.state = 'PINNED';
        this.flipProgress = 0;
        this.isFlipping = false;
        this.hasStunnedCat = false;
        this.hideChat();
        if (this.ratModel) this.ratModel.position.y = 0.1;
    }

    playFlip() {
        this.isFlipping = true;
        this.flipProgress = 0;
    }

    updateFlip(delta) {
        if (!this.ratModel || !this.isPinned) return;
        if (this.isFlipping) this.flipProgress = Math.min(1, this.flipProgress + delta * 4.2);
        const t = this.flipProgress;
        this.ratModel.rotation.x = t * Math.PI;
        const lift = Math.sin(t * Math.PI) * 0.28;
        this.ratModel.position.y = 0.12 + t * 0.06 + lift;
    }

    releaseAndFlee(catPos) {
        releaseAfterMiss(this, catPos);
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
        if (this.ratModel) this.ratModel.rotation.x = Math.PI;
        return t >= 1;
    }

    dispose() {
        this.isConsumed = true;
        this.hideChat();
        if (this.chatTimeout) clearTimeout(this.chatTimeout);
        if (this.debugVisionSphere) this.scene.remove(this.debugVisionSphere);
        if (this.guessMesh) this.scene.remove(this.guessMesh);
        if (this.debugTargetMesh) this.scene.remove(this.debugTargetMesh);
        disposeAvoidDebug(this);
        this.scene.remove(this.ratContainer);
        for (const texture of Object.values(this.prerenderedTextures)) {
            texture.dispose?.();
        }
        Entity.removeEntity(this);
    }

    ensureChatTexture(text) {
        if (this.prerenderedTextures[text]) return this.prerenderedTextures[text];
        const canvas = document.createElement('canvas');
        canvas.width = 256;
        canvas.height = 128;
        const context = canvas.getContext('2d');
        context.clearRect(0, 0, canvas.width, canvas.height);
        context.fillStyle = this.chatColor;
        context.beginPath();
        if (context.roundRect) context.roundRect(10, 10, 236, 80, 16);
        else context.rect(10, 10, 236, 80);
        context.fill();
        context.strokeStyle = '#ffffff';
        context.lineWidth = 4;
        context.stroke();
        context.fillStyle = '#000000';
        context.font = 'bold 14px Arial';
        context.textAlign = 'center';
        context.textBaseline = 'middle';
        context.fillText(text, 128, 50, 220);
        const texture = new THREE.CanvasTexture(canvas);
        texture.needsUpdate = true;
        this.prerenderedTextures[text] = texture;
        return texture;
    }

    showChatBubble(text) {
        if (this.chatBubbleSprite) {
            this.ratContainer.remove(this.chatBubbleSprite);
            this.chatBubbleSprite = null;
        }

        const texture = this.ensureChatTexture(text);
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

    updateNearbyRats() {
        this.nearbyRats = [];
        const allEntities = Entity.getEntitiesByType('entity');
        if (!allEntities) return;
        for (const otherEntity of allEntities) {
            if (
                otherEntity !== this &&
                otherEntity.ratContainer &&
                !otherEntity.isConsumed &&
                !otherEntity.isPinned
            ) {
                const dist = this.ratContainer.position.distanceTo(otherEntity.ratContainer.position);
                if (dist <= this.groupRadius) this.nearbyRats.push(otherEntity);
            }
        }
    }

    updateIdleBehavior(delta, senses, catCenter, now) {
        if (this.isWarning || this.state === 'CHATTING' || this.conversationId != null) return;
        const ratPos = this.ratContainer.position;

        const stillChecking = this.updateSoundReaction(delta, senses, catCenter, ratPos);
        this.updateScoutSearch(delta, senses, catCenter);

        if (stillChecking) {
            this.state = 'LISTENING';
            return;
        }

        if (this.state === 'LISTENING' && !senses.canHear && this.hearHoldTimer <= 0) {
            this.state = 'IDLE';
            this.idleTimer = 0;
            this.idleDuration = this.kind === 'dumb' ? 1.8 + Math.random() * 2.5 : 0.45 + Math.random() * 1;
            this.listenTimer = 0;
        }

        if (this.state === 'IDLE') {
            this.idleTimer += delta;
            if (this.idleTimer >= this.idleDuration) {
                this.pickRandomDestination(now);
                this.state = 'TURNING';
                this.turnTimer = 0;
            }
        } else if (this.state === 'TURNING') {
            this.turnTimer += delta;
            this.rotateTowards(this.targetDestination.clone(), this.turnSlerpSpeed);
            const forward = new THREE.Vector3(0, 0, 1).applyQuaternion(this.ratContainer.quaternion);
            const toTarget = new THREE.Vector3().subVectors(this.targetDestination, ratPos).normalize();
            toTarget.y = 0;
            if (forward.dot(toTarget) > 0.86 || this.turnTimer > 1.25) {
                this.state = 'WALKING';
                this.turnTimer = 0;
            }
        } else if (this.state === 'WALKING') {
            const dirToDest = new THREE.Vector3().subVectors(this.targetDestination, ratPos);
            dirToDest.y = 0;
            if (dirToDest.length() < 0.2) {
                this.state = 'IDLE';
                this.idleTimer = 0;
                this.idleDuration =
                    this.kind === 'dumb' ? 2 + Math.random() * 3 : 1 + Math.random() * 2;
            } else {
                dirToDest.normalize();
                const walkRate = this.kind === 'scout' ? this.ratSpeed * 0.82 : this.ratSpeed;
                moveRatOnGround(this, dirToDest.x, dirToDest.z, walkRate, delta);
                this.rotateTowards(this.targetDestination.clone());
            }
        }
    }

    updateEscape(delta, catCenter) {
        this.escapeTimer += delta;
        const cfg = this.kindConfig;

        if (this.escapeTimer >= this.escapeDelay) {
            const escapeSpeed = Math.min(cfg.fleeSpeed * (1 + this.encounterTime * 0.1), 6.25);
            moveRatOnGround(this, this.currentEscapeDir.x, this.currentEscapeDir.z, escapeSpeed, delta);
            this.ratModel.position.y = 0.1;
        } else {
            const jumpProgress = this.escapeTimer / Math.max(this.escapeDelay, 0.01);
            const hop = Math.sin(jumpProgress * Math.PI) * (this.kind === 'dumb' ? 0.35 : 0.55);
            this.ratModel.position.y = 0.1 + Math.max(0, hop);
        }

        const lookTarget = this.ratContainer.position.clone().add(this.currentEscapeDir);
        this.rotateTowards(lookTarget, cfg.turnSpeed * 1.8);

        if (this.escapeTimer >= this.escapeDuration) {
            this.isEscaping = false;
            this.state = 'IDLE';
            this.idleTimer = 0;
            this.ratModel.position.y = 0.1;
            this.ratSpeed = cfg.wanderSpeed;
            this.threatMeter = 0;
            if (this.kind === 'pouncer') {
                this.hasStunnedCat = false;
                this.pouncerEngageCooldown = Math.min(
                    this.pouncerEngageCooldown,
                    cfg.engageCooldown * 0.35
                );
            }
            this.markAlerted(1);
        }
    }

    update(deltaTime) {
        if (!this.ratModel || !Entity.player || this.isConsumed) return;

        this.worldTime += deltaTime;
        const now = this.worldTime;

        if (this.isPinned) {
            this.ratModel.getWorldPosition(this._worldPosition);
            this.visionSphere.center.copy(this._worldPosition);
            this.collisionSphere.center.set(
                this._worldPosition.x,
                this.ratContainer.position.y + 0.2,
                this._worldPosition.z
            );
            this.updateFlip(deltaTime);
            if (this.debugVisionSphere) this.debugVisionSphere.position.copy(this.visionSphere.center);
            return;
        }

        if (this.state === 'ROASTING') {
            updateRoast(this, deltaTime);
            applyTerrainPose(this.ratContainer, this.headingYaw, 0, deltaTime);
            return;
        }

        if (this.pouncerAlarmCooldown > 0) this.pouncerAlarmCooldown -= deltaTime;
        if (this.pouncerEngageCooldown > 0) this.pouncerEngageCooldown -= deltaTime;

        this.groupUpdateTimer += deltaTime;
        if (this.groupUpdateTimer >= this.groupUpdateInterval) {
            this.groupUpdateTimer = 0;
            this.updateNearbyRats();
        }

        if (this.alertCooldown > 0) {
            this.alertCooldown -= deltaTime;
            if (this.alertCooldown <= 0) {
                this.alertCooldown = 0;
                this.isAlerted = false;
            }
        }

        pruneAvoidSpots(this.avoidSpots, now);

        const playerEntity = Entity.player.entity;
        const ratPos = this.ratContainer.position;
        const catCenter = playerEntity.aerialSphere.center;

        this.ratModel.getWorldPosition(this._worldPosition);
        this.visionSphere.center.copy(this._worldPosition);
        this.collisionSphere.center.set(this._worldPosition.x, ratPos.y + 0.2, this._worldPosition.z);

        const senses = senseCat(this, playerEntity, now);
        const directCollision = playerEntity.collisionSphere.intersectsSphere(this.collisionSphere);
        let threatLevel = threatLevelFromSenses(this, senses, directCollision);

        if (this.nearbyRats.some((r) => r.isEscaping && r !== this)) {
            threatLevel = Math.min(1, threatLevel + 0.25);
        }

        const cfg = this.kindConfig;
        if (senses.bushHidden && !directCollision) {
            this.threatMeter = Math.max(0, this.threatMeter - deltaTime * 1.65);
        } else if (threatLevel > 0.08) {
            const reactionScale = this.kind === 'dumb' ? 1 / cfg.reactionTime : 1;
            let build = cfg.threatBuildRate * threatLevel * reactionScale;
            if (this.kind === 'pouncer' && !this.isEngaging) build *= 0.55;
            this.threatMeter += deltaTime * build;
        } else {
            const decay = this.kind === 'pouncer' ? 0.55 : 0.35;
            this.threatMeter = Math.max(0, this.threatMeter - deltaTime * decay);
        }

        const allRats = this.getAllRats();
        const intelTargets = allRats.length ? allRats : Entity.getEntitiesByType('entity') ?? [];
        if (this.kind === 'scout') {
            this.scoutBroadcastTimer = Math.max(0, this.scoutBroadcastTimer - deltaTime);
            this.scoutHearBroadcastTimer = Math.max(0, this.scoutHearBroadcastTimer - deltaTime);
        }
        runScoutIntel(this, senses, catCenter, intelTargets, now);
        this.handlePouncerAlarm(senses, catCenter, now);

        if (shouldPouncerBreakCatAim(this, playerEntity, senses)) {
            interruptRatConversation(this);
            cancelPouncerEngage(this);
            this.showChatBubble('Not today!');
            this.beginFlee(catCenter, 'panic');
        }

        if (senses.bushHidden && !directCollision) {
            if (this.isWarning) {
                this.isWarning = false;
                this.warnTargetRat = null;
                if (this.state === 'WARNING') this.state = 'IDLE';
            }
        }

        if (this.isInvestigating) {
            updateRatInvestigation(this, deltaTime, catCenter, senses);
        } else if (this.isEscorting) {
            updateScoutEscort(this, deltaTime, catCenter);
        } else if (this.isBeingEscorted) {
            if (!this.escortLeader?.isEscorting) {
                this.isBeingEscorted = false;
                this.escortLeader = null;
                if (this.state === 'ESCORTED') this.state = 'IDLE';
            }
        } else if (this.isEngaging) {
            runPouncerEngage(this, deltaTime, catCenter, playerEntity, senses);
        } else if (this.isWarning) {
            const warnResult = updateScoutWarning(this, deltaTime, catCenter, intelTargets, now, senses);
            if (warnResult === 'flee') {
                this.beginFlee(catCenter, 'sight');
            }
        } else if (this.isEscaping) {
            this.updateEscape(deltaTime, catCenter);
        } else if (this.conversationId != null) {
            if (senses.canSee && !senses.bushHidden && senses.distance <= (cfg.visionRange ?? 3) + 1.2) {
                interruptRatConversation(this);
            }
        } else {
            const fleeReady =
                shouldFleeNow(this, senses, threatLevel, directCollision) &&
                (this.kind !== 'dumb' || directCollision || this.threatMeter >= 1);

            if (
                this.kind === 'scout' &&
                senses.canSee &&
                !senses.bushHidden &&
                senses.distance > (cfg.scoutFleeDist ?? 3.15)
            ) {
                interruptRatConversation(this);
                startScoutWarning(this, catCenter, intelTargets, now);
            } else if (
                this.kind === 'pouncer' &&
                (canPouncerEngage(senses, senses.distance, cfg) ||
                    (senses.canSee && senses.distance <= (cfg.engageRange ?? 5) + 0.3))
            ) {
                beginPouncerEngage(this, catCenter);
            } else if (fleeReady) {
                this.beginFlee(catCenter, senses.canSee ? 'sight' : 'panic');
            } else {
                this.updateIdleBehavior(deltaTime, senses, catCenter, now);
            }
        }

        if (
            !this.isEngaging &&
            !this.isEscaping &&
            !this.isWarning &&
            !this.isInvestigating &&
            !this.isEscorting &&
            !this.isBeingEscorted &&
            !this.conversationId
        ) {
            this.ratModel.position.y = 0.1;
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
            const scale = this.visionRange / this._debugVisionBaseRadius;
            this.debugVisionSphere.scale.setScalar(scale);
        }

        if (
            this.kind === 'pouncer' &&
            this.guardDumbRat?.ratContainer &&
            !this.isEngaging &&
            !this.isEscaping &&
            !this.isWarning &&
            !this.isInvestigating &&
            !this.isEscorting &&
            !this.isBeingEscorted &&
            (this.state === 'IDLE' || this.state === 'WALKING' || this.state === 'TURNING')
        ) {
            this.pouncerGuardCheckTimer -= deltaTime;
            if (this.pouncerGuardCheckTimer <= 0) {
                this.pouncerGuardCheckTimer = 1.15;
                syncPouncerGuardAnchor(this);
                const dumbPos = this.guardDumbRat.ratContainer.position;
                const dist = this.ratContainer.position.distanceTo(dumbPos);
                if (dist > POUNCER_STAY_RADIUS + 1.2) {
                    this.pickRandomDestination(now);
                    this.state = 'TURNING';
                    this.turnTimer = 0;
                }
            }
        }

        this.avoidDebugSyncTimer += deltaTime;
        if (debugSettings.showWireframes && this.avoidDebugSyncTimer >= 0.12) {
            this.avoidDebugSyncTimer = 0;
            syncAvoidSpotDebug(this, now);
        }

        applyTerrainPose(this.ratContainer, this.headingYaw, 0, this.conversationId != null ? 0 : deltaTime);
    }
}

function cfgTurnEscape(rat) {
    return THREE.MathUtils.lerp(0.12, 0.45, Math.min(rat.encounterTime * 0.15, 1));
}
