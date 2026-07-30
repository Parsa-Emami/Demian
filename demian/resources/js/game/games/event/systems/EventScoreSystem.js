export default class EventScoreSystem {
 constructor(){ this.reset(); }
 reset(){ this.score=0; this.combo=0; this.multiplier=1; this.events=[]; }
 setMultiplier(value){ this.multiplier=Math.max(1,Number(value)||1); }
 add(base,{reason='event',combo=true}={}){ const raw=Math.max(0,Number(base)||0); if(combo)this.combo+=1; else this.combo=0; const comboBonus=combo&&this.combo>1?Math.min(1,this.combo*.05):0; const awarded=Math.round(raw*this.multiplier*(1+comboBonus)); this.score+=awarded; this.events.push(Object.freeze({reason,base:raw,awarded,total:this.score,combo:this.combo})); if(this.events.length>50)this.events.shift(); return awarded; }
 snapshot(){ return Object.freeze({score:this.score,combo:this.combo,multiplier:this.multiplier,last:this.events.at(-1)??null}); }
}
