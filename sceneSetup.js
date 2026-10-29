import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js';

export function setupScene() {
    const scene = new THREE.Scene();
    
    scene.background = new THREE.Color(0x9fd4ff);
    scene.fog = new THREE.Fog(0xb8dcff, 48, 110);

    const sky = new THREE.Mesh(
        new THREE.SphereGeometry(420, 24, 16),
        new THREE.ShaderMaterial({
            side: THREE.BackSide,
            depthWrite: false,
            fog: false,
            uniforms: {
                topColor: { value: new THREE.Color(0x5eb0ff) },
                horizonColor: { value: new THREE.Color(0xfff6d4) }
            },
            vertexShader: `
                varying vec3 vDir;
                void main() {
                    vDir = position;
                    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
                }
            `,
            fragmentShader: `
                varying vec3 vDir;
                uniform vec3 topColor;
                uniform vec3 horizonColor;
                void main() {
                    float h = normalize(vDir).y;
                    float t = smoothstep(-0.02, 0.55, h);
                    gl_FragColor = vec4(mix(horizonColor, topColor, t), 1.0);
                }
            `
        })
    );
    scene.add(sky);

    const camera = new THREE.PerspectiveCamera(40, window.innerWidth / window.innerHeight, 0.1, 1000);
    camera.position.set(0, 3.4, 5.6);

    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.NoToneMapping;
    renderer.toneMappingExposure = 1;
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
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
                
                // Apply dark vignette edges when hiding in bushes (0 = open, 1 = fully concealed)
                if (inBush > 0.001) {
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

    const skyFill = new THREE.HemisphereLight(0xfff9ef, 0x7ec850, 1.35);
    scene.add(skyFill);

    const sunLight = new THREE.DirectionalLight(0xfff6cc, 3.2);
    sunLight.position.set(24, 36, 14);
    sunLight.castShadow = true;
    sunLight.shadow.mapSize.width = 2048;
    sunLight.shadow.mapSize.height = 2048;
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

    const textureLoader = new THREE.TextureLoader();
    const myTexture = textureLoader.load('./grass.jpg', () => {
        myTexture.colorSpace = THREE.SRGBColorSpace;
        myTexture.wrapS = THREE.RepeatWrapping;
        myTexture.wrapT = THREE.RepeatWrapping;
        myTexture.repeat.set(100, 100);
        myTexture.anisotropy = renderer.capabilities.getMaxAnisotropy();
    });
    myTexture.colorSpace = THREE.SRGBColorSpace;

    const material = new THREE.MeshStandardMaterial({ 
        map: myTexture,
        color: 0xd8f5a8,
        roughness: 0.92,
        metalness: 0
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