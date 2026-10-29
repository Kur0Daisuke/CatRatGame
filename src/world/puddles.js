import * as THREE from 'three';
import { PLAY_RADIUS, randomPointInDisk } from '../core/worldBounds.js';

const MAX_SHADER_RIPPLES = 6;

export function isClearOfPuddles(x, z, extraMargin, puddles) {
    if (!puddles || puddles.length === 0) return true;
    for (const puddle of puddles) {
        if (Math.hypot(x - puddle.x, z - puddle.z) < puddle.radius + extraMargin) {
            return false;
        }
    }
    return true;
}

function createPuddleMaterial(puddleEntry) {
    const mat = new THREE.MeshStandardMaterial({
        color: 0x4a8fd4,
        roughness: 0.1,
        metalness: 0.62,
        transparent: true,
        opacity: 0.84,
        depthWrite: false
    });

    mat.onBeforeCompile = (shader) => {
        shader.uniforms.uWaveTime = { value: 0 };
        shader.uniforms.uRipples = {
            value: Array.from({ length: MAX_SHADER_RIPPLES }, () => new THREE.Vector4(0, 0, 0, -999))
        };

        shader.vertexShader = shader.vertexShader.replace(
            '#include <begin_vertex>',
            `
            #include <begin_vertex>
            float rippleLift = 0.0;
            for (int i = 0; i < ${MAX_SHADER_RIPPLES}; i++) {
                vec4 rip = uRipples[i];
                float age = uWaveTime - rip.w;
                if (age > 0.0 && age < 2.4) {
                    vec2 d = transformed.xy - rip.xy;
                    float dist = length(d);
                    float ring = sin(dist * 14.0 - age * 18.0);
                    float falloff = exp(-dist * 1.15) * exp(-age * 1.35);
                    rippleLift += ring * falloff * rip.z;
                }
            }
            transformed.z += rippleLift * 0.11;
            `
        );

        shader.vertexShader = `uniform float uWaveTime;
uniform vec4 uRipples[${MAX_SHADER_RIPPLES}];
` + shader.vertexShader;

        puddleEntry.waveUniforms = shader.uniforms;
    };

    return mat;
}

function createPuddleMesh(radiusX, radiusZ, puddleEntry) {
    const geo = new THREE.CircleGeometry(1, 48);
    const mat = createPuddleMaterial(puddleEntry);
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
        const puddleEntry = {
            x,
            z,
            radius,
            mesh: null,
            waveUniforms: null,
            rippleIndex: 0
        };
        const mesh = createPuddleMesh(radius * stretch, radius * (1.1 - stretch * 0.35), puddleEntry);
        puddleEntry.mesh = mesh;
        const y = terrain.getHeightAt(x, z) + 0.04;
        mesh.position.set(x, y, z);
        mesh.rotation.z = Math.random() * Math.PI * 2;
        group.add(mesh);

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

export function worldToPuddleLocal(puddle, worldX, worldZ) {
    const dx = worldX - puddle.x;
    const dz = worldZ - puddle.z;
    const angle = -puddle.mesh.rotation.z;
    const cos = Math.cos(angle);
    const sin = Math.sin(angle);
    return {
        lx: dx * cos - dz * sin,
        lz: dx * sin + dz * cos
    };
}

export function pushPuddleRipple(puddle, worldX, worldZ, strength, time) {
    if (!puddle.waveUniforms) return;
    const { lx, lz } = worldToPuddleLocal(puddle, worldX, worldZ);
    const ripples = puddle.waveUniforms.uRipples.value;
    const slot = puddle.rippleIndex % MAX_SHADER_RIPPLES;
    puddle.rippleIndex += 1;
    ripples[slot].set(lx, lz, strength, time);
}

export function updatePuddleWaveTime(puddles, time) {
    for (const puddle of puddles) {
        if (puddle.waveUniforms) {
            puddle.waveUniforms.uWaveTime.value = time;
        }
    }
}
