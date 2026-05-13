import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { FXAAShader } from 'three/addons/shaders/FXAAShader.js';
import { CinematicShader } from './cinematic.js';
import { createSteamParticles } from './steam.js';
import { applyBranding } from './branding.js';

export class SceneView {
    constructor(containerId) {
        this.container = document.getElementById(containerId);
        this.clock = new THREE.Clock();
        this.currentModel = null;
        this.currentProductId = null;
        this.isWireframe = false;
        this.isCinematic = false;
        this.cameraTween = null;
        this.brewState = null;
        this.steam = null;

        this.mixer = null;
        this.bakedAction = null;
        this.bakedActions = null;
        this.bakedDuration = 0;
        this.liquidMesh = null;
        this.liquidInitialColor = null;

        this.cinematicCamera = true;
        this.userOverrideCamera = false;
        this.cinematicWaypoints = {
            startPos: [3.9, 1.6, 2.25],
            startTarget: [0, 0.75, 0],
            endPos: [0, 5.0, 0.5],
            endTarget: [0, 0.5, 0]
        };

        this.animationState = { active: false, type: 'showcase', speed: 1.0 };

        this._initScene();
        this._initLights();
        this._initPostProcessing();
        this._createGround();
        this._loop = this._loop.bind(this);
        this._loop();

        window.addEventListener('resize', () => this._onResize());
    }

    _initScene() {
        this.scene = new THREE.Scene();
        this.scene.background = new THREE.Color(0xf2f0eb);

        this.camera = new THREE.PerspectiveCamera(
            40,
            this.container.clientWidth / this.container.clientHeight,
            0.1,
            1000
        );
        this.camera.position.set(3, 2, 5);

        this.renderer = new THREE.WebGLRenderer({
            antialias: true,
            alpha: true,
            powerPreference: 'high-performance'
        });
        this.renderer.setSize(this.container.clientWidth, this.container.clientHeight);
        this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
        this.renderer.shadowMap.enabled = true;
        this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
        this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
        this.renderer.toneMappingExposure = 1.2;
        this.renderer.outputColorSpace = THREE.SRGBColorSpace;
        this.container.appendChild(this.renderer.domElement);

        this.controls = new OrbitControls(this.camera, this.renderer.domElement);
        this.controls.enableDamping = true;
        this.controls.dampingFactor = 0.05;
        this.controls.enableZoom = true;
        this.controls.zoomSpeed = 1.2;
        this.controls.minDistance = 1.2;
        this.controls.maxDistance = 12;
        this.controls.maxPolarAngle = Math.PI / 1.8;
        this.controls.target.set(0, 0.8, 0);
        this.controls.update();

        this.controls.addEventListener('start', () => {
            this.userOverrideCamera = true;
        });

        this.renderer.domElement.addEventListener('wheel', () => {
            this.userOverrideCamera = true;
        }, { passive: true });

        this.pmrem = new THREE.PMREMGenerator(this.renderer);
        this.pmrem.compileEquirectangularShader();
        const envScene = new THREE.Scene();
        envScene.background = new THREE.Color(0x333333);
        envScene.add(new THREE.DirectionalLight(0xffffff, 1).translateOnAxis(new THREE.Vector3(1,1,1).normalize(), 5));
        envScene.add(new THREE.DirectionalLight(0xffffff, 0.5).translateOnAxis(new THREE.Vector3(-1,0.5,-1).normalize(), 5));
        envScene.add(new THREE.DirectionalLight(0x88aaff, 0.3).translateOnAxis(new THREE.Vector3(0,-1,0), 5));
        this.scene.environment = this.pmrem.fromScene(envScene).texture;
    }

