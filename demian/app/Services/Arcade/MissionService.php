<?php

namespace App\Services\Arcade;

use Carbon\CarbonImmutable;
use Carbon\CarbonInterface;
use Illuminate\Support\Facades\DB;
use RuntimeException;

final class MissionService
{
    private function evidence(array $ids, string $key, CarbonImmutable $start, CarbonImmutable $at, bool $sealedSource): array
    {
        $out=[];
        $table=$sealedSource?'arcade_personal_progress':'arcade_leaderboard_entries';
        for($day=0;$day<7;$day++) {
            $from=$start->addDays($day);
            if ($from->gt($at)) break;
            $rows=DB::table('arcade_runs as r')
                ->join('arcade_verified_phones as v','v.player_id','=','r.player_id')
                ->join($table.' as p',function($j) use($key) {
                    $j->on('p.player_id','=','r.player_id')->on('p.game_id','=','r.game_id')
                        ->on('p.rules_version','=','r.rules_version')->where('p.period_key',$key);
                })->whereIn('r.player_id',$ids)->whereIn('r.game_id',PersonalProgressService::GAMES)
                ->where('r.status','verified')->where('r.score','>',0)->whereNotNull('r.replay_hash')
                ->whereNotNull('r.completed_at')->where('r.completed_at','<=',$at->toDateTimeString())
                ->whereColumn('v.verified_at','<=','r.started_at')
                ->where('r.started_at','>=',$from->toDateTimeString())
                ->where('r.started_at','<',$from->addDay()->toDateTimeString())
                ->select('r.player_id','r.game_id','r.rules_version')->selectRaw('MAX(r.score) AS best')
                ->groupBy('r.player_id','r.game_id','r.rules_version')->get();
            foreach($rows as $r) {
                $id=$r->player_id;
                if (!isset($out[$id])) $out[$id]=['mask'=>0,'games'=>[]];
                $out[$id]['mask'] |= 1<<$day;
                $old=$out[$id]['games'][$r->game_id][$r->rules_version]??0;
                $out[$id]['games'][$r->game_id][$r->rules_version]=max($old,(int)$r->best);
            }
        }
        return $out;
    }

    private function goals(array $ids,string $key,CarbonImmutable $start): array
    {
        $rows=DB::table('arcade_personal_progress as p')
            ->join('arcade_weekly_periods as w','w.period_key','=','p.period_key')
            ->where('w.status','sealed')->where('w.sealed_at','<=',$start->toDateTimeString())
            ->where('p.period_key','<',$key)->whereIn('p.player_id',$ids)
            ->select('p.player_id','p.game_id','p.rules_version')
            ->selectRaw('MAX(p.score) AS best, COUNT(*) AS weeks')
            ->groupBy('p.player_id','p.game_id','p.rules_version')->get();
        $result=[];
        foreach($rows as $r) {
            $goal=PersonalProgressPolicy::goal((int)$r->best,(int)$r->weeks);
            if ($goal!==null) $result[$r->player_id][$r->game_id][$r->rules_version]=$goal;
        }
        return $result;
    }

    private function achieved(array $games,array $goals,array $badges): ?array
    {
        ksort($games,SORT_STRING);
        foreach($games as $game=>$versions) {
            ksort($versions,SORT_STRING);
            foreach($versions as $version=>$score) {
                $target=$goals[$game][$version]??null;
                if ($target!==null && $score >= $target && isset($badges[$game][$version])) {
                    return ['game_id'=>$game,'rules_version'=>$version,'target'=>$target];
                }
            }
        }
        return null;
    }

