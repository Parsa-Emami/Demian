<?php

namespace App\Services\Arcade;

/**
 * Independent PHP version of the exact 0.6-unit cafe NavigationGrid used by
 * AfterHoursShadow. This is NOT an authoritative AI until full model replay
 * verifies its parity with source JS across valid trace families.
 */
final class CafeNavigationGrid
{
    private int $width;
    private int $height;
    /** @var bool[] */
    private array $blocked = [];
    private array $bounds;
    private float $cellSize = 0.6;

    public function __construct(
        private readonly CafeRouteGeometry $geometry,
        array $bounds,
        float $radius = 0.44
    ) {
        $this->bounds = $bounds;
        $this->width = max(1, (int) ceil(($bounds['maxX']-$bounds['minX'])/$this->cellSize));
        $this->height = max(1, (int) ceil(($bounds['maxZ']-$bounds['minZ'])/$this->cellSize));
        for ($z=0; $z<$this->height; $z++) {
            for ($x=0; $x<$this->width; $x++) {
                $p = $this->cellToWorld(['x'=>$x,'z'=>$z]);
                $this->blocked[$z*$this->width+$x] =
                    $p['x'] < $bounds['minX']+$radius
                    || $p['x'] > $bounds['maxX']-$radius
                    || $p['z'] < $bounds['minZ']+$radius
                    || $p['z'] > $bounds['maxZ']-$radius
                    || ! $this->geometry->canStand($p['x'], $p['z'], $radius);
            }
        }
    }

    public function worldToCell(array $p): array
    {
        return [
            'x'=>max(0,min($this->width-1,
                (int) floor(($p['x']-$this->bounds['minX'])/$this->cellSize))),
            'z'=>max(0,min($this->height-1,
                (int) floor(($p['z']-$this->bounds['minZ'])/$this->cellSize))),
        ];
    }

    public function cellToWorld(array $c): array
    {
        return ['x'=>$this->bounds['minX']+($c['x']+0.5)*$this->cellSize,
            'z'=>$this->bounds['minZ']+($c['z']+0.5)*$this->cellSize];
    }

    public function isWalkable(int $x,int $z): bool
    {
        return $x>=0 && $z>=0 && $x<$this->width && $z<$this->height
            && ! $this->blocked[$z*$this->width+$x];
    }

    private function nearest(array $c,int $maxRadius=8): ?array
    {
        if ($this->isWalkable($c['x'],$c['z'])) return $c;
        for ($r=1;$r<=$maxRadius;$r++) {
            for ($x=$c['x']-$r;$x<=$c['x']+$r;$x++) {
                foreach ([$c['z']-$r,$c['z']+$r] as $z) {
                    if ($this->isWalkable($x,$z)) return ['x'=>$x,'z'=>$z];
                }
            }
            for ($z=$c['z']-$r+1;$z<$c['z']+$r;$z++) {
                foreach ([$c['x']-$r,$c['x']+$r] as $x) {
                    if ($this->isWalkable($x,$z)) return ['x'=>$x,'z'=>$z];
                }
            }
        }
        return null;
    }

    public function closest(array $point): array
    {
        $cell = $this->worldToCell($point);
        return $this->isWalkable($cell['x'],$cell['z'])
            ? $point : $this->cellToWorld($this->nearest($cell) ?? $cell);
    }

    private function heuristic(array $a,array $b): float
    {
        $dx=abs($a['x']-$b['x']);$dz=abs($a['z']-$b['z']);
        return max($dx,$dz)+(M_SQRT2-1)*min($dx,$dz);
    }

    private function lineWalkable(array $a,array $b): bool
    {
        $d=hypot($b['x']-$a['x'],$b['z']-$a['z']);
        $steps=max(1,(int)ceil($d/($this->cellSize*0.35)));
        for($i=0;$i<=$steps;$i++) {
            $q=$i/$steps;
            $c=$this->worldToCell(['x'=>$a['x']+($b['x']-$a['x'])*$q,
                'z'=>$a['z']+($b['z']-$a['z'])*$q]);
            if (! $this->isWalkable($c['x'],$c['z'])) return false;
        }
        return true;
    }

