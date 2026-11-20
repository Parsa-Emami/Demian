import test from 'node:test';
import assert from 'node:assert/strict';
import ArcadeLeaderboardService from '../../resources/js/game/leaderboard/ArcadeLeaderboardService.js';
import {formatLeagueName} from '../../resources/js/game/leaderboard/SkillLeaguePresentation.js';

test('league endpoints are read-only and private request never accepts player-id from client', async () => {
    const calls=[];
    const service=new ArcadeLeaderboardService({baseUrl:'https://api.example.test',storage:null,identityStorage:null,
        fetcher:async(url,options)=>{calls.push({url,options});return {ok:true,json:async()=>({data:[]})};}});
    await service.skillLeague('gold','2026-11-07');
    assert.equal(new URL(calls[0].url).searchParams.get('league'),'gold');
    assert.equal(calls[0].options.headers.Authorization,undefined);
    assert.equal(await service.mySkillLeague(),null);
    service.identity={token:'private',player_id:'not-in-url'};
    await service.mySkillLeague();
    assert.equal(calls[1].options.headers.Authorization,'Bearer private');
    assert.ok(!calls[1].url.includes('not-in-url'));
    await assert.rejects(service.skillLeague('fake'));
    assert.equal(formatLeagueName('legend'),'افسانه‌ای');
    assert.equal(formatLeagueName('toString'),'نامشخص');
});
