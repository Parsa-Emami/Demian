import { UI_LAYER, assignUiLayer } from '../../../ui/UiLayer.js';
import { PIXEL_PALETTE as P } from '../../../rendering2d/PixelPalette.js';
import CafePixelRenderer from '../../../rendering2d/CafePixelRenderer.js';
import { cafeMapCamera } from './CafeMapProjection.js';
import FbxCafeInspector from '../../../rendering3d/FbxCafeInspector.js';

function setText(element, value) {
    if (element) element.textContent = String(value ?? '');
}

function pixel(value) { return Math.round(Number(value) || 0); }

export default class WorldMap {
    constructor({ host, manifest, discovery, onFastTravel = null, onClose = null } = {}) {
        this.host = host;
        this.manifest = manifest;
        this.discovery = discovery;
        this.onFastTravel = onFastTravel;
        this.onClose = onClose;
        this.root = null;
        this.canvas = null;
        this.context = null;
        this.selectedId = null;
        this.cafe = new CafePixelRenderer({ bounds: manifest.bounds });
        this.mapZoom = 1;
        this.mapCenter = null;
        this.drag = null; this.dragMoved = false;
        this.boundWheel = (event) => { event.preventDefault(); this.zoom(this.mapZoom * (event.deltaY < 0 ? 1.25 : .8), event); };
        this.boundDown = (event) => {
            this.drag = { x:event.clientX,z:event.clientY,center:{...this.mapCamera(this.canvas.width,this.canvas.height).position},id:event.pointerId };
            this.dragMoved = false; this.canvas.setPointerCapture(event.pointerId);
        };
        this.boundMove = (event) => {
            if (!this.drag) return;
            const ratio = this.canvas.width/Math.max(1,this.canvas.getBoundingClientRect().width);
            const scale = this.mapCamera(this.canvas.width,this.canvas.height).pixelsPerUnit;
            const dx = (event.clientX-this.drag.x)*ratio, dz = (event.clientY-this.drag.z)*ratio;
            this.dragMoved ||= Math.hypot(dx,dz)>4;
            this.mapCenter = { x:this.drag.center.x-dx/scale,z:this.drag.center.z-dz/scale }; this.draw();
        };
        this.boundUp = (event) => { this.drag = null; if(this.canvas.hasPointerCapture(event.pointerId))this.canvas.releasePointerCapture(event.pointerId); };
        this.sceneCanvas = null;
        this.sceneKey = null;
        this.playerPosition = { x: 0, z: 0 };
        this.boundClick = (event) => this.selectFromPointer(event);
        this.boundKey = (event) => { if (event.key === 'Escape') this.close(); };
    }

    mount() {
        if (!this.host || this.root) return;
        this.root = document.createElement('section');
        this.root.className = 'open-world-map';
        assignUiLayer(this.root, UI_LAYER.LOCAL_BASE);
        this.root.hidden = true;
        this.root.setAttribute('aria-hidden', 'true');
        this.root.innerHTML = `
            <div class="open-world-map__panel" role="dialog" aria-modal="true" aria-label="نقشه کافه دمیان">
                <header><div><small>DEMIAN // CAFÉ</small><h2>نقشه کافه</h2></div><button type="button" data-map-3d>نمای سه‌بعدی</button><button type="button" data-map-close aria-label="بستن نقشه">×</button></header>
                <div class="open-world-map__canvas-wrap"><canvas></canvas><div class="open-world-map__zoom" data-ui-layer="local-control"><button type="button" data-map-zoom-in aria-label="بزرگ‌نمایی">+</button><button type="button" data-map-zoom-out aria-label="کوچک‌نمایی">−</button><button type="button" data-map-fit>نقشه کامل</button></div></div>
                <footer><div><strong data-map-selection>یک Save Point را انتخاب کن</strong><small data-map-status>نقاط کشف‌شده برای سفر سریع فعال‌اند.</small></div><button type="button" data-map-travel disabled>سفر سریع</button></footer>
            </div>`;
        this.canvas = this.root.querySelector('canvas');
        this.context = this.canvas.getContext('2d', { alpha: false });
        if (this.context) this.context.imageSmoothingEnabled = false;
        this.root.querySelector('[data-map-3d]').addEventListener('click', () => {
            this.inspector?.dispose();
            this.inspector = new FbxCafeInspector(this.root, { playerPosition: this.playerPosition });
            this.inspector.open();
        });
        this.closeButton = this.root.querySelector('[data-map-close]');
        this.travelButton = this.root.querySelector('[data-map-travel]');
        this.selectionLabel = this.root.querySelector('[data-map-selection]');
        this.statusLabel = this.root.querySelector('[data-map-status]');
        this.closeButton.addEventListener('click', () => this.close());
        this.travelButton.addEventListener('click', () => this.travel());
        this.root.querySelector('[data-map-zoom-in]').addEventListener('click', () => this.zoom(this.mapZoom*1.5));
        this.root.querySelector('[data-map-zoom-out]').addEventListener('click', () => this.zoom(this.mapZoom/1.5));
        this.root.querySelector('[data-map-fit]').addEventListener('click', () => { this.mapZoom=1;this.mapCenter=null;this.draw(); });
        this.canvas.addEventListener('wheel',this.boundWheel,{passive:false});
        this.canvas.addEventListener('pointerdown',this.boundDown);
        this.canvas.addEventListener('pointermove',this.boundMove);
        this.canvas.addEventListener('pointerup',this.boundUp);
        this.canvas.addEventListener('pointercancel',this.boundUp);
        this.canvas.addEventListener('click', this.boundClick);
        this.host.append(this.root);
    }

