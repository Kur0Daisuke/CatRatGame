import * as THREE from 'three';
import { sampleTerrainHeight } from '../core/collision.js';
import { debugSettings } from '../core/debugSettings.js';
import { pruneAvoidSpots } from './ratIntel.js';

let _sphereGeo = null;
let _sphereMat = null;

function sharedMarkerMaterial() {
    if (!_sphereMat) {
        _sphereMat = new THREE.MeshBasicMaterial({
            color: 0xff7722,
            wireframe: true,
            transparent: true,
            opacity: 0.9,
            depthWrite: false
        });
    }
    return _sphereMat;
}

function sharedMarkerGeometry() {
    if (!_sphereGeo) _sphereGeo = new THREE.SphereGeometry(0.55, 6, 5);
    return _sphereGeo;
}

export function createAvoidDebugGroup(scene) {
    const group = new THREE.Group();
    group.name = 'avoid-spot-debug';
    group.visible = debugSettings.showWireframes;
    scene.add(group);
    return group;
}

export function syncAvoidSpotDebug(rat, now) {
    if (!rat.avoidDebugGroup) return;
    rat.avoidDebugGroup.visible = debugSettings.showWireframes;
    if (!debugSettings.showWireframes) return;

    pruneAvoidSpots(rat.avoidSpots, now);
    const spots = rat.avoidSpots;
    const markers = rat.avoidDebugMarkers;

    while (markers.length < spots.length) {
        const mesh = new THREE.Mesh(sharedMarkerGeometry(), sharedMarkerMaterial());
        rat.avoidDebugGroup.add(mesh);
        markers.push(mesh);
    }

    for (let i = 0; i < spots.length; i++) {
        const spot = spots[i];
        const mesh = markers[i];
        mesh.visible = true;
        const y = sampleTerrainHeight(spot.x, spot.z) + 0.32;
        mesh.position.set(spot.x, y, spot.z);
        const pulse = 0.92 + Math.sin(now * 3 + i) * 0.08;
        mesh.scale.setScalar(pulse);
    }
    for (let i = spots.length; i < markers.length; i++) {
        markers[i].visible = false;
    }
}

export function disposeAvoidDebug(rat) {
    if (rat.avoidDebugGroup) rat.scene.remove(rat.avoidDebugGroup);
    rat.avoidDebugMarkers = [];
    rat.avoidDebugGroup = null;
}
