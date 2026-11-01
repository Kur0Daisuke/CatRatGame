import * as THREE from 'three';

let softTexture = null;

/** Shared radial falloff so point sprites read as soft puffs, not square blocks. */
export function getSoftParticleTexture() {
    if (softTexture) return softTexture;

    const size = 128;
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d');
    const mid = size / 2;
    const gradient = ctx.createRadialGradient(mid, mid, 0, mid, mid, mid);
    gradient.addColorStop(0, 'rgba(255,255,255,0.95)');
    gradient.addColorStop(0.22, 'rgba(255,255,255,0.55)');
    gradient.addColorStop(0.55, 'rgba(255,255,255,0.12)');
    gradient.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, size, size);

    softTexture = new THREE.CanvasTexture(canvas);
    softTexture.colorSpace = THREE.SRGBColorSpace;
    softTexture.needsUpdate = true;
    return softTexture;
}

export function createSoftPointsMaterial(options = {}) {
    return new THREE.PointsMaterial({
        map: getSoftParticleTexture(),
        transparent: true,
        depthWrite: false,
        sizeAttenuation: true,
        alphaTest: 0.02,
        ...options
    });
}
