<?php

namespace Tests\Feature;

use App\Services\Arcade\CafeFbxMotion;
use Symfony\Component\Process\Process;
use Tests\TestCase;

final class CafeFbxMotionParityTest extends TestCase
{
    public function test_all_three_cafe_games_match_canonical_js_circle_collision_solver(): void
    {
        $node = new Process([
            'node', base_path('tools/generate_fbx_motion_fixtures.mjs'),
        ]);
        $node->setTimeout(60);
        $node->mustRun();
        $fixtures = json_decode($node->getOutput(), true, flags: JSON_THROW_ON_ERROR);
        $this->assertCount(3, $fixtures);
        $physics = app(CafeFbxMotion::class);
        foreach ($fixtures as $fixture) {
            $this->assertCount(450, $fixture['cases']);
            foreach ($fixture['cases'] as $index => $move) {
                $actual = $physics->move(
                    $move['from'], $move['target'], $fixture['bounds']);
                $this->assertEqualsWithDelta($move['result']['x'], $actual['x'], 1e-5,
                    $fixture['id'].' x step '.$index);
                $this->assertEqualsWithDelta($move['result']['z'], $actual['z'], 1e-5,
                    $fixture['id'].' z step '.$index);
            }
        }
    }

    public function test_collision_resolution_rejects_impossible_motion_jumps(): void
    {
        $this->expectException(\InvalidArgumentException::class);
        app(CafeFbxMotion::class)->move(
            ['x'=>-1.2,'z'=>-6.5], ['x'=>100,'z'=>100],
            ['minX'=>-1000, 'maxX'=>1000, 'minZ'=>-1000, 'maxZ'=>1000]);
    }
}
