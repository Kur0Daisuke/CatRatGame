import * as THREE from 'three';
import { setupScene } from './sceneSetup.js';
import { Player } from './player.js';
import { Rat } from './rat.js';
import { loadEnvironment } from './environment.js';
import { debugSettings, setWireframesVisible, onWireframesChange } from './debugSettings.js';
import { PounceSystem } from './pounce.js';
import { CatSoundVisual } from './soundVisual.js';

const { scene, camera, renderer, composer, stylizedPass } = setupScene();

const player = new Player(scene);
const rats = [];
const roster = [
    ...Array(8).fill('dumb'),
    ...Array(6).fill('scout'),
    ...Array(6).fill('pouncer')
];
roster.forEach((kind, index) => {
    rats.push(new Rat(scene, kind, index));
});

const environment = loadEnvironment(scene);
const bushes = environment.bushes || [];

const look = { yaw: 0, pitch: 0.54 };
const cameraDistance = 6.6;
const lookTarget = new THREE.Vector3();
camera.position.set(15, Math.sin(look.pitch) * cameraDistance, 15 + Math.cos(look.pitch) * cameraDistance);
camera.lookAt(15, 0.45, 15);

const pounce = new PounceSystem({ camera, renderer, player, rats });
const soundVisual = new CatSoundVisual(scene);

const hint = document.createElement('div');
hint.className = 'hint';
hint.textContent = 'WASD move · Shift run · Ctrl sneak · E pounce · SPACE skill check · H wireframes';
document.body.appendChild(hint);

const debugPanel = document.createElement('div');
debugPanel.className = 'debug-panel';
debugPanel.innerHTML = `
  <label class="debug-toggle">
    <input type="checkbox" id="wireframe-toggle" />
    Show collision wireframes
  </label>
`;
document.body.appendChild(debugPanel);

const wireframeToggle = document.getElementById('wireframe-toggle');
wireframeToggle.checked = debugSettings.showWireframes;
wireframeToggle.addEventListener('change', () => {
    setWireframesVisible(wireframeToggle.checked);
    rats.forEach((rat) => rat.setDebugVisible(wireframeToggle.checked));
});

onWireframesChange((visible) => {
    wireframeToggle.checked = visible;
    rats.forEach((rat) => rat.setDebugVisible(visible));
});

window.addEventListener('keydown', (event) => {
    if (event.code === 'KeyH') {
        setWireframesVisible(!debugSettings.showWireframes);
        rats.forEach((rat) => rat.setDebugVisible(debugSettings.showWireframes));
    }
});

function applyMouseLook(event, sensitivity) {
    const dx = THREE.MathUtils.clamp(event.movementX, -80, 80);
    const dy = THREE.MathUtils.clamp(event.movementY, -80, 80);
    look.yaw -= dx * sensitivity;
    look.pitch = THREE.MathUtils.clamp(look.pitch + dy * sensitivity, 0.22, 1.15);
}

window.addEventListener('mousemove', (event) => {
    if (pounce.controlsCamera()) return;
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

    player.update(delta, bushes, look.yaw);

    soundVisual.update(player, delta);

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
        camera.position.y = THREE.MathUtils.lerp(camera.position.y, Math.max(desiredY, 0.45), follow);
        camera.position.z = THREE.MathUtils.lerp(camera.position.z, desiredZ, follow);

        lookTarget.set(focus.x, focus.y + 0.45, focus.z);
        camera.lookAt(lookTarget);
    }

    composer.render();
}

renderer.setAnimationLoop(animate);