import BaseGame from '../../contracts/BaseGame.js';
import { COLLISION_LAYERS } from '../../shared/collision/CollisionLayers.js';
import InteractionPrompt from '../../shared/interaction/ui/InteractionPrompt.js';
import HiderBrain from './ai/HiderBrain.js';
import SeekerBrain from './ai/SeekerBrain.js';
import { HIDE_AND_SEEK_CONFIG } from './config/HideAndSeekConfig.js';
import { CAFE_HIDE_MAP } from './maps/CafeHideMap.js';
import MatchDirector from './match/MatchDirector.js';
import { MATCH_ROLES, MATCH_STATES, MATCH_WINNERS } from './match/MatchState.js';
import HideAndSeekStatsStore from './persistence/HideAndSeekStatsStore.js';
import HideAndSeekRenderer from './render/HideAndSeekRenderer.js';
import HideSpotSystem from './systems/HideSpotSystem.js';
import ScoreSystem from './systems/ScoreSystem.js';
import TagSystem from './systems/TagSystem.js';
import VisibilitySystem from './systems/VisibilitySystem.js';
import HideAndSeekHud from './ui/HideAndSeekHud.js';

const PLAYER_ID = 'player';
const PARTICIPANT_IDS = Object.freeze([PLAYER_ID, 'npc-a', 'npc-b', 'npc-c']);
const ACTOR_COLORS = Object.freeze({
    'npc-a': '#f472b6',
    'npc-b': '#a78bfa',
    'npc-c': '#34d399',
});

function point(value) {
    return { x: Number(value?.x) || 0, z: Number(value?.z) || 0 };
}

function distance(left, right) {
    return Math.hypot(left.x - right.x, left.z - right.z);
}

function normalize(value, fallback = { x: 0, z: 1 }) {
    const length = Math.hypot(value.x, value.z);
    return length > 0.0001 ? { x: value.x / length, z: value.z / length } : { ...fallback };
}

function roleLabel(role) {
    return role === MATCH_ROLES.SEEKER ? 'جست‌وجوگر' : 'مخفی‌شونده';
}

function stateLabel(state) {
    return ({
        [MATCH_STATES.ROLE_REVEAL]: 'نقش‌ها مشخص شدند',
        [MATCH_STATES.HIDING_COUNTDOWN]: 'فرصت مخفی‌شدن',
        [MATCH_STATES.SEEKING]: 'جست‌وجو آغاز شده',
        [MATCH_STATES.ROUND_END]: 'پایان راند',
        [MATCH_STATES.RESULTS]: 'نتیجه',
    })[state] ?? 'آماده';
}

export default class HideAndSeekGame extends BaseGame {
    constructor() {
        super();
        this.context = null;
        this.map = CAFE_HIDE_MAP;
        this.config = HIDE_AND_SEEK_CONFIG;
        this.match = null;
        this.hideSpots = null;
        this.visibility = null;
        this.tagSystem = null;
        this.scoreSystem = null;
        this.statsStore = null;
        this.renderer = null;
        this.hud = null;
        this.prompt = null;
        this.collisionScope = null;
        this.interactionScope = null;
        this.navigationScope = null;
        this.navigationGrid = null;
        this.participants = new Map();
        this.interactables = new Map();
        this.playerRole = MATCH_ROLES.HIDER;
        this.seekerId = null;
        this.completed = false;
        this.resultCommitted = false;
        this.pixelRatio = 1;
        this.aiThinkAccumulator = 0;
        this.pulseCooldown = 0;
        this.danger = 0;
        this.status = 'در حال آماده‌سازی مسابقه…';
        this.lastMatchState = null;
    }

    async preload(context) {
        context.eventBus.emit('hide-and-seek:preload', { progress: 100, mapId: this.map.id });
    }

