import * as THREE from 'three';
import { Rat } from './rat.js';
import { randomPointInDisk, YARD_SPAWN_RADIUS } from '../core/worldBounds.js';
import { applyTerrainPose } from '../core/collision.js';

const DEFAULT_ROSTER = [
    ...Array(18).fill('dumb'),
    ...Array(10).fill('scout'),
    ...Array(22).fill('pouncer')
];

const POUNCER_ORBIT_MIN = 1.85;
const POUNCER_ORBIT_MAX = 2.75;

function placeRatOnTerrain(rat, x, z, yaw = Math.random() * Math.PI * 2) {
    rat.ratContainer.position.set(x, 0, z);
    rat.headingYaw = yaw;
    applyTerrainPose(rat.ratContainer, rat.headingYaw, 0);
}

/**
 * Dumb rats in the yard; every pouncer orbits a dumb rat; scouts on the rim.
 */
export function spawnRats(scene, terrain = null, roster = DEFAULT_ROSTER) {
    const kinds = [...roster];
    const dumbCount = kinds.filter((k) => k === 'dumb').length;
    const scoutCount = kinds.filter((k) => k === 'scout').length;
    const pouncerCount = kinds.filter((k) => k === 'pouncer').length;

    const rats = [];
    let index = 0;
    const yardCenter = { x: 15, z: 15 };

    const dumbRats = [];
    for (let i = 0; i < dumbCount; i++) {
        const rat = new Rat(scene, 'dumb', index++);
        const clusterAngle = (i / Math.max(1, dumbCount)) * Math.PI * 2 + 0.15 * i;
        const clusterR = 6 + (i % 4) * 3.2;
        const wx = yardCenter.x + Math.cos(clusterAngle) * clusterR + (Math.random() - 0.5) * 1.2;
        const wz = yardCenter.z + Math.sin(clusterAngle) * clusterR + (Math.random() - 0.5) * 1.2;
        placeRatOnTerrain(rat, wx, wz);
        dumbRats.push(rat);
        rats.push(rat);
    }

    for (let p = 0; p < pouncerCount; p++) {
        const dumb = dumbRats[p % dumbRats.length];
        const dumbPos = dumb.ratContainer.position;
        const orbitAngle = (p / Math.max(1, pouncerCount)) * Math.PI * 2 + p * 0.9 + Math.random() * 0.4;
        const orbitDist = POUNCER_ORBIT_MIN + Math.random() * (POUNCER_ORBIT_MAX - POUNCER_ORBIT_MIN);
        const px = dumbPos.x + Math.cos(orbitAngle) * orbitDist;
        const pz = dumbPos.z + Math.sin(orbitAngle) * orbitDist;

        const rat = new Rat(scene, 'pouncer', index++);
        placeRatOnTerrain(rat, px, pz, orbitAngle + Math.PI);
        rat.guardDumbRat = dumb;
        rat.guardClusterCenter = new THREE.Vector3(dumbPos.x, dumbPos.y, dumbPos.z);
        rats.push(rat);
    }

    for (let s = 0; s < scoutCount; s++) {
        const rat = new Rat(scene, 'scout', index++);
        const pt = randomPointInDisk(YARD_SPAWN_RADIUS - 3);
        placeRatOnTerrain(rat, yardCenter.x + pt.x, yardCenter.z + pt.z);
        rats.push(rat);
    }

    rats.forEach((rat) => {
        rat.getAllRats = () => rats;
    });

    return rats;
}

export function syncPouncerGuardAnchor(pouncer) {
    if (!pouncer.guardDumbRat?.ratContainer) return;
    const pos = pouncer.guardDumbRat.ratContainer.position;
    if (!pouncer.guardClusterCenter) {
        pouncer.guardClusterCenter = new THREE.Vector3();
    }
    pouncer.guardClusterCenter.set(pos.x, pos.y, pos.z);
}
