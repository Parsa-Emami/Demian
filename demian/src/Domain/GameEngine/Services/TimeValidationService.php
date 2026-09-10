<?php
namespace Domain\GameEngine\Services;
class TimeValidationService {
    public function validate(int $duration, int $max): bool {
        return $duration >= 0 && $duration <= $max;
    }
}
