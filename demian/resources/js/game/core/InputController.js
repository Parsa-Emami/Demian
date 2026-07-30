import InputRouter from '../input/InputRouter';

/**
 * @deprecated Use InputRouter directly. This adapter preserves the original
 * constructor and OPEN_WORLD snapshot shape for older imports.
 */
export default class InputController extends InputRouter {
    constructor(root = document) {
        super({ root, initialContext: 'OPEN_WORLD' });
    }
}
