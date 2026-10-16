import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { gunzipSync } from 'three/addons/libs/fflate.module.js';
import { fbxCafeAssetUrl } from '../rendering2d/FbxCafeAssets.js';
import { UI_LAYER, assignUiLayer } from '../ui/UiLayer.js';

/** One on-demand, event-rendered WebGL view. No GPU work in the game loop. */
export default class FbxCafeInspector {
    constructor(host, { playerPosition = null } = {}) {
        this.host = host; this.playerPosition = playerPosition; this.closed = false;
        this.abort = new AbortController(); this.showRoof = false;
        this.onKey = (event) => {
            if (event.key === 'Escape') { event.preventDefault(); event.stopImmediatePropagation(); this.dispose(); }
            if (event.key === 'Tab' && this.root) {
                const buttons = [...this.root.querySelectorAll('button:not([disabled])')];
                const index = buttons.indexOf(document.activeElement);
                if (event.shiftKey && index <= 0) { buttons.at(-1)?.focus(); event.preventDefault(); }
                if (!event.shiftKey && index === buttons.length - 1) { buttons[0]?.focus(); event.preventDefault(); }
            }
        };
    }
    async open() {
        this.previousFocus = document.activeElement;
        this.root = assignUiLayer(document.createElement('section'), UI_LAYER.LOCAL_CONTROL);
        this.root.className = 'fbx-cafe-inspector'; this.root.setAttribute('role','dialog');
        this.root.setAttribute('aria-modal','true'); this.root.setAttribute('aria-label','مدل سه‌بعدی کافه دمیان');
        this.root.innerHTML = `<header><div><small>DEMIAN</small><h2>مدل سه‌بعدی کافه</h2></div>
          <div><button type="button" data-fbx-reset>نمای کامل</button><button type="button" data-fbx-roof aria-pressed="false">سقف</button><button type="button" data-fbx-close aria-label="بستن مدل سه‌بعدی">×</button></div></header>
          <div class="fbx-cafe-inspector__stage"><p role="status">در حال بارگذاری مدل سه‌بعدی…</p></div>
          <footer>چرخش با کشیدن · زوم با اسکرول یا دو انگشت · جابه‌جایی با دکمهٔ راست ماوس</footer>`;
        this.host.append(this.root); this.stage = this.root.querySelector('.fbx-cafe-inspector__stage');
        this.root.querySelector('[data-fbx-close]').addEventListener('click', () => this.dispose());
        this.root.querySelector('[data-fbx-reset]').addEventListener('click', () => this.overview());
        this.root.querySelector('[data-fbx-roof]').addEventListener('click', (event) => {
            this.showRoof = !this.showRoof; event.currentTarget.setAttribute('aria-pressed',String(this.showRoof));
            this.model?.traverse((o) => { if (o.userData.overhead) o.visible = this.showRoof; }); this.render();
        });
        this.root.querySelector('[data-fbx-close]').focus(); document.addEventListener('keydown',this.onKey,true);
        try {
            this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
            this.renderer.setPixelRatio(Math.min(globalThis.devicePixelRatio || 1,1.5));
            this.renderer.setClearColor(0xd6cfc0); this.renderer.outputColorSpace = THREE.SRGBColorSpace;
            this.renderer.toneMapping = THREE.ACESFilmicToneMapping; this.renderer.toneMappingExposure = 1;
            this.renderer.domElement.setAttribute('aria-label','مدل قابل چرخش کافه');
            this.scene = new THREE.Scene(); this.scene.add(new THREE.HemisphereLight(0xfff7e6,0x696e77,1.5));
            const light = new THREE.DirectionalLight(0xffeccb,2); light.position.set(-20,120,-40); this.scene.add(light);
            this.camera = new THREE.PerspectiveCamera(40,1,.2,2000);
            this.controls = new OrbitControls(this.camera,this.renderer.domElement);
            this.controls.minDistance = 6; this.controls.maxDistance = 800; this.controls.maxPolarAngle = Math.PI * .49;
            this.controls.addEventListener('change', () => this.render());
            this.stage.append(this.renderer.domElement);
            this.observer = new ResizeObserver(() => this.resize()); this.observer.observe(this.stage);
            this.resize();
            const response = await fetch(fbxCafeAssetUrl('cafe.glb.gz'),{ signal: this.abort.signal });
            if (!response.ok) throw new Error(`Model request failed (${response.status})`);
            const raw = new Uint8Array(await response.arrayBuffer());
            if (this.closed) return;
            // Accept both the stored gzip and servers that transparently decompress it.
            const bytes = raw[0] === 0x1f && raw[1] === 0x8b ? gunzipSync(raw) : raw;
            const gltf = await new GLTFLoader().parseAsync(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength),'');
            if (this.closed) { this.releaseModel(gltf.scene); return; }
            this.model = gltf.scene;
            this.model.traverse((o) => { if (o.userData.overhead) o.visible = this.showRoof; });
            this.scene.add(this.model);
            if (Number.isFinite(this.playerPosition?.x) && Number.isFinite(this.playerPosition?.z)) {
                const marker = new THREE.Mesh(new THREE.ConeGeometry(.8,2,12),new THREE.MeshBasicMaterial({ color:0x00a8b0 }));
                marker.rotation.z = Math.PI; marker.position.set(this.playerPosition.x,3,this.playerPosition.z); this.scene.add(marker);
            }
            this.stage.querySelector('[role="status"]')?.remove(); this.overview();
            this.root.dataset.modelReady = 'true';
        } catch (error) {
            if (this.closed || error.name === 'AbortError') return;
            this.renderer?.domElement.remove();
            const status = this.stage.querySelector('[role="status"]');
            if (status) status.textContent = 'نمای سه‌بعدی بارگذاری نشد. نقشهٔ بازی همچنان در دسترس است.';
            this.root.dataset.modelError = 'true';
            console.warn('[Demian FBX]',error);
        }
    }
    overview() {
        if (!this.controls || !this.model) return;
        const box=new THREE.Box3().setFromObject(this.model),center=box.getCenter(new THREE.Vector3());
        const direction=new THREE.Vector3(105,145,110).normalize();
        const right=new THREE.Vector3().crossVectors(new THREE.Vector3(0,1,0),direction).normalize();
        const up=new THREE.Vector3().crossVectors(direction,right);
        const tanY=Math.tan(THREE.MathUtils.degToRad(this.camera.fov/2)),tanX=tanY*this.camera.aspect;
        let distance=0;
        for(const x of [box.min.x,box.max.x])for(const y of [box.min.y,box.max.y])for(const z of [box.min.z,box.max.z]){
            const p=new THREE.Vector3(x,y,z).sub(center);
            distance=Math.max(distance,p.dot(direction)+Math.abs(p.dot(right))/tanX,p.dot(direction)+Math.abs(p.dot(up))/tanY);
        }
        this.controls.target.copy(center);this.camera.position.copy(center).addScaledVector(direction,distance*1.08);
        this.controls.update();this.render();
    }
    resize() {
        if (!this.renderer || !this.camera || this.closed) return;
        const width = Math.max(1,this.stage.clientWidth), height = Math.max(1,this.stage.clientHeight);
        this.renderer.setSize(width,height); this.camera.aspect = width/height; this.camera.updateProjectionMatrix(); this.render();
    }
    render() { if (!this.closed && this.renderer && this.camera && this.scene) this.renderer.render(this.scene,this.camera); }
    releaseModel(model) {
        const textures = new Set();
        model?.traverse((o) => {
            o.geometry?.dispose();
            for (const material of [].concat(o.material ?? [])) {
                for (const value of Object.values(material)) if (value?.isTexture) textures.add(value);
                material.dispose();
            }
        });
        for (const texture of textures) { texture.source?.data?.close?.(); texture.dispose(); }
    }
    dispose() {
        if (this.closed) return; this.closed = true; this.abort.abort();
        document.removeEventListener('keydown',this.onKey,true); this.observer?.disconnect(); this.controls?.dispose();
        this.releaseModel(this.scene); this.renderer?.dispose(); this.renderer?.forceContextLoss(); this.root?.remove();
        if (this.previousFocus?.isConnected) this.previousFocus.focus();
        this.scene = this.model = this.root = this.renderer = this.controls = null;
    }
}
