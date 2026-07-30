import NpcMemory from './NpcMemory.js';
export default class RolePlayBrain{
 constructor({npcId,navigationGrid,speed=2.2}={}){this.npcId=npcId;this.navigationGrid=navigationGrid;this.speed=speed;this.memory=new NpcMemory();this.activity='idle';this.target=null;this.path=[];this.pathIndex=0;this.repathCooldown=0;}
 setSchedule(entry){if(!entry)return;this.activity=entry.activity??'idle';this.target=entry.position?{...entry.position}:null;}
 plan(position){if(!this.target||!this.navigationGrid)return[];this.path=this.navigationGrid.findPath(position,this.target);this.pathIndex=this.path.length>1?1:0;this.repathCooldown=1.5;return this.path;}
 update(actor,dt){this.repathCooldown=Math.max(0,this.repathCooldown-dt);if(!this.target)return{x:0,z:0};if(Math.hypot(actor.position.x-this.target.x,actor.position.z-this.target.z)<0.25)return{x:0,z:0};if(!this.path.length||this.pathIndex>=this.path.length||this.repathCooldown<=0)this.plan(actor.position);const waypoint=this.path[this.pathIndex]??this.target;const dx=waypoint.x-actor.position.x,dz=waypoint.z-actor.position.z,length=Math.hypot(dx,dz);if(length<0.2){this.pathIndex+=1;return{x:0,z:0};}return{x:dx/length*this.speed*dt,z:dz/length*this.speed*dt};}
 snapshot(){return Object.freeze({npcId:this.npcId,activity:this.activity,target:this.target?Object.freeze({...this.target}):null,memory:this.memory.snapshot()});}
}
