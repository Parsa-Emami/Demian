import BaseScreen from './BaseScreen';

export default class CafeMenuScreen extends BaseScreen {
    async afterOpen() {
        const items = this.element.querySelectorAll('[data-menu-reveal]');
        this.animation?.revealItems(items, { duration: 330, delay: 55 });
    }
}
