export class GameRuntimeManager {
  private scenes: Map<string, unknown> = new Map();
  private disposers: Map<string, Set<() => void>> = new Map();
  register(name:string, scene:unknown){ if (!name) throw new Error('Runtime scene name is required'); this.scenes.set(name, scene); return scene; }
  track(name:string, disposer:() => void){ if (!name || typeof disposer !== 'function') throw new TypeError('A scene name and disposer are required'); if (!this.disposers.has(name)) this.disposers.set(name, new Set()); const set = this.disposers.get(name)!; set.add(disposer); return () => set.delete(disposer); }
  dispose(name:string){ const set = this.disposers.get(name); if (set) { [...set].reverse().forEach(fn => { try { fn(); } catch {} }); set.clear(); this.disposers.delete(name); } const scene:any = this.scenes.get(name); scene?.events?.emit?.('shutdown'); scene?.shutdown?.(); scene?.destroy?.(); this.scenes.delete(name); }
  disposeAll(){ [...new Set([...this.scenes.keys(), ...this.disposers.keys()])].forEach(name => this.dispose(name)); }
  has(name:string){ return this.scenes.has(name); }
}