    async enter(context) {
        this.context = context;
        this.collisionScope = context.services.collision.createScope('hide-and-seek');
        this.interactionScope = context.services.interaction.createScope('hide-and-seek');
        this.navigationScope = context.services.navigation.createScope('hide-and-seek');
        this.setupSpatialWorld();

        this.hideSpots = new HideSpotSystem(this.map.hideSpots);
        this.visibility = new VisibilitySystem(this.config.vision);
        this.tagSystem = new TagSystem(this.config.tag);
        this.scoreSystem = new ScoreSystem(this.config.scoring);
        this.statsStore = new HideAndSeekStatsStore();
        this.match = new MatchDirector({
            config: this.config,
            onEvent: (event) => this.onMatchEvent(event),
        });
        this.renderer = new HideAndSeekRenderer(context, this.map);
        this.hud = new HideAndSeekHud({ root: context.root, animation: context.animation });
        this.hud.mount();
        this.prompt = new InteractionPrompt({
            host: context.root.querySelector('[data-game-hud-host]'),
            eventBus: context.eventBus,
            animation: context.animation,
        });
        this.prompt.mount();
        this.registerHideSpotInteractions();
        this.applySettings(context.settings.snapshot());
        this.resize();
        context.eventBus.emit('hide-and-seek:entered', {
            mapId: this.map.id,
            collision: context.services.collision.stats(),
            navigation: this.navigationGrid.stats(),
        });
    }

    setupSpatialWorld() {
        this.map.staticColliders.forEach((definition) => {
            this.collisionScope.addStaticAabb(
                definition.id,
                definition.position,
                definition.halfExtents,
                {
                    layer: COLLISION_LAYERS.WORLD,
                    mask: COLLISION_LAYERS.CHARACTER,
                    userData: { kind: 'hide-map-obstacle', definition },
                }
            );
        });
        this.map.hideSpots.forEach((spot) => {
            this.collisionScope.addTriggerCircle(`hide-trigger-${spot.id}`, spot.position, spot.radius, {
                userData: { kind: 'hide-spot', spotId: spot.id },
            });
        });
        this.navigationGrid = this.navigationScope.createGrid('cafe-hide-map', {
            minX: this.map.bounds.minX,
            maxX: this.map.bounds.maxX,
            minZ: this.map.bounds.minZ,
            maxZ: this.map.bounds.maxZ,
            cellSize: 0.8,
            allowDiagonal: true,
        });
        const staticColliders = this.map.staticColliders.map((definition) => this.collisionScope.get(definition.id));
        this.navigationGrid.rasterizeColliders(staticColliders, { padding: this.config.player.radius + 0.08 });
    }

    registerHideSpotInteractions() {
        this.map.hideSpots.forEach((spot) => {
            const interactable = this.interactionScope.register({
                id: `hide-${spot.id}`,
                position: spot.position,
                radius: spot.radius + 1.15,
                label: spot.label,
                hint: 'ENTER · مخفی شو / خارج شو',
                priority: 2,
                requireLineOfSight: false,
                enabled: false,
                metadata: { kind: 'hide-spot', spotId: spot.id },
                action: () => this.togglePlayerHide(spot.id),
            });
            this.interactables.set(`hide:${spot.id}`, interactable);
        });
    }

    startSession(params = {}) {
        this.completed = false;
        this.resultCommitted = false;
        this.aiThinkAccumulator = 0;
        this.pulseCooldown = 0;
        this.danger = 0;
        this.status = 'نقش خود را ببین و آماده شو.';
        this.hideSpots.clear();
        this.tagSystem.reset();
        this.scoreSystem.reset();
        this.clearParticipants();

        const requestedPlayerRole = ['hider', 'seeker'].includes(params.role) ? params.role : null;
        const seed = params.seed ?? `${Date.now()}-${Math.floor(Math.random() * 100000)}`;
        const matchSnapshot = this.match.start({
            participantIds: PARTICIPANT_IDS,
            playerId: PLAYER_ID,
            requestedPlayerRole,
            seed,
        });
        this.seekerId = matchSnapshot.seekerId;
        this.playerRole = this.match.roleOf(PLAYER_ID);
        this.createParticipants();
        this.registerTagInteractions();
        this.hud.setPaused(false);
        this.hud.announce(
            this.playerRole === MATCH_ROLES.SEEKER ? 'YOU ARE THE SEEKER' : 'YOU ARE A HIDER',
            this.playerRole === MATCH_ROLES.SEEKER ? 'danger' : 'accent',
            2200
        );
        this.context.eventBus.emit('hide-and-seek:session-started', {
            seed,
            playerRole: this.playerRole,
            seekerId: this.seekerId,
            mapId: this.map.id,
        });
        this.updateHud();
    }

