import ArcadeMiniGameBase from '../arcade/ArcadeMiniGameBase.js';
export default class NeonRunGame extends ArcadeMiniGameBase {
    constructor() { super({ id: 'neon-run', title: 'NEON RUN', subtitle: 'Jump · Dash · Survive', kicker: 'DEMIAN ARCADE / 01', objective: 'روی مسیر نئون بدو، بپر و رکورد بزن.', controls: 'A/D یا جوی‌استیک · JUMP · DASH', duration: 60 }); }
}
