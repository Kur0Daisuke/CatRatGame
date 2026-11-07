import * as THREE from 'three';

import { setupScene } from './scene/sceneSetup.js';

import { Player } from './game/player.js';

import { spawnRats } from './game/ratSpawn.js';

import { loadWorld } from './world/loadWorld.js';

import { createTerrain } from './world/terrain.js';

import { setTerrainSampler, setTerrainNormalSampler, applyTerrainPose } from './core/collision.js';

import { debugSettings, setWireframesVisible } from './core/debugSettings.js';

import { createSettings } from './ui/settings.js';

import { createMenu } from './ui/menu.js';

import { PounceSystem } from './systems/pounce.js';
import { EatParticleBurst } from './systems/eatParticles.js';
import { CatVfx } from './systems/catVfx.js';

import { CatSoundVisual } from './systems/soundVisual.js';

import { StaminaVisual } from './systems/staminaVisual.js';

import { PuddleWaveSystem } from './systems/puddleWaves.js';
import { updateRatConversations } from './game/ratConversation.js';
import { createBushVignette } from './ui/bushVignette.js';
import { createBushCoverHud } from './ui/bushCoverHud.js';
import { createBushCoverDebug } from './world/bushCoverDebug.js';
import { Dog } from './game/dog.js';
import { setHuntDog } from './game/huntDog.js';
import { DogCatchSystem } from './systems/dogCatch.js';
import { TreeClimbSystem } from './systems/treeClimb.js';
import { createHuntSession } from './systems/huntSession.js';
import { createTouchControls, prefersTouchControls } from './ui/touchControls.js';



if (prefersTouchControls()) document.body.classList.add('touch-ui');

const { scene, camera, renderer } = setupScene();

const terrain = createTerrain(scene, renderer);

setTerrainSampler((x, z) => terrain.getHeightAt(x, z));

setTerrainNormalSampler((x, z) => terrain.getNormalAt(x, z));

const player = new Player(scene);

applyTerrainPose(player.container, player.headingYaw, 0);

const landingY = player.container.position.y;

player.container.visible = false;

player.container.position.y = landingY + 24;

player.setControlsBlocked(true);

player.aerialSphere.center.set(15, 1000, 15);

player.sightSphere.center.set(15, 1000, 15);

player.collisionSphere.center.set(15, 1000, 15);

let phase = 'menu';

let dropTime = 0;

let landingSmokeSpawned = false;

let gardenTime = 0;

let pointerUnlockTime = -Infinity;

document.body.dataset.phase = phase;



const rats = spawnRats(scene, terrain);

const environment = loadWorld(scene, terrain);

const bushes = environment.bushes || [];

const puddles = environment.puddles || [];

const trees = environment.trees || [];

const clouds = environment.clouds;

const look = { yaw: 0, pitch: 0.4 };

const cameraDistance = 6.6;

const lookTarget = new THREE.Vector3();

const eatVfx = new EatParticleBurst(scene);

const catVfx = new CatVfx(scene);

player.catVfx = catVfx;

const pounce = new PounceSystem({ camera, renderer, player, rats, eatVfx });

const dog = new Dog(scene, player.container.position.x, player.container.position.z);
setHuntDog(dog);

const treeClimb = new TreeClimbSystem({ player, trees, camera });

const soundVisual = new CatSoundVisual(scene);

const staminaVisual = new StaminaVisual();

const puddleWaves = new PuddleWaveSystem(scene, puddles);

const hud = document.createElement('section');

hud.className = 'game-hud';

hud.setAttribute('aria-label', 'Hunter status');

hud.innerHTML = '<div class="hud-bars"></div>';

document.body.appendChild(hud);

const bushCoverHud = createBushCoverHud();
const hudStats = document.createElement('div');
hudStats.className = 'hud-stats';
hud.appendChild(hudStats);
hudStats.append(pounce.scoreEl, bushCoverHud.el, treeClimb.hudEl);

const bushVignette = createBushVignette();
const bushCoverDebug = createBushCoverDebug(scene, () => bushes);

hud.querySelector('.hud-bars').append(staminaVisual.meterEl, soundVisual.meterEl);

const staminaValue = document.createElement('span');

staminaValue.className = 'stamina-value';

staminaVisual.meterEl.appendChild(staminaValue);

let huntStarted = false;

function refillRats() {
    for (const rat of rats) rat.dispose();
    rats.length = 0;
    const fresh = spawnRats(scene, terrain);
    for (const rat of fresh) {
        rats.push(rat);
        rat.getAllRats = () => rats;
    }
}

