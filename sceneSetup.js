import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js';

export function setupScene() {
    const scene = new THREE.Scene();
    
    // --- SKYBOX SETUP ---
    const cubeTextureLoader = new THREE.CubeTextureLoader();
    // Replace these paths with your actual skybox face image paths
    const skyboxTexture = cubeTextureLoader.load([
        './skybox/px.jpg', './skybox/nx.jpg',
        './skybox/py.jpg', './skybox/ny.jpg',
        './skybox/pz.jpg', './skybox/nz.jpg'
    ]);
    scene.background = skyboxTexture;

    const camera = new THREE.PerspectiveCamera(40, window.innerWidth / window.innerHeight, 0.1, 1000);
    camera.position.set(0, 2, 3);

    const renderer = new THREE.WebGLRenderer();
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.shadowMap.enabled = true;
    document.body.appendChild(renderer.domElement);

    const composer = new EffectComposer(renderer);
    const renderPass = new RenderPass(scene, camera);
    composer.addPass(renderPass);

    // Stylized Vignette Shader (Preserves original colors, applies dark edges ONLY in bush)
    const StylizedShader = {
        uniforms: {
            'tDiffuse': { value: null },
            'inBush': { value: 0.0 } 
        },
        vertexShader: `
            varying vec2 vUv;
            void main() {
                vUv = uv;
                gl_Position = vec4(position, 1.0);
            }
        `,
        fragmentShader: `
            uniform sampler2D tDiffuse;
            uniform float inBush;
            varying vec2 vUv;
            void main() {
                vec4 texel = texture2D(tDiffuse, vUv);
                vec3 color = texel.rgb; // Preserves original color without extra tinting
                
                // Apply dark vignette edges ONLY when inBush is true
                if (inBush > 0.5) {
                    vec2 uv = vUv * (1.0 - vUv.yx);
                    float vignette = uv.x * uv.y * 12.0;
                    vignette = pow(vignette, 0.2);
                    color *= mix(1.0, vignette, inBush);
                }

                gl_FragColor = vec4(color, texel.a);
            }
        `
    };

    const stylizedPass = new ShaderPass(StylizedShader);
    composer.addPass(stylizedPass);

    // --- ORIGINAL LIGHTING INTENSITIES ---
    const ambientLight = new THREE.AmbientLight(0xffffff, 4);
    scene.add(ambientLight);

    const sunLight = new THREE.DirectionalLight(0xffffff, 3);
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

    window.addEventListener('resize', () => {
        camera.aspect = window.innerWidth / window.innerHeight;
        camera.updateProjectionMatrix();
        renderer.setSize(window.innerWidth, window.innerHeight);
        composer.setSize(window.innerWidth, window.innerHeight);
    });

    return { scene, camera, renderer, composer, stylizedPass };
}