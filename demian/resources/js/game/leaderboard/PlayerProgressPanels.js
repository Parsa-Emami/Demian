import PersonalProgressPanel from './PersonalProgressPanel.js';
import LoyaltyXpPanel from './LoyaltyXpPanel.js';
import MissionPanel from './MissionPanel.js';

export function mountPlayerProgressPanels(service, anchor) {
    const progress = new PersonalProgressPanel(service, anchor);
    const loyalty = new LoyaltyXpPanel(service, progress.root);
    const missions = new MissionPanel(service, loyalty.root);
    return [progress, loyalty, missions];
}
