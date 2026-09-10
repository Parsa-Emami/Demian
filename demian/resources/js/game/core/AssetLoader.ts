export type Loader = { image?: Function; atlas?: Function; json?: Function; audio?: Function; once?: Function; start?: Function; isLoading?: () => boolean };
export type AssetDefinition = { type: 'image'|'atlas'|'json'|'audio'; key: string; url: string; dataUrl?: string };
export class AssetLoader {
  private loaded = new Set<string>(); private queued = new Set<string>(); private pending?: Promise<void>; private loader?: Loader;
  constructor(loader?: Loader) { this.loader = loader; }
  queue(assets: AssetDefinition[] = []) { const added: AssetDefinition[] = []; for (const a of assets) { if (!a?.key || !a.url || this.loaded.has(a.key) || this.queued.has(a.key)) continue; const fn = this.loader?.[a.type]; if (typeof fn !== 'function') continue; this.queued.add(a.key); added.push(a); a.type === 'atlas' && a.dataUrl ? fn.call(this.loader, a.key, a.url, a.dataUrl) : fn.call(this.loader, a.key, a.url); } return added; }
  async load(assets: AssetDefinition[] = []) {
    this.queue(assets);
    if (!this.loader?.start) { this.queued.forEach(key => { this.loaded.add(key); }); this.queued.clear(); return; }
    if (this.pending) return this.pending;
    this.pending = new Promise<void>((resolve, reject) => {
      const done = () => { this.queued.forEach(key => this.loaded.add(key)); this.queued.clear(); this.pending = undefined; resolve(); };
      const fail = (file: unknown) => { this.queued.clear(); this.pending = undefined; reject(file instanceof Error ? file : new Error(`Failed to load asset${file ? `: ${String(file)}` : ''}`)); };
      this.loader!.once?.('complete', done); this.loader!.once?.('loaderror', fail);
      if (!this.loader!.isLoading?.()) this.loader!.start!();
    });
    return this.pending;
  }
  invalidate(key?: string) { key ? this.loaded.delete(key) : this.loaded.clear(); }
  isLoaded(key: string) { return this.loaded.has(key); }
}
