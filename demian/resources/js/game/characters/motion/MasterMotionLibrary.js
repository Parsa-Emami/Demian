import contract from '../../../../game/character-motion.json' with { type: 'json' };

function freeze(value) {
    if (value && typeof value === 'object') {
        Object.values(value).forEach(freeze);
        Object.freeze(value);
    }
    return value;
}

export const MASTER_MOTION = freeze(contract);
export const MOTION_CHARACTERS = MASTER_MOTION.characters;
export const MOTION_SAMPLES = MASTER_MOTION.samples;
export const MOTION_BONES = freeze([
    ['hipFar', 'kneeFar'], ['kneeFar', 'ankleFar'],
    ['shoulderFar', 'elbowFar'], ['elbowFar', 'wristFar'],
    ['pelvis', 'chest'], ['chest', 'neck'], ['neck', 'head'],
    ['hipNear', 'kneeNear'], ['kneeNear', 'ankleNear'],
    ['shoulderNear', 'elbowNear'], ['elbowNear', 'wristNear'],
]);

const definitions = new Map(MOTION_CHARACTERS.map(entry => [entry.slug, entry]));
export const motionCharacter = slug => definitions.get(String(slug ?? '').trim().toLowerCase()) ?? null;
export const motionFamily = id => MASTER_MOTION.families[id] ?? null;
export const normalizedPhase = phase => Number.isFinite(Number(phase)) ? ((Number(phase) % 1) + 1) % 1 : 0;
export const clamp01 = value => Number.isFinite(Number(value)) ? Math.min(1, Math.max(0, Number(value))) : 0;
const smooth = value => { const t = clamp01(value); return t * t * (3 - 2 * t); };
const point = (x, y) => ({ x, y });
const TAU = Math.PI * 2;

export function solveTwoBone(root, end, upper, lower, bend = 1) {
    const dx = end.x - root.x, dy = end.y - root.y;
    const original = Math.hypot(dx, dy);
    const distance = Math.min(upper + lower - 1e-7, Math.max(Math.abs(upper - lower) + 1e-7, original));
    const ux = original > 1e-8 ? dx / original : 0;
    const uy = original > 1e-8 ? dy / original : -1;
    const along = (upper * upper - lower * lower + distance * distance) / (2 * distance);
    const offset = Math.sqrt(Math.max(0, upper * upper - along * along));
    return { joint: point(root.x + ux * along - uy * offset * bend, root.y + uy * along + ux * offset * bend),
        end: point(root.x + ux * distance, root.y + uy * distance), reachable: Math.abs(original - distance) < 1e-6 };
}

export function masterFootPath(phase, clip) {
    const p = normalizedPhase(phase), contact = p < clip.stance;
    if (contact) return { x: clip.stepWidth * (.5 - p / clip.stance), y: 0, contact: true };
    const t = (p - clip.stance) / (1 - clip.stance);
    return { x: clip.stepWidth * (-.5 + smooth(t)), y: Math.sin(Math.PI * t) * clip.lift, contact: false };
}

export function canonicalMotionState(state) {
    return MASTER_MOTION.poseAliases[state] ?? ({ breathe: 'idle', blink: 'idle', ready: 'idle', tiptoe: 'walk', skid: 'run',
        dash: 'sprint', hop: 'jump', hover: 'jump', dodge: 'slide', crouch: 'slide' })[state] ?? state;
}

export function runtimeMotionClip(state, context = 'world', speed = 0) {
    const base = MASTER_MOTION.clips[canonicalMotionState(state)], profile = MASTER_MOTION.contexts?.[context];
    if (!base?.strideLength || !profile || !Number.isFinite(speed) || speed <= 0) return base;
    const stance = Math.min(profile.maximumStance, Math.max(profile.minimumStance, profile.stepWidth * profile.bodyWorldHeight * profile.cadenceHz / speed));
    return { ...base, stepWidth: profile.stepWidth, lift: profile.lift, stance, strideLength: profile.stepWidth * profile.bodyWorldHeight / stance };
}

