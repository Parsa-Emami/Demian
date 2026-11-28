import CanvasCharacterAvatar from '../../../characters/CanvasCharacterAvatar.js';

const ROAM_OFFSETS = [[2.7, .8], [3, -2.6], [-2.3, -3.2], [-3.4, 1.5], [.4, 3.4]];
const FOLLOW_OFFSETS = [[0, 2.3], [-2.3, 0], [2.3, 0], [0, -2.3]];
const PATH_INTERVAL = .45;

function distance(a, b) {
    return Math.hypot(a.x - b.x, a.z - b.z);
}

export default class PishiCompanion {
    constructor(grid, home) {
        this.grid = grid;
        this.home = { x: home.x, z: home.z };
        this.position = this.walkablePoint({ x: home.x + 2.3, z: home.z + 1.5 });
        this.forward = { x: 0, z: 1 };
        this.route = [];
        this.nextRoam = 0;
        this.wait = 1.1;
        this.repathIn = 0;
        this.following = false;
    }

    walkablePoint(point) {
        const cell = this.grid.nearestWalkable(this.grid.worldToCell(point, { clamp: false }), 4);
        return cell && this.grid.cellToWorld(cell);
    }

    async load(signal) {
        const url = new URL('assets/companions/pishi/atlas.json', document.baseURI);
        const response = await fetch(url, { signal });
        if (!response.ok) throw new Error('Pishi atlas could not be loaded');
        const atlas = await response.json();
        const imageUrl = new URL(atlas.meta.image, url);
        imageUrl.searchParams.set('sprite_rev', atlas.meta.imageRevision);
        const image = new Image();
        image.src = imageUrl.href;
        await image.decode();
        if (signal.aborted || !this.position) return;
        this.avatar = new CanvasCharacterAvatar({ slug: atlas.meta.slug, atlas, image });
        this.avatar.sync({ position: this.position, forward: this.forward, speed: 0, motionState: 'idle' });
    }

    setTarget(target) {
        if (!target || distance(this.position, target) < .2) return false;
        const route = this.grid.findPath(this.position, target, { smooth: false, maxIterations: 2400 });
        if (route.length === 1 && this.grid.lineWalkable(this.position, target)) {
            this.route = [target];
            return true;
        }
        if (route.length < 2) return false;
        this.route = route.slice(1);
        return true;
    }

    chooseTarget(darya, forward) {
        if (this.following) {
            const behind = { x: darya.x - forward.x * 2.6, z: darya.z - forward.z * 2.6 };
            const candidates = [behind, ...FOLLOW_OFFSETS.map(([dx, dz]) => ({ x: darya.x + dx, z: darya.z + dz }))];
            for (const point of candidates) {
                const target = this.walkablePoint(point);
                if (target && distance(target, darya) >= 1.65 && this.setTarget(target)) break;
            }
            return;
        }
        if (this.route.length || this.wait > 0) return;
        const [dx, dz] = ROAM_OFFSETS[this.nextRoam];
        this.nextRoam = (this.nextRoam + 1) % ROAM_OFFSETS.length;
        const center = darya ?? this.home;
        const radius = darya ? .64 : 1;
        const target = this.walkablePoint({ x: center.x + dx * radius, z: center.z + dz * radius });
        this.wait = this.setTarget(target) ? 1.6 : .7;
    }

    step(deltaTime, darya, facing = this.forward) {
        if (!this.position) return;
        const gap = darya ? distance(this.position, darya) : 0;
        const follow = Boolean(darya) && gap > (this.following ? 2.65 : 3.85);
        if (follow !== this.following) {
            this.following = follow;
            this.route = [];
            this.repathIn = 0;
            this.wait = 1.25;
        }
        if (!this.route.length) this.wait -= deltaTime;
        this.repathIn -= deltaTime;
        if (this.repathIn <= 0) {
            this.repathIn = PATH_INTERVAL;
            this.chooseTarget(darya, facing);
        }

        const waypoint = this.route[0];
        let speed = 0;
        let travelledDistance = 0;
        if (waypoint) {
            const remaining = distance(this.position, waypoint);
            const strideSpeed = this.following ? Math.min(8.1, 3.9 + gap * .43) : 2.25;
            travelledDistance = Math.min(remaining, strideSpeed * deltaTime);
            if (remaining > 0) {
                this.forward = { x: (waypoint.x - this.position.x) / remaining,
                    z: (waypoint.z - this.position.z) / remaining };
                this.position = { x: this.position.x + this.forward.x * travelledDistance,
                    z: this.position.z + this.forward.z * travelledDistance };
                speed = strideSpeed;
            }
            if (travelledDistance >= remaining - 1e-6) this.route.shift();
        }
        this.avatar?.sync({ position: this.position, forward: this.forward, speed,
            travelledDistance, motionState: speed > 3.4 ? 'run' : speed > 0 ? 'walk' : 'idle' }, deltaTime);
    }
}
