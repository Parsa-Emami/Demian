<?php

namespace Tests\Feature;

use App\Services\Arcade\AfterHoursShadowSimulator;
use App\Services\Arcade\CafeRouteGeometry;
use Symfony\Component\Process\Process;
use Tests\TestCase;

final class AfterHoursShadowDifferentialTest extends TestCase
{
    private const FIRST_SHADOW = ['x'=>4.5,'z'=>-70.1];

    private static function player(string $scenario,int $tick): array
    {
        if($scenario==='patrol'||$scenario==='noise')return ['x'=>-1.2,'z'=>-6.5];
        if($scenario==='chase')return ['x'=>self::FIRST_SHADOW['x']+2.0,
            'z'=>self::FIRST_SHADOW['z']+0.5];
        $time=$tick/60;
        return ['x'=>self::FIRST_SHADOW['x']+4*sin($time*.8),
            'z'=>self::FIRST_SHADOW['z']+2*cos($time*.4)];
    }

    public function test_independent_php_shadow_ai_matches_original_js_patrol_chase_and_hearing(): void
    {
        $node=new Process(['node',base_path('tools/generate_after_hours_shadow_fixtures.mjs')]);
        $node->setTimeout(70);
        $node->mustRun();
        $cases=json_decode($node->getOutput(),true,flags:JSON_THROW_ON_ERROR);
        $this->assertCount(8,$cases);
        foreach($cases as $fixture){
            $shadow=app()->make(AfterHoursShadowSimulator::class,
                ['difficulty'=>$fixture['difficulty']]);
            $expected=array_column($fixture['snapshots'],null,'tick');
            for($tick=1;$tick<=900;$tick++){
                $player=self::player($fixture['scenario'],$tick);
                $grace=$fixture['difficulty']==='hard'?5:7;
                $active=$tick/60 >= $grace;
                $lit=$player['z']>=-55.5;
                $noise=$fixture['scenario']==='noise'&&$tick>=90&&$tick<141
                    ? ['id'=>1,'x'=>self::FIRST_SHADOW['x']+3,
                        'z'=>self::FIRST_SHADOW['z']+2,'radius'=>14] : null;
                $shadow->tick($player,$lit,$active,$noise);
                if(!isset($expected[$tick]))continue;
                $actual=$shadow->snapshot();
                $goal=$expected[$tick];
                $label=$fixture['difficulty'].' '.$fixture['scenario'].' '.$tick;
                $this->assertSame($goal['mode'],$actual['mode'],'mode '.$label);
                $this->assertSame($goal['patrolIndex'],$actual['patrolIndex'],'patrol '.$label);
                $this->assertEqualsWithDelta($goal['position']['x'],
                    $actual['position']['x'],1e-4,'shadow x '.$label);
                $this->assertEqualsWithDelta($goal['position']['z'],
                    $actual['position']['z'],1e-4,'shadow z '.$label);
                $this->assertEqualsWithDelta($goal['forward']['x'],
                    $actual['forward']['x'],1e-4,'heading x '.$label);
                $this->assertEqualsWithDelta($goal['forward']['z'],
                    $actual['forward']['z'],1e-4,'heading z '.$label);
            }
        }
    }
}
