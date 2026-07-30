import { TETRIS_CONFIG } from '../config/TetrisConfig.js';
import Board from '../domain/Board.js';
import Piece from '../domain/Piece.js';
import PieceBag from '../domain/PieceBag.js';
import RotationSystem from '../domain/RotationSystem.js';
import ScoringSystem from '../domain/ScoringSystem.js';
import TetrisState, { TETRIS_STATES } from '../domain/TetrisState.js';
import { spawnPosition } from '../domain/Tetrominoes.js';
import ReplayPlayer from '../replay/ReplayPlayer.js';
import ReplayRecorder from '../replay/ReplayRecorder.js';
import GravitySystem from './GravitySystem.js';
import InputRepeatSystem from './InputRepeatSystem.js';
import LockDelaySystem from './LockDelaySystem.js';

function createSeed() {
    if (globalThis.crypto?.getRandomValues) {
        const values = new Uint32Array(2);
        globalThis.crypto.getRandomValues(values);
        return `${values[0].toString(36)}-${values[1].toString(36)}`;
    }
    return `${Date.now().toString(36)}-${Math.floor(Math.random() * 1e9).toString(36)}`;
}

export default class TetrisEngine {
    constructor({ config = TETRIS_CONFIG, onEvent = null } = {}) {
        this.config = config;
        this.onEvent = onEvent;
        this.board = new Board(config.board);
        this.rotation = new RotationSystem();
        this.scoring = new ScoringSystem();
        this.gravity = new GravitySystem();
        this.inputRepeat = new InputRepeatSystem();
        this.lockDelay = new LockDelaySystem();
        this.state = new TetrisState();
        this.resetSessionState();
    }

    resetSessionState() {
        this.seed = null;
        this.bag = null;
        this.activePiece = null;
        this.heldPiece = null;
        this.holdUsed = false;
        this.tick = 0;
        this.elapsedSeconds = 0;
        this.piecesLocked = 0;
        this.tetrises = 0;
        this.tSpins = 0;
        this.maxCombo = -1;
        this.lastAction = null;
        this.lastRotationKick = -1;
        this.recorder = null;
        this.replayPlayer = null;
        this.isReplay = false;
    }

    start({ seed = createSeed(), replay = null } = {}) {
        this.board.reset();
        this.scoring.reset();
        this.gravity.reset();
        this.inputRepeat.reset();
        this.lockDelay.resetForPiece();
        this.resetSessionState();

        this.isReplay = Boolean(replay);
        if (replay) {
            const replayFixedStep = Number(replay.fixedStep);
            if (!Number.isFinite(replayFixedStep)
                || Math.abs(replayFixedStep - this.config.timing.fixedStep) > 1e-9) {
                throw new Error('Replay fixed-step does not match the Tetris engine configuration.');
            }
        }
        this.seed = replay?.seed ?? seed;
        this.bag = new PieceBag({ seed: this.seed });
        this.recorder = this.isReplay ? null : new ReplayRecorder({
            seed: this.seed,
            fixedStep: this.config.timing.fixedStep,
        });
        this.replayPlayer = this.isReplay ? new ReplayPlayer(replay) : null;
        this.state.set(TETRIS_STATES.PLAYING);
        this.spawnNextPiece();
        this.emit('session-started', this.snapshot());
        return this.snapshot();
    }

    emit(type, payload = {}) {
        this.onEvent?.(Object.freeze({ type, ...payload }));
    }

    spawnPiece(type) {
        const position = spawnPosition(type, this.board.width, this.board.hiddenRows);
        const piece = new Piece(type, position);
        this.activePiece = piece;
        this.holdUsed = false;
        this.lastAction = 'spawn';
        this.lastRotationKick = -1;
        this.gravity.reset();
        this.lockDelay.resetForPiece();

        if (!this.board.canPlace(piece)) {
            this.finish('block-out');
            return false;
        }

        this.emit('piece-spawned', { piece: piece.clone(), next: this.nextQueue() });
        return true;
    }

    spawnNextPiece() {
        return this.spawnPiece(this.bag.next());
    }

    nextQueue() {
        return this.bag?.peek(this.config.queue.previewCount) ?? [];
    }

    update(deltaTime, liveInput = {}) {
        if (!this.state.is(TETRIS_STATES.PLAYING) || !this.activePiece) return;

        const input = this.replayPlayer?.inputAt(this.tick) ?? liveInput;
        this.recorder?.record(this.tick, input);
        this.tick += 1;
        this.elapsedSeconds += deltaTime;

        let manipulated = false;

        if (input.hold) {
            manipulated = this.hold() || manipulated;
            if (!this.state.is(TETRIS_STATES.PLAYING)) return;
        }

        if (input.rotateClockwise) {
            manipulated = this.tryRotate(1) || manipulated;
        }
        if (input.rotateCounterClockwise) {
            manipulated = this.tryRotate(-1) || manipulated;
        }

        for (const direction of this.inputRepeat.horizontal(input, deltaTime)) {
            manipulated = this.tryMove(direction, 0, 'move') || manipulated;
        }

        if (input.hardDrop) {
            const distance = this.hardDrop();
            this.scoring.addDrop({ hard: distance });
            this.lockActivePiece('hard-drop');
            return;
        }

        const softDropSteps = this.inputRepeat.softDrop(input, deltaTime);
        let softDropDistance = 0;
        for (let index = 0; index < softDropSteps; index += 1) {
            if (!this.tryMove(0, 1, 'soft-drop')) break;
            softDropDistance += 1;
        }
        if (softDropDistance > 0) this.scoring.addDrop({ soft: softDropDistance });

        const gravitySteps = this.gravity.update(deltaTime, this.scoring.level);
        for (let index = 0; index < gravitySteps; index += 1) {
            if (!this.tryMove(0, 1, 'gravity')) break;
        }

        const grounded = !this.board.canPlace(this.activePiece.moved(0, 1));
        if (this.lockDelay.update(deltaTime, { grounded, manipulated })) {
            this.lockActivePiece('lock-delay');
        }
    }

