import * as THREE from 'three';
import { FENCE_RADIUS } from '../core/worldBounds.js';

export class Terrain {
    constructor(options = {}) {
        this.size = options.size ?? 112;
        this.segments = options.segments ?? 128;
        this.halfSize = this.size * 0.5;
        this.maxHeight = options.maxHeight ?? 2.65;
        this.seed = options.seed ?? 7.13;
        this.mesh = null;
        this.underfill = null;
    }

    noise2(x, z) {
        const s = this.seed;
        return (
            Math.sin(x * 0.065 + s) * Math.cos(z * 0.058 + s * 1.37) * 0.55 +
            Math.sin(x * 0.13 + s * 2.1) * Math.cos(z * 0.12 - s * 0.8) * 0.28 +
            Math.sin(x * 0.26 + z * 0.22 + s) * 0.14 +
            Math.cos(x * 0.04 - z * 0.05 + s * 0.5) * 0.22
        );
    }

    edgeMask(x, z) {
        const nx = x / (this.halfSize * 0.92);
        const nz = z / (this.halfSize * 0.92);
        const d = Math.hypot(nx, nz);
        const t = THREE.MathUtils.clamp(1.15 - d, 0, 1);
        return 0.72 + 0.28 * (t * t * (3 - 2 * t));
    }

    getHeightAt(x, z) {
        const dist = Math.hypot(x, z);
        const mask = this.edgeMask(x, z);
        const n = this.noise2(x, z);
        const hills = (n * 0.5 + 0.5) * this.maxHeight;
        let h = hills * mask;

        if (dist > FENCE_RADIUS - 6) {
            const rimT = THREE.MathUtils.smoothstep(FENCE_RADIUS - 6, FENCE_RADIUS + 10, dist);
            const fenceBlend = terrainRimHeight(x, z, dist);
            h = THREE.MathUtils.lerp(h, fenceBlend, rimT);
        }

        return Math.max(h, 0.08);
    }

    build(scene, renderer, grassTexture) {
        const geometry = new THREE.PlaneGeometry(this.size, this.size, this.segments, this.segments);
        geometry.rotateX(-Math.PI / 2);

        const pos = geometry.attributes.position;
        const colors = [];
        const lowColor = new THREE.Color(0x8ec971);
        const highColor = new THREE.Color(0xd8f5a8);
        const dirtColor = new THREE.Color(0xa8926a);
        const tmp = new THREE.Color();

        for (let i = 0; i < pos.count; i++) {
            const x = pos.getX(i);
            const z = pos.getZ(i);
            const y = this.getHeightAt(x, z);
            pos.setY(i, y);

            const hNorm = THREE.MathUtils.clamp(y / this.maxHeight, 0, 1);
            tmp.copy(lowColor).lerp(highColor, hNorm);
            if (hNorm < 0.22) {
                tmp.lerp(dirtColor, 0.28 * (1 - hNorm / 0.22));
            }
            colors.push(tmp.r, tmp.g, tmp.b);
        }

        geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
        geometry.computeVertexNormals();

        if (grassTexture) {
            grassTexture.colorSpace = THREE.SRGBColorSpace;
            grassTexture.wrapS = THREE.RepeatWrapping;
            grassTexture.wrapT = THREE.RepeatWrapping;
            grassTexture.repeat.set(28, 28);
            if (renderer) {
                grassTexture.anisotropy = renderer.capabilities.getMaxAnisotropy();
            }
        }

        const material = new THREE.MeshStandardMaterial({
            map: grassTexture,
            vertexColors: true,
            color: 0xffffff,
            roughness: 0.94,
            metalness: 0
        });

        this.mesh = new THREE.Mesh(geometry, material);
        this.mesh.receiveShadow = true;
        this.mesh.name = 'terrain';
        this.grassTexture = grassTexture;
        scene.add(this.mesh);

        this.buildUnderfill(scene, grassTexture);
        return this.mesh;
    }

    buildUnderfill(scene, grassTexture) {
        const underMap = grassTexture ? grassTexture.clone() : null;
        if (underMap) {
            underMap.wrapS = THREE.RepeatWrapping;
            underMap.wrapT = THREE.RepeatWrapping;
            underMap.repeat.set(40, 40);
        }
        const mat = new THREE.MeshStandardMaterial({
            map: underMap,
            color: 0x9ec978,
            roughness: 1,
            metalness: 0
        });
        const disk = new THREE.Mesh(new THREE.CircleGeometry(130, 64), mat);
        disk.rotation.x = -Math.PI / 2;
        disk.position.y = -0.35;
        disk.receiveShadow = true;
        disk.name = 'terrain-underfill';
        scene.add(disk);
        this.underfill = disk;
    }
}

function terrainRimHeight(x, z, dist) {
    const angle = Math.atan2(z, x);
    const wobble = Math.sin(angle * 5 + dist * 0.08) * 0.12;
    return 0.42 + wobble + Math.min((dist - FENCE_RADIUS) * 0.04, 0.35);
}

export function createTerrain(scene, renderer, options = {}) {
    const loader = new THREE.TextureLoader();
    const grassTexture = loader.load('/grass.jpg');
    const terrain = new Terrain(options);
    terrain.build(scene, renderer, grassTexture);
    return terrain;
}
