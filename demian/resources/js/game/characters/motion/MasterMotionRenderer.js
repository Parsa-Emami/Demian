import { MASTER_MOTION, MOTION_BONES, projectMasterJoints } from './MasterMotionLibrary.js';

export function drawMasterRig(ctx, pose, { x, ground, scale, color = '#d6e89c', attachments = [] } = {}) {
    pose = { ...pose, joints: projectMasterJoints(pose) };
    ctx.save();
    ctx.translate(x, ground);
    ctx.scale(scale, -scale);
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    for (const [from, to] of MOTION_BONES) {
        const a = pose.joints[from], b = pose.joints[to];
        ctx.globalAlpha = from.includes('Far') ? .38 : .95;
        ctx.strokeStyle = color;
        ctx.lineWidth = .018;
        ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke();
    }
    ctx.globalAlpha = 1;
    ctx.strokeStyle = color;
    ctx.lineWidth = .012;
    ctx.beginPath(); ctx.arc(pose.joints.head.x, pose.joints.head.y, MASTER_MOTION.skeleton.headRadius, 0, Math.PI * 2); ctx.stroke();
    for (const name of ['kneeNear', 'elbowNear', 'pelvis', 'chest']) {
        const p = pose.joints[name];
        ctx.fillStyle = color;
        ctx.beginPath(); ctx.arc(p.x, p.y, .018, 0, Math.PI * 2); ctx.fill();
    }
    for (const side of ['near', 'far']) {
        const p = pose.joints[side === 'near' ? 'ankleNear' : 'ankleFar'];
        ctx.fillStyle = pose.contacts[side] ? '#f4c784' : '#63726e';
        ctx.beginPath(); ctx.arc(p.x, p.y, .022, 0, Math.PI * 2); ctx.fill();
    }
    for (const accessory of attachments) {
        ctx.strokeStyle = '#b5d5e0';
        ctx.lineWidth = .012;
        if (accessory.kind === 'wings') {
            for (const side of [-1, 1]) {
                ctx.beginPath(); ctx.moveTo(accessory.x, accessory.y);
                ctx.lineTo(accessory.x + side * accessory.span, accessory.y + accessory.rotation + accessory.extension * .12);
                ctx.stroke();
            }
        } else {
            ctx.beginPath(); ctx.arc(accessory.x, accessory.y, accessory.kind === 'pishi' ? .035 : .018, 0, Math.PI * 2); ctx.stroke();
        }
    }
    ctx.restore();
}
