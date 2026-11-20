<?php
namespace Tests\Unit;

use App\Services\Arcade\SkillLeaguePolicy as Policy;
use PHPUnit\Framework\TestCase;

final class SkillLeaguePolicyTest extends TestCase
{
    public function test_placement_promotion_hysteresis_lifetime_floor_and_inactivity(): void
    {
        $this->assertSame('placement',Policy::classify([],null)['league']);
        $this->assertSame('bronze',Policy::classify([],449)['league']);
        $this->assertSame('silver',Policy::classify([],450)['league']);
        $this->assertSame('gold',Policy::classify([],700)['league']);
        $this->assertSame('legend',Policy::classify([100],900)['league']);
        $this->assertSame('promoted',Policy::classify([100],900)['movement']);
        $this->assertSame('legend',Policy::classify([1000,0,0],null)['league']);
        $this->assertSame('gold',Policy::classify([1000,0,0],0)['league']);
        $this->assertSame('demoted',Policy::classify([1000,0,0],0)['movement']);
        $this->assertSame('gold',Policy::classify([1000,0,0,0,0,0,0],0)['league']);
        $this->assertSame('legend',Policy::classify([1000,0,850,0],0)['league']);
        $this->assertSame('legend',Policy::classify([1000,0,0,0],950)['league']);
    }

    private function rows(int $n,bool $tie=false,string $game='dino-run'): array
    {
        $rows=[];
        for ($i=0;$i<$n;++$i) $rows[]=['player_id'=>'p'.$i,'run_id'=>$game.$i,
            'game_id'=>$game,'rules_version'=>'v1','score'=>$tie?123:1000-$i,
            'achieved_at'=>'2026-11-10 01:00:00'];
        return $rows;
    }

    public function test_midrank_ties_minimum_cohort_and_best_game_only(): void
    {
        $small=Policy::normalize($this->rows(19));
        $this->assertFalse($small[0]['qualified']);
        $ties=Policy::normalize($this->rows(20,true));
        $this->assertSame([500],array_values(array_unique(array_column($ties,'points'))));
        $rows=$this->rows(20);
        $score=Policy::normalize([...$rows,...$this->rows(20,true,'cafe-drift')]);
        $this->assertCount(20,$score);
        $this->assertSame(1000,$score[0]['points']);
        $this->assertSame($score,Policy::normalize(array_reverse([...$rows,...$this->rows(20,true,'cafe-drift')])));
    }

    public function test_duplicate_game_best_is_rejected(): void
    {
        $r=$this->rows(20);
        $this->expectException(\RuntimeException::class);
        Policy::normalize([...$r,$r[0]]);
    }
}
