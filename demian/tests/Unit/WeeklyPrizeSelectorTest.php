<?php

namespace Tests\Unit;

use App\Services\Arcade\WeeklyPrizeSelector;
use PHPUnit\Framework\TestCase;

final class WeeklyPrizeSelectorTest extends TestCase
{
    private function row(string $id, int $score = 100, string $at = '2026-11-14T09:00:00Z'): array
    {
        return ['player_id' => $id, 'score' => $score, 'achieved_at' => $at, 'verified' => true];
    }

    public function test_limits_to_ten_with_stable_score_time_and_id_order(): void
    {
        $rows = [];
        for ($i = 12; $i >= 1; $i--) {
            $rows[] = $this->row(sprintf('p%02d', $i), 1000 - $i);
        }
        $winners = (new WeeklyPrizeSelector())->select(['dino-run' => $rows])['dino-run'];
        $this->assertCount(10, $winners);
        $this->assertSame('p01', $winners[0]['player_id']);
        $this->assertSame('p10', $winners[9]['player_id']);
        $this->assertSame(10, $winners[9]['prize_rank']);
        $this->assertSame(10, $winners[9]['technical_rank']);
    }

    public function test_ties_use_earlier_score_time_then_stable_player_id(): void
    {
        $rows = [$this->row('z'), $this->row('b', 100, '2026-11-14T08:00:00Z'), $this->row('a')];
        $result = (new WeeklyPrizeSelector())->select(['dino-run' => $rows])['dino-run'];
        $this->assertSame(['b', 'a', 'z'], array_column($result, 'player_id'));
        $this->assertSame([1, 2, 3], array_column($result, 'technical_rank'));
    }

    public function test_prefers_new_winners_and_backfills_from_any_rank(): void
    {
        $rows = [$this->row('old', 1000)];
        for ($i = 1; $i <= 10; $i++) {
            $rows[] = $this->row('new'.$i, 1000 - $i);
        }
        $winners = (new WeeklyPrizeSelector())->select(['dino-run' => $rows], ['old'])['dino-run'];
        $this->assertCount(10, $winners);
        $this->assertSame('new1', $winners[0]['player_id']);
        $this->assertSame('new10', $winners[9]['player_id']);
        $this->assertSame(11, $winners[9]['technical_rank']);
        $this->assertSame(10, $winners[9]['prize_rank']);
    }

    public function test_previous_winners_fill_only_remaining_capacity(): void
    {
        $result = (new WeeklyPrizeSelector())->select([
            'dino-run' => [$this->row('old', 200), $this->row('new', 100)],
        ], ['old'])['dino-run'];
        $this->assertSame(['new', 'old'], array_column($result, 'player_id'));
        $this->assertSame([2, 1], array_column($result, 'technical_rank'));
        $this->assertSame([false, true], array_column($result, 'previous_winner'));
    }

    public function test_only_one_award_across_games_without_comparing_raw_scores(): void
    {
        $result = (new WeeklyPrizeSelector())->select([
            'game-b' => [$this->row('same', 9000), $this->row('other', 10)],
            'game-a' => [$this->row('same', 1), $this->row('third', 0)],
        ]);
        $this->assertSame(['same', 'third'], array_column($result['game-a'], 'player_id'));
        $this->assertSame(['other'], array_column($result['game-b'], 'player_id'));
        $this->assertSame(2, $result['game-b'][0]['technical_rank']);
        $this->assertSame(1, $result['game-b'][0]['prize_rank']);
    }

    public function test_chooses_best_per_player_and_does_not_modify_inputs(): void
    {
        $rows = [$this->row('a', 10), $this->row('a', 40), $this->row('b', 25)];
        $copy = $rows;
        $winners = (new WeeklyPrizeSelector())->select(['dino-run' => $rows])['dino-run'];
        $this->assertSame(['a', 'b'], array_column($winners, 'player_id'));
        $this->assertSame([40, 25], array_column($winners, 'score'));
        $this->assertSame($copy, $rows);
    }

    public function test_rejects_unverified_results(): void
    {
        $row = $this->row('bad');
        $row['verified'] = false;
        $this->expectException(\InvalidArgumentException::class);
        (new WeeklyPrizeSelector())->select(['dino-run' => [$row]]);
    }

    public function test_rejects_malformed_timestamps(): void
    {
        $this->expectException(\InvalidArgumentException::class);
        (new WeeklyPrizeSelector())->select(['dino-run' => [$this->row('bad', 123, 'tomorrow')]]);
    }

    public function test_offsets_are_normalized_to_utc_before_tie_breaking(): void
    {
        $rows = [
            $this->row('later', 100, '2026-11-14T12:30:00+03:30'),
            $this->row('earlier', 100, '2026-11-14T08:59:59Z'),
        ];
        $result = (new WeeklyPrizeSelector())->select(['dino-run' => $rows])['dino-run'];
        $this->assertSame(['earlier', 'later'], array_column($result, 'player_id'));
    }

    public function test_rejects_invalid_calendar_dates(): void
    {
        $this->expectException(\InvalidArgumentException::class);
        (new WeeklyPrizeSelector())->select(['dino-run' => [$this->row('bad', 123, '2026-13-99T01:00:00Z')]]);
    }

    public function test_empty_input_produces_no_awards(): void
    {
        $this->assertSame([], (new WeeklyPrizeSelector())->select([]));
        $this->assertSame(['dino-run' => []], (new WeeklyPrizeSelector())->select(['dino-run' => []]));
    }
}
