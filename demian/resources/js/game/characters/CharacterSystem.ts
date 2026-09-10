import { AnimationRegistry } from '../core/AnimationRegistry.ts';

export type CharacterDefinition = { id: string; texture: string; animations: any[]; create?: (scene: any, x: number, y: number, texture: string) => any };
export class CharacterSystem {
  private definitions = new Map<string, CharacterDefinition>();
  private instances = new Set<any>();
  private animations: AnimationRegistry;
  constructor(animations = new AnimationRegistry()) { this.animations = animations; }
  register(definition: CharacterDefinition) { if (!definition.id || !definition.texture) throw new Error('Invalid character definition'); this.definitions.set(definition.id, definition); this.animations.registerMany(definition.animations || []); return this; }
  registerMany(definitions: CharacterDefinition[]) { definitions.forEach(d => this.register(d)); return this; }
  spawn(scene: any, id: string, x = 0, y = 0) { const def = this.definitions.get(id); if (!def) throw new Error(`Unknown character: ${id}`); const sprite = def.create ? def.create(scene, x, y, def.texture) : scene?.add?.sprite?.(x, y, def.texture); if (!sprite) throw new Error(`Unable to create character: ${id}`); this.instances.add(sprite); return sprite; }
  despawn(sprite: any) { if (!this.instances.delete(sprite)) return false; sprite.removeAllListeners?.(); sprite.stop?.(); sprite.destroy?.(); return true; }
  clear() { [...this.instances].forEach(s => this.despawn(s)); }
  get count() { return this.instances.size; }
  get animationRegistry() { return this.animations; }
}
