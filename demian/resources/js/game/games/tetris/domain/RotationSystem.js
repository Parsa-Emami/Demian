const JLSTZ_KICKS = Object.freeze({
    '0>1': [[0, 0], [-1, 0], [-1, -1], [0, 2], [-1, 2]],
    '1>0': [[0, 0], [1, 0], [1, 1], [0, -2], [1, -2]],
    '1>2': [[0, 0], [1, 0], [1, 1], [0, -2], [1, -2]],
    '2>1': [[0, 0], [-1, 0], [-1, -1], [0, 2], [-1, 2]],
    '2>3': [[0, 0], [1, 0], [1, -1], [0, 2], [1, 2]],
    '3>2': [[0, 0], [-1, 0], [-1, 1], [0, -2], [-1, -2]],
    '3>0': [[0, 0], [-1, 0], [-1, 1], [0, -2], [-1, -2]],
    '0>3': [[0, 0], [1, 0], [1, -1], [0, 2], [1, 2]],
});

const I_KICKS = Object.freeze({
    '0>1': [[0, 0], [-2, 0], [1, 0], [-2, 1], [1, -2]],
    '1>0': [[0, 0], [2, 0], [-1, 0], [2, -1], [-1, 2]],
    '1>2': [[0, 0], [-1, 0], [2, 0], [-1, -2], [2, 1]],
    '2>1': [[0, 0], [1, 0], [-2, 0], [1, 2], [-2, -1]],
    '2>3': [[0, 0], [2, 0], [-1, 0], [2, -1], [-1, 2]],
    '3>2': [[0, 0], [-2, 0], [1, 0], [-2, 1], [1, -2]],
    '3>0': [[0, 0], [1, 0], [-2, 0], [1, 2], [-2, -1]],
    '0>3': [[0, 0], [-1, 0], [2, 0], [-1, -2], [2, 1]],
});

export default class RotationSystem {
    rotate(board, piece, direction = 1) {
        if (piece.type === 'O') {
            return { success: true, piece: piece.clone(), kickIndex: 0 };
        }

        const target = piece.rotated(direction);
        const key = `${piece.rotation}>${target.rotation}`;
        const table = piece.type === 'I' ? I_KICKS : JLSTZ_KICKS;
        const kicks = table[key] ?? [[0, 0]];

        for (let index = 0; index < kicks.length; index += 1) {
            const [dx, dy] = kicks[index];
            const candidate = target.moved(dx, dy);
            if (board.canPlace(candidate)) {
                return { success: true, piece: candidate, kickIndex: index };
            }
        }

        return { success: false, piece, kickIndex: -1 };
    }
}