    public function seal(string $key,string $digest,CarbonInterface $at): void
    {
        if (DB::transactionLevel()<1 || !preg_match('/^[a-f0-9]{64}$/D',$digest)) throw new RuntimeException('Mission settlement requires a trusted transaction.');
        $period=DB::table('arcade_weekly_periods')->where('period_key',$key)->lockForUpdate()->first();
        if (!$period || $period->status!=='open') throw new RuntimeException('Mission period is not open.');
        if (DB::table('arcade_personal_progress')->where('period_key',$key)->where('source_sha256','!=',$digest)->exists()) {
            throw new RuntimeException('Mission source checksum mismatch.');
        }
        $start=CarbonImmutable::parse($period->starts_at,'UTC');
        $now=CarbonImmutable::instance($at)->utc();
        $players=DB::table('arcade_personal_progress')->where('period_key',$key)->distinct()->orderBy('player_id')->pluck('player_id');
        foreach($players->chunk(400) as $chunk) {
            $ids=$chunk->all();
            $evidence=$this->evidence($ids,$key,$start,$now,true);
            $goals=$this->goals($ids,$key,$start);
            $badges=[];
            foreach(DB::table('arcade_personal_progress')->where('period_key',$key)->whereIn('player_id',$ids)
                ->where('badge','personal-breakthrough')->get(['player_id','game_id','rules_version']) as $r) {
                $badges[$r->player_id][$r->game_id][$r->rules_version]=true;
            }
            $rows=[];
            foreach($ids as $id) {
                $e=$evidence[$id]??['mask'=>0,'games'=>[]];
                $goal=$this->achieved($e['games'],$goals[$id]??[],$badges[$id]??[]);
                $parts=MissionPolicy::evaluate($e['mask'],count($e['games']),$goal!==null);
                if ($parts['total_xp']>MissionPolicy::CAP) throw new RuntimeException('Mission cap exceeded.');
                $rows[]=['player_id'=>$id,'period_key'=>$key,'policy_version'=>MissionPolicy::VERSION,...$parts,
                    'adaptive_game_id'=>$goal['game_id']??null,'adaptive_rules_version'=>$goal['rules_version']??null,
                    'adaptive_target'=>$goal['target']??null,'source_sha256'=>$digest,'created_at'=>$now->toDateTimeString()];
            }
            foreach(array_chunk($rows,200) as $batch) DB::table('arcade_mission_weeks')->insert($batch);
        }
    }

    public function profile(string $player): array
    {
        $now=CarbonImmutable::now('UTC');
        $window=app(WeeklyCompetitionService::class)->window($now);
        $key=$window['period_key']; $start=$window['starts_at'];
        $verified=app(PhoneIdentityService::class)->identity($player)!==null;
        $local=$now->setTimezone('Asia/Tehran');
        $response=['verified'=>$verified,'status'=>$verified?'provisional':'unverified',
            'server_now'=>$now->toIso8601String(),'day_ends_at'=>$local->startOfDay()->addDay()->utc()->toIso8601String(),
            'week_ends_at'=>$window['ends_at']->toIso8601String(),'period_key'=>$key,'rules'=>MissionPolicy::rules(),
            'progress'=>MissionPolicy::evaluate(0,0,false),'today_complete'=>false,'targets'=>[],'played_games'=>[],'last_finalized'=>null];
        if (!$verified) return $response;
        $e=$this->evidence([$player],$key,$start,$now,false)[$player]??['mask'=>0,'games'=>[]];
        $goals=$this->goals([$player],$key,$start)[$player]??[];
        $targets=[];$met=false;
        $locks=DB::table('arcade_weekly_rule_locks')->where('period_key',$key)->where('ranked_enabled',true)
            ->get(['game_id','rules_version'])->keyBy('game_id');
        foreach($goals as $game=>$versions) {
            $version=$locks->get($game)?->rules_version;
            if (!$version || !isset($versions[$version])) continue;
            $score=$e['games'][$game][$version]??0;
            $target=$versions[$version];
            $met=$met || $score >= $target;
            $targets[]=['game_id'=>$game,'rules_version'=>$version,'target'=>$target,'score'=>$score,'provisional_met'=>$score >= $target];
        }
        $last=DB::table('arcade_mission_weeks as m')->join('arcade_weekly_periods as w','w.period_key','=','m.period_key')
            ->where('w.status','sealed')->where('m.player_id',$player)->orderByDesc('m.period_key')
            ->first(['m.period_key','m.total_xp','m.active_days','m.distinct_games','m.adaptive_xp']);
        $day=(int)$start->setTimezone('Asia/Tehran')->startOfDay()->diffInDays($local->startOfDay());
        return [...$response,'progress'=>MissionPolicy::evaluate($e['mask'],count($e['games']),$met),
            'today_complete'=>(bool)($e['mask'] & (1<<$day)),'targets'=>$targets,'played_games'=>array_keys($e['games']),
            'last_finalized'=>$last?['period_key'=>$last->period_key,'total_xp'=>(int)$last->total_xp,
                'active_days'=>(int)$last->active_days,'distinct_games'=>(int)$last->distinct_games,
                'adaptive_xp'=>(int)$last->adaptive_xp]:null];
    }
}
