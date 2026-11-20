import test from 'node:test';
import assert from 'node:assert/strict';
import ArcadeLeaderboardService from '../../resources/js/game/leaderboard/ArcadeLeaderboardService.js';

test('personal progress is bearer-private, allowlisted and never uses offline score storage',async()=>{
    const calls=[];
    const service=new ArcadeLeaderboardService({baseUrl:'https://api.example.test',storage:null,identityStorage:null,
        fetcher:async(url,options)=>{calls.push({url,options});return {ok:true,json:async()=>({history:[]})};}});
    assert.equal(await service.myPersonalProgress(),null);
    assert.equal(calls.length,0);
    service.identity={token:'private',player_id:'private-player'};
    await service.myPersonalProgress('dino-run');
    assert.equal(new URL(calls[0].url).searchParams.get('game'),'dino-run');
    assert.equal(calls[0].options.headers.Authorization,'Bearer private');
    assert.ok(!calls[0].url.includes('private-player'));
    await assert.rejects(service.myPersonalProgress('other-game'));
    assert.equal(calls.length,1);
});
