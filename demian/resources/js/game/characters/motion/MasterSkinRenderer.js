import { drawArm, drawLeg, drawTorso, line } from './MasterWardrobeRenderer.js';
import { projectMasterJoints, sampleMasterPose } from './MasterMotionLibrary.js';
import wardrobe from '../../../../game/character-skins.json' with { type: 'json' };

const restPoses = new Map();
function restJoints(pose) {
    const key = `${pose.family}:${pose.direction}`;
    if (!restPoses.has(key)) restPoses.set(key, projectMasterJoints(sampleMasterPose(pose.family, { direction: pose.direction, facing: pose.facing })));
    return restPoses.get(key);
}
function layer(ctx, image, part, dx = 0, dy = 0, angle = 0, anchor = [0, .55], widthScale = 1) {
    if (!part) return;
    const [x, y, width, height] = part.bounds;
    ctx.save(); ctx.translate(anchor[0] + dx, -anchor[1] - dy); ctx.rotate(angle); ctx.scale(widthScale, 1);
    ctx.drawImage(image, ...part.frame, x - anchor[0], anchor[1] - y, width, height); ctx.restore();
}
export function drawMasterSkin(ctx, image, skin, pose, { x = 0, ground = 0, height = 100, reducedMotion = false, elevation = 0, attachments = [] } = {}) {
    if (!skin?.views || !pose?.joints || !image) return false;
    const view = skin.views[pose.direction] ?? skin.views.e, look = wardrobe.characters[skin.slug];
    if (!view || !look) return false;
    const authored = skin.authoredActions?.[pose.state];
    if (authored) {
        const index = Math.min(authored.length - 1, Math.max(0, Math.floor(pose.progress * (authored.length - 1))));
        ctx.save(); ctx.translate(x, ground); ctx.scale(height, height); layer(ctx, image, skin.views.e[authored[index]], 0, 0, 0, [0, 0]); ctx.restore(); return true;
    }
    const joints = projectMasterJoints(pose), rest = restJoints(pose), time = pose.time ?? 0;
    const horizontal = pose.direction.includes('e') ? 1 : pose.direction.includes('w') ? -1 : 0;
    const wing = attachments.find(item => item.kind === 'wings');
    const rotation = reducedMotion ? 0 : wing?.rotation ?? Math.sin(time * Math.PI * 2 * .72) * .15;
    const extension = wing?.extension ?? (pose.state === 'slide' ? .15 : .65);
    ctx.save(); ctx.translate(x, ground); ctx.scale(height, height); ctx.lineCap = 'round'; ctx.lineJoin = 'round'; ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = 'high';
    for (const [name, sign] of [['wingLeft', -1], ['wingRight', 1]]) layer(ctx, image, view[name], joints.chest.x - rest.chest.x, joints.chest.y - rest.chest.y, sign * (rotation + (1 - extension) * .32), [sign * .1, .55], .45 + extension * .55);
    const material = { image, view }, rear = ['n', 'ne', 'nw'].includes(pose.direction);
    drawArm(ctx, joints, 'Far', look, material); drawLeg(ctx, joints, 'Far', look, horizontal, material); drawLeg(ctx, joints, 'Near', look, horizontal, material);
    if (!rear) layer(ctx, image, view.hair, joints.neck.x - rest.neck.x, joints.neck.y - rest.neck.y, -pose.lean * .16, [0, .57]);
    line(ctx, { x: joints.chest.x, y: joints.chest.y + .01 }, { x: joints.neck.x, y: joints.neck.y + .085 }, .064, look.skin);
    drawTorso(ctx, joints, rear ? { ...look, tie: false, necklace: false } : look, horizontal);
    if (look.dress) {
        const waist = joints.pelvis, bottom = Math.min(joints.ankleNear.y, joints.ankleFar.y) + .055;
        ctx.fillStyle = look.trousers; ctx.strokeStyle = '#181e26'; ctx.lineWidth = .009;
        ctx.beginPath(); ctx.moveTo(waist.x - .09, -waist.y - .03); ctx.lineTo(waist.x + .09, -waist.y - .03);
        ctx.quadraticCurveTo(joints.kneeNear.x + .09, -bottom - .10, joints.ankleNear.x + .09, -bottom);
        ctx.quadraticCurveTo(waist.x, -bottom + .018, joints.ankleFar.x - .075, -bottom); ctx.closePath(); ctx.fill(); ctx.stroke();
        line(ctx, { x: waist.x + .01, y: waist.y - .03 }, { x: joints.ankleNear.x + .025, y: bottom + .02 }, .008, '#ffffff19');
    }
    layer(ctx, image, view.torso, joints.pelvis.x - rest.pelvis.x, joints.pelvis.y - rest.pelvis.y, -pose.lean, [0, .30]);
    drawArm(ctx, joints, 'Near', look, material);
    if (rear) layer(ctx, image, view.hair, joints.neck.x - rest.neck.x, joints.neck.y - rest.neck.y, -pose.lean * .16, [0, .57]);
    if (look.handbag) {
        const wrist = joints.wristNear;
        line(ctx, { x: joints.chest.x + .055, y: joints.chest.y + .02 }, { x: wrist.x + .045, y: wrist.y }, .005, '#bca061');
        ctx.fillStyle = '#20242c'; ctx.strokeStyle = '#a88b4e'; ctx.lineWidth = .005; ctx.beginPath(); ctx.roundRect(wrist.x + .015, -wrist.y, .065, .065, .009); ctx.fill(); ctx.stroke();
        ctx.fillStyle = '#d7b56b'; ctx.fillRect(wrist.x + .039, -wrist.y + .023, .013, .008);
    }
    layer(ctx, image, view.head, joints.neck.x - rest.neck.x, joints.neck.y - rest.neck.y, -pose.lean * .16, [0, .57]);
    layer(ctx, image, view.homayoun, joints.neck.x - rest.neck.x, joints.neck.y - rest.neck.y + (reducedMotion ? 0 : Math.sin(time * 4.1) * .004), -pose.lean * .16, [0, .57]);
    const pet = attachments.find(item => item.kind === 'pishi');
    layer(ctx, image, view.pishi, (horizontal ? -.33 * horizontal : -.3) + (reducedMotion ? 0 : pet?.followOffset ?? 0) * pose.facing, (reducedMotion ? 0 : pet?.bob ?? 0) - elevation, 0, [0, 0]);
    ctx.restore(); return true;
}
