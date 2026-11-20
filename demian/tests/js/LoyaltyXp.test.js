import test from 'node:test';
import assert from 'node:assert/strict';
import ArcadeLeaderboardService from '../../resources/js/game/leaderboard/ArcadeLeaderboardService.js';

test('loyalty is read only and bearer private, with no offline XP claim or account parameter',async()=>{
    const calls=[];
    const service=new ArcadeLeaderboardService({baseUrl:'https://api.example.test',storage:null,identityStorage:null,
        fetcher:async(url,options)=>{calls.push({url,options});return {ok:true,json:async()=>({total_xp:0})};}});
    assert.equal(await service.myLoyalty(),null);
    assert.equal(calls.length,0);
    service.identity={token:'private',player_id:'private-player'};
    await service.myLoyalty();
    assert.equal(new URL(calls[0].url).pathname,'/api/v1/arcade/player/loyalty');
    assert.equal(new URL(calls[0].url).search,'');
    assert.equal(calls[0].options.headers.Authorization,'Bearer private');
    assert.equal(calls[0].options.method,'GET');
});
