export class TextureAtlasLoader {
  constructor(scene){this.scene=scene;}
  load(key,image,json){this.scene.load.atlas(key,image,json);}
}
