<?php

namespace App\Services\Arcade;

use Carbon\CarbonImmutable;
use Carbon\CarbonInterface;
use Illuminate\Support\Facades\DB;
use RuntimeException;

final class SkillLeagueService
{
    /** Cutoff is the season's immutable start. Delayed historical seals
     * cannot quietly rewrite the league during an active season. */
    private function history(array $players, string $key, string $cutoff): array
    {
        $history=[];
        foreach (array_chunk($players, 400) as $ids) {
            $rows=DB::table('arcade_skill_standings as s')
                ->join('arcade_skill_seasons as w','w.period_key','=','s.period_key')
                ->whereIn('s.player_id',$ids)->where('s.period_key','<',$key)
                ->where('w.finalized_at','<=',$cutoff)->where('s.qualified',true)
                ->orderBy('s.period_key')->get(['s.player_id','s.points']);
            foreach ($rows as $r) $history[$r->player_id][]=(int)$r->points;
        }
        return $history;
    }

    /** Called only by the trusted settlement transaction under period lock. */
    public function seal(string $key, array $snapshot, string $sourceHash, CarbonInterface $at): void
    {
        $start=app(WeeklyFairScoringService::class)->validatePeriodKey($key)->utc()->toDateTimeString();
        if (!hash_equals($sourceHash,hash('sha256',json_encode($snapshot,JSON_THROW_ON_ERROR)))) {
            throw new RuntimeException('League source checksum mismatch.');
        }
        if ($existing=DB::table('arcade_skill_seasons')->where('period_key',$key)->first()) {
            if (!hash_equals($existing->source_sha256,$sourceHash)) throw new RuntimeException('Immutable league source differs.');
            return;
        }
        $ids=array_values(array_unique(array_column($snapshot,'player_id')));
        $verified=[];
        foreach (array_chunk($ids,400) as $chunk) {
            foreach (DB::table('arcade_verified_phones')->whereIn('player_id',$chunk)->get(['player_id','verified_at']) as $p) {
                $verified[$p->player_id]=$p->verified_at;
            }
        }
        // The score must have been accomplished after ownership verification.
        // One unique verified phone per live account is enforced in the DB.
        $eligible=array_values(array_filter($snapshot, static fn($r) =>
            isset($verified[$r['player_id']])
            && CarbonImmutable::parse($verified[$r['player_id']], 'UTC')->lte(CarbonImmutable::parse($r['achieved_at'],'UTC'))));
        $entries=SkillLeaguePolicy::normalize($eligible);
        $history=$this->history(array_column($entries,'player_id'),$key,$start);
        $groups=[];
        foreach ($entries as $row) {
            $classification=SkillLeaguePolicy::classify($history[$row['player_id']]??[], $row['qualified']?$row['points']:null);
            if (!$row['qualified']) $classification['league']='placement';
            $groups[$classification['league']][]=['period_key'=>$key,...$row,...$classification];
        }
        ksort($groups,SORT_STRING); $rows=[];
        foreach ($groups as $league=>$group) {
            usort($group,static fn($a,$b)=>($b['points']<=>$a['points'])
                ?:strcmp($a['achieved_at'],$b['achieved_at'])?:strcmp($a['player_id'],$b['player_id']));
            $previous=null; $rank=0;
            foreach ($group as $i=>$r) {
                if ($previous!==$r['points']) { $rank=$i+1; $previous=$r['points']; }
                $rows[]=[...$r,'rank'=>$rank,'position'=>$i+1];
            }
        }
        DB::table('arcade_skill_seasons')->insert([
            'period_key'=>$key,'policy_version'=>SkillLeaguePolicy::VERSION,'source_sha256'=>$sourceHash,
            'snapshot_sha256'=>hash('sha256',json_encode($rows,JSON_THROW_ON_ERROR)),
            'participants'=>count($rows),'qualified'=>count(array_filter($rows,static fn($r)=>$r['qualified'])),
            'finalized_at'=>CarbonImmutable::instance($at)->utc()->toDateTimeString(),
        ]);
        foreach (array_chunk($rows,250) as $chunk) DB::table('arcade_skill_standings')->insert($chunk);
    }

    public function board(?string $key, string $league, int $limit): array
    {
        if ($key!==null) app(WeeklyFairScoringService::class)->validatePeriodKey($key);
        $season=DB::table('arcade_skill_seasons as s')->join('arcade_weekly_periods as w','w.period_key','=','s.period_key')
            ->where('w.status','sealed')->when($key!==null,fn($q)=>$q->where('s.period_key',$key))
            ->orderByDesc('s.period_key')->first(['s.*']);
        $base=['period_key'=>$season?->period_key??$key,'league'=>$league,'rules'=>SkillLeaguePolicy::rules(),
            'data'=>[],'participants'=>0,'status'=>'not_finalized'];
        if (!$season) return $base;
        $query=DB::table('arcade_skill_standings as s')->join('arcade_players as p','p.id','=','s.player_id')
            ->where('s.period_key',$season->period_key)->where('s.league',$league);
        $count=(clone $query)->count();
        $rows=$query->orderBy('s.position')->limit($limit)->get(['p.display_name','s.points','s.rank','s.position','s.qualified','s.movement','s.cohort_size','s.source_game_id']);
        return [...$base,'status'=>'finalized','participants'=>$count,'snapshot_sha256'=>$season->snapshot_sha256,
            'data'=>$rows->map(static fn($r)=>[
                'display_name'=>$r->display_name,'points'=>(int)$r->points,'rank'=>(int)$r->rank,
                'position'=>(int)$r->position,'qualified'=>(bool)$r->qualified,'movement'=>$r->movement,
                'cohort_size'=>(int)$r->cohort_size,'source_game_id'=>$r->source_game_id,
                'recognition'=>(bool)$r->qualified && (int)$r->rank<=3,
            ])->all()];
    }

    public function profile(string $player): array
    {
        $window=app(WeeklyCompetitionService::class)->window(CarbonImmutable::now('UTC'));
        $history=$this->history([$player],$window['period_key'],$window['starts_at']->toDateTimeString());
        $scores=$history[$player]??[];
        $state=SkillLeaguePolicy::classify($scores,null);
        $last=DB::table('arcade_skill_standings as s')->join('arcade_weekly_periods as w','w.period_key','=','s.period_key')
            ->where('w.status','sealed')->where('s.player_id',$player)->orderByDesc('s.period_key')
            ->first(['s.period_key','s.league','s.points','s.qualified','s.rank','s.movement']);
        return ['current_period'=>$window['period_key'],'current_league'=>$state['league'],'peak_tier'=>$state['peak_tier'],
            'low_weeks'=>$state['low_weeks'],'qualified_weeks'=>count($scores),
            'verified'=>app(PhoneIdentityService::class)->identity($player)!==null,
            'last_result'=>$last,'rules'=>SkillLeaguePolicy::rules()];
    }
}
