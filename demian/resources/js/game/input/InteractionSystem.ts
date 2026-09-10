export class InteractionSystem {
 private targets = new Map<string, any>();
 register(target:any) { if (!target?.id || typeof target.interact !== 'function') throw new TypeError('Interactable requires id and interact().'); if (this.targets.has(target.id)) throw new Error(`Duplicate interactable: ${target.id}`); this.targets.set(target.id,target); return target; }
 unregister(id:string) { return this.targets.delete(id); }
 findNearest(position:{x:number;z:number}, radius=2.5) { let best:any=null, distance=Infinity; for(const target of this.targets.values()){const dx=target.position.x-position.x,dz=target.position.z-position.z,d=Math.hypot(dx,dz);if(d<=Math.min(radius,target.radius??radius)&&d<distance){best=target;distance=d;}} return best; }
 interact(target:any){ if(target?.interact) return target.interact(); return false; }
 clear(){this.targets.clear();}
}
