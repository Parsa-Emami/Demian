export type SceneLike = { scene?: { start?: Function; stop?: Function; launch?: Function }; events?: any; shutdown?: Function; destroy?: Function };
export class SceneManager {
  private scenes = new Map<string, SceneLike>();
  private active?: string;
  register(key: string, scene: SceneLike) { if (!key) throw new Error('Scene key is required'); if (!scene) throw new TypeError('Scene is required'); this.scenes.set(key, scene); return scene; }
  has(key: string) { return this.scenes.has(key); }
  get(key: string) { return this.scenes.get(key); }
  start(key: string, data?: unknown) { const scene = this.scenes.get(key); if (!scene) throw new Error(`Unknown scene: ${key}`); this.active = key; scene.scene?.start?.(data); return scene; }
  switchTo(key: string, data?: unknown) { if (this.active && this.active !== key) this.stop(this.active); return this.start(key, data); }
  stop(key = this.active) { if (!key) return; const scene = this.scenes.get(key); scene?.scene?.stop?.(); scene?.shutdown?.(); scene?.events?.emit?.('shutdown'); if (this.active === key) this.active = undefined; }
  destroy(key: string) { this.stop(key); const scene = this.scenes.get(key); scene?.destroy?.(); this.scenes.delete(key); }
  destroyAll() { [...this.scenes.keys()].forEach(k => this.destroy(k)); }
  get current() { return this.active; }
}
