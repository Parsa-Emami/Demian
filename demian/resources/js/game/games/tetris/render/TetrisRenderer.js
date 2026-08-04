import { TETROMINO_COLORS } from '../domain/Tetrominoes.js';
import { CAFE_BOUNDS, CAFE_STATIC_COLLIDERS } from '../../../shared/cafe/CafeReferenceLayout.js';
import CafeGameRenderer2D from '../../../rendering2d/CafeGameRenderer2D.js';
import { cssColor, PIXEL_PALETTE as P } from '../../../rendering2d/PixelPalette.js';

const GHOST_COLOR = '#bff7ff';

export default class TetrisRenderer extends CafeGameRenderer2D {
    constructor(context, config) {
        super(context, { bounds: CAFE_BOUNDS, staticColliders: CAFE_STATIC_COLLIDERS }, { follow: false, atmosphere: 'night' });
        this.config = config;
        this.flash = new Map();
        this.resize();
    }

    render(snapshot, deltaTime = 0) {
        if (!snapshot) return;
        for (const [row, remaining] of this.flash) {
            const next = remaining - deltaTime;
            if (next <= 0) this.flash.delete(row); else this.flash.set(row, next);
        }

        const ctx = this.begin({ atmosphere: 'night' });
        const logical = this.context.renderer.logicalDimensions();
        const { width, visibleRows, hiddenRows } = this.config.board;
        const maxCellByHeight = Math.floor((logical.height - 24) / visibleRows);
        const maxCellByWidth = Math.floor((logical.width * 0.54) / width);
        const cell = Math.max(6, Math.min(15, maxCellByHeight, maxCellByWidth));
        const boardWidth = width * cell;
        const boardHeight = visibleRows * cell;
        const originX = Math.round((logical.width - boardWidth) / 2);
        const originY = Math.round((logical.height - boardHeight) / 2);

        ctx.fillStyle = 'rgba(8, 11, 29, 0.92)';
        ctx.fillRect(originX - 5, originY - 5, boardWidth + 10, boardHeight + 10);
        ctx.strokeStyle = P.cyan;
        ctx.lineWidth = 2;
        ctx.strokeRect(originX - 4.5, originY - 4.5, boardWidth + 9, boardHeight + 9);
        ctx.strokeStyle = 'rgba(120, 140, 180, 0.24)';
        ctx.lineWidth = 1;
        for (let x = 0; x <= width; x += 1) {
            ctx.beginPath(); ctx.moveTo(originX + x * cell + 0.5, originY); ctx.lineTo(originX + x * cell + 0.5, originY + boardHeight); ctx.stroke();
        }
        for (let y = 0; y <= visibleRows; y += 1) {
            ctx.beginPath(); ctx.moveTo(originX, originY + y * cell + 0.5); ctx.lineTo(originX + boardWidth, originY + y * cell + 0.5); ctx.stroke();
        }

        const drawCell = (x, y, color, ghost = false) => {
            if (y < hiddenRows) return;
            const screenY = originY + (y - hiddenRows) * cell;
            const screenX = originX + x * cell;
            if (ghost) {
                ctx.strokeStyle = color;
                ctx.globalAlpha = 0.58;
                ctx.strokeRect(screenX + 2.5, screenY + 2.5, cell - 5, cell - 5);
                ctx.globalAlpha = 1;
                return;
            }
            ctx.fillStyle = '#0b1020';
            ctx.fillRect(screenX + 1, screenY + 2, cell - 2, cell - 1);
            ctx.fillStyle = color;
            ctx.fillRect(screenX + 1, screenY + 1, cell - 2, cell - 3);
            ctx.fillStyle = 'rgba(255,255,255,.32)';
            ctx.fillRect(screenX + 2, screenY + 2, Math.max(2, cell - 5), 2);
            ctx.fillStyle = 'rgba(0,0,0,.26)';
            ctx.fillRect(screenX + cell - 3, screenY + 3, 2, Math.max(2, cell - 5));
        };

        snapshot.board.forEach((row, y) => row.forEach((type, x) => {
            if (type) drawCell(x, y, cssColor(TETROMINO_COLORS[type]));
        }));
        snapshot.ghostPiece?.cells().forEach(({ x, y }) => drawCell(x, y, GHOST_COLOR, true));
        snapshot.activePiece?.cells().forEach(({ x, y }) => drawCell(x, y, cssColor(TETROMINO_COLORS[snapshot.activePiece.type])));

        for (const [row, remaining] of this.flash) {
            const visibleY = row - hiddenRows;
            if (visibleY < 0 || visibleY >= visibleRows) continue;
            ctx.fillStyle = `rgba(255,255,255,${Math.min(0.85, remaining * 5)})`;
            ctx.fillRect(originX, originY + visibleY * cell, boardWidth, cell);
        }
        this.end(ctx);
    }

    flashRows(rows = []) { rows.forEach((row) => this.flash.set(Number(row), 0.18)); }
    dispose() { this.flash.clear(); super.dispose(); }
}
