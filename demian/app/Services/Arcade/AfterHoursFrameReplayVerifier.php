<?php

namespace App\Services\Arcade;

use Illuminate\Validation\ValidationException;

/**
 * Independent 60Hz ORIGINAL After Hours state replay. This version is not
 * connected to public ranked endpoints until exhaustive JS parity, client
 * input capture, concurrency and hosting acceptance are complete.
 *
 * Compact wire evidence: [tick, xAxis, zAxis, run(0/1),
 *                         interact(0/1), powerSelection|null].
 * Axes remain held between events; interact is a one-tick pulse.
 * No score, position, shadow state or client-owned card flag is trusted.
 */
final class AfterHoursFrameReplayVerifier
{
    public const VERSION = 'after-hours-frames-v1';
    public const MAX_TRANSITIONS = 6500;
    private const SPAWN = ['x'=>-1.2,'z'=>-6.5];
    private const BOUNDS = [
        'minX'=>-14.7,'maxX'=>14.7,'minZ'=>-76.1,'maxZ'=>-2.4,
    ];
    private const PANELS = [
        ['id'=>'panel-front','kind'=>'panel','x'=>2.9,'z'=>-9.0],
        ['id'=>'panel-back','kind'=>'panel','x'=>-1.8,'z'=>-52.1],
    ];
    private const EXIT = ['id'=>'exit','kind'=>'exit','x'=>0.4,'z'=>-3.9];
    private const LOCKER = ['id'=>'locker','kind'=>'locker','x'=>-11.6,'z'=>-74.95];
    private const CARD_LAYOUTS = [
        [['x'=>1.1,'z'=>-24.8],['x'=>3.7,'z'=>-68.5]],
        [['x'=>-10.9,'z'=>-34.6],['x'=>-11.8,'z'=>-65.5]],
        [['x'=>7.0,'z'=>-48.8],['x'=>-6.4,'z'=>-72.7]],
    ];
    private const RULES = [
        'standard'=>['duration'=>300,'grace'=>7,'hearing'=>1.0],
        'hard'=>['duration'=>240,'grace'=>5,'hearing'=>1.28],
    ];

    public function __construct(
        private readonly CafeRouteGeometry $geometry,
        private readonly CafeFbxMotion $physics
    ) {}

    private function reject(string $message): never
    {
        throw ValidationException::withMessages(['replay'=>$message]);
    }

    private static function dist(array $a,array $b): float
    {
        return hypot($b['x']-$a['x'],$b['z']-$a['z']);
    }

    private function nearest(array $player,array $cards,bool $relic): ?array
    {
        $targets=[...self::PANELS,self::EXIT,self::LOCKER,...$cards];
        $distance=2.3;$nearest=null;
        foreach($targets as $target){
            if(($target['collected']??false)
                ||($target['kind']==='locker'&&$relic))continue;
            $gap=self::dist($player,$target);
            if($gap >= $distance
                ||! $this->geometry->canSee($player,$target))continue;
            $nearest=$target;$distance=$gap;
        }
        return $nearest;
    }

    private function validated(int $ticks,array $transitions,string $difficulty): void
    {
        $duration=self::RULES[$difficulty]['duration']??null;
        if($duration===null||$ticks<60||$ticks>$duration*60
            ||count($transitions)<2||count($transitions)>self::MAX_TRANSITIONS){
            $this->reject('Invalid After Hours frame evidence bounds.');
        }
        $last=0;
        foreach($transitions as $change){
            if(!is_array($change)||array_keys($change)!==[0,1,2,3,4,5]
                ||!is_int($change[0])||$change[0]<1||$change[0]>$ticks
                ||$change[0]<=$last
                ||!is_numeric($change[1])||!is_numeric($change[2])
                ||is_bool($change[1])||is_bool($change[2])
                ||!is_finite((float)$change[1])||!is_finite((float)$change[2])
                ||abs((float)$change[1])>1||abs((float)$change[2])>1
                ||!in_array($change[3],[0,1],true)
                ||!in_array($change[4],[0,1],true)
                ||($change[5]!==null
                    &&!in_array($change[5],['exit','counter','storage'],true))
                ||($change[5]!==null&&$change[4]!==1)){
                $this->reject('Invalid compressed After Hours input transition.');
            }
            $last=$change[0];
        }
        if($transitions[0][0]!==1||$transitions[array_key_last($transitions)][0]!==$ticks){
            $this->reject('Original After Hours proof must include first and terminal input.');
        }
    }

