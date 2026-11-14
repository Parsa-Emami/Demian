<?php

namespace App\Services\Arcade;

use Illuminate\Validation\ValidationException;

/**
 * Full fixed-step original CafeRushModel replay with SERVER-derived movement,
 * collision, schedule, order states, tray tilt, spills, VIP, combo and score.
 *
 * Evidence is a bounded array of RLE changes [tick,x,z,run,interact].
 * Both x/z axes are normalized inputs, NOT claimed player coordinates.
 * No arbitrary score, locally stored orders or client session time is trusted.
 *
 * This engine is not registered for public rewards until the authenticated
 * frontend records identical input and the release/abuse gates pass.
 */
final class CafeRushFrameReplayVerifier
{
    public const VERSION='cafe-rush-frames-v1';
    public const GAME_ID='cafe-rush';
    public const TICKS=7200;
    public const MAX_TRANSITIONS=7200;
    private const START=['x'=>-0.35,'z'=>-25.3];
    private const BOUNDS=['minX'=>-14.7,'maxX'=>14.7,'minZ'=>-49.5,'maxZ'=>-8.5];
    private const RULES=[
        'easy'=>['quota'=>4,'capacity'=>1,'patience'=>33.0,'cadence'=>12.0],
        'standard'=>['quota'=>6,'capacity'=>2,'patience'=>31.0,'cadence'=>8.2],
        'hard'=>['quota'=>8,'capacity'=>3,'patience'=>29.0,'cadence'=>6.6],
    ];
    private const RECIPES=[
        'tea'=>['station'=>'bar','time'=>1.25],
        'espresso'=>['station'=>'bar','time'=>1.65],
        'cake'=>['station'=>'pastry','time'=>.95],
        'vip'=>['station'=>'bar','time'=>2.6],
    ];
    private const MENU=['tea','cake','espresso','tea','espresso','cake'];
    private const TABLES=[1,2,1,2,1,2,2,1];
    private const SPOTS=[
        ['id'=>'tickets','kind'=>'tickets','x'=>-.1,'z'=>-26.35],
        ['id'=>'bar','kind'=>'station','x'=>2.95,'z'=>-31.15],
        ['id'=>'pastry','kind'=>'station','x'=>2.6,'z'=>-22.25],
        ['id'=>'table-1','kind'=>'table','table'=>1,'x'=>-2.35,'z'=>-16.9],
        ['id'=>'table-2','kind'=>'table','table'=>2,'x'=>-2.9,'z'=>-43.4],
    ];

    public function __construct(
        private readonly CafeRouteGeometry $geometry,
        private readonly CafeFbxMotion $physics
    ) {}

    private static function distance(array $a,array $b): float
    {
        return hypot($a['x']-$b['x'],$a['z']-$b['z']);
    }
    private static function clamp(float $value,float $min,float $max): float
    {
        return max($min,min($max,$value));
    }
    private function reject(string $why): never
    {
        throw ValidationException::withMessages(['replay'=>$why]);
    }

    private function validate(int $ticks,array $transitions,string $difficulty): void
    {
        if($ticks!==self::TICKS||!isset(self::RULES[$difficulty])
            ||count($transitions)<2||count($transitions)>self::MAX_TRANSITIONS)
            $this->reject('Invalid original Cafe Rush frame evidence bounds.');
        $last=0;
        foreach($transitions as $item){
            if(!is_array($item)||array_keys($item)!==[0,1,2,3,4]
                ||!is_int($item[0])||$item[0]<1||$item[0]>self::TICKS
                ||$item[0]<=$last
                ||!is_numeric($item[1])||!is_numeric($item[2])
                ||is_bool($item[1])||is_bool($item[2])
                ||!is_finite((float)$item[1])||!is_finite((float)$item[2])
                ||abs((float)$item[1])>1||abs((float)$item[2])>1
                ||!in_array($item[3],[0,1],true)||!in_array($item[4],[0,1],true))
                $this->reject('Invalid or non-monotonic Cafe Rush controls.');
            $last=$item[0];
        }
        if($transitions[0][0]!==1||$last!==self::TICKS)
            $this->reject('Missing initial or terminal controls.');
        if($transitions[array_key_last($transitions)][4]!==0)
            $this->reject('Cannot interact after the shift closes.');
    }