    createParticipants() {
        const hiderSpawns = [...this.map.hiderSpawns];
        let hiderIndex = 0;
        PARTICIPANT_IDS.forEach((id, index) => {
            const role = this.match.roleOf(id);
            const spawn = role === MATCH_ROLES.SEEKER
                ? this.map.seekerSpawn
                : hiderSpawns[hiderIndex++ % hiderSpawns.length];
            const participant = {
                id,
                label: id === PLAYER_ID ? 'PLAYER' : `NPC ${index}`,
                color: id === PLAYER_ID ? '#67e8f9' : ACTOR_COLORS[id],
                role,
                isPlayer: id === PLAYER_ID,
                position: point(spawn),
                forward: role === MATCH_ROLES.SEEKER ? { x: -1, z: 0 } : { x: 1, z: 0 },
                velocity: { x: 0, z: 0 },
                speed: 0,
                hidden: false,
                spotId: null,
                eliminated: false,
                visibleToSeeker: false,
                detection: 0,
                intent: null,
                path: [],
                pathIndex: 0,
                repathTimer: 0,
                brain: null,
            };
            if (!participant.isPlayer && role === MATCH_ROLES.SEEKER) {
                participant.brain = new SeekerBrain({
                    patrolPoints: this.map.patrolPoints,
                    memorySeconds: this.config.vision.memorySeconds,
                });
            } else if (!participant.isPlayer && role === MATCH_ROLES.HIDER) {
                participant.brain = new HiderBrain({
                    preferredSpotIds: this.map.hideSpots
                        .filter((_spot, spotIndex) => spotIndex % 3 === index % 3)
                        .map((spot) => spot.id),
                });
            }
            const localColliderId = `actor-${id}`;
            const collider = this.collisionScope.addDynamicCircle(localColliderId, participant.position, this.config.player.radius, {
                userData: { kind: 'hide-and-seek-participant', participantId: id },
            });
            participant.colliderLocalId = localColliderId;
            participant.colliderId = collider.id;
            this.participants.set(id, participant);
        });
    }

    registerTagInteractions() {
        [...this.interactables.entries()]
            .filter(([key]) => key.startsWith('tag:'))
            .forEach(([key, interactable]) => {
                this.context.services.interaction.unregister(interactable.id);
                this.interactables.delete(key);
            });

        this.participants.forEach((participant) => {
            if (participant.role !== MATCH_ROLES.HIDER) return;
            const interactable = this.interactionScope.register({
                id: `tag-${participant.id}`,
                position: participant.position,
                radius: this.config.tag.distance + 0.55,
                label: `TAG · ${participant.label}`,
                hint: 'ENTER · پیدا شد!',
                priority: 4,
                requireLineOfSight: true,
                enabled: false,
                action: () => this.tryTag(this.participants.get(this.seekerId), participant),
            });
            this.interactables.set(`tag:${participant.id}`, interactable);
        });
    }

    fixedUpdate(deltaTime, input = {}) {
        if (this.completed || !this.match) return;
        this.pulseCooldown = Math.max(0, this.pulseCooldown - deltaTime);
        this.tagSystem.update(deltaTime);
        this.match.update(deltaTime);
        this.syncEliminationState();

        const player = this.participants.get(PLAYER_ID);
        if (!player) return;
        this.updatePlayer(player, deltaTime, input);
        this.updateVisibility();
        this.updateAi(deltaTime);
        this.updateVisibility();
        this.updateInteractions(input);
        this.scoreSystem.tick(player, deltaTime, { seeking: this.match.state === MATCH_STATES.SEEKING });
        this.collisionScope.updateTriggers(player.colliderLocalId);
        this.updateStatus(player);
    }

