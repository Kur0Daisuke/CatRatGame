import * as THREE from 'three';

export function setupScene() {
    const scene = new THREE.Scene();
    
    scene.background = new THREE.Color(0x9fd4ff);
    scene.fog = new THREE.Fog(0xb8dcff, 42, 105);

    const sunDirection = new THREE.Vector3(24, 36, 14).normalize();
    const sunVisual = new THREE.Group();
    sunVisual.name = 'sun';
    const sunGlow = new THREE.Mesh(
        new THREE.SphereGeometry(11, 20, 20),
        new THREE.MeshBasicMaterial({
            color: 0xfff6d4,
            transparent: true,
            opacity: 0.32,
            fog: false,
            depthWrite: false
        })
    );
    const sunCore = new THREE.Mesh(
        new THREE.SphereGeometry(6.8, 24, 24),
        new THREE.MeshBasicMaterial({ color: 0xfff0a8, fog: false })
    );
    sunVisual.add(sunGlow, sunCore);
    sunVisual.position.copy(sunDirection.clone().multiplyScalar(340));
    scene.add(sunVisual);

    const mobile = window.matchMedia('(pointer: coarse)').matches
        || window.matchMedia('(hover: none)').matches;

    const camera = new THREE.PerspectiveCamera(46, window.innerWidth / window.innerHeight, 0.1, 1000);
    camera.position.set(0, 3.4, 5.6);

    const renderer = new THREE.WebGLRenderer({ antialias: !mobile, powerPreference: mobile ? 'low-power' : 'high-performance' });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, mobile ? 1.5 : 2));
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.NoToneMapping;
    renderer.toneMappingExposure = 1;
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    document.body.appendChild(renderer.domElement);

    const skyFill = new THREE.HemisphereLight(0xfff9ef, 0x7ec850, 1.35);
    scene.add(skyFill);

    const sunLight = new THREE.DirectionalLight(0xfff6cc, 3.2);
    sunLight.position.copy(sunDirection.clone().multiplyScalar(80));
    sunLight.target.position.set(0, 0, 0);
    sunLight.castShadow = true;
    const shadowSize = mobile ? 1024 : 2048;
    sunLight.shadow.mapSize.width = shadowSize;
    sunLight.shadow.mapSize.height = shadowSize;
    sunLight.shadow.camera.left = -40;
    sunLight.shadow.camera.right = 40;
    sunLight.shadow.camera.top = 40;
    sunLight.shadow.camera.bottom = -40;
    sunLight.shadow.camera.near = 1;
    sunLight.shadow.camera.far = 90;
    sunLight.shadow.bias = -0.0003;
    sunLight.shadow.normalBias = 0.02;
    sunLight.shadow.radius = 2;
    scene.add(sunLight);
    scene.add(sunLight.target);

    const fillLight = new THREE.DirectionalLight(0xe8f4ff, 0.85);
    fillLight.position.set(-16, 10, -12);
    scene.add(fillLight);

    function resizeRenderer() {
        const width = Math.round(window.visualViewport?.width || window.innerWidth);
        const height = Math.round(window.visualViewport?.height || window.innerHeight);
        document.documentElement.style.height = `${height}px`;
        document.body.style.height = `${height}px`;
        camera.aspect = width / Math.max(height, 1);
        camera.updateProjectionMatrix();
        renderer.setSize(width, height, false);
        renderer.domElement.style.width = '100%';
        renderer.domElement.style.height = '100%';
    }

    resizeRenderer();
    window.addEventListener('resize', resizeRenderer);
    window.visualViewport?.addEventListener('resize', resizeRenderer);
    window.visualViewport?.addEventListener('scroll', resizeRenderer);

    return { scene, camera, renderer };
}
