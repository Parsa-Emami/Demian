export const ROLE_PLAY_CAFE_MAP=Object.freeze({
 id:'demian-cafe-role-play',bounds:Object.freeze({minX:-18,maxX:18,minZ:-12,maxZ:12}),floor:Object.freeze({width:36,depth:24,color:0x111827}),spawn:Object.freeze({x:0,z:7}),
 staticColliders:Object.freeze([
  {id:'north-wall',position:{x:0,z:-11.5},halfExtents:{x:18,z:0.5},height:2.8,color:0x202a44},
  {id:'south-wall-left',position:{x:-11,z:11.5},halfExtents:{x:7,z:0.5},height:2.8,color:0x202a44},
  {id:'south-wall-right',position:{x:11,z:11.5},halfExtents:{x:7,z:0.5},height:2.8,color:0x202a44},
  {id:'west-wall',position:{x:-17.5,z:0},halfExtents:{x:0.5,z:12},height:2.8,color:0x202a44},
  {id:'east-wall',position:{x:17.5,z:0},halfExtents:{x:0.5,z:12},height:2.8,color:0x202a44},
  {id:'counter',position:{x:-7,z:-4},halfExtents:{x:5,z:1.1},height:1.35,color:0x713f12},
  {id:'storage',position:{x:-13,z:-5},halfExtents:{x:2,z:3},height:2.4,color:0x334155},
  {id:'arcade-bank',position:{x:12,z:-5},halfExtents:{x:3.5,z:1.2},height:2.5,color:0x312e81},
  {id:'sofa',position:{x:8,z:7},halfExtents:{x:3,z:1},height:1.1,color:0x4c1d95},
  {id:'table-04-obstacle',position:{x:4,z:1},halfExtents:{x:1.2,z:1.2},height:0.8,color:0x78350f},
  {id:'table-02-obstacle',position:{x:-1,z:1},halfExtents:{x:1.1,z:1.1},height:0.8,color:0x78350f}
 ]),
 npcs:Object.freeze([
  {id:'tiam',name:'تیام',dialogueId:'tiam-intro',position:{x:-2,z:4},color:0x22d3ee},
  {id:'ronak',name:'روناک',dialogueId:'ronak-shift',position:{x:-5,z:0},color:0xf472b6},
  {id:'amirreza',name:'امیررضا',dialogueId:'amirreza-arcade',position:{x:9,z:-2},color:0xfbbf24}
 ]),
 pickups:Object.freeze([
  {id:'coffee-1',itemId:'coffee-cup',position:{x:-9.5,z:-2.2},color:0xf59e0b},
  {id:'coffee-2',itemId:'coffee-cup',position:{x:-7.8,z:-2.2},color:0xf59e0b},
  {id:'coffee-3',itemId:'coffee-cup',position:{x:-6.1,z:-2.2},color:0xf59e0b},
  {id:'repair-kit',itemId:'repair-kit',position:{x:-14.5,z:-1.2},color:0x38bdf8}
 ]),
 interactables:Object.freeze([
  {id:'table-04',kind:'delivery',label:'تحویل سفارش به میز ۴',position:{x:4,z:2.7},radius:2.2},
  {id:'arcade-repair',kind:'repair',label:'تعمیر کابین آرکید',position:{x:10,z:-3.2},radius:2.3},
  {id:'save-point',kind:'save',label:'ذخیره‌ی پیشرفت',position:{x:0,z:9.4},radius:2.0}
 ]),
 zones:Object.freeze([{id:'cafe-entrance',position:{x:0,z:9},radius:2.5},{id:'counter-zone',position:{x:-5,z:-1},radius:2.5}])
});
