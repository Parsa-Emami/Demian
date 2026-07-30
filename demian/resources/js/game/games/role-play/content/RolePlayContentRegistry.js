import tiamIntro from '../definitions/dialogues/tiam-intro.json' with { type: 'json' };
import ronakShift from '../definitions/dialogues/ronak-shift.json' with { type: 'json' };
import amirrezaArcade from '../definitions/dialogues/amirreza-arcade.json' with { type: 'json' };
import firstShift from '../definitions/quests/first-shift.json' with { type: 'json' };
import arcadeRepair from '../definitions/quests/arcade-repair.json' with { type: 'json' };
import meetTeam from '../definitions/quests/meet-the-team.json' with { type: 'json' };
import items from '../definitions/items/items.json' with { type: 'json' };
import jobs from '../definitions/jobs/jobs.json' with { type: 'json' };
import schedules from '../definitions/schedules/schedules.json' with { type: 'json' };
import { assertValidRolePlayContent, deepFreezeContent } from '../core/RolePlayDefinitionValidator.js';

function clone(value){return typeof structuredClone==='function'?structuredClone(value):JSON.parse(JSON.stringify(value));}
export const BUILT_IN_ROLE_PLAY_CONTENT=deepFreezeContent(assertValidRolePlayContent({version:1,dialogues:[tiamIntro,ronakShift,amirrezaArcade],quests:[firstShift,arcadeRepair,meetTeam],items,jobs,schedules}));
export default class RolePlayContentRegistry{
 constructor(content=BUILT_IN_ROLE_PLAY_CONTENT){this.content=deepFreezeContent(assertValidRolePlayContent(clone(content)));}
 get dialogues(){return this.content.dialogues;} get quests(){return this.content.quests;} get items(){return this.content.items;} get jobs(){return this.content.jobs;} get schedules(){return this.content.schedules;}
 dialogue(id){return this.dialogues.find((d)=>d.id===id)??null;} quest(id){return this.quests.find((q)=>q.id===id)??null;} item(id){return this.items.find((i)=>i.id===id)??null;}
 snapshot(){return this.content;}
}
