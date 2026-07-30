export default class JobSystem{
 constructor({definitions=[],onEvent=null}={}){this.definitions=new Map(definitions.map((d)=>[d.id,d]));this.progress=new Map();this.onEvent=onEvent;}
 ensure(id){if(!this.definitions.has(id))throw new Error(`Unknown job: ${id}`);if(!this.progress.has(id))this.progress.set(id,{xp:0,level:0,shifts:0,unlocked:false});return this.progress.get(id);}
 unlock(id){const p=this.ensure(id);p.unlocked=true;this.emit('unlocked',id);return true;}
 addXp(id,amount,reason='task'){const p=this.ensure(id);if(!p.unlocked)p.unlocked=true;p.xp=Math.max(0,p.xp+Math.floor(Number(amount)||0));const definition=this.definitions.get(id);let level=0;for(const threshold of definition.levels??[])if(p.xp>=threshold.xp)level=Math.max(level,threshold.level);const changed=level!==p.level;p.level=level;this.emit(changed?'level-up':'progress',id,{amount,reason});return p.level;}
 finishShift(id){const p=this.ensure(id);p.shifts+=1;this.addXp(id,this.definitions.get(id).shiftXp??25,'shift');return p.shifts;}
 level(id){return this.progress.get(id)?.level??0;} snapshot(){return Object.freeze(Object.fromEntries([...this.progress].map(([id,p])=>[id,Object.freeze({...p,title:this.definitions.get(id)?.title??id})])));}
 export(){return Object.fromEntries([...this.progress].map(([id,p])=>[id,{...p}]));} import(data={}){for(const[id,p]of Object.entries(data)){if(this.definitions.has(id))this.progress.set(id,{xp:0,level:0,shifts:0,unlocked:false,...p});}}
 emit(type,jobId,detail={}){this.onEvent?.({type,jobId,progress:{...this.ensure(jobId)},...detail});}
}