    updatePlayer(player, deltaTime, input) {
        const movementAllowed = this.match.isMovementAllowed(player.id) && !player.eliminated;
        const inputVector = { x: Number(input.x) || 0, z: Number(input.z) || 0 };
        const magnitude = Math.min(1, Math.hypot(inputVector.x, inputVector.z));

        if (player.hidden && magnitude > 0.18) this.exitHideSpot(player.id);
        if (!movementAllowed || player.hidden) {
            player.velocity.x = 0;
            player.velocity.z = 0;
            player.speed = 0;
        } else {
            const direction = normalize(inputVector, player.forward);
            const targetSpeed = magnitude * (input.run ? this.config.player.runSpeed : this.config.player.walkSpeed);
            const targetVelocity = { x: direction.x * targetSpeed, z: direction.z * targetSpeed };
            const blend = 1 - Math.exp(-this.config.player.acceleration * deltaTime);
            player.velocity.x += (targetVelocity.x - player.velocity.x) * blend;
            player.velocity.z += (targetVelocity.z - player.velocity.z) * blend;
            if (magnitude > 0.05) player.forward = direction;
            this.moveParticipant(player, deltaTime);
        }

        if (input.revealPulse && this.playerRole === MATCH_ROLES.SEEKER) this.useRevealPulse();
    }

    updateAi(deltaTime) {
        this.aiThinkAccumulator += deltaTime;
        const shouldThink = this.aiThinkAccumulator >= this.config.ai.thinkInterval;
        const thinkDelta = shouldThink ? this.aiThinkAccumulator : deltaTime;
        if (shouldThink) this.aiThinkAccumulator = 0;
        const seeker = this.participants.get(this.seekerId);

        this.participants.forEach((participant) => {
            if (participant.isPlayer || participant.eliminated || !participant.brain) return;
            if (shouldThink) {
                if (participant.role === MATCH_ROLES.SEEKER) {
                    const visibleHiders = [...this.participants.values()].filter((candidate) =>
                        candidate.role === MATCH_ROLES.HIDER && candidate.visibleToSeeker && !candidate.eliminated
                    );
                    participant.intent = participant.brain.update(thinkDelta, {
                        self: participant,
                        visibleHiders,
                        hideSpots: this.hideSpots.snapshot(),
                        seeking: this.match.state === MATCH_STATES.SEEKING,
                    });
                } else {
                    participant.intent = participant.brain.update(thinkDelta, {
                        self: participant,
                        seeker,
                        spots: this.hideSpots.snapshot().map((spot) => ({
                            ...spot,
                            available: this.hideSpots.available(spot.id) || participant.spotId === spot.id,
                        })),
                        hidingPhase: this.match.state === MATCH_STATES.HIDING_COUNTDOWN,
                        seeking: this.match.state === MATCH_STATES.SEEKING,
                    });
                }
                this.planAiPath(participant);
            }
            this.executeAiIntent(participant, deltaTime);
        });
    }

    planAiPath(participant) {
        const target = participant.intent?.target;
        if (!target || participant.hidden) return;
        participant.repathTimer -= this.config.ai.thinkInterval;
        const targetChanged = !participant.pathTarget || distance(participant.pathTarget, target) > 1.2;
        if (participant.repathTimer > 0 && !targetChanged) return;
        participant.path = this.navigationGrid.findPath(participant.position, target, { smooth: true });
        participant.pathIndex = participant.path.length > 1 ? 1 : 0;
        participant.pathTarget = { ...target };
        participant.repathTimer = this.config.ai.repathInterval;
    }

    executeAiIntent(participant, deltaTime) {
        if (!this.match.isMovementAllowed(participant.id) || participant.hidden || participant.eliminated) return;
        const intent = participant.intent;
        if (!intent) return;
        const waypoint = participant.path[participant.pathIndex] ?? intent.target;
        const direction = normalize({ x: waypoint.x - participant.position.x, z: waypoint.z - participant.position.z }, participant.forward);
        const speed = participant.role === MATCH_ROLES.SEEKER ? this.config.ai.seekerSpeed : this.config.ai.hiderSpeed;
        participant.velocity.x = direction.x * speed;
        participant.velocity.z = direction.z * speed;
        participant.forward = direction;
        this.moveParticipant(participant, deltaTime);
        if (distance(participant.position, waypoint) <= this.config.ai.waypointTolerance) {
            participant.pathIndex = Math.min(participant.pathIndex + 1, participant.path.length);
        }

        if (intent.action === 'enter-hide-spot' && intent.spotId) {
            const spot = this.hideSpots.get(intent.spotId);
            if (spot && distance(participant.position, spot.position) < spot.radius + 1.05) {
                this.enterHideSpot(participant.id, intent.spotId);
            }
        }
        if (intent.action === 'check-hide-spot' && intent.targetId) {
            const spot = this.hideSpots.get(intent.targetId);
            if (spot && distance(participant.position, spot.position) < spot.radius + 1.15) {
                this.checkHideSpot(participant.id, intent.targetId);
                participant.brain.markSpotChecked(intent.targetId);
            }
        }

        if (participant.role === MATCH_ROLES.SEEKER && this.match.state === MATCH_STATES.SEEKING) {
            const target = [...this.participants.values()].find((candidate) =>
                candidate.role === MATCH_ROLES.HIDER && candidate.visibleToSeeker && !candidate.eliminated &&
                this.tagSystem.canTag(participant, candidate, { visible: true })
            );
            if (target) this.tryTag(participant, target);
        }
    }

