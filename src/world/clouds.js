import * as THREE from 'three';
import { YARD_CENTER_X, YARD_CENTER_Z } from '../core/worldBounds.js';

const CLOUD_COUNT = 18;
const DRIFT_EXTENT = 124;
const TEXTURE_SIZE = 256;

function hash2(x, y) {
    const n = Math.sin(x * 127.1 + y * 311.7) * 43758.5453;
    return n - Math.floor(n);
}

function valueNoise(x, y) {
    const x0 = Math.floor(x);
    const y0 = Math.floor(y);
    const fx = x - x0;
    const fy = y - y0;
    const sx = fx * fx * (3 - 2 * fx);
    const sy = fy * fy * (3 - 2 * fy);
    const a = hash2(x0, y0);
    const b = hash2(x0 + 1, y0);
    const c = hash2(x0, y0 + 1);
    const d = hash2(x0 + 1, y0 + 1);
    return a + (b - a) * sx + (c - a) * sy + (a - b - c + d) * sx * sy;
}

function fbm(x, y, octaves = 5) {
    let sum = 0;
    let amp = 0.5;
    let freq = 1;
    for (let i = 0; i < octaves; i++) {
        sum += valueNoise(x * freq, y * freq) * amp;
        amp *= 0.5;
        freq *= 2.07;
    }
    return sum;
}

function makeBlobs(seed) {
    const blobs = [];
    const width = 0.52 + hash2(seed, 1.1) * 0.32;
    blobs.push({ x: 0, y: -0.08, rx: width, ry: 0.2, k: 1.05, w: 1.15 });
    blobs.push({
        x: (hash2(seed, 2.2) - 0.5) * 0.12,
        y: 0.04,
        rx: width * 0.82,
        ry: 0.28,
        k: 1.15,
        w: 1
    });
    const lumps = 4 + Math.floor(hash2(seed, 3.3) * 4);
    for (let i = 0; i < lumps; i++) {
        const t = (i / Math.max(1, lumps - 1) - 0.5) * width * 1.85;
        blobs.push({
            x: t + (hash2(seed, i + 5) - 0.5) * 0.12,
            y: 0.12 + hash2(seed, i + 8) * 0.34,
            rx: 0.14 + hash2(seed, i + 12) * 0.2,
            ry: 0.15 + hash2(seed, i + 16) * 0.22,
            k: 1.25 + hash2(seed, i + 20) * 0.9,
            w: 0.65 + hash2(seed, i + 24) * 0.5
        });
    }
    return blobs;
}

function paintCloudTexture(seed) {
    const size = TEXTURE_SIZE;
    const data = new Uint8Array(size * size * 4);
    const blobs = makeBlobs(seed);
    const inv = 2 / (size - 1);

    for (let y = 0; y < size; y++) {
        for (let x = 0; x < size; x++) {
            const i = (y * size + x) * 4;
            if (x < 2 || y < 2 || x > size - 3 || y > size - 3) continue;

            const u = x * inv - 1;
            const v = -(y * inv - 1);
            let density = 0;
            for (const blob of blobs) {
                const dx = (u - blob.x) / blob.rx;
                const dy = (v - blob.y) / blob.ry;
                density += Math.exp(-(dx * dx + dy * dy) * blob.k) * blob.w;
            }

            const n = fbm(u * 2.6 + seed, v * 2.8 + seed * 0.41);
            const n2 = fbm(u * 9.5 + 4.1, v * 8.2 - seed);
            density = density * (0.62 + n * 0.55);
            density -= (n2 - 0.42) * 0.42;
            if (v < -0.12) density *= THREE.MathUtils.smoothstep(-0.42, -0.08, v);

            const rim = Math.hypot(u * 0.98, Math.max(0, v) * 1.05 + Math.max(0, -v) * 1.35);
            density *= Math.max(0, 1 - rim ** 2.4);

            const alpha = THREE.MathUtils.smoothstep(0.4, 0.56, density);
            if (alpha <= 0.04) continue;

            const lit = THREE.MathUtils.clamp(0.58 + v * 0.32 + density * 0.18 + n * 0.1, 0.48, 1);
            const cool = THREE.MathUtils.smoothstep(0.18, -0.22, v) * 0.16;
            data[i] = Math.round((0.93 + lit * 0.07 - cool * 0.08) * 255);
            data[i + 1] = Math.round((0.94 + lit * 0.06 - cool * 0.04) * 255);
            data[i + 2] = Math.round((0.96 + lit * 0.04) * 255);
            data[i + 3] = Math.round(alpha * 255);
        }
    }

    const texture = new THREE.DataTexture(data, size, size, THREE.RGBAFormat);
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.minFilter = THREE.LinearFilter;
    texture.magFilter = THREE.LinearFilter;
    texture.generateMipmaps = false;
    texture.needsUpdate = true;
    texture.flipY = true;
    return texture;
}

