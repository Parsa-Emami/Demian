import CafeGameRenderer2D from '../../../rendering2d/CafeGameRenderer2D.js';
import { drawPixelActor } from '../../../rendering2d/PixelActorRenderer.js';
import { cssColor, PIXEL_PALETTE as P } from '../../../rendering2d/PixelPalette.js';

const ROLE_COLORS = Object.freeze({ player: P.cyan, seeker: P.red, hider: P.purple, eliminated: '#475569' });

export default class HideAndSeekRenderer extends CafeGameRenderer2D {
    constructor(context, map) {
        super(context, map, { follow: true, atmosphere: 'night', zoom: 11 });
        this.activeSpots = new Set();
        this.resize();
    }

    setSpotActive(spotId, active) {
        if (active) this.activeSpots.add(spotId); else this.activeSpots.delete(spotId);
    }

    drawHideSpots(ctx) {
        for (const spot of this.map.hideSpots ?? []) {
            const screen = this.camera.worldToScreen(spot.position);
            const radius = Math.max(4, Math.round((spot.radius ?? 1) * this.camera.pixelsPerUnit));
            ctx.globalAlpha = this.activeSpots.has(spot.id) ? 0.8 : 0.34;
            ctx.strokeStyle = cssColor(spot.color, P.purple);
            ctx.lineWidth = this.activeSpots.has(spot.id) ? 3 : 1;
            ctx.strokeRect(screen.x - radius, screen.y - radius, radius * 2, radius * 2);
            ctx.globalAlpha = 1;
        }
    }

    drawVisionCone(ctx, seeker) {
        if (!seeker || seeker.eliminated) return;
        const position = this.camera.worldToScreen(seeker.position);
        const forward = seeker.forward ?? { x: 0, z: 1 };
        const angle = Math.atan2(forward.z, forward.x);
        const length = Math.max(38, Math.round(this.camera.pixelsPerUnit * 6.5));
        const spread = 0.55;
        ctx.fillStyle = 'rgba(251, 113, 133, 0.13)';
        ctx.beginPath();
        ctx.moveTo(position.x, position.y);
        ctx.lineTo(position.x + Math.cos(angle - spread) * length, position.y + Math.sin(angle - spread) * length);
        ctx.lineTo(position.x + Math.cos(angle + spread) * length, position.y + Math.sin(angle + spread) * length);
        ctx.closePath();
        ctx.fill();
    }

    render(participants, { playerId, seekerId, deltaTime = 0 } = {}) {
        const player = participants.find((entry) => entry.id === playerId) ?? participants[0];
        const seeker = participants.find((entry) => entry.id === seekerId);
        const ctx = this.begin({ target: player?.position, deltaTime, atmosphere: 'night' });
        this.drawHideSpots(ctx);
        this.drawVisionCone(ctx, seeker);

        participants.forEach((participant) => {
            const role = participant.id === seekerId ? 'seeker' : participant.id === playerId ? 'player' : 'hider';
            this.queue.add({
                layer: 20,
                y: participant.position?.z ?? 0,
                draw: () => drawPixelActor(ctx, this.camera, participant, {
                    color: participant.eliminated ? ROLE_COLORS.eliminated : ROLE_COLORS[role],
                    player: participant.id === playerId,
                    eliminated: participant.eliminated,
                    hidden: Boolean(participant.hidden || participant.hideSpotId),
                    label: role === 'seeker' ? 'SEEKER' : '',
                }),
            });
        });
        this.end(ctx);
    }
}