    moveParticipant(participant, deltaTime) {
        const target = {
            x: participant.position.x + participant.velocity.x * deltaTime,
            z: participant.position.z + participant.velocity.z * deltaTime,
        };
        const result = this.collisionScope.moveCircle(participant.colliderLocalId, target, {
            collideWithDynamic: true,
            maxSubstep: this.config.player.radius * 0.45,
        });
        participant.position.x = result.position.x;
        participant.position.z = result.position.z;
        participant.speed = Math.hypot(participant.velocity.x, participant.velocity.z);
        if (result.blockedX) participant.velocity.x = 0;
        if (result.blockedZ) participant.velocity.z = 0;
        const tagInteractable = this.interactables.get(`tag:${participant.id}`);
        if (tagInteractable) {
            tagInteractable.position.x = participant.position.x;
            tagInteractable.position.z = participant.position.z;
        }
    }

    updateVisibility() {
        const seeker = this.participants.get(this.seekerId);
        if (!seeker) return;
        this.participants.forEach((participant) => {
            if (participant.role !== MATCH_ROLES.HIDER || participant.eliminated) return;
            const spot = this.hideSpots.spotForActor(participant.id);
            const result = this.visibility.evaluate(seeker, participant, {
                raycast: (from, to, options) => this.collisionScope.raycast(from, to, {
                    mask: COLLISION_LAYERS.WORLD,
                    types: ['static'],
                    ...options,
                }),
                exclude: [seeker.colliderId, participant.colliderId],
                lightLevel: this.lightLevelAt(participant.position),
                movementSpeed: participant.speed,
                concealment: spot?.concealment ?? 0,
            });
            participant.visibleToSeeker = this.match.state === MATCH_STATES.SEEKING && result.visible;
            participant.detection = result.score;
        });
    }

    lightLevelAt(position) {
        let level = 0.66;
        this.map.lightZones.forEach((zone) => {
            const factor = Math.max(0, 1 - distance(position, zone.position) / zone.radius);
            level = Math.max(level, zone.lightLevel * factor);
        });
        return Math.min(1, level);
    }

    updateInteractions(input) {
        const player = this.participants.get(PLAYER_ID);
        if (!player || player.eliminated) {
            this.context.services.interaction.clearActor(PLAYER_ID);
            return;
        }
        this.hideSpots.spots.forEach((spot) => {
            const interactable = this.interactables.get(`hide:${spot.id}`);
            if (!interactable) return;
            const currentSpot = this.hideSpots.spotForActor(PLAYER_ID);
            interactable.enabled = this.playerRole === MATCH_ROLES.HIDER &&
                [MATCH_STATES.HIDING_COUNTDOWN, MATCH_STATES.SEEKING].includes(this.match.state) &&
                (currentSpot?.id === spot.id || this.hideSpots.available(spot.id));
            interactable.hint = currentSpot?.id === spot.id ? 'ENTER · خارج شو' : 'ENTER · مخفی شو';
        });
        this.participants.forEach((participant) => {
            const interactable = this.interactables.get(`tag:${participant.id}`);
            if (!interactable) return;
            interactable.enabled = this.playerRole === MATCH_ROLES.SEEKER &&
                this.match.state === MATCH_STATES.SEEKING &&
                !participant.eliminated && participant.visibleToSeeker;
        });

        this.context.services.interaction.updateActor({
            actorId: PLAYER_ID,
            position: player.position,
            forward: player.forward,
            excludeOccluders: [player.colliderId],
        });
        if (input.interact) {
            this.context.services.interaction
                .interact(PLAYER_ID, { game: this })
                .catch((error) => this.context.app.shell.toast(error.message, 'error'));
        }
    }

