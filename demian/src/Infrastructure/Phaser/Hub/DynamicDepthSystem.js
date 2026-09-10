export class DynamicDepthSystem {
  update(entity){ if(entity && entity.y !== undefined) entity.setDepth(Math.floor(entity.y)); }
  sort(entities=[]){ entities.forEach(e=>this.update(e)); }
}
