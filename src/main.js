import * as THREE from 'three';
import { setupScene } from './scene/sceneSetup.js';
import { Player } from './game/player.js';
import { Rat } from './game/rat.js';
import { loadWorld } from './world/loadWorld.js';
import { createTerrain } from './world/terrain.js';
import { setTerrainSampler, applyTerrainHeight } from './core/collision.js';
import { debugSettings, setWireframesVisible } from './core/debugSettings.js';
import { createSettings } from './ui/settings.js';
import { createMenu } from './ui/menu.js';
import { PounceSystem } from './systems/pounce.js';
import { CatSoundVisual } from './systems/soundVisual.js';
import { StaminaVisual } from './systems/staminaVisual.js';
import { PuddleWaveSystem } from './systems/puddleWaves.js';

const { scene, camera, renderer, composer, stylizedPass } = setupScene();
const terrain = createTerrain(scene, renderer);
setTerrainSampler((x, z) => terrain.getHeightAt(x, z));
const player = new Player(scene);
applyTerrainHeight(player.container.position);
const landingY = player.container.position.y;
player.container.visible = false;
player.container.position.y = landingY + 24;
player.setControlsBlocked(true);
player.aerialSphere.center.set(15, 1000, 15);
player.sightSphere.center.set(15, 1000, 15);
player.collisionSphere.center.set(15, 1000, 15);
let phase = 'menu';
let dropTime = 0;
let gardenTime = 0;
let pointerUnlockTime = -Infinity;
document.body.dataset.phase = phase;

const rats = [];
const roster = [...Array(8).fill('dumb'), ...Array(6).fill('scout'), ...Array(6).fill('pouncer')];
roster.forEach((kind, index) => rats.push(new Rat(scene, kind, index)));
rats.forEach(rat => applyTerrainHeight(rat.ratContainer.position));
const environment = loadWorld(scene, terrain);
const bushes = environment.bushes || [];
const puddles = environment.puddles || [];
const look = { yaw: 0, pitch: 0.54 };
const cameraDistance = 6.6;
const lookTarget = new THREE.Vector3();
const pounce = new PounceSystem({ camera, renderer, player, rats });
const soundVisual = new CatSoundVisual(scene);
const staminaVisual = new StaminaVisual();
const puddleWaves = new PuddleWaveSystem(scene, puddles);
const hud = document.createElement('section');
hud.className = 'game-hud';
hud.setAttribute('aria-label', 'Hunter status');
hud.innerHTML = '<div class="hud-emblem" aria-hidden="true">C/R</div><div class="hud-bars"></div>';
document.body.appendChild(hud);
hud.querySelector('.hud-bars').append(staminaVisual.meterEl, soundVisual.meterEl);
hud.appendChild(pounce.scoreEl);
const staminaValue = document.createElement('span');
staminaValue.className = 'stamina-value';
staminaVisual.meterEl.appendChild(staminaValue);
const settings = createSettings({ rats, onChange(open) {
    player.setControlsBlocked(open || phase !== 'playing');
    document.body.classList.toggle('settings-open', open);
} });
const menu = createMenu({ player, onStart() {
    phase = 'dropping';
    document.body.dataset.phase = phase;
    player.container.visible = true;
    look.yaw = 0;
    look.pitch = 0.54;
    camera.position.set(15, landingY + Math.sin(look.pitch) * cameraDistance, 15 + Math.cos(look.pitch) * cameraDistance);
    camera.lookAt(15, landingY + 0.45, 15);
} });
window.addEventListener('keydown', event => {
    if (event.code === 'Escape' && phase !== 'menu' && !event.repeat) {
        event.preventDefault();
        if (settings.isOpen && performance.now() - pointerUnlockTime < 150) return;
        settings.setOpen(!settings.isOpen);
    }
    if (event.code === 'KeyH' && phase === 'playing') setWireframesVisible(!debugSettings.showWireframes);
});
// Browsers can consume Escape to release pointer lock without delivering keydown.
document.addEventListener('pointerlockchange', () => {
    if (!document.pointerLockElement && phase === 'playing' && !pounce.isActive() && !settings.isOpen) {
        pointerUnlockTime = performance.now();
        settings.setOpen(true);
    }
});
window.addEventListener('mousemove', event => {
    if (phase !== 'playing' || settings.isOpen || pounce.controlsCamera()) return;
    const sensitivity = document.pointerLockElement === renderer.domElement ? 0.0026 : 0.004;
    look.yaw -= THREE.MathUtils.clamp(event.movementX, -80, 80) * sensitivity;
    look.pitch = THREE.MathUtils.clamp(look.pitch + THREE.MathUtils.clamp(event.movementY, -80, 80) * sensitivity, 0.22, 1.15);
});
renderer.domElement.addEventListener('click', () => {
    if (phase !== 'playing' || settings.isOpen || pounce.isActive()) return;
    renderer.domElement.requestPointerLock();
});
renderer.domElement.addEventListener('contextmenu', event => event.preventDefault());
const clock = new THREE.Timer();
function animate(time) {
    clock.update(time);
    const delta = Math.min(clock.getDelta(), 0.05);
    menu.update(delta);
    if (!settings.isOpen) {
        if (phase === 'playing') {
            player.update(delta, bushes, look.yaw, puddles);
            soundVisual.update(player, delta);
            staminaVisual.update(player);
            staminaValue.textContent = `${Math.ceil(player.stamina)} / ${player.staminaMax}`;
            pounce.update(delta);
            puddleWaves.update(delta, player, rats);
        } else if (phase === 'dropping') {
            dropTime += delta;
            const duration = 1.65;
            if (dropTime < duration) {
                player.container.position.y = landingY + 24 * (1 - (dropTime / duration) ** 2);
                player.carModel.rotation.z = Math.sin(dropTime * 5) * 0.1;
            } else {
                const t = Math.min((dropTime - duration) / 0.4, 1);
                player.container.position.y = landingY + Math.sin(t * Math.PI) * 0.35;
                player.carModel.rotation.z = 0;
                player.carModel.scale.set(1 + Math.sin(t * Math.PI) * 0.15, 1 - Math.sin(t * Math.PI) * 0.2, 1 + Math.sin(t * Math.PI) * 0.15);
                if (t === 1) {
                    phase = 'playing';
                    document.body.dataset.phase = phase;
                    player.isDeployed = true;
                    player.setControlsBlocked(false);
                }
            }
        }
        rats.forEach(rat => rat.update(delta));
    }
    if (phase === 'menu') {
        gardenTime += delta * 0.035;
        camera.position.set(15 + Math.sin(gardenTime) * 19, landingY + 9, 15 + Math.cos(gardenTime) * 19);
        camera.lookAt(15, landingY, 15);
    }
    if (stylizedPass?.uniforms.inBush) stylizedPass.uniforms.inBush.value = player.bushBlend;
    if (phase === 'playing' && !settings.isOpen && !pounce.controlsCamera()) {
        const focus = player.container.position;
        const horizontal = Math.cos(look.pitch) * cameraDistance;
        const desired = new THREE.Vector3(focus.x + Math.sin(look.yaw) * horizontal, focus.y + Math.sin(look.pitch) * cameraDistance, focus.z + Math.cos(look.yaw) * horizontal);
        camera.position.lerp(desired, 1 - Math.exp(-8 * delta));
        lookTarget.set(focus.x, focus.y + 0.45, focus.z);
        camera.lookAt(lookTarget);
    }
    composer.render();
}
renderer.setAnimationLoop(animate);