    togglePlayerHide(spotId) {
        const player = this.participants.get(PLAYER_ID);
        if (!player || player.role !== MATCH_ROLES.HIDER || player.eliminated) return false;
        if (player.spotId === spotId) return Boolean(this.exitHideSpot(player.id));
        return Boolean(this.enterHideSpot(player.id, spotId));
    }

    enterHideSpot(actorId, spotId) {
        const participant = this.participants.get(String(actorId));
        if (!participant || participant.role !== MATCH_ROLES.HIDER || participant.eliminated) return null;
        const entry = this.hideSpots.enter(participant.id, spotId);
        if (!entry) return null;
        participant.hidden = true;
        participant.spotId = entry.spot.id;
        participant.position.x = entry.position.x;
        participant.position.z = entry.position.z;
        participant.velocity.x = 0;
        participant.velocity.z = 0;
        participant.speed = 0;
        this.setParticipantColliderEnabled(participant, false);
        this.renderer?.setSpotActive(entry.spot.id, true);
        if (participant.isPlayer) this.hud?.announce('HIDDEN', 'success');
        this.context.eventBus.emit('hide-and-seek:hidden', { participantId: participant.id, spotId: entry.spot.id });
        return entry;
    }

    exitHideSpot(actorId) {
        const participant = this.participants.get(String(actorId));
        if (!participant?.hidden) return null;
        const previousSpotId = participant.spotId;
        const result = this.hideSpots.exit(participant.id);
        participant.hidden = false;
        participant.spotId = null;
        if (result) {
            participant.position.x = result.position.x;
            participant.position.z = result.position.z;
        }
        this.setParticipantColliderEnabled(participant, true);
        this.collisionScope.sync(participant.colliderLocalId, participant.position);
        this.renderer?.setSpotActive(previousSpotId, false);
        this.context.eventBus.emit('hide-and-seek:unhidden', { participantId: participant.id, spotId: previousSpotId });
        return result;
    }

    setParticipantColliderEnabled(participant, enabled) {
        this.context.services.collision.setEnabled(participant.colliderId, enabled);
    }

    checkHideSpot(seekerId, spotId) {
        const seeker = this.participants.get(String(seekerId));
        if (!seeker || seeker.role !== MATCH_ROLES.SEEKER || this.match.state !== MATCH_STATES.SEEKING) return [];
        const revealed = this.hideSpots.reveal(spotId);
        revealed.forEach((actorId) => {
            const hider = this.participants.get(actorId);
            if (!hider) return;
            hider.hidden = false;
            hider.spotId = null;
            const spot = this.hideSpots.get(spotId);
            hider.position.x = spot.exitPosition.x;
            hider.position.z = spot.exitPosition.z;
            this.setParticipantColliderEnabled(hider, true);
            this.collisionScope.sync(hider.colliderLocalId, hider.position);
            this.tryTag(seeker, hider, { forceVisible: true });
        });
        this.renderer?.setSpotActive(spotId, false);
        this.context.eventBus.emit('hide-and-seek:spot-checked', { seekerId, spotId, revealed });
        return revealed;
    }

    useRevealPulse() {
        if (this.pulseCooldown > 0 || this.match.state !== MATCH_STATES.SEEKING) return false;
        const player = this.participants.get(PLAYER_ID);
        this.pulseCooldown = 8;
        const nearby = this.hideSpots.snapshot()
            .filter((spot) => distance(player.position, spot.position) <= 3.2)
            .sort((a, b) => distance(player.position, a.position) - distance(player.position, b.position));
        if (nearby[0]) this.checkHideSpot(player.id, nearby[0].id);
        this.hud?.announce(nearby[0] ? 'SPOT SCANNED' : 'NO SIGNAL', nearby[0] ? 'accent' : 'info');
        return true;
    }

