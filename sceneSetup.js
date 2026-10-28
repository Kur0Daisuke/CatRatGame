import * as THREE from 'three';

export function setupScene() {
    const scene = new THREE.Scene();
    
    const camera = new THREE.PerspectiveCamera(40, window.innerWidth / window.innerHeight, 0.1, 1000);
    camera.position.set(0, 2, 3);

    const renderer = new THREE.WebGLRenderer();
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.shadowMap.enabled = true;
    document.body.appendChild(renderer.domElement);

    // Lights
    const ambientLight = new THREE.AmbientLight(0xffffff, 2);
    scene.add(ambientLight);

    const sunLight = new THREE.DirectionalLight(0xffffff, 2);
    sunLight.position.set(10, 20, 10);
    sunLight.castShadow = true;
    sunLight.shadow.mapSize.width = 2048;
    sunLight.shadow.mapSize.height = 2048;
    sunLight.shadow.camera.left = -100;
    sunLight.shadow.camera.right = 100;
    sunLight.shadow.camera.top = 100;
    sunLight.shadow.camera.bottom = -100;
    sunLight.shadow.camera.near = 0.5;
    sunLight.shadow.camera.far = 100;
    sunLight.shadow.bias = -0.0005;
    scene.add(sunLight);

    // Grass Floor
    const textureLoader = new THREE.TextureLoader();
    const myTexture = textureLoader.load('./grass.jpg', () => {
        myTexture.wrapS = THREE.RepeatWrapping;
        myTexture.wrapT = THREE.RepeatWrapping;
        myTexture.repeat.set(100, 100);
    });

    const material = new THREE.MeshStandardMaterial({ 
        map: myTexture, 
        roughness: 0.8, 
        metalness: 0.1 
    });
    const flatObject = new THREE.Mesh(new THREE.PlaneGeometry(100, 100), material);
    flatObject.rotation.x = -Math.PI / 2;
    flatObject.position.set(0, 0, 0);
    flatObject.receiveShadow = true;
    scene.add(flatObject);

    // Handle window resizing
    window.addEventListener('resize', () => {
        camera.aspect = window.innerWidth / window.innerHeight;
        camera.updateProjectionMatrix();
        renderer.setSize(window.innerWidth, window.innerHeight);
    });

    return { scene, camera, renderer };
}