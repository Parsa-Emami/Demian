<?php

namespace Tests\Feature;

use App\Services\Arcade\AfterHoursFrameReplayVerifier;
use Illuminate\Validation\ValidationException;
use Symfony\Component\Process\Process;
use Tests\TestCase;

final class AfterHoursFullFrameParityTest extends TestCase
{
    private function cases(): array
    {
        $node=new Process(['node',base_path('tools/generate_after_hours_frame_fixtures.mjs')]);
        $node->setTimeout(60);
        $node->mustRun();
        return json_decode($node->getOutput(),true,flags:JSON_THROW_ON_ERROR);
    }

    public function test_independent_original_frame_replay_matches_real_js_game_and_shadow(): void
    {
        $fixtures=$this->cases();
        $this->assertCount(5,$fixtures);
        foreach($fixtures as $item){
            $actual=app(AfterHoursFrameReplayVerifier::class)->simulate(
                $item['seed'],$item['ticks'],$item['transitions'],$item['difficulty']);
            $expected=$item['actual'];
            $label=$item['difficulty'].' seed='.$item['seed'];
            $this->assertSame($expected['status'],$actual['status'],'status '.$label);
            $this->assertSame($expected['score'],$actual['score'],'score '.$label);
            $this->assertSame($expected['passed'],$actual['passed'],'cards '.$label);
            $this->assertSame($expected['relic'],$actual['relic'],'relic '.$label);
            $this->assertEqualsWithDelta($expected['elapsed'],$actual['elapsed'],1e-8,
                'clock '.$label);
            foreach(['x','z'] as $axis){
                $this->assertEqualsWithDelta(
                    $expected['player'][$axis],$actual['player'][$axis],1e-4,
                    'player '.$axis.' '.$label);
                $this->assertEqualsWithDelta(
                    $expected['shadow']['position'][$axis],
                    $actual['shadow']['position'][$axis],1e-4,
                    'shadow '.$axis.' '.$label);
            }
            $this->assertSame($expected['shadow']['mode'],
                $actual['shadow']['mode'],'mode '.$label);
        }
    }

    public function test_forged_power_outside_a_real_panel_is_rejected(): void
    {
        $item=$this->cases()[0];
        $item['transitions'][0][4]=1;
        $item['transitions'][0][5]='exit';
        $this->expectException(ValidationException::class);
        app(AfterHoursFrameReplayVerifier::class)->simulate(
            $item['seed'],$item['ticks'],$item['transitions'],$item['difficulty']);
    }

    public function test_missing_terminal_action_cannot_complete_original_game(): void
    {
        $item=$this->cases()[0];
        $this->expectException(ValidationException::class);
        app(AfterHoursFrameReplayVerifier::class)->verify(
            $item['seed'],$item['ticks'],$item['transitions'],$item['difficulty']);
    }

    public function test_duplicate_ticks_and_fabricated_score_are_never_authoritative(): void
    {
        $item=$this->cases()[3];
        $item['transitions'][1][0]=$item['transitions'][0][0];
        $this->expectException(ValidationException::class);
        app(AfterHoursFrameReplayVerifier::class)->simulate(
            $item['seed'],$item['ticks'],$item['transitions'],$item['difficulty']);
    }
}