    tryTag(seeker, hider, { forceVisible = false } = {}) {
        if (!seeker || !hider || this.match.state !== MATCH_STATES.SEEKING) return false;
        const visible = forceVisible || hider.visibleToSeeker;
        if (!forceVisible && !this.tagSystem.tag(seeker, hider, { visible })) return false;
        if (forceVisible && distance(seeker.position, hider.position) > this.config.tag.distance + 1.2) return false;
        if (hider.hidden) this.exitHideSpot(hider.id);
        const eliminated = this.match.eliminateHider(hider.id, { seekerId: seeker.id });
        if (!eliminated) return false;
        hider.eliminated = true;
        hider.visibleToSeeker = false;
        this.setParticipantColliderEnabled(hider, false);
        this.scoreSystem.awardTag(seeker.id, this.match.timer.remaining);
        this.hud?.announce(hider.isPlayer ? 'YOU WERE FOUND' : 'HIDER FOUND', 'danger');
        this.context.eventBus.emit('hide-and-seek:tagged', { seekerId: seeker.id, hiderId: hider.id });
        return true;
    }

    syncEliminationState() {
        this.match.participants.forEach((state, id) => {
            const participant = this.participants.get(id);
            if (participant && state.eliminated) participant.eliminated = true;
        });
    }

    updateStatus(player) {
        const seeker = this.participants.get(this.seekerId);
        if (player.eliminated) {
            this.status = 'پیدا شدی؛ نتیجه‌ی راند را ببین.';
            this.danger = 1;
            return;
        }
        if (this.match.state === MATCH_STATES.ROLE_REVEAL) {
            this.status = `نقش تو: ${roleLabel(this.playerRole)}`;
            this.danger = 0;
            return;
        }
        if (this.match.state === MATCH_STATES.HIDING_COUNTDOWN) {
            this.status = this.playerRole === MATCH_ROLES.SEEKER ? 'تا پایان شمارش منتظر بمان.' : 'یک مخفیگاه امن پیدا کن.';
            this.danger = 0;
            return;
        }
        if (this.playerRole === MATCH_ROLES.HIDER) {
            this.status = player.hidden ? `مخفی در ${this.hideSpots.get(player.spotId)?.label ?? 'مخفیگاه'}` : 'در فضای باز هستی.';
            this.danger = Math.max(player.detection, seeker ? Math.max(0, 1 - distance(player.position, seeker.position) / this.config.vision.range) : 0);
        } else {
            this.status = this.pulseCooldown > 0 ? `Pulse: ${Math.ceil(this.pulseCooldown)}s` : 'Pulse آماده است.';
            const visibleCount = [...this.participants.values()].filter((entry) => entry.role === MATCH_ROLES.HIDER && entry.visibleToSeeker && !entry.eliminated).length;
            this.danger = visibleCount > 0 ? 1 : 0.12;
        }
    }

    onMatchEvent(event) {
        this.context?.eventBus.emit(`hide-and-seek:${event.type}`, event);
        if (event.type === 'state-changed') {
            this.lastMatchState = event.state;
            if (event.state === MATCH_STATES.HIDING_COUNTDOWN) this.hud?.announce('HIDE!', 'accent', 1800);
            if (event.state === MATCH_STATES.SEEKING) this.hud?.announce('SEEKING STARTED', 'danger', 1800);
            if (event.state === MATCH_STATES.ROUND_END) this.awardRoundOutcome();
        }
        if (event.type === 'results-ready') this.finishSession();
    }

    awardRoundOutcome() {
        if (this.resultCommitted) return;
        const player = this.participants.get(PLAYER_ID);
        if (!player) return;
        const won = (this.playerRole === MATCH_ROLES.SEEKER && this.match.winner === MATCH_WINNERS.SEEKER) ||
            (this.playerRole === MATCH_ROLES.HIDER && this.match.winner === MATCH_WINNERS.HIDERS && !player.eliminated);
        if (won) this.scoreSystem.awardWin(PLAYER_ID, this.playerRole);
        if (this.playerRole === MATCH_ROLES.HIDER && !player.eliminated && this.match.winner === MATCH_WINNERS.HIDERS) {
            this.scoreSystem.awardEscape(PLAYER_ID);
        }
        this.resultCommitted = true;
        this.hud?.announce(won ? 'VICTORY' : 'ROUND LOST', won ? 'success' : 'danger', 2100);
    }

