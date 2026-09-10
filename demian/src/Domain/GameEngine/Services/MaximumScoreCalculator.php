<?php
namespace Domain\GameEngine\Services;
class MaximumScoreCalculator {
    public function calculate(int $seconds, int $rate): int {
        return max(0, $seconds*$rate);
    }
}