function createSkyDome() {
    const radius = 520;
    const geometry = new THREE.SphereGeometry(radius, 32, 20);
    const colors = [];
    const zenith = new THREE.Color(0x5b9ae8);
    const mid = new THREE.Color(0x8ec8f8);
    const horizon = new THREE.Color(0xb7dbf5);
    const tmp = new THREE.Color();
    const pos = geometry.attributes.position;

    for (let i = 0; i < pos.count; i++) {
        const y = pos.getY(i) / radius;
        const t = THREE.MathUtils.clamp(y, -0.08, 1);
        if (t < 0.28) {
            tmp.copy(horizon).lerp(mid, THREE.MathUtils.smoothstep(-0.08, 0.28, t));
        } else {
            tmp.copy(mid).lerp(zenith, THREE.MathUtils.smoothstep(0.28, 0.95, t));
        }
        colors.push(tmp.r, tmp.g, tmp.b);
    }

    geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
    const material = new THREE.MeshBasicMaterial({
        vertexColors: true,
        side: THREE.BackSide,
        fog: false,
        depthWrite: false
    });
    const dome = new THREE.Mesh(geometry, material);
    dome.name = 'sky-dome';
    dome.renderOrder = -20;
    dome.frustumCulled = false;
    return dome;
}

const puffGeometry = new THREE.PlaneGeometry(1, 1);

function puffMaterial(map, tint, opacity) {
    return new THREE.MeshBasicMaterial({
        map,
        color: tint,
        opacity,
        transparent: true,
        depthWrite: false,
        fog: false,
        side: THREE.DoubleSide
    });
}

function addCumulus(parent, textures, x, y, z, scale) {
    const cloud = new THREE.Group();
    cloud.position.set(x, y, z);

    const mainMap = textures[Math.floor(Math.random() * textures.length)];
    const main = new THREE.Mesh(puffGeometry, puffMaterial(mainMap, 0xffffff, 1));
    const width = (20 + Math.random() * 10) * scale;
    main.scale.set(width, width * 0.58, 1);
    main.renderOrder = -8;
    cloud.add(main);

    if (Math.random() > 0.4) {
        const sideMap = textures[Math.floor(Math.random() * textures.length)];
        const side = new THREE.Mesh(puffGeometry, puffMaterial(sideMap, 0xf7f9fc, 0.88));
        const sideW = width * (0.42 + Math.random() * 0.18);
        side.position.set((Math.random() - 0.5) * width * 0.38, Math.random() * 1.8, (Math.random() - 0.5) * 4);
        side.scale.set(sideW, sideW * 0.62, 1);
        side.renderOrder = -9;
        cloud.add(side);
    }

    parent.add(cloud);
    return cloud;
}

export function createSkyClouds(scene) {
    const group = new THREE.Group();
    group.name = 'sky-clouds';
    scene.add(group);
    group.add(createSkyDome());

    const textures = [0.91, 2.17, 3.44, 4.82, 6.05, 7.73].map(paintCloudTexture);
    const clouds = [];

    for (let i = 0; i < CLOUD_COUNT; i++) {
        const horizon = i < 12;
        const angle = (i / (horizon ? 12 : CLOUD_COUNT)) * Math.PI * 2 + (horizon ? 0.08 : Math.random() * 0.5);
        const radius = horizon ? 58 + (i % 3) * 9 : 34 + Math.random() * 28;
        const x = YARD_CENTER_X + Math.cos(angle) * radius;
        const z = YARD_CENTER_Z + Math.sin(angle) * radius;
        const y = horizon ? 15 + (i % 4) * 2.2 : 21 + Math.random() * 10;
        const scale = horizon ? 1.7 + (i % 5) * 0.14 : 1.15 + Math.random() * 0.5;
        const cloud = addCumulus(group, textures, x, y, z, scale);
        clouds.push({
            object: cloud,
            speed: 0.45 + Math.random() * 0.7,
            bob: Math.random() * Math.PI * 2,
            baseY: y
        });
    }

    let time = 0;

    return {
        group,
        update(delta, camera) {
            time += delta;
            for (const cloud of clouds) {
                cloud.object.position.x += cloud.speed * delta;
                cloud.object.position.y = cloud.baseY + Math.sin(time * 0.16 + cloud.bob) * 0.65;
                if (cloud.object.position.x > YARD_CENTER_X + DRIFT_EXTENT) {
                    cloud.object.position.x = YARD_CENTER_X - DRIFT_EXTENT;
                    cloud.object.position.z = YARD_CENTER_Z + (Math.random() - 0.5) * DRIFT_EXTENT * 1.35;
                }
                cloud.object.lookAt(camera.position.x, cloud.object.position.y, camera.position.z);
            }
        }
    };
}
