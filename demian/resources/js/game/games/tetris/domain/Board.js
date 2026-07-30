export default class Board {
    constructor({ width = 10, visibleRows = 20, hiddenRows = 4 } = {}) {
        this.width = width;
        this.visibleRows = visibleRows;
        this.hiddenRows = hiddenRows;
        this.height = visibleRows + hiddenRows;
        this.grid = this.createGrid();
    }

    createGrid() {
        return Array.from({ length: this.height }, () => Array(this.width).fill(null));
    }

    reset() {
        this.grid = this.createGrid();
    }

    inside(x, y) {
        return x >= 0 && x < this.width && y < this.height;
    }

    occupied(x, y) {
        if (x < 0 || x >= this.width || y >= this.height) return true;
        if (y < 0) return false;
        return this.grid[y][x] !== null;
    }

    canPlace(piece) {
        return piece.cells().every(({ x, y }) => this.inside(x, y) && !this.occupied(x, y));
    }

    lockPiece(piece) {
        const cells = piece.cells();
        if (!cells.every(({ x, y }) => this.inside(x, y) && y >= 0 && !this.occupied(x, y))) {
            return false;
        }

        cells.forEach(({ x, y }) => {
            this.grid[y][x] = piece.type;
        });
        return true;
    }

    completedRows() {
        const rows = [];
        for (let y = 0; y < this.height; y += 1) {
            if (this.grid[y].every(Boolean)) rows.push(y);
        }
        return rows;
    }

    clearRows(rows = this.completedRows()) {
        const unique = [...new Set(rows)].sort((a, b) => a - b);
        if (unique.length === 0) return [];

        const rowSet = new Set(unique);
        const survivors = this.grid.filter((_, y) => !rowSet.has(y));
        const emptyRows = Array.from({ length: unique.length }, () => Array(this.width).fill(null));
        this.grid = [...emptyRows, ...survivors];
        return unique;
    }

    clearCompletedLines() {
        const rows = this.completedRows();
        this.clearRows(rows);
        return rows;
    }

    isPerfectClear() {
        return this.grid.every((row) => row.every((cell) => cell === null));
    }

    isGameOver() {
        return this.grid.slice(0, this.hiddenRows).some((row) => row.some(Boolean));
    }

    ghostY(piece) {
        let ghost = piece;
        while (this.canPlace(ghost.moved(0, 1))) {
            ghost = ghost.moved(0, 1);
        }
        return ghost.y;
    }

    snapshot() {
        return this.grid.map((row) => [...row]);
    }
}
