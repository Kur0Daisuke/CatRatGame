import * as THREE from 'three';
import { setupScene } from './sceneSetup.js';
import { Player } from './player.js';
import { Rat } from './rat.js';
import { loadEnvironment } from './environment.js';

const { scene, camera, renderer } = setupScene();

const player = new Player(scene);
const rat = [];

for (let i = 0; i < 20; i++) {
    rat.push(new Rat(scene));
}
const environment = loadEnvironment(scene);

const clock = new THREE.Timer(); 

function animate(time) {
    const delta = clock.getDelta();

    player.update(delta);

    rat.forEach(e => e.update(delta))

    if (player.container) {
        camera.position.x = THREE.MathUtils.lerp(camera.position.x, player.container.position.x, 0.1);
        camera.position.y = THREE.MathUtils.lerp(camera.position.y, (player.carModel ? player.carModel.position.y : 0) + 3, 0.1);
        camera.position.z = THREE.MathUtils.lerp(camera.position.z, player.container.position.z + 5, 0.1);
        camera.lookAt(player.container.position);
    }
    clock.update(time)
    renderer.render(scene, camera);

}

renderer.setAnimationLoop(animate);