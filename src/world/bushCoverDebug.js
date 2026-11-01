import * as THREE from 'three';
import { BUSH_COVER_FADE, sampleTerrainHeight } from '../core/collision.js';
import { debugSettings, onWireframesChange } from '../core/debugSettings.js';

const _bushWorld = new THREE.Vector3();

/**
 * Debug wire rings: inner green = full cover, outer amber = fade band.
 */
export function createBushCoverDebug(scene, getBushes) {
    const group = new THREE.Group();
    group.name = 'bushCoverDebug';
    scene.add(group);

    let builtCount = 0;

    const innerMat = new THREE.MeshBasicMaterial({
        color: 0x44ff88,
        wireframe: true,
        transparent: true,
        opacity: 0.75,
        depthWrite: false
    });
    const outerMat = new THREE.MeshBasicMaterial({
        color: 0xffcc44,
        wireframe: true,
        transparent: true,
        opacity: 0.45,
        depthWrite: false
    });

    function clearGroup() {
        while (group.children.length) {
            const child = group.children[0];
            group.remove(child);
            child.geometry?.dispose?.();
        }
    }

    function rebuild() {
        clearGroup();
        if (!debugSettings.showWireframes) {
            group.visible = false;
            return;
        }

        const bushes = getBushes() ?? [];
        builtCount = bushes.length;

        for (const bush of bushes) {
            if (bush.mesh) {
                bush.mesh.getWorldPosition(_bushWorld);
            } else if (bush.x == null || bush.coverRadius == null) {
                continue;
            }
            const bx = bush.mesh ? _bushWorld.x : bush.x;
            const bz = bush.mesh ? _bushWorld.z : bush.z;
            const y = sampleTerrainHeight(bx, bz) + 0.05;
            const r = bush.coverRadius ?? 0.32;
            const fade = BUSH_COVER_FADE;

            const core = new THREE.Mesh(
                new THREE.RingGeometry(Math.max(0.02, r * 0.55), r, 24),
                innerMat
            );
            core.rotation.x = -Math.PI / 2;
            core.position.set(bx, y, bz);
            core.renderOrder = 20;

            const fadeRing = new THREE.Mesh(
                new THREE.RingGeometry(r, r + fade, 24),
                outerMat
            );
            fadeRing.rotation.x = -Math.PI / 2;
            fadeRing.position.set(bx, y + 0.02, bz);
            fadeRing.renderOrder = 19;

            group.add(core, fadeRing);
        }

        group.visible = bushes.length > 0;
    }

    onWireframesChange(rebuild);

    return {
        update() {
            const bushes = getBushes() ?? [];
            if (bushes.length !== builtCount && debugSettings.showWireframes) {
                rebuild();
            }
            group.visible = debugSettings.showWireframes && bushes.length > 0;
        }
    };
}