    tryMove(dx, dy, action = 'move') {
        const candidate = this.activePiece.moved(dx, dy);
        if (!this.board.canPlace(candidate)) return false;
        this.activePiece = candidate;
        this.lastAction = action;
        this.lastRotationKick = -1;
        return true;
    }

    tryRotate(direction) {
        const result = this.rotation.rotate(this.board, this.activePiece, direction);
        if (!result.success) return false;
        this.activePiece = result.piece;
        this.lastAction = 'rotate';
        this.lastRotationKick = result.kickIndex;
        this.emit('piece-rotated', { direction, kickIndex: result.kickIndex });
        return true;
    }

    hardDrop() {
        const startY = this.activePiece.y;
        this.activePiece = this.activePiece.clone({ y: this.board.ghostY(this.activePiece) });
        this.lastAction = 'hard-drop';
        return this.activePiece.y - startY;
    }

    hold() {
        if (this.holdUsed || !this.activePiece) return false;
        const outgoing = this.activePiece.type;
        const incoming = this.heldPiece;
        this.heldPiece = outgoing;
        this.holdUsed = true;

        if (incoming) {
            const position = spawnPosition(incoming, this.board.width, this.board.hiddenRows);
            this.activePiece = new Piece(incoming, position);
            this.gravity.reset();
            this.lockDelay.resetForPiece();
            this.lastAction = 'hold';
            if (!this.board.canPlace(this.activePiece)) {
                this.finish('block-out');
            }
        } else {
            this.spawnNextPiece();
            this.holdUsed = true;
        }

        this.emit('piece-held', { held: this.heldPiece, active: this.activePiece?.type ?? null });
        return true;
    }

    detectTSpin(piece) {
        if (piece.type !== 'T' || this.lastAction !== 'rotate') return false;
        const centerX = piece.x + 1;
        const centerY = piece.y + 1;
        const corners = [
            [centerX - 1, centerY - 1],
            [centerX + 1, centerY - 1],
            [centerX - 1, centerY + 1],
            [centerX + 1, centerY + 1],
        ];
        const occupied = corners.filter(([x, y]) => this.board.occupied(x, y)).length;
        return occupied >= 3;
    }

    lockActivePiece(reason) {
        if (!this.activePiece || !this.state.is(TETRIS_STATES.PLAYING)) return;
        const lockedPiece = this.activePiece.clone();
        const lockOut = lockedPiece.cells().some(({ y }) => y < this.board.hiddenRows);
        const tSpin = this.detectTSpin(lockedPiece);

        if (!this.board.lockPiece(lockedPiece)) {
            this.finish('invalid-lock');
            return;
        }

        this.piecesLocked += 1;
        const rows = this.board.completedRows();
        if (rows.length > 0) {
            this.emit('lines-cleared', { rows: [...rows], count: rows.length });
            this.board.clearRows(rows);
        }

        const perfectClear = rows.length > 0 && this.board.isPerfectClear();
        const award = this.scoring.awardLock({ lines: rows.length, tSpin, perfectClear });
        this.maxCombo = Math.max(this.maxCombo, award.combo);
        if (rows.length === 4) this.tetrises += 1;
        if (tSpin) this.tSpins += 1;

        this.emit('piece-locked', {
            reason,
            piece: lockedPiece,
            rows,
            award,
            perfectClear,
        });

        if (lockOut || this.board.isGameOver()) {
            this.finish('lock-out');
            return;
        }

        this.spawnNextPiece();
    }

    finish(reason = 'game-over') {
        if (this.state.is(TETRIS_STATES.GAME_OVER)) return;
        this.state.set(TETRIS_STATES.GAME_OVER);
        const result = this.result(reason);
        this.emit('game-over', result);
    }

    result(reason = 'game-over') {
        return Object.freeze({
            reason,
            score: this.scoring.score,
            lines: this.scoring.lines,
            level: this.scoring.level,
            pieces: this.piecesLocked,
            tetrises: this.tetrises,
            tSpins: this.tSpins,
            maxCombo: Math.max(0, this.maxCombo),
            durationSeconds: Math.floor(this.elapsedSeconds),
            seed: this.seed,
            replay: this.recorder?.export({
                score: this.scoring.score,
                lines: this.scoring.lines,
                level: this.scoring.level,
            }) ?? null,
            isReplay: this.isReplay,
        });
    }

    ghostPiece() {
        if (!this.activePiece) return null;
        return this.activePiece.clone({ y: this.board.ghostY(this.activePiece) });
    }

    snapshot() {
        return Object.freeze({
            state: this.state.value,
            board: this.board.snapshot(),
            activePiece: this.activePiece?.clone() ?? null,
            ghostPiece: this.ghostPiece(),
            heldPiece: this.heldPiece,
            holdAvailable: !this.holdUsed,
            nextQueue: Object.freeze([...this.nextQueue()]),
            scoring: this.scoring.snapshot(),
            seed: this.seed,
            elapsedSeconds: this.elapsedSeconds,
            piecesLocked: this.piecesLocked,
            isReplay: this.isReplay,
        });
    }
}
