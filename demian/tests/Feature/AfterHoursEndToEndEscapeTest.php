<?php

namespace Tests\Feature;

use App\Services\Arcade\AfterHoursFrameReplayVerifier;
use Illuminate\Validation\ValidationException;
use Symfony\Component\Process\Process;
use Tests\TestCase;

final class AfterHoursEndToEndEscapeTest extends TestCase
{
    public function test_original_game_source_can_produce_a_real_shadow_safe_escape_accepted_by_php(): void
    {
        $node=new Process(['node',base_path('tools/generate_after_hours_winning_fixture.mjs')]);
        $node->setTimeout(90);
        $node->mustRun();
        $data=json_decode($node->getOutput(),true,flags:JSON_THROW_ON_ERROR);
        $this->assertNotNull($data['winner'],
            'All route attempts failed against actual shadow AI: '.json_encode($data['attempts']));
        $case=$data['winner'];
        $this->assertSame('escaped',$case['status']);
        $this->assertSame(2,$case['cards']);
        $this->assertLessThanOrEqual(AfterHoursFrameReplayVerifier::MAX_TRANSITIONS,
            count($case['frames']));
        $result=app(AfterHoursFrameReplayVerifier::class)->verify(
            $case['seed'],$case['ticks'],$case['frames'],$case['difficulty']);
        $this->assertSame($case['score'],$result['score']);
        $this->assertSame(2,$result['passed']);
    }
}