    finishSession() {
        if (this.completed) return;
        this.completed = true;
        this.awardRoundOutcome();
        const player = this.participants.get(PLAYER_ID);
        const score = this.scoreSystem.snapshot(PLAYER_ID);
        const won = (this.playerRole === MATCH_ROLES.SEEKER && this.match.winner === MATCH_WINNERS.SEEKER) ||
            (this.playerRole === MATCH_ROLES.HIDER && this.match.winner === MATCH_WINNERS.HIDERS && !player.eliminated);
        const profile = this.statsStore.commit({
            won,
            role: this.playerRole,
            score: score.score,
            tags: score.tags,
            survivalSeconds: score.survivalSeconds,
        });
        this.context.app.completeGame({
            title: won ? 'HIDE & SEEK · VICTORY' : 'HIDE & SEEK · ROUND OVER',
            subtitle: `${roleLabel(this.playerRole)} · ${this.map.title}`,
            score: score.score,
            stats: {
                'نقش': roleLabel(this.playerRole),
                'برنده': this.match.winner === MATCH_WINNERS.SEEKER ? 'جست‌وجوگر' : 'مخفی‌شونده‌ها',
                'Tag': score.tags,
                'زمان بقا': `${Math.floor(score.survivalSeconds)}s`,
                'زمان مخفی': `${Math.floor(score.hiddenSeconds)}s`,
                'فرار موفق': score.escapes,
                'بهترین امتیاز': profile.bestScore,
                'بردها': `${profile.wins}/${profile.matches}`,
            },
            role: this.playerRole,
            seed: this.match.seed,
        });
    }

    update() {
        this.updateHud();
    }

    updateHud() {
        if (!this.hud || !this.match) return;
        const player = this.participants.get(PLAYER_ID);
        this.hud.update({
            playerRole: this.playerRole,
            match: this.match.snapshot(),
            score: this.scoreSystem?.score(PLAYER_ID) ?? 0,
            hidden: Boolean(player?.hidden),
            danger: this.danger,
            status: `${stateLabel(this.match.state)} · ${this.status}`,
            paused: this.context?.app?.paused,
        });
    }

    render(_alpha, deltaTime) {
        this.renderer?.render([...this.participants.values()], {
            playerId: PLAYER_ID,
            seekerId: this.seekerId,
            deltaTime,
        });
    }

    applySettings(settings = {}) {
        const max = this.context?.services.performanceProfile.maxPixelRatio ?? 1.5;
        const device = Math.min(window.devicePixelRatio || 1, max);
        const ratios = {
            performance: Math.min(0.8, device),
            balanced: Math.min(1.05, device),
            high: device,
            auto: Math.min(1.2, device),
        };
        this.pixelRatio = ratios[settings.quality] ?? device;
        this.resize();
    }

    resize() {
        this.renderer?.resize(this.pixelRatio);
    }

    pause() {
        this.hud?.setPaused(true);
        this.context?.services.interaction.clearActor(PLAYER_ID);
    }

    resume() {
        this.hud?.setPaused(false);
    }

    async exit() {
        this.context?.services.interaction.clearActor(PLAYER_ID);
        this.context?.eventBus.emit('hide-and-seek:session-exited', {
            state: this.match?.state ?? null,
            seed: this.match?.seed ?? null,
        });
    }

    clearParticipants() {
        this.participants.forEach((participant) => {
            if (participant.colliderLocalId) this.collisionScope?.remove(participant.colliderLocalId);
        });
        this.participants.clear();
        this.interactables.forEach((interactable, key) => {
            if (key.startsWith('tag:')) this.context?.services.interaction.unregister(interactable.id);
        });
        [...this.interactables.keys()].filter((key) => key.startsWith('tag:')).forEach((key) => this.interactables.delete(key));
    }

    dispose() {
        this.clearParticipants();
        this.prompt?.dispose();
        this.hud?.dispose();
        this.renderer?.dispose();
        this.interactionScope?.dispose();
        this.navigationScope?.dispose();
        this.collisionScope?.dispose();
        this.context = null;
        this.match = null;
        this.hideSpots = null;
        this.visibility = null;
        this.tagSystem = null;
        this.scoreSystem = null;
        this.renderer = null;
        this.hud = null;
        this.prompt = null;
        this.navigationGrid = null;
        this.interactables.clear();
    }
}