    _initLights() {
        this.ambientLight = new THREE.AmbientLight(0xffffff, 0.6);
        this.scene.add(this.ambientLight);

        this.directionalLight = new THREE.DirectionalLight(0xfff8ee, 1.2);
        this.directionalLight.position.set(5, 8, 5);
        this.directionalLight.castShadow = true;
        this.directionalLight.shadow.mapSize.set(2048, 2048);
        Object.assign(this.directionalLight.shadow.camera, {
            near: 0.1, far: 30, left: -5, right: 5, top: 5, bottom: -5
        });
        this.directionalLight.shadow.bias = -0.0001;
        this.directionalLight.shadow.normalBias = 0.02;
        this.scene.add(this.directionalLight);

        const fill = new THREE.DirectionalLight(0xeaf2ff, 0.4);
        fill.position.set(-5, 3, -3);
        this.scene.add(fill);

        this.rimLight = new THREE.DirectionalLight(0xffffff, 0.25);
        this.rimLight.position.set(-3, 2, -5);
        this.scene.add(this.rimLight);

        this.scene.add(new THREE.HemisphereLight(0xffffff, 0xd8d4c8, 0.3));
    }

    _initPostProcessing() {
        this.composer = new EffectComposer(this.renderer);
        this.composer.addPass(new RenderPass(this.scene, this.camera));

        this.bloomPass = new UnrealBloomPass(
            new THREE.Vector2(this.container.clientWidth, this.container.clientHeight),
            0.12, 0.3, 0.95
        );
        this.composer.addPass(this.bloomPass);

        this.cinematicPass = new ShaderPass(CinematicShader);
        this.cinematicPass.enabled = false;
        this.composer.addPass(this.cinematicPass);

        this.fxaaPass = new ShaderPass(FXAAShader);
        const pr = this.renderer.getPixelRatio();
        this.fxaaPass.material.uniforms.resolution.value.set(
            1 / (this.container.clientWidth * pr),
            1 / (this.container.clientHeight * pr)
        );
        this.composer.addPass(this.fxaaPass);
    }

    _createGround() {
        const ground = new THREE.Mesh(
            new THREE.CircleGeometry(8, 64),
            new THREE.MeshStandardMaterial({
                color: 0xd8d4c8, metalness: 0.1, roughness: 0.85, envMapIntensity: 0.3
            })
        );
        ground.rotation.x = -Math.PI / 2;
        ground.position.y = -0.01;
        ground.receiveShadow = true;
        this.scene.add(ground);

        const grid = new THREE.PolarGridHelper(4, 8, 4, 64, 0xc4bfae, 0xc4bfae);
        this.scene.add(grid);
    }

    loadModel(product, onLoaded) {
        this.currentProductId = product.id;
        this._disposeCurrent();
        this._stopBrew();

        const requestedId = product.id;
        const loader = new GLTFLoader();
        loader.load(
            product.modelUrl,
            (gltf) => {
                if (this.currentProductId !== requestedId) {
                    return;
                }
                if (this.currentModel) this._disposeCurrent();
                this.currentModel = gltf.scene;
                this._normaliseModel(this.currentModel);
                applyBranding(this.currentModel, product.id);
                this._applyDefaultColor(this.currentModel, product.id);
                this.scene.add(this.currentModel);
                this._setupBakedAnimation(gltf);
                if (this.isWireframe) this.setWireframe(true);
                onLoaded?.(true);
            },
            undefined,
            (err) => {
                if (this.currentProductId !== requestedId) return;
                if (this.currentModel) this._disposeCurrent();
                this.currentModel = this._createPlaceholder(product.id);
                this._normaliseModel(this.currentModel);
                applyBranding(this.currentModel, product.id);
                this._applyDefaultColor(this.currentModel, product.id);
                this.scene.add(this.currentModel);
                if (this.isWireframe) this.setWireframe(true);
                onLoaded?.(false);
            }
        );
    }

    _applyDefaultColor(root, productId) {
        const defaults = {
            'coffee-bag': { meshName: 'bagbody', color: 0xffffff }
        };
        const cfg = defaults[productId];
        if (!cfg) return;
        root.traverse(child => {
            if (!child.isMesh || !child.material) return;
            if ((child.name || '').toLowerCase() !== cfg.meshName) return;
            const mats = Array.isArray(child.material) ? child.material : [child.material];
            mats.forEach(m => {
                if (m && m.color) {
                    m.color.set(cfg.color);
                    m.needsUpdate = true;
                }
            });
        });
    }

