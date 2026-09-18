import { AnimationRegistry } from '../core/AnimationRegistry.ts';
import type { AnimationConfig } from '../core/AnimationRegistry.ts';
import type { CharacterManifestV4 } from '../assets/AtlasRegistry.ts';

export type CharacterDefinition = { id: string; texture: string; animations: any[]; create?: (scene: any, x: number, y: number, texture: string) => any };

/** Minimal shape of an animation_manifest.json document (see schemas/animation_manifest.schema.json). */
export type AnimationManifestDocument = { character_key?: string; states?: Record<string, { frames: number; fps: number; loop?: boolean }> };

export class CharacterSystem {
  private definitions = new Map<string, CharacterDefinition>();
  private instances = new Set<any>();
  private animations: AnimationRegistry;
  constructor(animations = new AnimationRegistry()) { this.animations = animations; }
  register(definition: CharacterDefinition) { if (!definition.id || !definition.texture) throw new Error('Invalid character definition'); this.definitions.set(definition.id, definition); this.animations.registerMany(definition.animations || []); return this; }
  registerMany(definitions: CharacterDefinition[]) { definitions.forEach(d => this.register(d)); return this; }

  /**
   * Character Core V4 bridge: builds a CharacterDefinition from a
   * `character_manifest_v4.json` document + its paired animation manifest
   * (e.g. darya_animation_manifest.json), then registers it exactly as
   * `register()` would. Purely additive — `register`/`registerMany`/`spawn`
   * keep their original signatures and behaviour for existing callers such
   * as PhaserGameCore.registerCharacters().
   *
   * Animation `frames` are intentionally left as an empty array here: this
   * class only knows animation *timing* (fps/loop) from the manifest, not
   * pixel frame regions, which live in the per-variant atlas JSON and are
   * resolved by TextureAtlasLoader/AtlasRegistry at load time.
   */
  registerFromManifest(
    manifest: CharacterManifestV4,
    animationManifest?: AnimationManifestDocument,
    options: { variant?: string; create?: CharacterDefinition['create'] } = {}
  ) {
    const variant = options.variant ?? 'mobile';
    const texture = manifest?.runtime?.atlas_targets?.[variant]?.image;
    if (!manifest?.character_key || !texture) {
      throw new Error(
        `registerFromManifest: manifest for "${manifest?.character_key ?? '?'}" is missing character_key or an atlas target for variant "${variant}".`
      );
    }
    const animations: AnimationConfig[] = Object.entries(animationManifest?.states ?? {}).map(([key, state]) => ({
      key: `${manifest.character_key}:${key}`,
      frames: [],
      frameRate: state.fps,
      repeat: state.loop === false ? 0 : -1,
    }));
    return this.register({ id: manifest.character_key, texture, animations, create: options.create });
  }

  spawn(scene: any, id: string, x = 0, y = 0) { const def = this.definitions.get(id); if (!def) throw new Error(`Unknown character: ${id}`); const sprite = def.create ? def.create(scene, x, y, def.texture) : scene?.add?.sprite?.(x, y, def.texture); if (!sprite) throw new Error(`Unable to create character: ${id}`); this.instances.add(sprite); return sprite; }
  despawn(sprite: any) { if (!this.instances.delete(sprite)) return false; sprite.removeAllListeners?.(); sprite.stop?.(); sprite.destroy?.(); return true; }
  clear() { [...this.instances].forEach(s => this.despawn(s)); }
  get count() { return this.instances.size; }
  get animationRegistry() { return this.animations; }
}
