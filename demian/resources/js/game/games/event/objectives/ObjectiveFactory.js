import CollectObjective from './CollectObjective.js'; import ReachObjective from './ReachObjective.js'; import SurviveObjective from './SurviveObjective.js'; import DefeatObjective from './DefeatObjective.js'; import ScoreObjective from './ScoreObjective.js';
const TYPES=Object.freeze({collect:CollectObjective,reach:ReachObjective,survive:SurviveObjective,defeat:DefeatObjective,score:ScoreObjective});
export function createObjective(definition){ const Objective=TYPES[definition.type]; if(!Objective)throw new Error(`Unsupported objective type: ${definition.type}`); return new Objective(definition); }
export default class ObjectiveFactory { create(definition){ return createObjective(definition); } }
