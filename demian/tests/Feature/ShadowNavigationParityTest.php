<?php

namespace Tests\Feature;

use App\Services\Arcade\CafeNavigationGrid;
use App\Services\Arcade\CafeRouteGeometry;
use Symfony\Component\Process\Process;
use Tests\TestCase;

final class ShadowNavigationParityTest extends TestCase
{
    public function test_php_pathfinding_matches_real_after_hours_js_smoothing_and_grid(): void
    {
        $node = new Process(['node',base_path('tools/generate_shadow_nav_fixtures.mjs')]);
        $node->setTimeout(60);
        $node->mustRun();
        $f = json_decode($node->getOutput(),true,flags:JSON_THROW_ON_ERROR);
        $grid=new CafeNavigationGrid(app(CafeRouteGeometry::class),$f['bounds']);
        $this->assertGreaterThan(30,count($f['fixtures']));
        foreach($f['fixtures'] as $i=>$case){
            $actual=$grid->findPath($case['from'],$case['goal']);
            $this->assertCount(count($case['path']),$actual,
                'Shadow path waypoint count drift on fixture '.$i);
            foreach($actual as $j=>$point){
                $this->assertEqualsWithDelta($case['path'][$j]['x'],$point['x'],
                    1e-6,'Path X '.$i.' waypoint '.$j);
                $this->assertEqualsWithDelta($case['path'][$j]['z'],$point['z'],
                    1e-6,'Path Z '.$i.' waypoint '.$j);
            }
        }
    }
}