function startDrop() {
    pounce.cancelForReset();
    treeClimb.cancelForReset();
    dogCatch.abort();
    huntSession.hideOverlay();
    huntSession.reset();
    if (huntStarted) refillRats();
    huntStarted = true;
    player.prepareDrop(15, 15);
    player.container.position.y = landingY + 24;
    player.aerialSphere.center.set(15, 1000, 15);
    player.sightSphere.center.set(15, 1000, 15);
    player.collisionSphere.center.set(15, 1000, 15);
    dog.resetFar(15, 15);
    phase = 'dropping';
    document.body.dataset.phase = phase;
    dropTime = 0;
    landingSmokeSpawned = false;
    look.yaw = 0;
    look.pitch = 0.54;
    camera.position.set(15, landingY + Math.sin(look.pitch) * cameraDistance, 15 + Math.cos(look.pitch) * cameraDistance);
    camera.lookAt(15, landingY + 0.45, 15);
}

function returnToMenu() {
    pounce.cancelForReset();
    treeClimb.cancelForReset();
    dogCatch.abort();
    huntSession.reset();
    huntSession.hideOverlay();
    phase = 'menu';
    document.body.dataset.phase = phase;
    player.container.visible = false;
    player.isDeployed = false;
    player.setControlsBlocked(true);
    gardenTime = 0;
    menu.show();
}

const settings = createSettings({
    rats,
    onChange(open) {
        player.setControlsBlocked(open || phase !== 'playing' || huntSession.isEnded());
        document.body.classList.toggle('settings-open', open);
    },
    onRestart() {
        settings.setOpen(false);
        startDrop();
    },
    onMenu() {
        settings.setOpen(false);
        returnToMenu();
    }
});

const menu = createMenu({ player, onStart() { startDrop(); } });

function selectedCatLabel() {
    const pressed = document.querySelector('.cat-option[aria-pressed="true"]');
    return pressed?.textContent?.trim() || 'Cat';
}

const huntSession = createHuntSession({
    getCatLabel: selectedCatLabel,
    onEnd() {
        player.setControlsBlocked(true);
        dogCatch.abort();
        menu.refreshHighScores();
    }
});

huntSession.setHandlers({
    onRetry() {
        settings.setOpen(false);
        startDrop();
    },
    onMenu() {
        settings.setOpen(false);
        returnToMenu();
    }
});

pounce.onRatEliminated = (remaining) => huntSession.setRatsRemaining(remaining);

const dogCatch = new DogCatchSystem({
    camera,
    renderer,
    player,
    dog,
    isPounceActive: () => pounce.isActive() || huntSession.isEnded(),
    isHuntEnded: () => huntSession.isEnded(),
    onQteStart: () => huntSession.loseLifeFromDog()
});

hudStats.prepend(huntSession.livesEl);
hudStats.prepend(huntSession.timerEl);

function applyLook(dx, dy, sensitivity) {
    if (phase !== 'playing' || settings.isOpen || pounce.controlsCamera() || dogCatch.controlsCamera() || huntSession.isEnded()) return;
    const sens = sensitivity ?? (document.pointerLockElement === renderer.domElement ? 0.0026 : 0.004);
    look.yaw -= THREE.MathUtils.clamp(dx, -80, 80) * sens;
    look.pitch = THREE.MathUtils.clamp(look.pitch + THREE.MathUtils.clamp(dy, -80, 80) * sens, 0.22, 1.15);
}

const touchControls = createTouchControls({
    player,
    canvas: renderer.domElement,
    onLook: (dx, dy) => applyLook(dx, dy, 0.0052),
    onPounce: () => pounce.requestPounce(),
    onClimb: () => treeClimb.requestUse(),
    onSkill: () => {
        if (pounce.submitSkill()) return;
        dogCatch.submitSkill();
    },
    onPause: () => {
        if (phase === 'menu' || dogCatch.isActive() || huntSession.isEnded()) return;
        settings.setOpen(!settings.isOpen);
    },
    getState: () => {
        const inPlay = phase === 'playing'
            && !settings.isOpen
            && !huntSession.isEnded()
            && !pounce.controlsCamera()
            && !dogCatch.controlsCamera();
        return {
            showStick: inPlay && !player.isLocked && !player.isStunned && !player.isRecovering,
            showActions: inPlay,
            showLook: inPlay,
            showPause: phase !== 'menu' && !settings.isOpen && !huntSession.isEnded() && !dogCatch.isActive() && pounce.state !== 'qte',
            showSkill: !settings.isOpen && !huntSession.isEnded() && (pounce.state === 'qte' || dogCatch.state === 'qte'),
            pounceReady: inPlay && !pounce.promptEl.hidden,
            climbReady: inPlay && !treeClimb.promptEl.hidden,
            perched: player.isTreePerched
        };
    }
});

window.addEventListener('keydown', event => {

        if (event.code === 'Escape' && phase !== 'menu' && !event.repeat && !dogCatch.isActive() && !huntSession.isEnded()) {

        event.preventDefault();

        if (settings.isOpen && performance.now() - pointerUnlockTime < 150) return;

        settings.setOpen(!settings.isOpen);

    }

    if (event.code === 'KeyH' && phase === 'playing') setWireframesVisible(!debugSettings.showWireframes);

});