    open(position = null) {
        if (!this.root) this.mount();
        if (position) this.playerPosition = { x: Number(position.x) || 0, z: Number(position.z) || 0 };
        this.mapZoom=1;this.mapCenter=null;
        this.root.hidden = false;
        this.root.setAttribute('aria-hidden', 'false');
        document.addEventListener('keydown', this.boundKey);
        this.draw();
        this.closeButton?.focus();
    }

    close() {
        if (!this.root || this.root.hidden) return;
        this.inspector?.dispose(); this.inspector = null;
        this.root.hidden = true;
        this.root.setAttribute('aria-hidden', 'true');
        document.removeEventListener('keydown', this.boundKey);
        this.onClose?.();
    }

    isOpen() { return Boolean(this.root && !this.root.hidden); }

    mapCamera(width,height) {
        const camera=cafeMapCamera(this.manifest.bounds,width,height,
            Math.max(24,Math.round(Math.min(width,height)*.055)),{zoom:this.mapZoom,center:this.mapCenter});
        return camera;
    }
    project(point = {},width,height) { return this.mapCamera(width,height).worldToScreen(point); }
    zoom(value,event=null) {
        const next=Math.max(1,Math.min(14,value));
        const before=this.mapCamera(this.canvas.width,this.canvas.height);
        let anchor={x:this.canvas.width/2,y:this.canvas.height/2};
        if(event){const rect=this.canvas.getBoundingClientRect();anchor={x:(event.clientX-rect.left)*this.canvas.width/rect.width,y:(event.clientY-rect.top)*this.canvas.height/rect.height};}
        const world=before.screenToWorld(anchor),oldZoom=this.mapZoom;this.mapZoom=next;
        if(!event && oldZoom===1 && next>1)this.mapCenter={...this.playerPosition};
        else {
            const after=this.mapCamera(this.canvas.width,this.canvas.height).screenToWorld(anchor);
            this.mapCenter={x:before.position.x+world.x-after.x,z:before.position.z+world.z-after.z};
        }
        if(next===1)this.mapCenter=null;
        this.draw();
    }

    resizeCanvas() {
        const rect = this.canvas.getBoundingClientRect();
        const dpr = Math.min(globalThis.devicePixelRatio || 1, 2);
        this.canvas.width = Math.max(320, Math.round(rect.width * dpr));
        this.canvas.height = Math.max(220, Math.round(rect.height * dpr));
        return { width: this.canvas.width, height: this.canvas.height };
    }

    drawBackdrop(context,width,height) {
        context.fillStyle='#111b1b';context.fillRect(0,0,width,height);
    }

