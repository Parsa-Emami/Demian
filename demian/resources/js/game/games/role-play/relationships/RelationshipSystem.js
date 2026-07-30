const clamp=(v)=>Math.max(-100,Math.min(100,Math.round(Number(v)||0)));
export function relationshipRank(value){if(value>=75)return 'trusted';if(value>=35)return 'friend';if(value>=10)return 'warm';if(value<=-50)return 'hostile';if(value<=-15)return 'cold';return 'neutral';}
export default class RelationshipSystem{
 constructor(initial={}){this.values=new Map(Object.entries(initial).map(([id,v])=>[id,clamp(v)]));this.history=[];}
 get(id){return this.values.get(id)??0;}
 set(id,value,reason='set'){const previous=this.get(id);const current=clamp(value);this.values.set(id,current);this.history.push(Object.freeze({id,previous,current,delta:current-previous,reason}));return current;}
 adjust(id,delta,reason='interaction'){return this.set(id,this.get(id)+(Number(delta)||0),reason);}
 rank(id){return relationshipRank(this.get(id));}
 snapshot(){return Object.freeze({values:Object.freeze(Object.fromEntries(this.values)),ranks:Object.freeze(Object.fromEntries([...this.values.keys()].map((id)=>[id,this.rank(id)])))});}
 import(data={}){this.values=new Map(Object.entries(data.values??data).map(([id,v])=>[id,clamp(v)]));}
}
