const OBJECTIVE_TYPES = new Set(['collect', 'reach', 'survive', 'defeat', 'score']);
const MODIFIER_TYPES = new Set(['speed', 'low-gravity', 'fog', 'double-score']);
const REWARD_TYPES = new Set(['coin', 'xp', 'badge', 'cosmetic']);
const MAX_DURATION = 60 * 60;

function finite(value, fallback = 0) {
    const number = Number(value);
    return Number.isFinite(number) ? number : fallback;
}

function assert(condition, message, errors) {
    if (!condition) errors.push(message);
}

function hasDependencyCycle(objectives) {
    const dependencies = new Map(objectives.map((objective) => [objective.id, objective.requires ?? []]));
    const visiting = new Set();
    const visited = new Set();

    function visit(id) {
        if (visiting.has(id)) return true;
        if (visited.has(id)) return false;
        visiting.add(id);
        for (const dependency of dependencies.get(id) ?? []) {
            if (visit(dependency)) return true;
        }
        visiting.delete(id);
        visited.add(id);
        return false;
    }

    return [...dependencies.keys()].some(visit);
}

export function validateEventDefinition(definition) {
    const errors = [];
    assert(definition && typeof definition === 'object', 'Definition must be an object.', errors);
    if (!definition || typeof definition !== 'object') return errors;

    assert(definition.schemaVersion === 1, 'schemaVersion must be 1.', errors);
    assert(/^[a-z0-9][a-z0-9-]{2,63}$/.test(definition.id ?? ''), 'id is invalid.', errors);
    assert(Number.isInteger(definition.revision) && definition.revision >= 1, 'revision must be a positive integer.', errors);
    assert(typeof definition.title === 'string' && definition.title.trim().length >= 2, 'title is required.', errors);
    assert(typeof definition.map === 'string' && definition.map.length > 0, 'map is required.', errors);
    assert(finite(definition.duration) > 0 && finite(definition.duration) <= MAX_DURATION, 'duration is invalid.', errors);
    assert(finite(definition.countdown, 3) >= 0 && finite(definition.countdown, 3) <= 15, 'countdown is invalid.', errors);
    assert(
        Number.isInteger(definition.playerCount?.min)
        && Number.isInteger(definition.playerCount?.max)
        && definition.playerCount.min >= 1
        && definition.playerCount.max >= definition.playerCount.min
        && definition.playerCount.max <= 64,
        'playerCount is invalid.',
        errors
    );
    assert(Number.isFinite(Number(definition.spawn?.x)) && Number.isFinite(Number(definition.spawn?.z)), 'spawn is invalid.', errors);
    assert(Array.isArray(definition.objectives) && definition.objectives.length > 0, 'At least one objective is required.', errors);
    assert((definition.objectives ?? []).some((objective) => objective.required !== false), 'At least one required objective is needed.', errors);
    assert(Array.isArray(definition.modifiers), 'modifiers must be an array.', errors);
    assert(Array.isArray(definition.rewards), 'rewards must be an array.', errors);
    assert(definition.world && typeof definition.world === 'object', 'world is required.', errors);

    const objectiveIds = new Set();
    for (const objective of definition.objectives ?? []) {
        assert(typeof objective.id === 'string' && !objectiveIds.has(objective.id), `Objective id is missing or duplicated: ${objective.id}`, errors);
        objectiveIds.add(objective.id);
        assert(OBJECTIVE_TYPES.has(objective.type), `Unsupported objective type: ${objective.type}`, errors);
        assert(objective.required === undefined || typeof objective.required === 'boolean', `Objective ${objective.id} required must be boolean.`, errors);
        assert(Array.isArray(objective.requires ?? []), `Objective ${objective.id} requires must be an array.`, errors);
        if (objective.type === 'collect') {
            assert(typeof objective.item === 'string' && objective.item.length > 0, `Objective ${objective.id} item is required.`, errors);
            assert(finite(objective.amount) > 0, `Objective ${objective.id} amount is invalid.`, errors);
        }
        if (objective.type === 'reach') assert(typeof objective.zone === 'string' && objective.zone.length > 0, `Objective ${objective.id} zone is required.`, errors);
        if (objective.type === 'defeat') {
            assert(typeof objective.enemy === 'string' && objective.enemy.length > 0, `Objective ${objective.id} enemy is required.`, errors);
            assert(finite(objective.amount) > 0, `Objective ${objective.id} amount is invalid.`, errors);
        }
        if (objective.type === 'survive') {
            assert(finite(objective.seconds) > 0 && finite(objective.seconds) <= finite(definition.duration), `Objective ${objective.id} seconds is invalid.`, errors);
        }
        if (objective.type === 'score') assert(finite(objective.amount) > 0, `Objective ${objective.id} score is invalid.`, errors);
    }

    for (const objective of definition.objectives ?? []) {
        for (const dependency of objective.requires ?? []) {
            assert(objectiveIds.has(dependency), `Objective ${objective.id} requires unknown objective ${dependency}.`, errors);
            assert(dependency !== objective.id, `Objective ${objective.id} cannot require itself.`, errors);
        }
    }
    assert(!hasDependencyCycle(definition.objectives ?? []), 'Objective dependency graph contains a cycle.', errors);

    const modifierIds = new Set();
    for (const modifier of definition.modifiers ?? []) {
        assert(typeof modifier.id === 'string' && !modifierIds.has(modifier.id), `Modifier id is missing or duplicated: ${modifier.id}`, errors);
        modifierIds.add(modifier.id);
        assert(MODIFIER_TYPES.has(modifier.type), `Unsupported modifier type: ${modifier.type}`, errors);
        assert(Number.isFinite(Number(modifier.value)), `Modifier ${modifier.id} value is invalid.`, errors);
        if (['speed', 'low-gravity'].includes(modifier.type)) assert(finite(modifier.value) > 0, `Modifier ${modifier.id} must be greater than zero.`, errors);
        if (modifier.type === 'fog') assert(finite(modifier.value) >= 0 && finite(modifier.value) <= 0.2, `Modifier ${modifier.id} fog value is invalid.`, errors);
        if (modifier.type === 'double-score') assert(finite(modifier.value) >= 1 && finite(modifier.value) <= 10, `Modifier ${modifier.id} score multiplier is invalid.`, errors);
    }

    for (const reward of definition.rewards ?? []) {
        assert(REWARD_TYPES.has(reward.type), `Unsupported reward type: ${reward.type}`, errors);
        if (['coin', 'xp'].includes(reward.type)) {
            assert(finite(reward.amount) >= 0, `Reward ${reward.type} amount is invalid.`, errors);
        } else {
            assert(typeof reward.id === 'string' && reward.id.length > 0, `Reward ${reward.type} id is required.`, errors);
        }
        if (reward.conditions?.objectiveId) {
            assert(objectiveIds.has(reward.conditions.objectiveId), `Reward references unknown objective ${reward.conditions.objectiveId}.`, errors);
        }
    }

    const worldIds = new Set();
    for (const group of ['collectibles', 'zones', 'enemies']) {
        assert(Array.isArray(definition.world?.[group]), `world.${group} must be an array.`, errors);
        for (const entity of definition.world?.[group] ?? []) {
            assert(typeof entity.id === 'string' && !worldIds.has(entity.id), `World id is missing or duplicated: ${entity.id}`, errors);
            worldIds.add(entity.id);
            assert(Number.isFinite(Number(entity.x)) && Number.isFinite(Number(entity.z)), `World entity ${entity.id} position is invalid.`, errors);
        }
    }

    const zones = new Set((definition.world?.zones ?? []).map((zone) => zone.id));
    for (const objective of definition.objectives ?? []) {
        if (objective.type === 'reach') {
            assert(zones.has(objective.zone), `Reach objective ${objective.id} references unknown zone ${objective.zone}.`, errors);
        } else if (objective.type === 'collect') {
            const available = (definition.world?.collectibles ?? []).filter((item) => item.item === objective.item).length;
            assert(available >= finite(objective.amount), `Collect objective ${objective.id} has insufficient world items.`, errors);
        } else if (objective.type === 'defeat') {
            const available = (definition.world?.enemies ?? []).filter((enemy) => enemy.kind === objective.enemy).length;
            assert(available >= finite(objective.amount), `Defeat objective ${objective.id} has insufficient world enemies.`, errors);
        }
    }

    return errors;
}

export function assertValidEventDefinition(definition) {
    const errors = validateEventDefinition(definition);
    if (errors.length) throw new TypeError(`Invalid event definition:\n- ${errors.join('\n- ')}`);
    return definition;
}

export function deepFreezeDefinition(value) {
    if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
    Object.values(value).forEach(deepFreezeDefinition);
    return Object.freeze(value);
}