    /** Simulate even losses for differential QA; verify() accepts wins only. */
    public function simulate(
        int $seed,int $ticks,array $transitions,string $difficulty='standard'
    ): array {
        if($seed<1)$this->reject('Invalid challenge seed.');
        $this->validated($ticks,$transitions,$difficulty);
        $rules=self::RULES[$difficulty];
        $layout=self::CARD_LAYOUTS[$seed%3];
        $cards=[
            ['id'=>'card-1','kind'=>'card',...$layout[0],'collected'=>false],
            ['id'=>'card-2','kind'=>'card',...$layout[1],'collected'=>false],
        ];
        $player=self::SPAWN;
        $shadow=new AfterHoursShadowSimulator($this->geometry,$this->physics,$difficulty);
        $elapsed=0.0;
        $status='running';
        $dark='storage';
        $collected=0;
        $relic=false;
        $stepDistance=0.0;
        $noise=null;$noiseId=0;
        $held=['x'=>0.0,'z'=>0.0,'run'=>false];
        $transitionIndex=0;
        $frames=0;
        for($tick=1;$tick<=$ticks;$tick++){
            $interact=false;$power=null;
            if(isset($transitions[$transitionIndex])
                &&$transitions[$transitionIndex][0]===$tick){
                $change=$transitions[$transitionIndex++];
                $held=['x'=>(float)$change[1],'z'=>(float)$change[2],
                    'run'=>$change[3]===1];
                $interact=$change[4]===1;
                $power=$change[5];
            }
            // Source AfterHoursGame.fixedUpdate handles interact BEFORE advance.
            if($interact){
                $target=$this->nearest($player,$cards,$relic);
                switch($target['kind']??null){
                    case 'panel':
                        if($power!==null){
                            if($power===$dark)$this->reject('Redundant power change.');
                            $dark=$power;
                        }else{
                            // Ranked frame protocol requires a completed choice,
                            // not a menu open/close without a simulated tick.
                            $this->reject('Panel interaction lacks a circuit decision.');
                        }
                        break;
                    case 'card':
                        foreach($cards as &$card){
                            if($card['id']===$target['id']){
                                $card['collected']=true;$collected++;
                                break;
                            }
                        }
                        unset($card);
                        break;
                    case 'locker':
                        if($dark!=='storage'){
                            $relic=true;
                            $noise=['id'=>++$noiseId,'x'=>$target['x'],
                                'z'=>$target['z'],'radius'=>14*$rules['hearing'],
                                'time'=>$elapsed];
                        }
                        break;
                    case 'exit':
                        if($collected===2&&$dark!=='exit')$status='escaped';
                        break;
                    default:
                        if($power!==null)$this->reject('Power forged outside a panel.');
                }
            }elseif($power!==null)$this->reject('Power must be selected with interaction.');
            if($status==='escaped'){
                if($tick!==$ticks)$this->reject('Evidence continues after escape.');
                break;
            }
            // JS advances fixed dt and checks timeout BEFORE movement/AI.
            $before=$elapsed;
            $elapsed=min((float)$rules['duration'],$elapsed+1/60);
            if($elapsed >= $rules['duration']-1e-6){
                $status='timeout';
                if($tick!==$ticks)$this->reject('Evidence continues after timeout.');
                break;
            }
            $x=max(-1.0,min(1.0,$held['x']));
            $z=max(-1.0,min(1.0,$held['z']));
            $length=hypot($x,$z);
            if($length>=0.02){
                $run=$held['run'];
                $speed=($run?10.8:5.4)*min(1.0,$length);
                $direction=['x'=>$x/$length,'z'=>$z/$length];
                $beforeMove=$player;
                $player=$this->physics->move($player,[
                    'x'=>$player['x']+$direction['x']*$speed/60,
                    'z'=>$player['z']+$direction['z']*$speed/60,
                ],self::BOUNDS);
                $travel=self::dist($beforeMove,$player);
                if($travel/ (1/60) >= 0.15){
                    $stepDistance+=$travel;
                    if($stepDistance >= ($run?3.2:2.4)){
                        $stepDistance=0.0;
                        if($run){
                            $noise=['id'=>++$noiseId,
                                'x'=>$player['x'],'z'=>$player['z'],
                                'radius'=>11.5*$rules['hearing'],'time'=>$elapsed];
                        }
                    }
                }
            }
            $active=$elapsed >= $rules['grace'];
            $lit=($player['z']>=-16.5?'exit':
                ($player['z']>=-55.5?'counter':'storage'))!==$dark;
            $heard=$noise!==null&&($elapsed-$noise['time']<0.85)?$noise:null;
            $shadow->tick($player,$lit,$active,$heard);
            $frames=$tick;
            if($active&&self::dist($player,$shadow->position)<=1.08
                &&$this->geometry->canSee($player,$shadow->position)){
                $status='caught';
                if($tick!==$ticks)$this->reject('Evidence continues after capture.');
                break;
            }
        }
        if($transitionIndex!==count($transitions))
            $this->reject('Unused or post-terminal input transitions.');
        $remaining=max(0.0,$rules['duration']-$elapsed);
        $score=$status==='escaped'
            ?1000+(int)floor($remaining)*2+($relic?300:0)
            :$collected*100;
        return ['status'=>$status,'score'=>$score,'ticks'=>$ticks,
            'passed'=>$collected,'relic'=>$relic,'elapsed'=>$elapsed,
            'player'=>$player,'shadow'=>$shadow->snapshot(),
            'frames'=>$frames];
    }

    public function verify(
        int $seed,int $ticks,array $transitions,string $difficulty='standard'
    ): array {
        $result=$this->simulate($seed,$ticks,$transitions,$difficulty);
        if($result['status']!=='escaped'||$result['passed']!==2)
            $this->reject('No independently verified original After Hours escape.');
        return ['score'=>$result['score'],'ticks'=>$ticks,'passed'=>2];
    }
}