    _setupBakedAnimation(gltf) {
        this.mixer = null;
        this.bakedAction = null;
        this.bakedDuration = 0;
        this.liquidMesh = null;
        this.liquidInitialColor = null;

        if (!gltf.animations || gltf.animations.length === 0) return;

        this.mixer = new THREE.AnimationMixer(this.currentModel);

        this.bakedActions = gltf.animations.map(clip => {
            const action = this.mixer.clipAction(clip);
            action.setLoop(THREE.LoopOnce, 1);
            action.clampWhenFinished = true;
            action.weight = 1;
            action.enabled = true;
            return action;
        });
        this.bakedAction = this.bakedActions[0];
        this.bakedDuration = this.bakedAction.getClip().duration;

        this.bakedActions.forEach(a => { a.reset(); a.play(); });
        this.mixer.update(0.0001);
        this.bakedActions.forEach(a => { a.time = 0; a.paused = true; });

        const plunger = this.currentModel.getObjectByName('Plunger');
        if (plunger) {
            plunger.position.set(0, 0, 0);
        }
        const topFlap = this.currentModel.getObjectByName('TopFlap');
        if (topFlap) topFlap.rotation.x = 0;

        const liquid = this.currentModel.getObjectByName('Liquid');
        if (liquid && liquid.material && liquid.material.color) {
            this.liquidMesh = liquid;
            this.liquidInitialColor = liquid.material.color.clone();
        }
    }

    _disposeCurrent() {
        if (!this.currentModel) return;
        if (this.mixer) {
            this.mixer.stopAllAction();
            this.mixer.uncacheRoot(this.currentModel);
            this.mixer = null;
        }
        this.bakedAction = null;
        this.bakedActions = null;
        this.bakedDuration = 0;
        this.liquidMesh = null;
        this.liquidInitialColor = null;
        this.scene.remove(this.currentModel);
        this.currentModel.traverse((child) => {
            if (child.isMesh) {
                child.geometry?.dispose?.();
                const mats = Array.isArray(child.material) ? child.material : [child.material];
                mats.forEach(m => m?.dispose?.());
            }
        });
        this.currentModel = null;
    }

    _normaliseModel(root) {
        const box = new THREE.Box3().setFromObject(root);
        const size = box.getSize(new THREE.Vector3());
        const centre = box.getCenter(new THREE.Vector3());
        const scale = 2 / Math.max(size.x, size.y, size.z);
        root.scale.setScalar(scale);
        root.position.set(-centre.x * scale, -box.min.y * scale, -centre.z * scale);

        root.traverse((child) => {
            if (!child.isMesh) return;
            child.castShadow = true;
            child.receiveShadow = true;
            this._enhanceMaterial(child.material);

            const meshName = (child.name || '').toLowerCase();
            if (['lid', 'dome', 'domelid'].includes(meshName)) {
                child.material = new THREE.MeshPhysicalMaterial({
                    color: 0xffffff,
                    transmission: 0.85,
                    roughness: 0.08,
                    ior: 1.45,
                    thickness: 0.3,
                    transparent: true,
                    opacity: 0.55,
                    envMapIntensity: 1.5,
                    side: THREE.DoubleSide
                });
            }
        });
    }

    _enhanceMaterial(material) {
        if (!material) return;
        if (Array.isArray(material)) return material.forEach(m => this._enhanceMaterial(m));
        if (material.envMapIntensity !== undefined) material.envMapIntensity = 1.5;
        const name = (material.name || '').toLowerCase();
        if (name.includes('glass') || material.transparent) {
            if (material.transmission !== undefined) {
                material.transmission = 0.95;
                material.thickness = 0.5;
                material.roughness = 0.05;
                material.ior = 1.45;
            }
        }
        if (name.includes('metal') || name.includes('steel') || material.metalness > 0.5) {
            material.metalness = 1.0;
            material.roughness = Math.min(material.roughness ?? 0.3, 0.3);
            material.envMapIntensity = 2;
        }
        material.needsUpdate = true;
    }