    public function simulate(
        int $seed,int $ticks,array $transitions,string $difficulty='standard'
    ): array {
        if($seed<1)$this->reject('Invalid Cafe Rush server seed.');
        $this->validate($ticks,$transitions,$difficulty);
        $rules=self::RULES[$difficulty];$variation=$seed%3;
        $elapsed=0.0;$nextTicketAt=0.0;$ticketNumber=0;$regularNumber=0;
        $vipIssued=false;$vipServed=false;
        $orders=[];$tray=null;$puddles=[];
        $player=self::START;$forward=['x'=>0.0,'z'=>-1.0];
        $speed=0.0;$velocity=['x'=>0.0,'z'=>0.0];
        $delivered=0;$score=0;$combo=0;$bestCombo=0;
        $spills=0;$expired=0;$mistakes=0;
        $input=['x'=>0.0,'z'=>0.0,'run'=>false];
        $index=0;

        $addTicket=static function(bool $vip,float $now)use(
            &$orders,&$ticketNumber,&$regularNumber,&$nextTicketAt,&$vipIssued,
            $variation,$rules
        ):void{
            $i=$regularNumber+$variation;
            $recipe=$vip?'vip':self::MENU[$i%count(self::MENU)];
            $table=$vip?2:self::TABLES[$i%count(self::TABLES)];
            $orders[]=['id'=>++$ticketNumber,'recipe'=>$recipe,'table'=>$table,
                'vip'=>$vip,'state'=>'waiting','readyAt'=>0.0,
                'due'=>min(120.0,$now+($vip?30.0:$rules['patience']))];
            if($vip)$vipIssued=true;
            else{
                $regularNumber++;
                $nextTicketAt=$now+$rules['cadence'];
            }
        };
        $schedule=static function(float $now)use(
            &$orders,&$nextTicketAt,&$vipIssued,$rules,$addTicket
        ):void{
            if(count($orders)>=$rules['capacity'])return;
            if($now>=90.0&&!$vipIssued)$addTicket(true,$now);
            elseif($now>=$nextTicketAt&&($now<77.0
                ||($vipIssued&&$now<108.0)))$addTicket(false,$now);
        };
        $schedule(0.0);
        for($tick=1;$tick<=self::TICKS;$tick++){
            $interact=false;
            if(isset($transitions[$index])&&$transitions[$index][0]===$tick){
                $t=$transitions[$index++];
                $input=['x'=>(float)$t[1],'z'=>(float)$t[2],
                    'run'=>$t[3]===1];$interact=$t[4]===1;
            }
            $elapsed=min(120.0,$elapsed+1/60);
            foreach($orders as &$order){
                if($order['due']<=$elapsed+1e-6){
                    $order['state']='expired';$expired++;$combo=0;
                    if($tray!==null&&$tray['orderId']===$order['id'])$tray=null;
                }elseif($order['state']==='preparing'
                    &&$order['readyAt']<=$elapsed+1e-6){
                    $order['state']='ready';
                }
            }
            unset($order);
            $orders=array_values(array_filter($orders,
                static fn(array $o):bool=>$o['state']!=='expired'));
            if($elapsed>=120.0-1e-6)break;

            // Model.move(dt,input): per-frame velocity, collisions, tray physics.
            $x=self::clamp($input['x'],-1.0,1.0);
            $z=self::clamp($input['z'],-1.0,1.0);
            $mag=hypot($x,$z);$moving=$mag>0.02;
            $direction=$moving?['x'=>$x/$mag,'z'=>$z/$mag]:$forward;
            $run=$input['run']&&$moving;
            $slippery=false;
            foreach($puddles as $point){
                if(self::distance($point,$player)<1.35){$slippery=true;break;}
            }
            $targetSpeed=$moving?($run?11.6:6.4)*min(1.0,$mag):0.0;
            $blend=$slippery?1-exp(-(1/60)*4.9):1.0;
            $previous=$player;$oldSpeed=$speed;
            $velocity['x']+=($direction['x']*$targetSpeed-$velocity['x'])*$blend;
            $velocity['z']+=($direction['z']*$targetSpeed-$velocity['z'])*$blend;
            if($targetSpeed>0.0||hypot($velocity['x'],$velocity['z'])>0.02){
                $player=$this->physics->move($player,[
                    'x'=>$player['x']+$velocity['x']/60,
                    'z'=>$player['z']+$velocity['z']/60,
                ],self::BOUNDS);
            }
            $speed=self::distance($previous,$player)*60;
            if($tray!==null){
                $angle=self::clamp(1.0-(
                    $forward['x']*$direction['x']+$forward['z']*$direction['z']
                ),0.0,2.0);
                $turn=$run&&$oldSpeed>6.4+0.75?$angle*0.51:0.0;
                $carried=null;
                foreach($orders as $o){
                    if($o['id']===$tray['orderId']){$carried=$o;break;}
                }
                $load=($carried['vip']??false)?1.23:1.0;
                $slip=$slippery&&$speed>2.0?(1/60)*($run?.48:.13):0.0;
                $tray['risk']=self::clamp($tray['risk']
                    +($turn+$slip)*$load-(1/60)*($run?.23:.68),0.0,1.0);
                $side=$forward['x']*$direction['z']-$forward['z']*$direction['x'];
                $tray['lean']=self::clamp($tray['lean']*exp(-(1/60)*6)
                    +($side>=0?1:-1)*$turn,-1.0,1.0);
                if($tray['risk']>=1.0){
                    foreach($orders as &$o){
                        if($o['id']===$tray['orderId'])$o['state']='accepted';
                    }
                    unset($o);
                    $tray=null;$spills++;$combo=0;
                    $duplicate=false;
                    foreach($puddles as $p){
                        if(self::distance($p,$player)<.8){$duplicate=true;break;}
                    }
                    if(count($puddles)<64&&!$duplicate)$puddles[]=$player;
                }
            }
            $forward=$direction;
            // The source model interacts AFTER the frame's physics.
            if($interact){
                $near=null;$distance=2.2;
                foreach(self::SPOTS as $spot){
                    $gap=self::distance($player,$spot);
                    if($gap<$distance&&$this->geometry->canSee($player,$spot)){
                        $distance=$gap;$near=$spot;
                    }
                }
                if($near!==null){
                    if($near['kind']==='table'){
                        if($tray!==null){
                            foreach($orders as $i=>$order){
                                if($order['id']!==$tray['orderId'])continue;
                                if($order['table']!==$near['table']){
                                    $combo=0;$mistakes++;
                                }else{
                                    $orders=array_values(array_filter($orders,
                                        static fn(array $o):bool=>$o['id']!==$order['id']));
                                    $combo++;$bestCombo=max($bestCombo,$combo);
                                    $delivered++;$vipServed=$vipServed||$order['vip'];
                                    $score+=100+($combo%3===0?50:0)+($order['vip']?75:0);
                                    $tray=null;
                                }
                                break;
                            }
                        }
                    }elseif($tray===null&&$near['kind']==='tickets'){
                        $accepted=false;$choice=null;
                        foreach($orders as $i=>$o){
                            if($o['state']==='accepted')$accepted=true;
                            if($o['state']==='waiting'){
                                if($choice===null)$choice=$i;
                                if($o['vip'])$choice=$i;
                            }
                        }
                        if(!$accepted&&$choice!==null)
                            $orders[$choice]['state']='accepted';
                    }elseif($tray===null&&$near['kind']==='station'){
                        $work=null;
                        foreach($orders as $i=>$o){
                            if(self::RECIPES[$o['recipe']]['station']===$near['id']
                                &&in_array($o['state'],['preparing','ready'],true)){
                                $work=$i;break;
                            }
                        }
                        if($work!==null&&$orders[$work]['state']==='ready'){
                            $tray=['orderId'=>$orders[$work]['id'],'risk'=>0.0,'lean'=>0.0];
                            $orders[$work]['state']='carrying';
                        }elseif($work===null){
                            foreach($orders as &$o){
                                if($o['state']==='accepted'
                                    &&self::RECIPES[$o['recipe']]['station']===$near['id']){
                                    $o['state']='preparing';
                                    $o['readyAt']=$elapsed+self::RECIPES[$o['recipe']]['time'];
                                    break;
                                }
                            }
                            unset($o);
                        }
                    }
                }
            }
            $schedule($elapsed);
        }
        if($index!==count($transitions))
            $this->reject('Unused original Cafe Rush input controls.');
        return [
            'score'=>$score,'ticks'=>self::TICKS,'passed'=>$delivered,
            'won'=>$delivered >= $rules['quota'],
            'details'=>['best_combo'=>$bestCombo,'vip_served'=>$vipServed,
                'spills'=>$spills,'expired'=>$expired,'mistakes'=>$mistakes],
            'player'=>$player,'puddles'=>count($puddles),'elapsed'=>$elapsed,
        ];
    }

    public function verify(
        int $seed,int $ticks,array $transitions,string $difficulty='standard'
    ): array {
        $result=$this->simulate($seed,$ticks,$transitions,$difficulty);
        // The original game always produces a score when the 120s shift ends,
        // even when the difficulty quota is missed. Require real successful
        // service, but never turn a genuine partial score into a fake win.
        if($result['passed']<1)$this->reject('No original Cafe Rush delivery verified.');
        return ['score'=>$result['score'],'ticks'=>$ticks,'passed'=>$result['passed']];
    }
}