    /** A* with binary min-heap and JS's identical insertion/tie order. */
    public function findPath(array $from,array $to): array
    {
        $start=$this->nearest($this->worldToCell($from));
        $goal=$this->nearest($this->worldToCell($to));
        if($start===null||$goal===null)return [];
        $key=static fn(array $p):string=>$p['x'].':'.$p['z'];
        $startKey=$key($start);$goalKey=$key($goal);
        $heap=[];$came=[];$cost=[$startKey=>0.0];

        $push=static function(array $point,float $priority)use(&$heap):void{
            $heap[]=['p'=>$point,'score'=>$priority];
            $i=count($heap)-1;
            while($i>0){
                $j=intdiv($i-1,2);
                if($heap[$j]['score']<=$heap[$i]['score'])break;
                [$heap[$j],$heap[$i]]=[$heap[$i],$heap[$j]];
                $i=$j;
            }
        };
        $pop=static function()use(&$heap):?array{
            if(!$heap)return null;
            $first=$heap[0];$last=array_pop($heap);
            if($heap){
                $heap[0]=$last;$n=count($heap);$i=0;
                while(true){
                    $left=$i*2+1;$right=$left+1;$smallest=$i;
                    if($left<$n&&$heap[$left]['score']<$heap[$smallest]['score'])$smallest=$left;
                    if($right<$n&&$heap[$right]['score']<$heap[$smallest]['score'])$smallest=$right;
                    if($smallest===$i)break;
                    [$heap[$i],$heap[$smallest]]=[$heap[$smallest],$heap[$i]];
                    $i=$smallest;
                }
            }
            return $first['p'];
        };
        $push($start,0.0);
        $iterations=0;
        $offsets=[[1,0],[-1,0],[0,1],[0,-1],[1,1],[1,-1],[-1,1],[-1,-1]];
        while($heap&&$iterations<12000){
            $iterations++;
            $current=$pop();$currentKey=$key($current);
            if($currentKey===$goalKey)break;
            foreach($offsets as [$dx,$dz]){
                $x=$current['x']+$dx;$z=$current['z']+$dz;
                if(! $this->isWalkable($x,$z))continue;
                if($dx!==0&&$dz!==0&&(! $this->isWalkable($current['x']+$dx,$current['z'])
                    ||! $this->isWalkable($current['x'],$current['z']+$dz)))continue;
                $next=['x'=>$x,'z'=>$z];$nextKey=$key($next);
                $newCost=$cost[$currentKey]+($dx!==0&&$dz!==0?M_SQRT2:1);
                if($newCost>=($cost[$nextKey]??INF))continue;
                $cost[$nextKey]=$newCost;
                $came[$nextKey]=$current;
                $push($next,$newCost+$this->heuristic($next,$goal));
            }
        }
        if($startKey!==$goalKey&&!isset($came[$goalKey]))return [];
        $cells=[$goal];$cursor=$goalKey;
        while($cursor!==$startKey){
            $prev=$came[$cursor]??null;
            if($prev===null)return [];
            $cells[]=$prev;$cursor=$key($prev);
        }
        $cells=array_reverse($cells);
        $path=array_map(fn(array $cell)=>$this->cellToWorld($cell),$cells);
        if($path){
            $path[0]=$from;
            $path[count($path)-1]=$to;
        }
        if(count($path)<=2)return $path;
        $smooth=[$path[0]];$anchor=0;$n=count($path);
        while($anchor<$n-1){
            $candidate=$n-1;
            while($candidate>$anchor+1
                &&! $this->lineWalkable($path[$anchor],$path[$candidate]))$candidate--;
            $smooth[]=$path[$candidate];
            $anchor=$candidate;
        }
        return $smooth;
    }
}