    _createPlaceholder(id) {
        const group = new THREE.Group();
        const glass = new THREE.MeshPhysicalMaterial({
            color: 0xffffff, metalness: 0, roughness: 0.05,
            transmission: 0.95, thickness: 0.3, ior: 1.45, envMapIntensity: 2
        });
        const metal = new THREE.MeshStandardMaterial({
            color: 0x888888, metalness: 1, roughness: 0.2, envMapIntensity: 2
        });
        const plastic = new THREE.MeshStandardMaterial({ color: 0x222222, roughness: 0.4 });

        if (id === 'french-press') {
            const carafe = new THREE.Mesh(
                new THREE.CylinderGeometry(0.5, 0.45, 1.6, 32, 1, true), glass
            );
            carafe.name = 'Carafe';
            carafe.position.y = 0.9;
            carafe.castShadow = true;
            group.add(carafe);

            for (const [y, name] of [[1.7, 'Frame_TopBand'], [0.15, 'Frame_BottomBand']]) {
                const ring = new THREE.Mesh(new THREE.TorusGeometry(0.52, 0.03, 16, 32), metal);
                ring.rotation.x = Math.PI / 2;
                ring.position.y = y;
                ring.name = name;
                group.add(ring);
            }
            const handleCurve = new THREE.CatmullRomCurve3([
                new THREE.Vector3(0.52, 1.5, 0),
                new THREE.Vector3(0.85, 0.9, 0),
                new THREE.Vector3(0.52, 0.3, 0)
            ]);
            const handle = new THREE.Mesh(new THREE.TubeGeometry(handleCurve, 20, 0.04, 8, false), metal);
            handle.name = 'Handle';
            group.add(handle);

            const rod = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 1.2, 8), metal);
            rod.position.y = 1.9;
            rod.name = 'PlungerRod';
            group.add(rod);

            const knob = new THREE.Mesh(new THREE.SphereGeometry(0.08, 16, 16), plastic);
            knob.position.y = 2.5;
            knob.name = 'Knob';
            group.add(knob);

