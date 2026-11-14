<?php

namespace Tests\Feature;

use App\Services\Arcade\CafeRushFrameReplayVerifier;
use Illuminate\Validation\ValidationException;
use Symfony\Component\Process\Process;
use Tests\TestCase;

final class CafeRushFullFrameParityTest extends TestCase
{
    private function source(int $seed,string $difficulty): array
    {
        $node=new Process(['node',base_path('tools/generate_rush_gameplay_fixture.mjs'),
            (string)$seed,$difficulty]);
        $node->setTimeout(70);$node->mustRun();
        return json_decode($node->getOutput(),true,flags:JSON_THROW_ON_ERROR);
    }

    public function test_source_js_gameplay_matches_independent_php_60hz_ticket_tray_and_combo_simulation(): void
    {
        foreach([[7,'standard'],[11,'easy'],[8,'hard']] as [$seed,$difficulty]){
            $fixture=$this->source($seed,$difficulty);
            $this->assertLessThanOrEqual(CafeRushFrameReplayVerifier::MAX_TRANSITIONS,
                count($fixture['transitions']));
            $php=app(CafeRushFrameReplayVerifier::class)->simulate(
                $seed,$fixture['ticks'],$fixture['transitions'],$difficulty);
            $js=$fixture['original_js'];
            $label=$difficulty.' seed '.$seed;
            $this->assertSame($js['score'],$php['score'],'score '.$label);
            $this->assertSame($js['delivered'],$php['passed'],'delivered '.$label);
            $this->assertSame($js['won'],$php['won'],'quota '.$label);
            foreach([
                'bestCombo'=>'best_combo','vipServed'=>'vip_served',
                'spills'=>'spills','expired'=>'expired','mistakes'=>'mistakes',
            ] as $jsKey=>$phpKey){
                $this->assertSame($js[$jsKey],$php['details'][$phpKey],
                    $jsKey.' '.$label);
            }
        }
    }

    public function test_a_forged_zero_second_ticket_service_is_not_a_ranked_result(): void
    {
        $case=$this->source(7,'standard');
        $this->expectException(ValidationException::class);
        app(CafeRushFrameReplayVerifier::class)->verify(
            $case['seed'],1,$case['transitions'],'standard');
    }

    public function test_invalid_axis_and_out_of_order_actions_are_rejected(): void
    {
        $case=$this->source(7,'standard');
        $case['transitions'][1][0]=$case['transitions'][0][0];
        $this->expectException(ValidationException::class);
        app(CafeRushFrameReplayVerifier::class)->simulate(
            $case['seed'],7200,$case['transitions'],'standard');
    }

    public function test_orig_game_tray_cannot_gain_points_by_submitting_claimed_score(): void
    {
        $case=$this->source(7,'standard');
        $case['transitions'][0][]=['score'=>90000000];
        $this->expectException(ValidationException::class);
        app(CafeRushFrameReplayVerifier::class)->simulate(
            $case['seed'],7200,$case['transitions'],'standard');
    }
}
