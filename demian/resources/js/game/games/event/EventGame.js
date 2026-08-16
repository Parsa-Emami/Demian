import BaseGame from '../../contracts/BaseGame.js';
import { COLLISION_LAYERS } from '../../shared/collision/CollisionLayers.js';
import { EVENT_CONFIG } from './config/EventConfig.js';
import EventDirector from './core/EventDirector.js';
import { EVENT_STATES } from './core/EventStates.js';
import EventRegistry from './EventRegistry.js';
import { EVENT_ARENA_MAP } from './maps/EventArenaMap.js';
import EventApiClient from './network/EventApiClient.js';
import EventRewardStore from './persistence/EventRewardStore.js';
import { createEventSnapshot } from './protocol/EventProtocol.js';
import RewardResolver from './rewards/RewardResolver.js';
import EventRenderer from './render/EventRenderer.js';
import EventScoreSystem from './systems/EventScoreSystem.js';
import EventHud from './ui/EventHud.js';

const PLAYER_COLLIDER_ID = 'player';

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

function createSessionId(eventId) {
    const token = globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.floor(Math.random() * 1e8)}`;
    return `${eventId}-${token}`;
}

function outcomeLabel(reason) {
    return ({
        'time-expired': 'زمان رویداد به پایان رسید.',
        'player-defeated': 'انرژی بازیکن تمام شد.',
    })[reason] ?? 'رویداد کامل نشد.';
}

export default class EventGame extends BaseGame {
    constructor() {
        super();
        this.context = null;
        this.map = EVENT_ARENA_MAP;
        this.config = EVENT_CONFIG;
        this.registry = new EventRegistry();
        this.director = null;
        this.score = new EventScoreSystem();
        this.rewardResolver = new RewardResolver();
        this.rewardStore = null;
        this.apiClient = null;
        this.serverSession = null;
        this.sessionAbortController = null;
        this.rewardProcessingPromise = null;
        this.evidence = null;
        this.definition = null;
        this.renderer = null;
        this.hud = null;
        this.collisionScope = null;
        this.navigationScope = null;
        this.navigationGrid = null;
        this.staticColliders = [];
        this.dynamicColliderIds = new Set();
        this.triggerColliderIds = new Set();
        this.world = null;
        this.completed = false;
        this.rewardProcessed = false;
        this.pixelRatio = 1;
        this.status = 'در حال آماده‌سازی رویداد…';
        this.networkAccumulator = 0;
        this.tick = 0;
        this.activeEventId = this.registry.defaultId;
        this.remoteApiAvailable = false;
    }

    async preload(context) {
        const definitions = await this.registry.preloadAll();
        if (context.options.eventApiBase) {
            try {
                const active = await this.registry.loadActive(context.options.eventApiBase);
                this.activeEventId = active.id;
                this.remoteApiAvailable = true;
                if (!definitions.some((definition) => definition.id === active.id)) definitions.push(active);
            } catch (error) {
                context.eventBus.emit('event:remote-definition-fallback', {
                    error,
                    fallbackEventId: this.activeEventId,
                });
            }
        }
        context.eventBus.emit('event:preload', {
            progress: 100,
            activeEventId: this.activeEventId,
            definitions: definitions.map((definition) => definition.id),
        });
    }

    async enter(context) {
        this.context = context;
        this.collisionScope = context.services.collision.createScope('event');
        this.navigationScope = context.services.navigation.createScope('event');
        this.setupSpatialWorld();
        this.director = new EventDirector({ onEvent: (event) => this.onDirectorEvent(event) });
        this.rewardStore = new EventRewardStore();
        this.apiClient = new EventApiClient({
            baseUrl: context.options.eventApiBase,
            timeoutMs: 2500,
        });
        this.renderer = new EventRenderer(context, this.map);
        await this.renderer.preloadCharacters();
        this.hud = new EventHud({
            root: context.root,
            animation: context.animation,
            onPause: () => context.app.pauseGame(),
        });
        this.hud.mount();
        this.applySettings(context.settings.snapshot());
        this.resize();
        context.eventBus.emit('event:entered', {
            events: this.registry.list(),
            mapId: this.map.id,
            navigation: this.navigationGrid.stats(),
        });
    }

    setupSpatialWorld() {
        this.staticColliders = this.map.staticColliders.map((definition) =>
            this.collisionScope.addStaticAabb(
                definition.id,
                definition.position,
                definition.halfExtents,
                {
                    layer: COLLISION_LAYERS.WORLD,
                    mask: COLLISION_LAYERS.CHARACTER,
                    userData: { kind: 'event-obstacle', definition },
                }
            )
        );
        this.navigationGrid = this.navigationScope.createGrid('event-arena', {
            minX: this.map.bounds.minX,
            maxX: this.map.bounds.maxX,
            minZ: this.map.bounds.minZ,
            maxZ: this.map.bounds.maxZ,
            cellSize: 0.8,
            allowDiagonal: true,
        });
        this.navigationGrid.rasterizeColliders(this.staticColliders, {
            padding: this.config.player.radius + 0.08,
        });
    }

    clearSessionColliders() {
        for (const id of this.dynamicColliderIds) this.collisionScope.remove(id);
        for (const id of this.triggerColliderIds) this.collisionScope.remove(id);
        this.dynamicColliderIds.clear();
        this.triggerColliderIds.clear();
    }

    async startSession(params = {}) {
        const requestedId = this.registry.has(params.eventId) ? params.eventId : this.activeEventId;
        let definition = this.registry.loader.get(requestedId);
        if (!definition) throw new Error(`Event definition was not preloaded: ${requestedId}`);

        this.sessionAbortController?.abort();
        this.sessionAbortController = new AbortController();
        this.serverSession = null;
        this.rewardProcessingPromise = null;

        if (this.apiClient.enabled && this.remoteApiAvailable && params.offline !== true) {
            try {
                const remote = await this.apiClient.startSession(requestedId, {
                    source: params.source ?? 'game-shell',
                    client_version: params.clientVersion ?? 'phase-6',
                    platform: params.platform ?? 'web',
                }, { signal: this.sessionAbortController.signal });
                definition = this.registry.registerDefinition(remote.definition);
                this.serverSession = remote.session;
            } catch (error) {
                if (this.sessionAbortController.signal.aborted) throw error;
                this.context.eventBus.emit('event:session-api-fallback', {
                    eventId: requestedId,
                    error,
                });
            }
        }

        this.definition = definition;
        this.completed = false;
        this.rewardProcessed = false;
        this.status = this.definition.description;
        this.networkAccumulator = 0;
        this.tick = 0;
        this.score.reset();
        this.clearSessionColliders();
        this.createWorld(this.definition);

        const sessionId = this.serverSession?.id ?? params.sessionId ?? createSessionId(this.definition.id);
        const seed = this.serverSession?.seed ?? params.seed ?? sessionId;
        this.director.prepare(this.definition, { sessionId, seed });
        const modifierSnapshot = this.director.modifierSystem.snapshot();
        this.score.setMultiplier(modifierSnapshot.scoreMultiplier);
        this.renderer.configure(this.definition, modifierSnapshot);
        this.director.start();
        this.hud.setPaused(false);
        this.hud.announce(this.definition.title.toUpperCase(), 'accent', 1800);
        this.updateHud();
        this.context.eventBus.emit('event:session-started', {
            eventId: this.definition.id,
            sessionId,
            seed,
            definitionRevision: this.definition.revision,
            authoritative: Boolean(this.serverSession),
        });
    }

    createWorld(definition) {
        const spawn = point(definition.spawn ?? this.map.spawn);
        const player = {
            id: 'player',
            position: spawn,
            forward: { x: 0, z: 1 },
            health: this.config.player.maxHealth,
            maxHealth: this.config.player.maxHealth,
            attackCooldown: 0,
            damageCooldown: 0,
            tick: 0,
        };
        this.collisionScope.addDynamicCircle(PLAYER_COLLIDER_ID, spawn, this.config.player.radius, {
            layer: COLLISION_LAYERS.CHARACTER,
            mask: COLLISION_LAYERS.WORLD | COLLISION_LAYERS.TRIGGER,
            userData: { kind: 'event-player' },
        });
        this.dynamicColliderIds.add(PLAYER_COLLIDER_ID);

        const collectibles = new Map(definition.world.collectibles.map((item, index) => [
            item.id,
            {
                ...item,
                position: { x: item.x, z: item.z },
                collected: false,
                phase: index * 0.73,
            },
        ]));
        const zones = new Map(definition.world.zones.map((zone) => {
            const state = {
                ...zone,
                position: { x: zone.x, z: zone.z },
                reached: false,
            };
            const colliderId = `zone-${zone.id}`;
            this.collisionScope.addTriggerCircle(colliderId, state.position, zone.radius, {
                userData: {
                    kind: 'event-zone',
                    zoneId: zone.id,
                    onTrigger: ({ phase }) => {
                        if (phase === 'enter') this.reachZone(zone.id);
                    },
                },
            });
            this.triggerColliderIds.add(colliderId);
            return [zone.id, state];
        }));
        const enemies = new Map(definition.world.enemies.map((enemy, index) => {
            const state = {
                ...enemy,
                position: { x: enemy.x, z: enemy.z },
                maxHealth: Math.max(1, Number(enemy.health) || 1),
                health: Math.max(1, Number(enemy.health) || 1),
                defeated: false,
                path: [],
                pathIndex: 0,
                repathTimer: index * 0.09,
                contactCooldown: 0,
                phase: index * 0.9,
            };
            const colliderId = `enemy-${enemy.id}`;
            this.collisionScope.addDynamicCircle(colliderId, state.position, this.config.enemy.radius, {
                layer: COLLISION_LAYERS.CHARACTER,
                mask: COLLISION_LAYERS.WORLD,
                userData: { kind: 'event-enemy', enemyId: enemy.id },
            });
            this.dynamicColliderIds.add(colliderId);
            state.colliderId = colliderId;
            return [enemy.id, state];
        }));

        this.evidence = {
            collectedItemIds: new Set(),
            reachedZoneIds: new Set(),
            defeatedEnemyIds: new Set(),
        };

        this.world = {
            elapsed: 0,
            player,
            collectibles,
            zones,
            enemies,
        };
    }

    onDirectorEvent(event) {
        if (event.type === 'objective-completed') {
            const awarded = this.score.add(event.objective.points, {
                reason: `objective:${event.objective.id}`,
                combo: false,
            });
            this.director.dispatch({ type: 'score', total: this.score.score });
            this.hud?.announce(`OBJECTIVE +${awarded}`, 'success', 1100);
            this.context?.eventBus.emit('event:objective-completed', {
                eventId: this.definition?.id,
                objective: event.objective,
                score: this.score.snapshot(),
            });
        }
        if (event.type === 'state') {
            this.context?.eventBus.emit('event:state-changed', {
                eventId: this.definition?.id,
                ...event,
            });
        }
    }

    fixedUpdate(deltaTime, input = {}) {
        if (!this.world || !this.director || this.completed) return;
        if (input.pause) {
            this.context.app.pauseGame();
            return;
        }

        const dt = Math.max(0, Number(deltaTime) || 0);
        this.tick += 1;
        this.world.elapsed += dt;
        this.world.player.tick = this.tick;
        this.world.player.attackCooldown = Math.max(0, this.world.player.attackCooldown - dt);
        this.world.player.damageCooldown = Math.max(0, this.world.player.damageCooldown - dt);

        this.director.fixedUpdate(dt);
        if (this.director.state === EVENT_STATES.ACTIVE) {
            this.updatePlayer(dt, input);
            this.collectNearbyItems();
            this.collisionScope.updateTriggers(PLAYER_COLLIDER_ID);
            if (input.eventAction || input.interact) this.performAction();
            this.updateEnemies(dt);
        }

        if (this.director.state === EVENT_STATES.REWARD && !this.rewardProcessed) {
            this.processRewards();
        }
        if (this.director.state === EVENT_STATES.RESULTS && !this.completed) {
            this.finishEvent();
        }

        this.networkAccumulator += dt;
        if (this.networkAccumulator >= 0.25) {
            this.networkAccumulator = 0;
            this.context.eventBus.emit('event:snapshot', this.protocolSnapshot());
        }
        this.updateHud();
    }

    updatePlayer(deltaTime, input) {
        const axis = normalize({ x: Number(input.x) || 0, z: Number(input.z) || 0 }, { x: 0, z: 0 });
        const magnitude = Math.min(1, Math.hypot(Number(input.x) || 0, Number(input.z) || 0));
        if (magnitude <= 0.001) return;
        const modifiers = this.director.modifierSystem.snapshot();
        const runMultiplier = input.run ? this.config.player.runMultiplier : 1;
        const speed = this.config.player.speed * modifiers.movementSpeedMultiplier * runMultiplier * magnitude;
        const target = {
            x: this.world.player.position.x + axis.x * speed * deltaTime,
            z: this.world.player.position.z + axis.z * speed * deltaTime,
        };
        const movement = this.collisionScope.moveCircle(PLAYER_COLLIDER_ID, target, {
            maxSubstep: this.config.player.radius * 0.42,
        });
        this.world.player.position = movement.position;
        this.world.player.forward = normalize(axis, this.world.player.forward);
    }

    collectNearbyItems() {
        for (const item of this.world.collectibles.values()) {
            if (item.collected || distance(item.position, this.world.player.position) > this.config.collectionRadius) continue;
            item.collected = true;
            this.evidence?.collectedItemIds.add(item.id);
            const awarded = this.score.add(item.points ?? 50, { reason: `collect:${item.item}` });
            this.director.dispatch({ type: 'collect', item: item.item, amount: 1, itemId: item.id });
            this.director.dispatch({ type: 'score', total: this.score.score });
            this.status = `${item.item === 'coffee-cup' ? 'سفارش' : 'خرده‌نور'} جمع شد · +${awarded}`;
            this.context.eventBus.emit('event:item-collected', {
                eventId: this.definition.id,
                itemId: item.id,
                item: item.item,
                awarded,
            });
        }
    }

    reachZone(zoneId) {
        const zone = this.world?.zones.get(zoneId);
        if (!zone || zone.reached || this.director.state !== EVENT_STATES.ACTIVE) return false;
        zone.reached = true;
        this.evidence?.reachedZoneIds.add(zoneId);
        this.director.dispatch({ type: 'reach', zone: zoneId });
        this.status = `${zone.label ?? zoneId} ثبت شد.`;
        this.context.eventBus.emit('event:zone-reached', { eventId: this.definition.id, zoneId });
        return true;
    }

    performAction() {
        const player = this.world.player;
        if (player.attackCooldown > 0) return false;
        const targets = [...this.world.enemies.values()]
            .filter((enemy) => !enemy.defeated && distance(enemy.position, player.position) <= this.config.attack.range)
            .sort((left, right) => distance(left.position, player.position) - distance(right.position, player.position));
        const target = targets[0];
        if (!target) {
            this.status = 'هدفی در محدوده‌ی اکشن نیست.';
            return false;
        }
        player.attackCooldown = this.config.attack.cooldown;
        target.health = Math.max(0, target.health - this.config.attack.damage);
        if (target.health <= 0) this.defeatEnemy(target);
        else this.status = `ضربه به ${target.kind} · ${target.health}/${target.maxHealth}`;
        this.context.eventBus.emit('event:action', { eventId: this.definition.id, targetId: target.id, health: target.health });
        return true;
    }

    defeatEnemy(enemy) {
        if (enemy.defeated) return;
        enemy.defeated = true;
        this.evidence?.defeatedEnemyIds.add(enemy.id);
        this.collisionScope.remove(enemy.colliderId);
        this.dynamicColliderIds.delete(enemy.colliderId);
        const awarded = this.score.add(enemy.points ?? 120, { reason: `defeat:${enemy.kind}` });
        this.director.dispatch({ type: 'defeat', enemy: enemy.kind, amount: 1, enemyId: enemy.id });
        this.director.dispatch({ type: 'score', total: this.score.score });
        this.status = `${enemy.kind} شکست خورد · +${awarded}`;
        this.hud.announce(`DEFEAT +${awarded}`, 'accent', 900);
        this.context.eventBus.emit('event:enemy-defeated', { eventId: this.definition.id, enemyId: enemy.id, awarded });
    }

    updateEnemies(deltaTime) {
        const player = this.world.player;
        for (const enemy of this.world.enemies.values()) {
            if (enemy.defeated) continue;
            enemy.repathTimer -= deltaTime;
            enemy.contactCooldown = Math.max(0, enemy.contactCooldown - deltaTime);
            if (enemy.repathTimer <= 0) {
                enemy.path = this.navigationGrid.findPath(enemy.position, player.position);
                enemy.pathIndex = enemy.path.length > 1 ? 1 : 0;
                enemy.repathTimer = this.config.enemy.repathSeconds;
            }
            const waypoint = enemy.path[enemy.pathIndex] ?? player.position;
            const direction = normalize({ x: waypoint.x - enemy.position.x, z: waypoint.z - enemy.position.z }, { x: 0, z: 0 });
            const target = {
                x: enemy.position.x + direction.x * (enemy.speed ?? 2.2) * deltaTime,
                z: enemy.position.z + direction.z * (enemy.speed ?? 2.2) * deltaTime,
            };
            const movement = this.collisionScope.moveCircle(enemy.colliderId, target, { maxSubstep: 0.2 });
            enemy.position = movement.position;
            if (distance(enemy.position, waypoint) < 0.5) enemy.pathIndex += 1;

            if (distance(enemy.position, player.position) <= this.config.enemy.contactRange && enemy.contactCooldown <= 0 && player.damageCooldown <= 0) {
                enemy.contactCooldown = this.config.enemy.damageCooldown;
                player.damageCooldown = this.config.enemy.damageCooldown;
                player.health = Math.max(0, player.health - this.config.enemy.damage);
                this.score.combo = 0;
                this.status = `آسیب دریافت شد · انرژی ${player.health}`;
                this.hud.announce(`-${this.config.enemy.damage} HP`, 'danger', 800);
                if (player.health <= 0) this.director.fail('player-defeated');
            }
        }
    }

    processRewards() {
        this.rewardProcessed = true;
        const directorSnapshot = this.director.snapshot();
        const localReceipt = this.rewardResolver.resolve(this.definition, {
            sessionId: directorSnapshot.sessionId,
            successful: !directorSnapshot.failureReason,
            score: this.score.score,
            objectives: directorSnapshot.objectives,
        });
        const finalize = (baseReceipt, serverClaim = null) => {
            if (!this.director || this.director.state !== EVENT_STATES.REWARD) return;
            const commit = this.rewardStore.commit(baseReceipt);
            const receipt = Object.freeze({ ...baseReceipt, serverClaim });
            this.director.acceptRewards(receipt);
            this.context?.eventBus.emit('event:rewards-resolved', {
                eventId: this.definition?.id,
                receipt,
                applied: commit.applied,
                wallet: commit.state.wallet,
                authoritative: Boolean(serverClaim),
            });
        };

        if (!this.serverSession || !this.apiClient.enabled) {
            finalize(localReceipt);
            return;
        }

        this.rewardProcessingPromise = this.apiClient.completeSession(
            this.serverSession,
            this.createCompletionPayload(),
            { signal: this.sessionAbortController?.signal }
        ).then((claim) => {
            const authoritativeReceipt = this.rewardResolver.fromServerClaim(
                this.definition,
                claim,
                { sessionId: directorSnapshot.sessionId }
            );
            finalize(authoritativeReceipt, claim);
            return claim;
        }).catch((error) => {
            if (!this.sessionAbortController?.signal.aborted) {
                this.context?.eventBus.emit('event:reward-api-fallback', {
                    eventId: this.definition?.id,
                    sessionId: this.serverSession?.id,
                    error,
                });
                finalize(localReceipt);
            }
            return null;
        });
    }

    createCompletionPayload() {
        return Object.freeze({
            score: this.score.score,
            elapsed_ms: Math.max(0, Math.round((this.director?.snapshot().elapsed ?? 0) * 1000)),
            evidence: Object.freeze({
                collected_item_ids: Object.freeze([...(this.evidence?.collectedItemIds ?? [])].sort()),
                reached_zone_ids: Object.freeze([...(this.evidence?.reachedZoneIds ?? [])].sort()),
                defeated_enemy_ids: Object.freeze([...(this.evidence?.defeatedEnemyIds ?? [])].sort()),
            }),
        });
    }

    finishEvent() {
        this.completed = true;
        const director = this.director.snapshot();
        const receipt = director.rewardReceipt;
        const success = !director.failureReason;
        const completedObjectives = director.objectives.filter((objective) => objective.status === 'completed').length;
        const rewardText = receipt?.rewards?.length
            ? receipt.rewards.map((reward) => reward.type === 'coin' || reward.type === 'xp' ? `${reward.amount} ${reward.type.toUpperCase()}` : reward.id).join(' · ')
            : 'بدون جایزه';
        this.context.app.completeGame({
            title: this.definition.title,
            subtitle: success ? 'رویداد با موفقیت کامل شد.' : outcomeLabel(director.failureReason),
            score: this.score.score,
            stats: {
                'وضعیت': success ? 'موفق' : 'ناموفق',
                'هدف‌ها': `${completedObjectives}/${director.objectives.length}`,
                'زمان باقی‌مانده': `${Math.ceil(director.remaining)} ثانیه`,
                'جایزه': rewardText,
                'شناسه رویداد': this.definition.id,
            },
        });
    }

    protocolSnapshot() {
        return createEventSnapshot({
            director: this.director,
            player: this.world.player,
            score: this.score,
            enemies: [...this.world.enemies.values()],
            collectibles: [...this.world.collectibles.values()],
        });
    }

    updateHud() {
        this.hud?.update({
            definition: this.definition,
            director: this.director?.snapshot(),
            score: this.score.snapshot(),
            player: this.world?.player,
            status: this.status,
        });
    }

    update(_deltaTime) {}

    render(_alpha, deltaTime = 0) {
        this.renderer?.render(this.world, deltaTime);
    }

    pause() {
        this.hud?.setPaused(true);
    }

    resume() {
        this.hud?.setPaused(false);
    }

    applySettings(settings) {
        const profile = this.context?.services.performanceProfile;
        const max = profile?.maxPixelRatio ?? 1.5;
        const minimum = profile?.minimumPixelRatio ?? 0.8;
        const device = Math.min(globalThis.devicePixelRatio || 1, max);
        this.pixelRatio = settings?.quality === 'low' ? Math.max(minimum, Math.min(1, device)) : device;
        this.renderer?.resize(this.pixelRatio);
    }

    resize() {
        this.renderer?.resize(this.pixelRatio);
    }

    async exit() {
        this.sessionAbortController?.abort();
        await this.rewardProcessingPromise?.catch?.(() => null);
        this.context?.eventBus.emit('event:exited', {
            eventId: this.definition?.id ?? null,
            state: this.director?.state ?? null,
        });
    }

    dispose() {
        this.sessionAbortController?.abort();
        this.clearSessionColliders();
        this.director?.dispose();
        this.renderer?.dispose();
        this.hud?.dispose();
        this.navigationScope?.dispose();
        this.collisionScope?.dispose();
        this.world = null;
        this.evidence = null;
        this.serverSession = null;
        this.rewardProcessingPromise = null;
        this.sessionAbortController = null;
        this.apiClient = null;
        this.remoteApiAvailable = false;
        this.definition = null;
        this.renderer = null;
        this.hud = null;
        this.director = null;
        this.context = null;
    }
}