// Browsers can consume Escape to release pointer lock without delivering keydown.

document.addEventListener('pointerlockchange', () => {

    if (document.body.classList.contains('touch-ui')) return;

    if (!document.pointerLockElement && phase === 'playing' && !pounce.isActive() && !dogCatch.isActive() && !settings.isOpen && !huntSession.isEnded()) {

        pointerUnlockTime = performance.now();

        settings.setOpen(true);

    }

});

window.addEventListener('mousemove', event => {
    if (document.body.classList.contains('touch-ui')) return;
    applyLook(event.movementX, event.movementY);
});

renderer.domElement.addEventListener('click', () => {
    if (document.body.classList.contains('touch-ui')) return;
    if (phase !== 'playing' || settings.isOpen || pounce.isActive() || dogCatch.isActive() || huntSession.isEnded()) return;

    renderer.domElement.requestPointerLock();

});

renderer.domElement.addEventListener('contextmenu', event => event.preventDefault());

const clock = new THREE.Timer();

function animate(time) {

    clock.update(time);

    const delta = Math.min(clock.getDelta(), 0.05);

    touchControls.sync();

    menu.update(delta);

    clouds?.update(delta, camera);

    if (!settings.isOpen) {

        if (phase === 'playing') {

            if (!huntSession.isEnded()) {
                huntSession.update(delta);
            }

            if (!huntSession.isEnded()) {
                player.update(delta, bushes, look.yaw, puddles, trees);

                treeClimb.update(delta);

                if (player.confuseLookDrift) {
                    look.yaw += player.confuseLookDrift * delta * 2.4;
                }

                soundVisual.update(player, delta);

                staminaVisual.update(player);

                staminaValue.textContent = `${Math.ceil(player.stamina)} / ${player.staminaMax}`;

                pounce.update(delta, look.yaw);

                eatVfx.update(delta);

                catVfx.update(delta);

                puddleWaves.update(delta, player, rats);

                bushCoverHud.update(player);
                bushVignette.update(player, delta, phase === 'playing' && !settings.isOpen);
                bushCoverDebug.update();
            }

        } else if (phase === 'dropping') {

            dropTime += delta;

            const duration = 1.65;

            if (dropTime < duration) {

                player.container.position.y = landingY + 24 * (1 - (dropTime / duration) ** 2);

                player.carModel.rotation.z = Math.sin(dropTime * 5) * 0.1;

            } else {

                if (!landingSmokeSpawned) {
                    landingSmokeSpawned = true;
                    catVfx.spawnLandingSmoke(player.container.position);
                }

                const t = Math.min((dropTime - duration) / 0.4, 1);

                player.container.position.y = landingY + Math.sin(t * Math.PI) * 0.35;

                player.carModel.rotation.z = 0;

                player.carModel.scale.set(1 + Math.sin(t * Math.PI) * 0.15, 1 - Math.sin(t * Math.PI) * 0.2, 1 + Math.sin(t * Math.PI) * 0.15);

                if (t === 1) {

                    phase = 'playing';

                    document.body.dataset.phase = phase;

                    player.isDeployed = true;

                    player.setControlsBlocked(false);

                    player.bushBlend = 0;
                    player.targetBushBlend = 0;
                    player.hiddenInBush = false;
                    player.bushCoverActive = false;
                    player._prevTargetBushBlend = 0;

                    const total = rats.length;
                    pounce.setRatTotal(total);
                    huntSession.begin(total);

                }

            }

            catVfx.update(delta);

        }

        rats.forEach(rat => rat.update(delta));
        updateRatConversations(rats, delta, player.container.position);
        dog.update(delta, player, rats);
        if (phase === 'playing' && !huntSession.isEnded()) dogCatch.update(delta);

    }

    if (phase === 'menu') {

        gardenTime += delta * 0.035;

        camera.position.set(15 + Math.sin(gardenTime) * 18, landingY + 5.4, 15 + Math.cos(gardenTime) * 18);

        camera.lookAt(15, landingY + 3.1, 15);

    }

    if (phase === 'playing' && !settings.isOpen && !pounce.controlsCamera() && !dogCatch.controlsCamera()) {

        const focus = player.container.position;

        const horizontal = Math.cos(look.pitch) * cameraDistance;

        const desired = new THREE.Vector3(focus.x + Math.sin(look.yaw) * horizontal, focus.y + Math.sin(look.pitch) * cameraDistance, focus.z + Math.cos(look.yaw) * horizontal);

        camera.position.lerp(desired, 1 - Math.exp(-8 * delta));

        lookTarget.set(focus.x, focus.y + (player.isTreePerched ? 1.05 : 0.45), focus.z);

        camera.lookAt(lookTarget);

    }

    renderer.render(scene, camera);

}

renderer.setAnimationLoop(animate);

