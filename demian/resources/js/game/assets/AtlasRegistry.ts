export class AtlasRegistry {
 private atlases: Record<string, unknown> = {};
 register(key:string,data:unknown){this.atlases[key]=data;}
 get(key:string){return this.atlases[key];}
}
