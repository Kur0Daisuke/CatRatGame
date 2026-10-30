import * as THREE from 'three';
import { setupScene } from './scene/sceneSetup.js';
import { Player } from './game/player.js';
import { Rat } from './game/rat.js';
import { loadWorld } from './world/loadWorld.js';
import { createTerrain } from './world/terrain.js';
import { setTerrainSampler, applyTerrainHeight } from './core/collision.js';
import { debugSettings, setWireframesVisible } from './core/debugSettings.js';
import { createSettings } from './ui/settings.js';
import { PounceSystem } from './systems/pounce.js';
import { CatSoundVisual } from './systems/soundVisual.js';
import { StaminaVisual } from './systems/staminaVisual.js';
import { PuddleWaveSystem } from './systems/puddleWaves.js';

const { scene, camera, renderer, composer, stylizedPass } = setupScene();

const terrain = createTerrain(scene, renderer);
setTerrainSampler((x, z) => terrain.getHeightAt(x, z));

const player = new Player(scene);
applyTerrainHeight(player.container.position);

const rats = [];
const roster = [
    ...Array(8).fill('dumb'),
    ...Array(6).fill('scout'),
    ...Array(6).fill('pouncer')
];
roster.forEach((kind, index) => {
    rats.push(new Rat(scene, kind, index));
});
rats.forEach((rat) => {
    if (rat.ratContainer) applyTerrainHeight(rat.ratContainer.position);
});

const environment = loadWorld(scene, terrain);
const bushes = environment.bushes || [];
const puddles = environment.puddles || [];

const look = { yaw: 0, pitch: 0.54 };
const cameraDistance = 6.6;
const lookTarget = new THREE.Vector3();
const spawnY = terrain.getHeightAt(15, 15);
camera.position.set(15, Math.sin(look.pitch) * cameraDistance + spawnY, 15 + Math.cos(look.pitch) * cameraDistance);
camera.lookAt(15, spawnY + 0.45, 15);

const pounce = new PounceSystem({ camera, renderer, player, rats });
const soundVisual = new CatSoundVisual(scene);
const staminaVisual = new StaminaVisual();
const puddleWaves = new PuddleWaveSystem(scene, puddles);

const hint = document.createElement('div');
hint.className = 'hint';
hint.textContent = 'WASD move · Shift run (stamina) · Stand in puddles to drink · Ctrl sneak · E pounce · SPACE skill check';
document.body.appendChild(hint);

const settings = createSettings({ player, rats });

window.addEventListener('keydown', (event) => {
    if (event.code === 'KeyH') {
        setWireframesVisible(!debugSettings.showWireframes);
    }
});

function applyMouseLook(event, sensitivity) {
    const dx = THREE.MathUtils.clamp(event.movementX, -80, 80);
    const dy = THREE.MathUtils.clamp(event.movementY, -80, 80);
    look.yaw -= dx * sensitivity;
    look.pitch = THREE.MathUtils.clamp(look.pitch + dy * sensitivity, 0.22, 1.15);
}

window.addEventListener('mousemove', (event) => {
    if (settings.isOpen || pounce.controlsCamera()) return;
    const locked = document.pointerLockElement === renderer.domElement;
    applyMouseLook(event, locked ? 0.0026 : 0.004);
});

renderer.domElement.addEventListener('click', () => {
    if (pounce.isActive()) return;
    renderer.domElement.requestPointerLock();
});
renderer.domElement.addEventListener('contextmenu', (event) => event.preventDefault());
document.addEventListener('pointerlockchange', () => {
    hint.style.opacity = document.pointerLockElement === renderer.domElement ? '0' : '0.9';
});

const clock = new THREE.Timer();

function animate(time) {
    clock.update(time);
    const delta = Math.min(clock.getDelta(), 0.05);

    player.update(delta, bushes, look.yaw, puddles);
    soundVisual.update(player, delta);
    staminaVisual.update(player);
    puddleWaves.update(delta, player, rats);
    rats.forEach((rat) => rat.update(delta));
    pounce.update(delta);

    if (stylizedPass && stylizedPass.uniforms['inBush']) {
        stylizedPass.uniforms['inBush'].value = player.bushBlend;
    }

    if (player.container && !pounce.controlsCamera()) {
        const focus = player.container.position;
        const horizontal = Math.cos(look.pitch) * cameraDistance;
        const desiredX = focus.x + Math.sin(look.yaw) * horizontal;
        const desiredY = focus.y + Math.sin(look.pitch) * cameraDistance;
        const desiredZ = focus.z + Math.cos(look.yaw) * horizontal;
        const follow = 1 - Math.exp(-8 * delta);

        camera.position.x = THREE.MathUtils.lerp(camera.position.x, desiredX, follow);
        camera.position.y = THREE.MathUtils.lerp(camera.position.y, Math.max(desiredY, focus.y + 0.45), follow);
        camera.position.z = THREE.MathUtils.lerp(camera.position.z, desiredZ, follow);

        lookTarget.set(focus.x, focus.y + 0.45, focus.z);
        camera.lookAt(lookTarget);
    }

    composer.render();
}

renderer.setAnimationLoop(animate);
