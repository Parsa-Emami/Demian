export default class ScheduleSystem{
 constructor(schedules=[]){this.schedules=new Map(schedules.map((s)=>[s.npcId,[...s.entries].sort((a,b)=>a.minute-b.minute)]));}
 resolve(npcId,minute){const entries=this.schedules.get(npcId)??[];if(!entries.length)return null;const m=((Math.floor(minute)%1440)+1440)%1440;let selected=entries[entries.length-1];for(const entry of entries){if(entry.minute<=m)selected=entry;else break;}return Object.freeze({...selected});}
 next(npcId,minute){const entries=this.schedules.get(npcId)??[];if(!entries.length)return null;const m=((Math.floor(minute)%1440)+1440)%1440;return Object.freeze({...entries.find((e)=>e.minute>m)??entries[0]});}
}
