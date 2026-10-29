import * as THREE from 'three';
import { Entity } from './entity.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

export class Player {
    constructor(scene) {
        this.scene = scene;
        this.container = new THREE.Group();
        
        // --- DEBUG SPAWN: Moved player further away from rats at (0,0,0) ---
        this.container.position.set(15, 0, 15);
        
        this.scene.add(this.container);

        this.carModel = null;
        this.speed = 4;
        this.walkDirectionX = 0;
        this.walkDirectionZ = 0;

        this.targetQuaternion = new THREE.Quaternion();
        this.tempMatrix = new THREE.Matrix4();
        this.slerpSpeed = 0.1;

        this.translationX = 0;
        this.translationY = 0;
        this.stoppedMoving = false;

        this.soundDecibel = 0;
        this.aerialSphere = new THREE.Sphere();
        this.collisionSphere = new THREE.Sphere();

        this.initControls();
        this.loadModel();
    }

    loadModel() {
        const loader = new GLTFLoader();
        loader.load("./car.glb", (gltf) => {
            this.carModel = gltf.scene;
            this.container.add(this.carModel);
            this.carModel.traverse((child) => {
                if (child.isMesh) {
                    child.castShadow = true;
                }
            });
            this.targetQuaternion.copy(this.container.quaternion);

            this.aerialSphere.radius = 4;
            this.collisionSphere.radius = 0.05;
            // const debugGeo = new THREE.SphereGeometry(4, 16, 16);
            // const debugMat = new THREE.MeshBasicMaterial({ 
            //     color: 0xff0000, 
            //     wireframe: true 
            // });
            // const debugAerialSphere = new THREE.Mesh(debugGeo, debugMat);
            
            // this.carModel.add(debugAerialSphere);

            Entity.appendEntity("player", this, 1);
        }, undefined, (err) => console.log(err));
    }

    initControls() {
        window.addEventListener("keydown", (e) => {
            switch(e.key) {
                case "d": this.walkDirectionX = 1; break;
                case "a": this.walkDirectionX = -1; break;
                case "w": this.walkDirectionZ = -1; break;
                case "s": this.walkDirectionZ = 1; break;
            }
        });

        window.addEventListener("keyup", (e) => {
            switch(e.key) {
                case "d":
                case "a": this.walkDirectionX = 0; break;
                case "w":
                case "s": this.walkDirectionZ = 0; break;
            }
        });
    }

    update(delta) {
        if(!this.aerialSphere || !this.collisionSphere) return
        this.aerialSphere.center.copy(this.container.position);
        this.collisionSphere.center.copy(this.container.position);
        let moveDirection = new THREE.Vector3(-this.walkDirectionX, 0, -this.walkDirectionZ);
        

        if (moveDirection.lengthSq() > 0) {
            moveDirection.normalize();

            this.tempMatrix.lookAt(new THREE.Vector3(0, 0, 0), moveDirection, new THREE.Vector3(0, 1, 0));
            this.targetQuaternion.setFromRotationMatrix(this.tempMatrix);

            this.translationX += 0.04;
            this.translationY += 0.08;
            this.stoppedMoving = true;
        } 
        else if (this.stoppedMoving) {
            this.translationY += 0.08;
            if (Math.abs(Math.sin(this.translationY * 0.8)) < 0.05) {
                this.stoppedMoving = false;
            }
        }

        if (Math.sin(this.translationX) >= 0.1 || Math.sin(this.translationX) <= -0.1) {
            this.translationX += 0.04;
        }

        // Smooth rotation
        this.container.quaternion.slerp(this.targetQuaternion, this.slerpSpeed);

        // Wobble and bounce effects
        if (this.carModel) {
            this.carModel.rotation.z = Math.sin(this.translationX) * 2 * delta;

            if (!this.stoppedMoving && moveDirection.lengthSq() === 0) {
                this.carModel.position.y = 0;
            } else {
                this.carModel.position.y = Math.abs(Math.sin(this.translationY * 0.8)) * 2 * delta;
            }
        }

        // Position movement
        this.container.position.x += this.walkDirectionX * this.speed * delta;
        this.container.position.z += this.walkDirectionZ * this.speed * delta;
    }
}