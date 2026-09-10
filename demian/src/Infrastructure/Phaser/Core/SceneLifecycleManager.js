export class SceneLifecycleManager {
  constructor(scene){this.scene=scene;}
  cleanup(){
    if(this.scene.children?.removeAll) this.scene.children.removeAll(true);
    if(this.scene.tweens) this.scene.tweens.killAll();
  }
}
