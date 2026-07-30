const ACTION_TYPES = new Set(['setFlag', 'clearFlag', 'relationship', 'giveItem', 'takeItem', 'startQuest', 'coins', 'jobXp', 'emit']);
const OBJECTIVE_TYPES = new Set(['talk', 'collect', 'deliver', 'reach', 'interact', 'play', 'win', 'wait']);

function isObject(value) { return value && typeof value === 'object' && !Array.isArray(value); }
function string(value) { return typeof value === 'string' && value.trim().length > 0; }
function unique(values) { return new Set(values).size === values.length; }

export function validateDialogueDefinition(definition) {
    const errors = [];
    if (!isObject(definition)) return ['Dialogue definition must be an object.'];
    if (!string(definition.id)) errors.push('Dialogue id is required.');
    if (!string(definition.start)) errors.push('Dialogue start node is required.');
    if (!isObject(definition.nodes) || Object.keys(definition.nodes).length === 0) errors.push('Dialogue nodes are required.');
    if (definition.start && definition.nodes && !definition.nodes[definition.start]) errors.push(`Start node does not exist: ${definition.start}`);
    Object.entries(definition.nodes ?? {}).forEach(([id, node]) => {
        if (!string(node.text)) errors.push(`Dialogue node ${id} requires text.`);
        (node.choices ?? []).forEach((choice, index) => {
            if (!string(choice.id)) errors.push(`Dialogue node ${id} choice ${index} requires id.`);
            if (!string(choice.text)) errors.push(`Dialogue node ${id} choice ${index} requires text.`);
            if (choice.next && !definition.nodes[choice.next]) errors.push(`Dialogue node ${id} choice ${choice.id} references missing node ${choice.next}.`);
            (choice.actions ?? []).forEach((action) => {
                if (!ACTION_TYPES.has(action.type)) errors.push(`Unknown dialogue action: ${action.type}`);
            });
        });
    });
    return errors;
}

export function validateQuestDefinition(definition) {
    const errors = [];
    if (!isObject(definition)) return ['Quest definition must be an object.'];
    if (!string(definition.id)) errors.push('Quest id is required.');
    if (!string(definition.title)) errors.push('Quest title is required.');
    if (!Array.isArray(definition.objectives) || definition.objectives.length === 0) errors.push('Quest objectives are required.');
    const ids = (definition.objectives ?? []).map((objective) => objective.id);
    if (!unique(ids)) errors.push('Quest objective ids must be unique.');
    (definition.objectives ?? []).forEach((objective, index) => {
        if (!string(objective.id)) errors.push(`Objective ${index} requires id.`);
        if (!OBJECTIVE_TYPES.has(objective.type)) errors.push(`Unknown objective type: ${objective.type}`);
        if (objective.amount !== undefined && (!Number.isFinite(objective.amount) || objective.amount <= 0)) errors.push(`Objective ${objective.id} amount must be positive.`);
        (objective.requires ?? []).forEach((required) => {
            if (!ids.includes(required)) errors.push(`Objective ${objective.id} requires missing objective ${required}.`);
        });
    });
    return errors;
}

export function validateRolePlayContent(content) {
    const errors = [];
    if (!isObject(content)) return ['Role play content must be an object.'];
    const dialogueIds = new Set();
    for (const dialogue of content.dialogues ?? []) {
        validateDialogueDefinition(dialogue).forEach((error) => errors.push(`dialogue:${dialogue?.id ?? '?'} ${error}`));
        if (dialogueIds.has(dialogue.id)) errors.push(`Duplicate dialogue id: ${dialogue.id}`);
        dialogueIds.add(dialogue.id);
    }
    const questIds = new Set();
    for (const quest of content.quests ?? []) {
        validateQuestDefinition(quest).forEach((error) => errors.push(`quest:${quest?.id ?? '?'} ${error}`));
        if (questIds.has(quest.id)) errors.push(`Duplicate quest id: ${quest.id}`);
        questIds.add(quest.id);
    }
    const itemIds = (content.items ?? []).map((item) => item.id);
    if (!unique(itemIds)) errors.push('Item ids must be unique.');
    (content.jobs ?? []).forEach((job) => {
        if (!string(job.id) || !string(job.title)) errors.push('Jobs require id and title.');
    });
    (content.schedules ?? []).forEach((schedule) => {
        if (!string(schedule.npcId) || !Array.isArray(schedule.entries)) errors.push('Schedules require npcId and entries.');
        let previous = -1;
        (schedule.entries ?? []).forEach((entry) => {
            if (!Number.isInteger(entry.minute) || entry.minute < 0 || entry.minute >= 1440) errors.push(`Invalid schedule minute for ${schedule.npcId}.`);
            if (entry.minute < previous) errors.push(`Schedule entries must be sorted for ${schedule.npcId}.`);
            previous = entry.minute;
        });
    });
    return errors;
}

export function assertValidRolePlayContent(content) {
    const errors = validateRolePlayContent(content);
    if (errors.length) throw new TypeError(`Invalid Role Play content: ${errors.join('; ')}`);
    return content;
}

export function deepFreezeContent(value) {
    if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
    Object.values(value).forEach(deepFreezeContent);
    return Object.freeze(value);
}
