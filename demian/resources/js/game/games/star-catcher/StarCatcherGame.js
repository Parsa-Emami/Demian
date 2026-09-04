import ArcadeMiniGameBase from '../arcade/ArcadeMiniGameBase.js';
export default class StarCatcherGame extends ArcadeMiniGameBase {
    constructor() { super({ id: 'star-catcher', title: 'STAR CATCHER', subtitle: 'Catch Gold · Dodge Red', kicker: 'DEMIAN ARCADE / 02', objective: 'ستاره‌های طلایی را بگیر و از بمب‌ها فرار کن.', controls: 'A/D یا جوی‌استیک · RUN · DASH', duration: 60 }); }
}
