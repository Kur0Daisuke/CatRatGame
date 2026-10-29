import * as THREE from 'three';
import { setupScene } from './sceneSetup.js';
import { Player } from './player.js';
import { Rat } from './rat.js';
import { loadEnvironment } from './environment.js';

const { scene, camera, renderer, composer, stylizedPass } = setupScene();

const player = new Player(scene);
const rat = [];

for (let i = 0; i < 20; i++) {
    rat.push(new Rat(scene));
}

const environment = loadEnvironment(scene);
const bushes = environment.bushes || [];

// --- MOUSE CAMERA MOVEMENT TRACKING ---
let mouseX = 0;
let mouseY = 0;
let targetCameraOffsetX = 0;
let targetCameraOffsetZ = 5;

window.addEventListener('mousemove', (e) => {
    // Normalize mouse coordinates between -1 and 1 based on screen size
    mouseX = (e.clientX / window.innerWidth) * 2 - 1;
    mouseY = -(e.clientY / window.innerHeight) * 2 + 1;
});

const clock = new THREE.Timer(); 

function animate(time) {
    const delta = clock.getDelta();

    player.update(delta, bushes);

    rat.forEach(e => e.update(delta));

    if (stylizedPass && stylizedPass.uniforms['inBush']) {
        stylizedPass.uniforms['inBush'].value = player.hiddenInBush ? 1.0 : 0.0;
    }

    if (player.container) {
        // Calculate dynamic camera offsets based on mouse position
        targetCameraOffsetX = THREE.MathUtils.lerp(targetCameraOffsetX, mouseX * 3.5, 0.05);
        let targetCameraOffsetY = THREE.MathUtils.lerp(3, 3 + mouseY * 2.0, 0.05);
        let targetCameraOffsetZ = THREE.MathUtils.lerp(5, 5 - mouseY * 2.0, 0.05);

        const targetX = player.container.position.x + targetCameraOffsetX;
        const targetY = (player.carModel ? player.carModel.position.y : 0) + targetCameraOffsetY;
        const targetZ = player.container.position.z + targetCameraOffsetZ;

        camera.position.x = THREE.MathUtils.lerp(camera.position.x, targetX, 0.1);
        camera.position.y = THREE.MathUtils.lerp(camera.position.y, targetY, 0.1);
        camera.position.z = THREE.MathUtils.lerp(camera.position.z, targetZ, 0.1);
        
        // Look slightly ahead toward mouse direction from player
        const lookTarget = player.container.position.clone();
        lookTarget.x += mouseX * 2.0;
        lookTarget.z -= mouseY * 2.0;
        camera.lookAt(lookTarget);
    }
    
    clock.update(time);
    composer.render();
}

renderer.setAnimationLoop(animate);