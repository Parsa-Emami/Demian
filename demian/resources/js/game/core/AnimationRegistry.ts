export type AnimationConfig = { key: string; frames: any[]|object; frameRate?: number; repeat?: number; yoyo?: boolean };
export class AnimationRegistry {
  private configs = new Map<string, AnimationConfig>();
  register(config: AnimationConfig) { if (this.configs.has(config.key)) return false; this.configs.set(config.key, config); return true; }
  registerMany(configs: AnimationConfig[]) { configs.forEach(c => this.register(c)); return this; }
  ensure(manager: any, config: AnimationConfig) { this.register(config); if (!manager?.exists?.(config.key)) manager?.create?.(config); return config.key; }
  get(key: string) { return this.configs.get(key); }
  has(key: string) { return this.configs.has(key); }
  remove(key: string, manager?: any) { manager?.remove?.(key); return this.configs.delete(key); }
  clear(manager?: any) { this.configs.forEach((_, key) => manager?.remove?.(key)); this.configs.clear(); }
}
