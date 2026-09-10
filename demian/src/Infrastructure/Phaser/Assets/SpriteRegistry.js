export class SpriteRegistry {
  constructor(){this.items=new Map();}
  register(id,data){this.items.set(id,data);}
  get(id){return this.items.get(id);}
  clear(){this.items.clear();}
}
