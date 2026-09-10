export class TilemapManager {
  constructor(scene) { this.scene = scene; this.layers = new Map(); }
  registerLayer(name, layer, collision=false) {
    this.layers.set(name,{layer,collision});
    if(collision && layer.setCollisionByProperty) layer.setCollisionByProperty({collides:true});
  }
  get(name){ return this.layers.get(name); }
}
