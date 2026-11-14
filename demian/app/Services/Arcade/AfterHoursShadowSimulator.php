<?php

namespace App\Services\Arcade;

/**
 * Server-side reimplementation of the source AfterHoursShadow v1 state
 * machine: patrol, perception, hearing, investigation, chase, and pathfinding.
 * Fixed tick = 1/60 second. A JavaScript/PHP differential test MUST pass
 * before this is incorporated into a ranked original-game verifier.
 */
final class AfterHoursShadowSimulator
{
    public const BOUNDS = [
        'minX'=>-14.7,'maxX'=>14.7,'minZ'=>-76.1,'maxZ'=>-2.4,
    ];
    private const ROUTE = [
        ['x'=>4.5,'z'=>-70.1],['x'=>-4.2,'z'=>-73.4],
        ['x'=>-5.1,'z'=>-55.0],['x'=>-11.1,'z'=>-38.0],
        ['x'=>1.0,'z'=>-22.5],['x'=>3.1,'z'=>-47.5],
        ['x'=>7.0,'z'=>-54.4],
    ];
    private const RULES = [
        'standard' => ['patrol'=>3.7,'search'=>5.7,'chase'=>8.2,
            'reaction'=>0.58,'memory'=>2.6,'dark'=>13.0,'lit'=>6.0,
            'hear_delay'=>0.4],
        'hard' => ['patrol'=>4.6,'search'=>7.1,'chase'=>9.7,
            'reaction'=>0.3,'memory'=>3.6,'dark'=>16.0,'lit'=>7.5,
            'hear_delay'=>0.16],
    ];

    public array $position;
    public array $forward = ['x'=>0.0,'z'=>1.0];
    public string $mode = 'patrol';
    public int $patrolIndex = 1;
    public array $target;
    public ?int $lastHeardId = null;
    public float $sightTime = 0.0;
    public float $lostTime = 0.0;
    public float $wait = 0.0;
    public float $searchTime = 0.0;
    public float $pathTime = 0.0;
    public array $path = [];

    private array $rules;
    private CafeNavigationGrid $grid;

    public function __construct(
        private readonly CafeRouteGeometry $geometry,
        private readonly CafeFbxMotion $physics,
        string $difficulty='standard'
    ) {
        if (! isset(self::RULES[$difficulty])) {
            throw new \InvalidArgumentException('Invalid shadow difficulty.');
        }
        $this->rules = self::RULES[$difficulty];
        $this->position = self::ROUTE[0];
        $this->target = self::ROUTE[1];
        $this->grid = new CafeNavigationGrid($geometry,self::BOUNDS);
    }

    private function distance(array $a,array $b): float
    {
        return hypot($b['x']-$a['x'],$b['z']-$a['z']);
    }

    private function changeMode(string $mode,array $target,float $wait=0.0): void
    {
        $this->mode=$mode;
        $this->target=$target;
        $this->wait=$wait;
        $this->searchTime=0.0;
        $this->pathTime=0.0;
        $this->lostTime=0.0;
    }

    private function sees(array $player,bool $lit,float $distance): bool
    {
        $range=$lit?$this->rules['lit']:$this->rules['dark'];
        if($distance>$range)return false;
        $dx=$player['x']-$this->position['x'];
        $dz=$player['z']-$this->position['z'];
        $facing=$dx*$this->forward['x']+$dz*$this->forward['z'];
        return ($distance<3.0||$this->mode==='chase'||$facing>=$distance*.12)
            &&$this->geometry->canSee($this->position,$player);
    }

    /**
     * $noise must be null or server-created id/x/z/radius/time.
     * Never consume caller-supplied shadow locations or mode.
     */
    public function tick(
        array $player, bool $lit, bool $active, ?array $noise=null
    ): void {
        $dt=1.0/60.0;
        $gap=$this->distance($this->position,$player);
        $visible=$active&&$this->sees($player,$lit,$gap);
        $this->sightTime=$visible?$this->sightTime+$dt:0.0;

        if($this->mode==='chase'){
            if($visible){
                $this->target=$player;
                $this->lostTime=0.0;
            }else{
                $this->lostTime+=$dt;
                if($this->lostTime>=$this->rules['memory'])
                    $this->changeMode('investigate',$this->target);
            }
        }elseif($visible&&$this->sightTime>=$this->rules['reaction']){
            $this->changeMode('chase',$player);
        }elseif($active&&$noise!==null&&($noise['id']??null)!==$this->lastHeardId){
            $this->lastHeardId=$noise['id'];
            $clearance=$this->geometry->canHear($this->position,$noise)?1.0:0.48;
            if($this->distance($this->position,$noise)<=$noise['radius']*$clearance){
                $target=['x'=>$noise['x'],'z'=>$noise['z']];
                if($this->mode==='investigate'){
                    $this->target=$target;
                    $this->searchTime=0.0;
                }else{
                    $this->changeMode('investigate',$target,$this->rules['hear_delay']);
                }
            }
        }
        if($this->wait>0){
            $this->wait=max(0.0,$this->wait-$dt);
            return;
        }
        $reached=$this->distance($this->position,$this->target)<0.58;
        if($this->mode==='patrol'&&$reached){
            $this->patrolIndex=($this->patrolIndex+1)%count(self::ROUTE);
            $this->changeMode('patrol',self::ROUTE[$this->patrolIndex]);
            $this->wait=0.32;
            return;
        }
        if($this->mode==='investigate'){
            $this->searchTime+=$dt;
            if($this->searchTime>=($reached?2.2:11.0)){
                $this->changeMode('patrol',self::ROUTE[$this->patrolIndex]);
            }
        }
        $this->move($dt);
    }

    private function move(float $dt): void
    {
        $this->pathTime-=$dt;
        if($this->pathTime<=0.0){
            $this->pathTime=0.28;
            $goal=$this->grid->closest($this->target);
            $this->path=array_values(array_filter(
                $this->grid->findPath($this->position,$goal),
                fn(array $point):bool=>$this->distance($this->position,$point)>0.12
            ));
        }
        $waypoint=$this->path[0]??null;
        if($waypoint===null)return;
        $length=$this->distance($this->position,$waypoint);
        $speed=match($this->mode){
            'chase'=>$this->rules['chase'],
            'investigate'=>$this->rules['search'],
            default=>$this->rules['patrol'],
        };
        $step=min($length,$speed*$dt);
        if($step>0.0){
            $this->forward=[
                'x'=>($waypoint['x']-$this->position['x'])/$length,
                'z'=>($waypoint['z']-$this->position['z'])/$length,
            ];
            $this->position=$this->physics->move($this->position,[
                'x'=>$this->position['x']+$this->forward['x']*$step,
                'z'=>$this->position['z']+$this->forward['z']*$step,
            ],self::BOUNDS);
        }
        if($this->distance($this->position,$waypoint)<0.14)array_shift($this->path);
    }

    public function snapshot(): array
    {
        return [
            'position'=>$this->position,
            'forward'=>$this->forward,
            'mode'=>$this->mode,
            'patrolIndex'=>$this->patrolIndex,
            'sightTime'=>$this->sightTime,
            'lostTime'=>$this->lostTime,
        ];
    }
}
