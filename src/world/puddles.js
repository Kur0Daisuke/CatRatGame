import * as THREE from 'three';
import { PLAY_RADIUS, randomPointInDisk } from '../core/worldBounds.js';
import { applyPuddleAnchor } from '../core/collision.js';

export function isClearOfPuddles(x, z, extraMargin, puddles) {
    if (!puddles || puddles.length === 0) return true;
    for (const puddle of puddles) {
        if (Math.hypot(x - puddle.x, z - puddle.z) < puddle.radius + extraMargin) {
            return false;
        }
    }
    return true;
}

function createPuddleMaterial() {
    return new THREE.MeshStandardMaterial({
        color: 0x4a8fd4,
        roughness: 0.1,
        metalness: 0.62,
        transparent: true,
        opacity: 0.84,
        depthWrite: false
    });
}

function createPuddleMesh(radiusX, radiusZ) {
    const geo = new THREE.CircleGeometry(1, 48);
    const mat = createPuddleMaterial();
    const mesh = new THREE.Mesh(geo, mat);
    mesh.rotation.x = -Math.PI / 2;
    mesh.scale.set(radiusX, radiusZ, 1);
    mesh.receiveShadow = true;
    return mesh;
}

/** Water puddles scattered in the playable yard — stand in one to restore stamina. */
export function spawnWaterPuddles(scene, terrain, count = 24) {
    const group = new THREE.Group();
    group.name = 'water-puddles';
    const puddles = [];
    const spawnRadius = PLAY_RADIUS - 5;
    const avoid = [{ x: 15, z: 15, r: 7 }];

    for (let i = 0; i < count; i++) {
        let x = 0;
        let z = 0;
        let ok = false;
        for (let attempt = 0; attempt < 40; attempt++) {
            const p = randomPointInDisk(spawnRadius);
            x = p.x;
            z = p.z;
            ok = true;
            for (const other of puddles) {
                if (Math.hypot(x - other.x, z - other.z) < other.radius + 2.8) {
                    ok = false;
                    break;
                }
            }
            if (ok) {
                for (const spot of avoid) {
                    if (Math.hypot(x - spot.x, z - spot.z) < spot.r) {
                        ok = false;
                        break;
                    }
                }
            }
            if (ok) break;
        }
        if (!ok) continue;

        const radius = 1.15 + Math.random() * 1.45;
        const stretch = 0.75 + Math.random() * 0.5;
        const surfaceYaw = Math.random() * Math.PI * 2;
        const puddleEntry = {
            x,
            z,
            radius,
            mesh: null,
            anchor: null
        };

        const anchor = new THREE.Group();
        anchor.position.set(x, 0, z);
        const mesh = createPuddleMesh(radius * stretch, radius * (1.1 - stretch * 0.35));
        anchor.add(mesh);
        applyPuddleAnchor(anchor, surfaceYaw, 0.035);
        group.add(anchor);

        puddleEntry.mesh = mesh;
        puddleEntry.anchor = anchor;
        puddles.push(puddleEntry);
    }

    scene.add(group);
    return puddles;
}

export function findPuddleAtPosition(puddles, x, z, padding = 0.35) {
    for (const puddle of puddles) {
        const dx = x - puddle.x;
        const dz = z - puddle.z;
        const effectiveR = puddle.radius + padding;
        if (dx * dx + dz * dz <= effectiveR * effectiveR) {
            return puddle;
        }
    }
    return null;
}
