import { SceneManager } from './SceneManager.ts';
import { AssetLoader } from './AssetLoader.ts';
import type { AssetDefinition } from './AssetLoader.ts';
import { AnimationRegistry } from './AnimationRegistry.ts';
import { CharacterSystem } from '../characters/CharacterSystem.ts';
import type { CharacterDefinition } from '../characters/CharacterSystem.ts';
import { GameRuntimeManager } from './GameRuntimeManager.ts';

/** Phaser composition root; keeps domain modules independent of Phaser. */
export class PhaserGameCore {
  readonly scenes: SceneManager;
  readonly assets: AssetLoader;
  readonly animations: AnimationRegistry;
  readonly characters: CharacterSystem;
  readonly runtime: GameRuntimeManager;
  constructor(loader?: any) {
    this.scenes = new SceneManager(); this.assets = new AssetLoader(loader);
    this.animations = new AnimationRegistry(); this.characters = new CharacterSystem(this.animations); this.runtime = new GameRuntimeManager();
  }
  registerScene(key: string, scene: any) { this.scenes.register(key, scene); this.runtime.register(key, scene); return this; }
  registerCharacters(definitions: CharacterDefinition[]) { this.characters.registerMany(definitions); return this; }
  async preload(definitions: AssetDefinition[]) { await this.assets.load(definitions); return this; }
  start(scene: string, data?: unknown) { return this.scenes.switchTo(scene, data); }
  stop(scene?: string) { this.scenes.stop(scene); }
  shutdown() { this.characters.clear(); this.runtime.disposeAll(); this.scenes.destroyAll(); this.assets.invalidate(); this.animations.clear(); }
}