            const base = new THREE.Mesh(new THREE.CylinderGeometry(0.55, 0.55, 0.08, 32), metal);
            base.position.y = 0.04;
            base.name = 'Base';
            group.add(base);
        } else if (id === 'takeaway-cup') {
            const cup = new THREE.Mesh(
                new THREE.CylinderGeometry(0.42, 0.32, 1.3, 32),
                new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.9 })
            );
            cup.position.y = 0.65; cup.castShadow = true; cup.name = 'Body';
            group.add(cup);
            const sleeve = new THREE.Mesh(
                new THREE.CylinderGeometry(0.39, 0.34, 0.5, 32),
                new THREE.MeshStandardMaterial({ color: 0x8B4513, roughness: 0.95 })
            );
            sleeve.position.y = 0.45; sleeve.name = 'Sleeve';
            group.add(sleeve);
            const lidMat = new THREE.MeshPhysicalMaterial({
                color: 0xffffff,
                transmission: 0.85,
                roughness: 0.08,
                ior: 1.45,
                thickness: 0.3,
                transparent: true,
                opacity: 0.55,
                envMapIntensity: 1.5,
                side: THREE.DoubleSide
            });
            const lid = new THREE.Mesh(new THREE.CylinderGeometry(0.44, 0.42, 0.12, 32), lidMat);
            lid.position.y = 1.36; lid.name = 'Lid';
            group.add(lid);
            const dome = new THREE.Mesh(
                new THREE.SphereGeometry(0.35, 32, 16, 0, Math.PI*2, 0, Math.PI/2), lidMat
            );
            dome.position.y = 1.4; dome.name = 'Dome';
            group.add(dome);

            const strawMat = new THREE.MeshStandardMaterial({
                color: 0x00704A, roughness: 0.25, metalness: 0
            });
            const straw = new THREE.Mesh(
                new THREE.CylinderGeometry(0.035, 0.035, 1.5, 20, 1, true),
                strawMat
            );
            straw.position.set(0.18, 1.55, 0);
            straw.rotation.z = -0.14;
            straw.name = 'Straw';
            straw.castShadow = true;
            group.add(straw);
        } else if (id === 'coffee-bag') {
            const whiteMat = new THREE.MeshStandardMaterial({ color: 0xF2EEE2, roughness: 0.55 });
            const brownMat = new THREE.MeshStandardMaterial({ color: 0x8C4A1B, roughness: 0.8 });
            const valveMat = new THREE.MeshStandardMaterial({ color: 0x141414, roughness: 0.45 });

            const bodyGeo = new THREE.BoxGeometry(0.9, 1.4, 0.45);
            const bagBody = new THREE.Mesh(bodyGeo, [brownMat, brownMat, brownMat, brownMat, whiteMat, whiteMat]);
            bagBody.position.y = 0.7;
            bagBody.castShadow = true;
            bagBody.name = 'Body';
            group.add(bagBody);

            const finGeo = new THREE.BoxGeometry(0.92, 0.08, 0.06);
            const fin = new THREE.Mesh(finGeo, whiteMat);
            fin.position.set(0, 1.44, 0);
            fin.name = 'FinSeal';
            group.add(fin);

            const pleatCount = 24;
            for (let i = 0; i < pleatCount; i++) {
                const tx = i / (pleatCount - 1);
                const x = -0.45 + tx * 0.9;
                const ridge = new THREE.Mesh(
                    new THREE.BoxGeometry(0.012, 0.08, 0.075),
                    whiteMat
                );
                ridge.position.set(x, 1.44, 0);
                group.add(ridge);
            }

            const valve = new THREE.Mesh(
                new THREE.CylinderGeometry(0.05, 0.05, 0.012, 24),
                valveMat
            );
            valve.rotation.x = Math.PI / 2;
            valve.position.set(0, 0.4, 0.227);
            valve.name = 'Valve';
            group.add(valve);
        }
        return group;
    }

    setWireframe(enabled) {
        this.isWireframe = enabled;
        if (!this.currentModel) return;
        this.currentModel.traverse((c) => {
            if (c.isMesh && c.material) {
                const mats = Array.isArray(c.material) ? c.material : [c.material];
                mats.forEach(m => m.wireframe = enabled);
            }
        });
    }

    setAmbient(on) { this.ambientLight.visible = on; }

    setIntensity(scale) {
        this.ambientLight.intensity = 0.6 * scale;
        this.directionalLight.intensity = 1.2 * scale;
        this.bloomPass.strength = 0.12 * scale;
    }

    setAutoRotate(on) {
        this.controls.autoRotate = on;
        this.controls.autoRotateSpeed = 1.5;
    }

    setCinematic(on) {
        this.isCinematic = on;
        this.cinematicPass.enabled = on;
    }

    cycleAnimation() {
        const types = ['showcase', 'float', 'spin', 'bounce'];
        if (!this.animationState.active) {
            this.animationState.active = true;
            this.animationState.type = 'showcase';
            return { active: true, type: 'showcase' };
        }
        const idx = types.indexOf(this.animationState.type);
        const next = (idx + 1) % types.length;
        if (next === 0) {
            this.animationState.active = false;
            if (this.currentModel) {
                this.currentModel.position.y = 0;
                this.currentModel.rotation.y = 0;
            }
            return { active: false, type: null };
        }
        this.animationState.type = types[next];
        return { active: true, type: types[next] };
    }

    tweenCamera(toPos, toTarget, duration = 800) {
        if (this.cameraTween) cancelAnimationFrame(this.cameraTween);
        const startPos = this.camera.position.clone();
        const startTarget = this.controls.target.clone();
        const endPos = new THREE.Vector3().fromArray(toPos);
        const endTarget = new THREE.Vector3().fromArray(toTarget);
        const t0 = performance.now();
        const ease = (x) => x < 0.5 ? 2*x*x : 1 - Math.pow(-2*x + 2, 2)/2;

        const step = () => {
            const t = Math.min(1, (performance.now() - t0) / duration);
            const k = ease(t);
            this.camera.position.lerpVectors(startPos, endPos, k);
            this.controls.target.lerpVectors(startTarget, endTarget, k);
            this.controls.update();
            if (t < 1) this.cameraTween = requestAnimationFrame(step);
            else this.cameraTween = null;
        };
        step();
    }

    swapColor(hex, swappableNames = []) {
        if (!this.currentModel) return;
        const target = swappableNames.map(n => n.toLowerCase());
        const colour = new THREE.Color(hex);
        this.currentModel.traverse((c) => {
            if (!c.isMesh || !c.material) return;
            const matchByName = target.some(n => (c.name || '').toLowerCase().includes(n));
            if (!matchByName) return;
            const mats = Array.isArray(c.material) ? c.material : [c.material];
            mats.forEach(m => {
                if (m.color) m.color.copy(colour);
                m.needsUpdate = true;
            });
        });
    }

    swapFinish({ roughness, metalness }) {
        if (!this.currentModel) return;
        this.currentModel.traverse((c) => {
            if (!c.isMesh || !c.material) return;
            const mats = Array.isArray(c.material) ? c.material : [c.material];
            mats.forEach(m => {
                if (m.roughness !== undefined) m.roughness = roughness;
                if (m.metalness !== undefined) m.metalness = metalness;
                m.needsUpdate = true;
            });
        });
    }

    _playSyncedAudio(audioEl) {
        if (!audioEl) return;
        this._brewAudioRef = audioEl;
        audioEl.currentTime = 0;
        const setRate = () => {
            const d = audioEl.duration;
            if (d && !isNaN(d) && this.bakedDuration > 0) {
                audioEl.playbackRate = Math.max(0.5, Math.min(4.0, d / this.bakedDuration));
            } else {
                audioEl.playbackRate = 1.0;
            }
        };
        if (audioEl.readyState >= 1) {
            setRate();
        } else {
            audioEl.addEventListener('loadedmetadata', setRate, { once: true });
        }
        audioEl.play().catch(() => {});
    }

    _stopBrewAudio() {
        if (this._brewAudioRef && !this._brewAudioRef.paused) {
            this._brewAudioRef.pause();
            this._brewAudioRef.currentTime = 0;
        }
    }

    startBrew(audioEl) {
        if (!this.currentModel) return false;

        this.userOverrideCamera = false;

        if (this.bakedActions && this.bakedActions.length && this.mixer) {
            this.bakedActions.forEach(a => {
                a.reset();
                a.timeScale = 1;
                a.paused = false;
                a.play();
            });
            this._playSyncedAudio(audioEl);
            return true;
        }

        if (this.currentProductId !== 'french-press') return false;
        this._stopBrew();

        const knob = this.currentModel.getObjectByName('Knob');
        const rod = this.currentModel.getObjectByName('PlungerRod');
        const carafe = this.currentModel.getObjectByName('Carafe');

        const startKnobY = knob ? knob.position.y : 0;
        const startRodY = rod ? rod.position.y : 0;

        const baseY = carafe ? 1.8 : 1.6;
        this.steam = createSteamParticles({ count: 220, baseY });
        this.scene.add(this.steam);

        this.brewState = {
            t0: performance.now(),
            duration: 4500,
            knob, rod, carafe,
            startKnobY, startRodY,
            originalCarafeColor: carafe?.material?.color ? carafe.material.color.clone() : null
        };

        if (audioEl) { audioEl.currentTime = 0; audioEl.play().catch(() => {}); }
        return true;
    }

    setBrewProgress(t) {
        t = Math.max(0, Math.min(1, t));

        if (this.mixer && this.bakedActions && this.bakedActions.length && this.bakedDuration > 0) {
            const seekTime = t * this.bakedDuration;
            this.bakedActions.forEach(a => {
                if (!a.isRunning()) { a.reset(); a.play(); }
                a.paused = true;
                a.time = seekTime;
            });
            this.mixer.setTime(seekTime);

            if (this.liquidMesh && this.liquidInitialColor) {
                const coffee = new THREE.Color(0x3a1c08);
                this.liquidMesh.material.color.copy(this.liquidInitialColor).lerp(coffee, t);
                this.liquidMesh.material.needsUpdate = true;
            }
            return;
        }

        if (this.currentProductId !== 'french-press' || !this.currentModel) return;

        const knob = this.currentModel.getObjectByName('Knob');
        const rod = this.currentModel.getObjectByName('PlungerRod');
        const carafe = this.currentModel.getObjectByName('Carafe');

        if (!this._timelineStartPositions) {
            this._timelineStartPositions = {
                knobY: knob ? knob.position.y : 0,
                rodY: rod ? rod.position.y : 0,
                carafeColor: carafe?.material?.color ? carafe.material.color.clone() : null
            };
        }

        const ease = (x) => 1 - Math.pow(1 - x, 3);
        const k = ease(t);
        const drop = 0.18 * k;
        const sp = this._timelineStartPositions;

        if (knob) knob.position.y = sp.knobY - drop;
        if (rod)  rod.position.y  = sp.rodY  - drop;

        if (carafe?.material?.color && sp.carafeColor) {
            const target = new THREE.Color(0x6b3a1a);
            carafe.material.color.copy(sp.carafeColor).lerp(target, k * 0.6);
        }
    }

    resumeBrew(audioEl) {
        if (this.mixer && this.bakedActions && this.bakedActions.length) {
            this.bakedActions.forEach(a => { a.paused = false; });
            if (audioEl) { audioEl.currentTime = 0; audioEl.play().catch(() => {}); }
            return true;
        }
        return this.startBrew(audioEl);
    }

    pauseBrew() {
        if (this.mixer && this.bakedActions && this.bakedActions.length) {
            this.bakedActions.forEach(a => { a.paused = true; });
        }
        if (this.brewState) {
            this.brewState.t0 = performance.now() - this.brewState.duration;
        }
    }

    getBrewProgress() {
        if (this.mixer && this.bakedAction && this.bakedDuration > 0) {
            return Math.min(1, this.bakedAction.time / this.bakedDuration);
        }
        if (this.brewState) {
            return Math.min(1, (performance.now() - this.brewState.t0) / this.brewState.duration);
        }
        return 0;
    }

    _stopBrew() {
        if (this.steam) {
            this.scene.remove(this.steam);
            this.steam.geometry.dispose();
            this.steam.material.dispose();
            this.steam = null;
        }
        if (this.brewState) {
            const { knob, rod, startKnobY, startRodY, carafe, originalCarafeColor } = this.brewState;
            if (knob) knob.position.y = startKnobY;
            if (rod) rod.position.y = startRodY;
            if (carafe?.material?.color && originalCarafeColor) {
                carafe.material.color.copy(originalCarafeColor);
            }
            this.brewState = null;
        }
    }

    _updateBrew(time) {
        if (!this.brewState) return;
        const t = Math.min(1, (performance.now() - this.brewState.t0) / this.brewState.duration);
        const ease = (x) => 1 - Math.pow(1 - x, 3);
        const k = ease(t);

        const drop = 0.18 * k;
        if (this.brewState.knob) this.brewState.knob.position.y = this.brewState.startKnobY - drop;
        if (this.brewState.rod)  this.brewState.rod.position.y  = this.brewState.startRodY  - drop;

        if (this.brewState.carafe?.material?.color && this.brewState.originalCarafeColor) {
            const target = new THREE.Color(0x6b3a1a);
            this.brewState.carafe.material.color.copy(this.brewState.originalCarafeColor).lerp(target, k * 0.6);
        }

        if (this.steam) {
            const opacity = (k < 0.2 ? k / 0.2 : (k > 0.85 ? (1 - k) / 0.15 : 1)) * 0.85;
            this.steam.userData.shaderMaterial.uniforms.opacity.value = Math.max(0, opacity);
            this.steam.userData.shaderMaterial.uniforms.time.value = time;
        }

        if (t >= 1) {
            this.brewState.t0 = performance.now() - this.brewState.duration;
        }
    }

    _onResize() {
        const w = this.container.clientWidth;
        const h = this.container.clientHeight;
        this.camera.aspect = w / h;
        this.camera.updateProjectionMatrix();
        this.renderer.setSize(w, h);
        this.composer.setSize(w, h);
        const pr = this.renderer.getPixelRatio();
        this.fxaaPass.material.uniforms.resolution.value.set(1/(w*pr), 1/(h*pr));
    }

    _animateModel(delta, time) {
        if (!this.currentModel || !this.animationState.active) return;
        const speed = this.animationState.speed;
        switch (this.animationState.type) {
            case 'float':
                this.currentModel.position.y = Math.sin(time * speed) * 0.05 + 0.05;
                this.currentModel.rotation.y = Math.sin(time * speed * 0.5) * 0.05;
                break;
            case 'spin':
                this.currentModel.rotation.y += delta * speed * 0.5;
                break;
            case 'bounce':
                this.currentModel.position.y = Math.abs(Math.sin(time * speed * 2)) * 0.15;
                break;
            case 'showcase':
                this.currentModel.rotation.y += delta * 0.3;
                this.currentModel.position.y = Math.sin(time * 0.5) * 0.03 + 0.03;
                break;
        }
    }

    _loop() {
        requestAnimationFrame(this._loop);
        const delta = this.clock.getDelta();
        const time = this.clock.getElapsedTime();
        this.controls.update();
        this._animateModel(delta, time);
        this._updateBrew(time);

        if (this.mixer) {
            this.mixer.update(delta);
            if (this.liquidMesh && this.liquidInitialColor && this.bakedAction && this.bakedDuration > 0) {
                const t = Math.min(1, this.bakedAction.time / this.bakedDuration);
                const coffee = new THREE.Color(0x3a1c08);
                this.liquidMesh.material.color
                    .copy(this.liquidInitialColor)
                    .lerp(coffee, t);
                this.liquidMesh.material.needsUpdate = true;
            }
            if (this.bakedAction && this.bakedDuration > 0
                && this.bakedAction.time >= this.bakedDuration - 0.02
                && this._brewAudioRef && !this._brewAudioRef.paused) {
                this._brewAudioRef.pause();
            }
        }

        const animPlaying = this.bakedAction
            && this.bakedDuration > 0
            && this.bakedAction.time > 0
            && this.bakedAction.time < this.bakedDuration
            && !this.bakedAction.paused;

        if (this.cinematicCamera && !this.userOverrideCamera
            && this.currentProductId === 'coffee-bag'
            && animPlaying) {
            const t = Math.min(1, Math.max(0, this.bakedAction.time / this.bakedDuration));
            const k = t * t * (3 - 2 * t);
            const w = this.cinematicWaypoints;

            this.camera.position.set(
                w.startPos[0]    + (w.endPos[0]    - w.startPos[0])    * k,
                w.startPos[1]    + (w.endPos[1]    - w.startPos[1])    * k,
                w.startPos[2]    + (w.endPos[2]    - w.startPos[2])    * k
            );
            this.controls.target.set(
                w.startTarget[0] + (w.endTarget[0] - w.startTarget[0]) * k,
                w.startTarget[1] + (w.endTarget[1] - w.startTarget[1]) * k,
                w.startTarget[2] + (w.endTarget[2] - w.startTarget[2]) * k
            );
            this.controls.update();
        }

        this.cinematicPass.uniforms.time.value = time;
        this.composer.render();
    }
}