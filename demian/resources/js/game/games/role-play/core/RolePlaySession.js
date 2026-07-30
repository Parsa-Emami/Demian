export default class RolePlaySession{
 constructor({startMinute=480}={}){this.worldTime=startMinute;this.tick=0;this.playSeconds=0;this.flags=new Set();this.variables={};this.status='آماده‌ی ساختن داستان تو';}
 update(dt,minutesPerSecond=1){this.tick+=1;this.playSeconds+=dt;this.worldTime=(this.worldTime+dt*minutesPerSecond)%1440;}
 setFlag(key,value=true){if(value)this.flags.add(key);else this.flags.delete(key);}
 hasFlag(key){return this.flags.has(key);}
 timeLabel(){const minute=Math.floor(this.worldTime)%1440;return`${String(Math.floor(minute/60)).padStart(2,'0')}:${String(minute%60).padStart(2,'0')}`;}
 import(data={}){this.worldTime=Number.isFinite(Number(data.worldTime))?Number(data.worldTime):this.worldTime;this.flags.clear();for(const flag of data.flags??[])this.flags.add(flag);for(const key of Object.keys(this.variables))delete this.variables[key];Object.assign(this.variables,data.variables??{});this.playSeconds=Number(data.playSeconds)||0;}
 snapshot(){return Object.freeze({worldTime:this.worldTime,timeLabel:this.timeLabel(),tick:this.tick,playSeconds:this.playSeconds,flags:Object.freeze([...this.flags]),variables:Object.freeze({...this.variables}),status:this.status});}
}