    draw() {
        if (this.inspector && !this.inspector.closed) return;
        if (!this.context) return;
        const { width, height } = this.resizeCanvas();
        const context = this.context;
        context.imageSmoothingEnabled = false;
        context.textBaseline = 'middle';
        this.drawBackdrop(context, width, height);
        const mapCamera = this.mapCamera(width,height);
        const sceneKey = `${width}:${height}:${this.mapZoom}:${mapCamera.position.x}:${mapCamera.position.z}:${this.cafe.revision}`;
        if (!this.sceneCanvas || this.sceneKey !== sceneKey) {
            this.sceneCanvas = document.createElement('canvas');
            this.sceneCanvas.width = width; this.sceneCanvas.height = height;
            this.cafe.draw(this.sceneCanvas.getContext('2d'), mapCamera, {});
            this.sceneKey = sceneKey;
        }
        context.drawImage(this.sceneCanvas, 0, 0);

        // The floorplan remains visible; discovery is a quiet tint, not a debug grid.
        context.save();
        const b=this.manifest.bounds,r=mapCamera.worldRect({x:(b.minX+b.maxX)/2,z:(b.minZ+b.maxZ)/2},{x:(b.maxX-b.minX)/2,z:(b.maxZ-b.minZ)/2});
        context.beginPath();context.rect(r.x,r.y,r.width,r.height);context.clip();
        for(const chunk of this.manifest.chunks) {
            if(this.discovery.isChunkDiscovered(chunk.id))continue;
            const a=this.project({x:chunk.bounds.minX,z:chunk.bounds.minZ},width,height),c=this.project({x:chunk.bounds.maxX,z:chunk.bounds.maxZ},width,height);
            context.fillStyle='rgba(15,27,24,.16)';context.fillRect(a.x,a.y,c.x-a.x,c.y-a.y);
        }
        context.restore();

        for (const point of this.manifest.savePoints) {
            const projected = this.project(point.position, width, height);
            const unlocked = this.discovery.isSavePointUnlocked(point.id);
            const selected = point.id === this.selectedId;
            const size = Math.max(5, Math.round(width * 0.008));
            const x = pixel(projected.x);
            const y = pixel(projected.y);
            if(selected || this.mapZoom>2){context.font='600 13px Vazirmatn,sans-serif';context.textAlign='left';context.fillStyle='#f3f1df';context.fillText(point.label,x+size+7,y);}
            context.fillStyle = unlocked ? (selected ? P.gold : P.green) : '#334155';
            context.fillRect(x - size, y - size, size * 2 + 1, size * 2 + 1);
            context.fillStyle = P.void;
            context.fillRect(x - Math.max(1, size - 2), y - Math.max(1, size - 2), Math.max(1, size * 2 - 3), Math.max(1, size * 2 - 3));
            context.fillStyle = unlocked ? (selected ? P.gold : P.green) : '#334155';
            context.fillRect(x - 1, y - size + 2, 3, Math.max(3, size * 2 - 3));
            context.fillRect(x - size + 2, y - 1, Math.max(3, size * 2 - 3), 3);
        }

        const player = this.project(this.playerPosition, width, height);
        const marker = Math.max(5, Math.round(width * 0.007));
        const px = pixel(player.x);
        const py = pixel(player.y);
        context.fillStyle = P.pinkDark;
        context.fillRect(px - marker - 2, py - marker - 2, marker * 2 + 5, marker * 2 + 5);
        context.fillStyle = P.pink;
        context.fillRect(px - marker, py - marker, marker * 2 + 1, marker * 2 + 1);
        context.fillStyle = P.white;
        context.fillRect(px - 1, py - 1, 3, 3);


    }

    selectFromPointer(event) {
        if(this.dragMoved){this.dragMoved=false;return;}
        const rect = this.canvas.getBoundingClientRect();
        const x = ((event.clientX - rect.left) / rect.width) * this.canvas.width;
        const y = ((event.clientY - rect.top) / rect.height) * this.canvas.height;
        let nearest = null;
        let distance = Infinity;
        for (const point of this.manifest.savePoints) {
            const projected = this.project(point.position, this.canvas.width, this.canvas.height);
            const candidate = Math.hypot(projected.x - x, projected.y - y);
            if (candidate < distance) { nearest = point; distance = candidate; }
        }
        if (!nearest || distance > Math.max(24, this.canvas.width * 0.035)) return;
        this.selectedId = nearest.id;
        const unlocked = this.discovery.isSavePointUnlocked(nearest.id);
        setText(this.selectionLabel, nearest.label);
        setText(this.statusLabel, unlocked ? 'این Save Point برای سفر سریع آماده است.' : 'ابتدا این Save Point را در جهان فعال کن.');
        this.travelButton.disabled = !unlocked;
        this.draw();
    }

    async travel() {
        const point = this.manifest.savePoint(this.selectedId);
        if (!point || !this.discovery.isSavePointUnlocked(point.id)) return;
        this.travelButton.disabled = true;
        setText(this.statusLabel, 'در حال بارگذاری مقصد…');
        try {
            await this.onFastTravel?.(point);
            this.close();
        } finally {
            this.travelButton.disabled = false;
        }
    }

    dispose() {
        this.inspector?.dispose(); this.inspector = null;
        document.removeEventListener('keydown', this.boundKey);
        this.canvas?.removeEventListener('click', this.boundClick);
        for(const [type,handler]of [['wheel',this.boundWheel],['pointerdown',this.boundDown],['pointermove',this.boundMove],['pointerup',this.boundUp],['pointercancel',this.boundUp]])this.canvas?.removeEventListener(type,handler);
        this.sceneCanvas = null;
        this.root?.remove();
        this.root = null;
        this.canvas = null;
        this.context = null;
        this.host = null;
    }
}