export function sampleMasterPose(familyId, { state = 'idle', phase = 0, progress = 0, facing = 1, time = 0, direction = null, context = 'world', speed = 0 } = {}) {
    const family = motionFamily(familyId);
    if (!family) throw new RangeError(`Unknown motion family: ${familyId}`);
    if (['turn', 'spin'].includes(state)) direction = ['e', 'se', 's', 'sw', 'w', 'nw', 'n', 'ne'][Math.floor(normalizedPhase(progress) * 8)];
    const rig = MASTER_MOTION.skeleton, p = normalizedPhase(phase), t = clamp01(progress);
    const mode = canonicalMotionState(state), clip = runtimeMotionClip(mode, context, speed);
    const ground = Boolean(clip?.strideLength);
    const airborne = ['takeoff', 'jump', 'fall'].includes(mode);
    const slide = mode === 'slide';
    const landing = mode === 'land' ? Math.sin(t * Math.PI) : 0;
    const bob = ground ? -Math.cos(p * TAU * 2) * clip.bob : Math.sin(p * TAU) * .002;
    const lean = ground ? family.lean[mode] : slide ? -1.4 : airborne ? .08 : 0;
    const pelvis = point(ground ? Math.sin(p * TAU) * family.hipSway : 0,
        slide ? .06 : rig.hipHeight + bob - landing * .045);
    for (const [offset, depth] of [[0, 1], [.5, -1]]) {
        const foot = ground ? masterFootPath(p + offset, clip) : { x: depth * .055, y: 0 };
        if (!slide && !airborne) {
            const reach = rig.upperLeg + rig.lowerLeg - .0001;
            const dx = foot.x - pelvis.x - depth * .014;
            pelvis.y = Math.min(pelvis.y, foot.y + Math.sqrt(Math.max(.001, reach * reach - dx * dx)));
        }
    }
    const chest = point(pelvis.x + Math.sin(lean) * (rig.chestHeight - rig.hipHeight), pelvis.y + Math.cos(lean) * (rig.chestHeight - rig.hipHeight));
    const neck = point(chest.x + Math.sin(lean) * .065, chest.y + .065);
    const joints = { pelvis, chest, neck, head: point(neck.x, neck.y + rig.headHeight - rig.chestHeight - .065) };
    const contacts = {};
    for (const [side, offset, depth] of [['Near', 0, 1], ['Far', .5, -1]]) {
        const foot = ground ? masterFootPath(p + offset, clip) : { x: depth * .055, y: 0, contact: !airborne };
        if (airborne) {
            const tuck = mode === 'takeoff' ? smooth(t) : mode === 'jump' ? 1 : 1 - smooth(t);
            foot.x = depth * (.08 - tuck * .03);
            foot.y = tuck * .16;
            foot.contact = false;
        }
        if (slide) { foot.x = depth > 0 ? .23 : -.1; foot.y = 0; }
        const hip = point(pelvis.x + depth * .014, pelvis.y);
        const solved = solveTwoBone(hip, foot, rig.upperLeg, rig.lowerLeg, 1);
        joints[`hip${side}`] = hip;
        joints[`knee${side}`] = solved.joint;
        joints[`ankle${side}`] = solved.end;
        contacts[side.toLowerCase()] = foot.contact && solved.reachable;
        const counterRotation = ground ? Math.sin(p * TAU) * family.shoulderCounterRotation : 0;
        const shoulder = point(chest.x + depth * rig.shoulderSpread, chest.y - .015 + counterRotation * depth);
        const swing = ground ? -Math.sin((p + offset) * TAU) * clip.armSwing * family.armSwingScale : .05 * depth;
        const angle = slide ? -1.4 : swing + lean;
        const elbow = point(shoulder.x + Math.sin(angle) * rig.upperArm, shoulder.y - Math.cos(angle) * rig.upperArm);
        const bend = ground ? clip.elbowBend + family.armBendOffset : airborne ? .9 : slide ? 2.75 : .15;
        const wrist = point(elbow.x + Math.sin(angle + bend) * rig.lowerArm, elbow.y - Math.cos(angle + bend) * rig.lowerArm);
        joints[`shoulder${side}`] = shoulder;
        joints[`elbow${side}`] = elbow;
        joints[`wrist${side}`] = wrist;
        if (['wave', 'salute', 'celebrate', 'win', 'dance', 'taunt', 'guitar', 'attack'].includes(mode) && (side === 'Near' || ['celebrate', 'win', 'dance'].includes(mode))) {
            const rotation = mode === 'attack' ? 1.8 : 2 + Math.sin(p * TAU * 2) * .28;
            const arm = point(shoulder.x + Math.sin(rotation) * rig.upperArm, shoulder.y - Math.cos(rotation) * rig.upperArm);
            joints[`elbow${side}`] = arm;
            joints[`wrist${side}`] = point(arm.x + Math.sin(rotation - .8) * rig.lowerArm, arm.y - Math.cos(rotation - .8) * rig.lowerArm);
        }
    }
    if (facing < 0) for (const joint of Object.values(joints)) joint.x *= -1;
    return { version: MASTER_MOTION.version, family: familyId, state: mode, phase: p, progress: t, joints,
        contacts, context, speed, time, direction: direction ?? (facing < 0 ? 'w' : 'e'), lean: lean * (facing < 0 ? -1 : 1), facing: facing < 0 ? -1 : 1 };
}

export function motionAttachments(definition, pose) {
    return (definition?.accessories ?? []).map(accessory => {
        const anchor = accessory.anchor === 'ground' ? point(0, 0) : pose.joints[accessory.anchor] ?? pose.joints.chest;
        const offset = accessory.offset ?? [0, 0];
        const wing = accessory.kind === 'wings';
        const amplitude = wing ? accessory.amplitude : 0;
        const phase = pose.phase + (accessory.phaseOffset ?? 0);
        return { ...accessory, x: anchor.x + offset[0] * pose.facing, y: anchor.y + offset[1],
            rotation: wing ? Math.sin(phase * TAU) * amplitude : 0,
            extension: wing ? (['takeoff', 'jump', 'fall'].includes(pose.state) ? 1 : pose.state === 'slide' ? .15 : .65) : 0 };
    });
}

export function projectMasterJoints(pose, direction = pose.direction) {
    const vectors = { e: [1, 0], se: [.7071, .7071], s: [0, 1], sw: [-.7071, .7071], w: [-1, 0], nw: [-.7071, -.7071], n: [0, -1], ne: [.7071, -.7071] };
    const [horizontal, depth] = vectors[direction] ?? vectors.e;
    const output = {};
    for (const [name, joint] of Object.entries(pose.joints)) {
        const side = name.endsWith('Near') ? 1 : name.endsWith('Far') ? -1 : 0;
        const lateral = side * (/shoulder|elbow|wrist/.test(name) ? .115 : .065);
        const sagittal = joint.x * pose.facing;
        output[name] = point(sagittal * horizontal - lateral * depth, joint.y - sagittal * depth);
    }
    return output;
}
